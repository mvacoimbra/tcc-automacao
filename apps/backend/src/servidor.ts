// Servidor do protótipo: liga broker MQTT, cliente MQTT, banco, REST e WebSocket.
// Modelo das Figuras 2 e 3 do TC I: dispositivo → MQTT → Node/Express → WebSocket → dashboard.
import { mkdirSync } from 'node:fs'
import { createServer, type Server as ServidorHttp } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { ConfigDispositivo, ConfigPayload, Configuracoes, Saude } from '@tcc/contrato'
import pacote from '../package.json' with { type: 'json' }
import { criarArmazenamento, type Armazenamento } from './armazenamento'
import { iniciarBroker, type BrokerEmbutido } from './broker'
import { criarClienteMqtt, type ClienteMqtt, type DestinoMqtt } from './cliente-mqtt'
import { CONFIG_PADRAO_DISPOSITIVO, mesclarConfig } from './config-dispositivo'
import { gravarConfiguracoes, lerConfiguracoes } from './configuracoes'
import { interpretarEstado, processarEstado } from './processamento'
import { escutar } from './portas'
import { ErroHttp, criarApp } from './rotas'
import { iniciarDispositivoSimulado, type DispositivoSimulado } from './simulador/dispositivo'
import { criarServidorWs, type ServidorWs } from './ws'

export type OpcoesServidor = {
  dirDados: string // onde ficam o banco e configuracoes.json
  portaHttp?: number // padrão 3000
  portaMqtt?: number // padrão 1883
  dirEstatico?: string // build do dashboard; se ausente, não serve estáticos
  // Relógio do dispositivo simulado (FSM, pulso do PIR, período de publicação).
  // Injetável para os testes não dependerem de tempo real.
  agora?: () => number
}

export type Servidor = {
  url: string
  portaHttp: number
  portaMqtt: number | null // null quando o broker é externo
  parar(): Promise<void>
}

const PORTA_HTTP_PADRAO = 3000
const PORTA_MQTT_PADRAO = 1883
const RAIZ_BROKER_EMBUTIDO = 'tcc'

// IPv4 da máquina na rede local, para abrir o dashboard no celular.
function enderecosLan(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address)
}

function raizDe(configuracoes: Configuracoes): string {
  return configuracoes.broker.modo === 'externo' ? configuracoes.broker.raiz : RAIZ_BROKER_EMBUTIDO
}

function destinoMqtt(configuracoes: Configuracoes, broker: BrokerEmbutido | null): DestinoMqtt {
  if (configuracoes.broker.modo === 'externo') {
    const { host, porta, raiz } = configuracoes.broker
    return { host, porta, raiz }
  }
  return { host: '127.0.0.1', porta: broker!.porta, raiz: RAIZ_BROKER_EMBUTIDO }
}

export async function criarServidor(opcoes: OpcoesServidor): Promise<Servidor> {
  mkdirSync(opcoes.dirDados, { recursive: true })
  let configuracoes = lerConfiguracoes(opcoes.dirDados)
  const armazenamento: Armazenamento = criarArmazenamento(join(opcoes.dirDados, 'leituras.db'))

  // Recursos abertos, para parar() poder encerrar só o que chegou a subir
  // (inclusive quando a inicialização falha no meio).
  let ws: ServidorWs | null = null
  let http: ServidorHttp | null = null
  let cliente: ClienteMqtt | null = null
  let broker: BrokerEmbutido | null = null
  let simulador: DispositivoSimulado | null = null
  let portaHttp = 0

  // seq anterior de cada dispositivo, para detectar perda de mensagens
  const ultimoSeq = new Map<string, number>()
  // Última config publicada por este backend para cada dispositivo (só em memória, como
  // no firmware, que também perde a config ao reiniciar). Sem publicação, vale o padrão.
  const configConhecida = new Map<string, ConfigDispositivo>()

  // Demo efetivo: preferência ligada E broker embutido (no externo o simulador não roda).
  const demoEfetivo = () => configuracoes.demo && configuracoes.broker.modo === 'embutido'

  function saude(): Saude {
    return {
      ok: true,
      versao: pacote.version,
      broker: {
        modo: configuracoes.broker.modo,
        conectado: cliente?.estaConectado() ?? false,
        porta: configuracoes.broker.modo === 'externo' ? configuracoes.broker.porta : broker!.porta,
      },
      demo: demoEfetivo(),
      portaHttp,
      enderecosLan: enderecosLan(),
    }
  }

  // Cada mensagem: validar → calcular latência e perda → gravar → transmitir.
  // Mensagem inválida é registrada e descartada, sem derrubar o processo.
  function tratarMensagem(topico: string, payload: string): void {
    const recebidoEm = Date.now()
    ws?.transmitir({ tipo: 'mqtt', direcao: 'entrada', topico, payload, em: recebidoEm })

    const r = interpretarEstado(payload)
    if (!r.ok) {
      console.warn(`[mqtt] mensagem descartada em ${topico}: ${r.motivo}`)
      return
    }
    const id = r.dados.dispositivo
    const anterior = ultimoSeq.get(id) ?? armazenamento.ultima(id)?.seq
    const leitura = processarEstado(r.dados, recebidoEm, anterior)
    armazenamento.gravar(leitura)
    ultimoSeq.set(id, leitura.seq)
    ws?.transmitir({ tipo: 'estado', dados: leitura })
  }

  async function publicarConfig(id: string, config: ConfigPayload): Promise<ConfigDispositivo> {
    if (!cliente?.estaConectado()) throw new ErroHttp(503, 'broker MQTT desconectado')
    const topico = `${raizDe(configuracoes)}/${id}/config`
    const payload = JSON.stringify(config)
    await cliente.publicar(topico, payload)
    ws?.transmitir({ tipo: 'mqtt', direcao: 'saida', topico, payload, em: Date.now() })
    const nova = mesclarConfig(configConhecida.get(id) ?? CONFIG_PADRAO_DISPOSITIVO, config)
    configConhecida.set(id, nova)
    return nova
  }

  // Liga ou desliga o simulador para refletir o demo efetivo.
  async function sincronizarSimulador(): Promise<void> {
    if (demoEfetivo() && broker && !simulador) {
      simulador = await iniciarDispositivoSimulado({
        porta: broker.porta,
        raiz: RAIZ_BROKER_EMBUTIDO,
        agora: opcoes.agora,
      })
    } else if (!demoEfetivo() && simulador) {
      const parando = simulador
      simulador = null
      await parando.parar()
    }
  }

  // Aplica uma nova configuração a quente, sem reiniciar o app. As chamadas são
  // enfileiradas: duas trocas seguidas não podem se intercalar.
  let fila: Promise<unknown> = Promise.resolve()
  function aplicarConfiguracoes(nova: Configuracoes): Promise<void> {
    const tarefa = fila.then(() => aplicar(nova))
    fila = tarefa.catch(() => undefined)
    return tarefa
  }

  async function aplicar(nova: Configuracoes): Promise<void> {
    const trocouBroker = JSON.stringify(configuracoes.broker) !== JSON.stringify(nova.broker)
    if (trocouBroker) {
      // o simulador é cliente do broker embutido: sai antes dele
      const antigoSimulador = simulador
      simulador = null
      await antigoSimulador?.parar()
      await cliente!.parar()

      // `broker` e `configuracoes` mudam juntos (sem await entre eles), para o /api/saude
      // nunca ver modo embutido sem broker.
      if (nova.broker.modo === 'externo') {
        const antigoBroker = broker
        broker = null
        configuracoes = nova
        await antigoBroker?.parar()
      } else {
        const novoBroker = broker ?? (await iniciarBroker(opcoes.portaMqtt ?? PORTA_MQTT_PADRAO))
        broker = novoBroker
        configuracoes = nova
      }
      await cliente!.conectar(destinoMqtt(nova, broker), nova.broker.modo === 'embutido')
    } else {
      configuracoes = nova
    }
    gravarConfiguracoes(opcoes.dirDados, nova)
    await sincronizarSimulador()

    ws?.transmitir({ tipo: 'conexao', broker: { modo: nova.broker.modo, conectado: cliente!.estaConectado() } })
    ws?.transmitir({ tipo: 'demo', ativo: demoEfetivo() })
  }

  let parando: Promise<void> | null = null
  function parar(): Promise<void> {
    // Ordem da seção 6.1 do PRD, com o simulador antes do cliente e do broker (ele é um
    // cliente do broker embutido; parar o broker antes o faria tentar reconectar).
    parando ??= (async () => {
      await ws?.parar()
      if (http?.listening) {
        http.closeAllConnections()
        await new Promise<void>((resolve) => http!.close(() => resolve()))
      }
      await simulador?.parar()
      await cliente?.parar()
      await broker?.parar()
      armazenamento.fechar()
    })()
    return parando
  }

  try {
    const app = criarApp({
      saude,
      armazenamento,
      configuracoes: () => configuracoes,
      aplicarConfiguracoes,
      configConhecida: (id) => configConhecida.get(id) ?? CONFIG_PADRAO_DISPOSITIVO,
      publicarConfig,
      demo: {
        async ativar(ativo) {
          if (configuracoes.broker.modo === 'externo') {
            throw new ErroHttp(409, 'modo Demo indisponível com broker externo')
          }
          await aplicarConfiguracoes({ ...configuracoes, demo: ativo })
        },
        pulsoPir() {
          if (!simulador) throw new ErroHttp(409, 'modo Demo desligado')
          simulador.pulsoPir()
        },
        definirAmbiente(ambiente) {
          if (!simulador) throw new ErroHttp(409, 'modo Demo desligado')
          simulador.definirAmbiente(ambiente)
        },
      },
      dirEstatico: opcoes.dirEstatico,
    })
    http = createServer(app)
    ws = criarServidorWs(http, (enviar) => {
      enviar({ tipo: 'conexao', broker: { modo: configuracoes.broker.modo, conectado: cliente?.estaConectado() ?? false } })
      enviar({ tipo: 'demo', ativo: demoEfetivo() })
    })

    const embutido = configuracoes.broker.modo === 'embutido'
    if (embutido) broker = await iniciarBroker(opcoes.portaMqtt ?? PORTA_MQTT_PADRAO)

    cliente = criarClienteMqtt({
      aoMensagem: tratarMensagem,
      aoConexao: (conectado) =>
        ws?.transmitir({ tipo: 'conexao', broker: { modo: configuracoes.broker.modo, conectado } }),
    })
    // Broker embutido é local e deve estar de pé: espera conectar. Um broker externo
    // pode estar fora do ar; o cliente segue tentando em segundo plano.
    await cliente.conectar(destinoMqtt(configuracoes, broker), embutido)
    await sincronizarSimulador()

    portaHttp = await escutar(http, opcoes.portaHttp ?? PORTA_HTTP_PADRAO, '0.0.0.0')
  } catch (erro) {
    await parar()
    throw erro
  }

  const url = `http://127.0.0.1:${portaHttp}`
  console.log(`[servidor] pronto em ${url} (MQTT ${broker ? `embutido na porta ${broker.porta}` : 'externo'})`)
  return { url, portaHttp, portaMqtt: broker?.porta ?? null, parar }
}
