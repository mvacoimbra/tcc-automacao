// Cliente MQTT do backend: assina <raiz>/+/estado no broker embutido OU num broker
// externo, e pode ser reconectado a quente (sem reiniciar o app).
import { randomBytes } from 'node:crypto'
import { connect, type MqttClient } from 'mqtt'

export type DestinoMqtt = { host: string; porta: number; raiz: string }

export type OpcoesClienteMqtt = {
  aoMensagem(topico: string, payload: string): void
  aoConexao(conectado: boolean): void
}

export type ClienteMqtt = {
  // Conecta ao destino, encerrando antes a conexão anterior (se houver).
  // Com `aguardar`, só resolve quando conectar (ou rejeita no tempo limite); sem ele,
  // devolve na hora e o cliente segue tentando em segundo plano (broker externo pode
  // estar fora do ar).
  conectar(destino: DestinoMqtt, aguardar: boolean): Promise<void>
  // Publica um texto; rejeita se o cliente não estiver conectado.
  publicar(topico: string, payload: string): Promise<void>
  estaConectado(): boolean
  parar(): Promise<void>
}

const PERIODO_RECONEXAO_MS = 2000
const TEMPO_LIMITE_CONEXAO_MS = 5000

export function criarClienteMqtt(opcoes: OpcoesClienteMqtt): ClienteMqtt {
  let atual: MqttClient | null = null

  async function encerrarAtual(): Promise<void> {
    const cliente = atual
    atual = null // eventos do cliente antigo passam a ser ignorados
    if (cliente) await cliente.endAsync(true)
  }

  return {
    async conectar(destino, aguardar) {
      await encerrarAtual()

      // id único: broker público derrubaria dois clientes com o mesmo id
      const cliente = connect({
        protocol: 'mqtt',
        host: destino.host,
        port: destino.porta,
        clientId: `tcc-backend-${randomBytes(4).toString('hex')}`,
        reconnectPeriod: PERIODO_RECONEXAO_MS,
        connectTimeout: TEMPO_LIMITE_CONEXAO_MS,
      })
      atual = cliente
      let conectadoAntes = false

      cliente.on('connect', () => {
        if (cliente !== atual) return
        cliente.subscribe(`${destino.raiz}/+/estado`, (erro) => {
          // se o cliente já foi trocado ou encerrado, a falha é esperada
          if (erro && cliente === atual) console.warn(`[mqtt] falha ao assinar: ${erro.message}`)
        })
        conectadoAntes = true
        opcoes.aoConexao(true)
      })
      cliente.on('close', () => {
        if (cliente !== atual || !conectadoAntes) return
        conectadoAntes = false
        opcoes.aoConexao(false)
      })
      cliente.on('error', (erro) => {
        if (cliente === atual) console.warn(`[mqtt] erro: ${erro.message}`)
      })
      cliente.on('message', (topico, corpo) => {
        if (cliente === atual) opcoes.aoMensagem(topico, corpo.toString('utf8'))
      })

      if (!aguardar) return
      await new Promise<void>((resolve, reject) => {
        const limite = setTimeout(() => {
          cliente.off('connect', aoConectar)
          reject(new Error(`não foi possível conectar ao broker MQTT ${destino.host}:${destino.porta}`))
        }, TEMPO_LIMITE_CONEXAO_MS)
        const aoConectar = () => {
          clearTimeout(limite)
          resolve()
        }
        cliente.once('connect', aoConectar)
      })
    },
    async publicar(topico, payload) {
      if (!atual?.connected) throw new Error('cliente MQTT desconectado')
      await atual.publishAsync(topico, payload)
    },
    estaConectado() {
      return atual?.connected ?? false
    },
    parar: encerrarAtual,
  }
}
