import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  Configuracoes,
  DispositivoVisto,
  EstadoDispositivo,
  LeituraComMetadados,
  Metricas,
  Saude,
} from '@tcc/contrato'
import { CABECALHO_CSV } from '../src/csv'
import { criarServidor, type OpcoesServidor, type Servidor } from '../src/servidor'
import {
  conectarMqtt,
  conectarWs,
  contarLeituras,
  criarDirDados,
  esperar,
  payloadEstado,
  type ClienteWs,
} from './ajudantes'

const servidores: Servidor[] = []
const clientesWs: ClienteWs[] = []
const diretorios: string[] = []
// relógio do simulador, controlado pelo teste
let t = 1_000_000

beforeEach(() => {
  t = 1_000_000
})

afterEach(async () => {
  for (const c of clientesWs.splice(0)) await c.fechar()
  for (const s of servidores.splice(0)) await s.parar()
  for (const d of diretorios.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function iniciar(
  config: Configuracoes = { broker: { modo: 'embutido' }, demo: false },
  opcoes: Partial<OpcoesServidor> = {},
): Promise<{ s: Servidor; dirDados: string }> {
  const dirDados = criarDirDados(config)
  diretorios.push(dirDados)
  const s = await criarServidor({ dirDados, portaHttp: 0, portaMqtt: 0, agora: () => t, ...opcoes })
  servidores.push(s)
  return { s, dirDados }
}

async function abrirWs(s: Servidor): Promise<ClienteWs> {
  const c = await conectarWs(`ws://127.0.0.1:${s.portaHttp}/ws`)
  clientesWs.push(c)
  return c
}

const json = (corpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(corpo),
})

const saudeDe = async (s: Servidor) => Saude.parse(await (await fetch(`${s.url}/api/saude`)).json())

// O simulador publica a primeira leitura durante a partida do servidor, antes de o
// WebSocket do teste conectar, e com o relógio congelado não há outra publicação.
// Avançar o relógio força a publicação periódica seguinte, já com o WebSocket ligado.
async function leituraNoWs(ws: ClienteWs): Promise<void> {
  t += 2001
  await esperar('leitura no WebSocket', () => ws.mensagens.find((m) => m.tipo === 'estado'))
}

// Demo ligado com uma ocupação já gravada: base dos testes de leitura/CSV/métricas.
async function demoComLeituras(): Promise<{ s: Servidor; dirDados: string; ws: ClienteWs }> {
  const { s, dirDados } = await iniciar({ broker: { modo: 'embutido' }, demo: true })
  const ws = await abrirWs(s)
  await leituraNoWs(ws)
  expect((await fetch(`${s.url}/api/demo/pir`, { method: 'POST' })).status).toBe(200)
  await esperar('OCUPADO', () => ws.mensagens.find((m) => m.tipo === 'estado' && m.dados.estado === 'OCUPADO'))
  t += 2001 // publicação periódica
  await esperar('3 leituras', () => contarLeituras(dirDados) >= 3)
  return { s, dirDados, ws }
}

describe('modo Demo ponta a ponta (relógio injetado)', () => {
  it('liga o demo, injeta PIR e observa OCUPADO com luz e HVAC; tempAlvo 30 desliga o HVAC', async () => {
    const { s } = await iniciar({ broker: { modo: 'embutido' }, demo: true })
    const ws = await abrirWs(s)
    const estados = () => ws.mensagens.flatMap((m) => (m.tipo === 'estado' ? [m.dados] : []))

    t += 2001 // ver leituraNoWs
    await esperar('DESOCUPADO inicial', () => estados().find((e) => e.estado === 'DESOCUPADO'))
    expect((await fetch(`${s.url}/api/demo/pir`, { method: 'POST' })).status).toBe(200)

    // 120 lux < 300 e 28 °C > 26
    const ocupado = await esperar('OCUPADO', () => estados().find((e) => e.estado === 'OCUPADO'))
    expect(ocupado).toMatchObject({ dispositivo: 'sala01', luz: true, hvac: true })

    const r = await fetch(`${s.url}/api/dispositivos/sala01/config`, json({ tempAlvo: 30 }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ tOcupadoMs: 30000, janelaConfMs: 0, pulsosConf: 1, luxLimiar: 300, tempAlvo: 30 })

    await esperar('HVAC desligado', () => estados().find((e) => e.estado === 'OCUPADO' && !e.hvac))
    // a publicação da config aparece no log MQTT como saída
    expect(ws.mensagens).toContainEqual(
      expect.objectContaining({ tipo: 'mqtt', direcao: 'saida', topico: 'tcc/sala01/config', payload: '{"tempAlvo":30}' }),
    )

    const estado = EstadoDispositivo.parse(await (await fetch(`${s.url}/api/dispositivos/sala01/estado`)).json())
    expect(estado.config.tempAlvo).toBe(30)
    expect(estado.leitura.dispositivo).toBe('sala01')
  })

  it('a config chega ao dispositivo pelo broker, no tópico <raiz>/<id>/config', async () => {
    const { s } = await iniciar({ broker: { modo: 'embutido' }, demo: true })
    const ws = await abrirWs(s)
    await leituraNoWs(ws)
    const observador = await conectarMqtt(s.portaMqtt!)
    const recebidas: string[] = []
    observador.on('message', (topico, corpo) => recebidas.push(`${topico} ${corpo}`))
    await observador.subscribeAsync('tcc/sala01/config')

    await fetch(`${s.url}/api/dispositivos/sala01/config`, json({ tOcupadoMs: 10000, pulsosConf: 2 }))
    await esperar('config no broker', () => recebidas.length === 1)
    expect(recebidas[0]).toBe('tcc/sala01/config {"tOcupadoMs":10000,"pulsosConf":2}')
    await observador.endAsync(true)
  })

  it('POST /api/demo liga e desliga o simulador e avisa pelo WebSocket', async () => {
    const { s } = await iniciar() // demo desligado
    const ws = await abrirWs(s)
    expect((await saudeDe(s)).demo).toBe(false)

    const ligar = await fetch(`${s.url}/api/demo`, json({ ativo: true }))
    expect(ligar.status).toBe(200)
    expect((await saudeDe(s)).demo).toBe(true)
    await esperar('aviso de demo ligado', () => ws.mensagens.find((m) => m.tipo === 'demo' && m.ativo))
    await esperar('leitura do simulador', () => ws.mensagens.find((m) => m.tipo === 'estado'))

    const desligar = await fetch(`${s.url}/api/demo`, json({ ativo: false }))
    expect(desligar.status).toBe(200)
    expect((await saudeDe(s)).demo).toBe(false)
    expect((await fetch(`${s.url}/api/demo/pir`, { method: 'POST' })).status).toBe(409)
  })

  it('POST /api/demo/ambiente altera os sensores simulados', async () => {
    const { s } = await iniciar({ broker: { modo: 'embutido' }, demo: true })
    const ws = await abrirWs(s)
    await leituraNoWs(ws)

    expect((await fetch(`${s.url}/api/demo/ambiente`, json({ temperatura: 21, lux: 800 }))).status).toBe(200)
    t += 2001
    await esperar('ambiente novo', () =>
      ws.mensagens.find((m) => m.tipo === 'estado' && m.dados.temperatura === 21 && m.dados.lux === 800),
    )
  })
})

describe('leituras, métricas e CSV', () => {
  it('lista dispositivos, leituras (com limite e intervalo) e métricas no formato do contrato', async () => {
    const { s } = await demoComLeituras()

    const dispositivos = DispositivoVisto.array().parse(await (await fetch(`${s.url}/api/dispositivos`)).json())
    expect(dispositivos.map((d) => d.id)).toEqual(['sala01'])

    const leituras = LeituraComMetadados.array().parse(
      await (await fetch(`${s.url}/api/dispositivos/sala01/leituras`)).json(),
    )
    expect(leituras.length).toBeGreaterThanOrEqual(3)
    expect(leituras.map((l) => l.recebidoEm)).toEqual([...leituras.map((l) => l.recebidoEm)].sort((a, b) => a - b))

    const ultima = LeituraComMetadados.array().parse(
      await (await fetch(`${s.url}/api/dispositivos/sala01/leituras?limite=1`)).json(),
    )
    expect(ultima).toEqual([leituras[leituras.length - 1]]) // com limite, as mais recentes

    const futuro = Date.now() + 3_600_000
    expect(await (await fetch(`${s.url}/api/dispositivos/sala01/leituras?de=${futuro}`)).json()).toEqual([])

    const metricas = Metricas.parse(await (await fetch(`${s.url}/api/dispositivos/sala01/metricas`)).json())
    expect(metricas.perda.recebidas).toBe(leituras.length)
    expect(metricas.latencia.amostras).toBe(leituras.length) // o simulador sempre manda ts
    expect(metricas.ocupacao.transicoes).toBeGreaterThanOrEqual(1)
  })

  it('export.csv devolve o cabeçalho e uma linha por leitura', async () => {
    const { s } = await demoComLeituras()
    const leituras = LeituraComMetadados.array().parse(
      await (await fetch(`${s.url}/api/dispositivos/sala01/leituras`)).json(),
    )

    const r = await fetch(`${s.url}/api/dispositivos/sala01/export.csv`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/csv')
    expect(r.headers.get('content-disposition')).toContain('sala01')
    const linhas = (await r.text()).trimEnd().split('\n')
    expect(linhas[0]).toBe(CABECALHO_CSV)
    expect(linhas).toHaveLength(leituras.length + 1)
  })
})

describe('erros', () => {
  it('404 para dispositivo desconhecido em todas as rotas por id', async () => {
    const { s } = await iniciar()
    for (const caminho of ['estado', 'leituras', 'metricas', 'export.csv']) {
      const r = await fetch(`${s.url}/api/dispositivos/fantasma/${caminho}`)
      expect(r.status, caminho).toBe(404)
      expect(await r.json()).toEqual({ erro: expect.any(String) })
    }
    expect((await fetch(`${s.url}/api/dispositivos/fantasma/config`, json({ tempAlvo: 30 }))).status).toBe(404)
  })

  it('400 para id de dispositivo malformado', async () => {
    const { s } = await iniciar()
    expect((await fetch(`${s.url}/api/dispositivos/com%20espaco/estado`)).status).toBe(400)
  })

  it('400 para config inválida (tipo errado, campo desconhecido, JSON quebrado)', async () => {
    const { s, dirDados } = await iniciar()
    const pub = await conectarMqtt(s.portaMqtt!)
    await pub.publishAsync('tcc/sala01/estado', payloadEstado())
    await esperar('dispositivo conhecido', () => contarLeituras(dirDados) === 1)
    await pub.endAsync(true)

    const url = `${s.url}/api/dispositivos/sala01/config`
    expect((await fetch(url, json({ tempAlvo: 'quente' }))).status).toBe(400)
    expect((await fetch(url, json({ inventado: 1 }))).status).toBe(400)
    const quebrado = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ nao json' })
    expect(quebrado.status).toBe(400)
    expect(await quebrado.json()).toEqual({ erro: expect.any(String) })
  })

  it('400 para parâmetros de consulta inválidos', async () => {
    const { s, dirDados } = await iniciar()
    const pub = await conectarMqtt(s.portaMqtt!)
    await pub.publishAsync('tcc/sala01/estado', payloadEstado())
    await esperar('dispositivo conhecido', () => contarLeituras(dirDados) === 1)
    await pub.endAsync(true)

    for (const q of ['limite=0', 'limite=abc', 'limite=1.5', 'de=abc', 'ate=-1']) {
      expect((await fetch(`${s.url}/api/dispositivos/sala01/leituras?${q}`)).status, q).toBe(400)
    }
    // acima do máximo (10000) não é erro: vira o máximo
    expect((await fetch(`${s.url}/api/dispositivos/sala01/leituras?limite=50000`)).status).toBe(200)
  })

  it('409 nas rotas de demo com o demo desligado, e 400 para corpo inválido com ele ligado', async () => {
    const { s } = await iniciar() // demo desligado
    expect((await fetch(`${s.url}/api/demo/pir`, { method: 'POST' })).status).toBe(409)
    expect((await fetch(`${s.url}/api/demo/ambiente`, json({ temperatura: 30 }))).status).toBe(409)

    await fetch(`${s.url}/api/demo`, json({ ativo: true }))
    expect((await fetch(`${s.url}/api/demo/ambiente`, json({ umidade: 500 }))).status).toBe(400)
    expect((await fetch(`${s.url}/api/demo`, json({ ativo: 'sim' }))).status).toBe(400)
  })

  it('rota /api inexistente responde 404 em JSON', async () => {
    const { s } = await iniciar()
    const r = await fetch(`${s.url}/api/nao-existe`)
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ erro: expect.any(String) })
  })
})

describe('configurações e troca de broker a quente', () => {
  it('GET /api/configuracoes devolve a configuração atual', async () => {
    const { s } = await iniciar({ broker: { modo: 'embutido' }, demo: false })
    expect(Configuracoes.parse(await (await fetch(`${s.url}/api/configuracoes`)).json())).toEqual({
      broker: { modo: 'embutido' },
      demo: false,
    })
  })

  it('PUT troca para broker externo e volta ao embutido sem reiniciar', async () => {
    const externo = await iniciar() // outro servidor, cujo broker embutido faz o papel de broker externo
    const { s, dirDados } = await iniciar()
    const ws = await abrirWs(s)
    const alvo: Configuracoes = {
      broker: { modo: 'externo', host: '127.0.0.1', porta: externo.s.portaMqtt!, raiz: 'tcc' },
      demo: true, // preferência ligada, mas no modo externo o demo não roda
    }

    const r = await fetch(`${s.url}/api/configuracoes`, { ...json(alvo), method: 'PUT' })
    expect(r.status).toBe(200)
    expect(Configuracoes.parse(await r.json())).toEqual(alvo)

    await esperar('conectado ao broker externo', async () => {
      const saude = await saudeDe(s)
      return saude.broker.modo === 'externo' && saude.broker.conectado
    })
    const saude = await saudeDe(s)
    expect(saude).toMatchObject({ broker: { modo: 'externo', porta: externo.s.portaMqtt }, demo: false })
    expect(ws.mensagens).toContainEqual({ tipo: 'conexao', broker: { modo: 'externo', conectado: true } })
    expect(JSON.parse(readFileSync(join(dirDados, 'configuracoes.json'), 'utf8'))).toEqual(alvo)

    // um dispositivo publicando no broker externo passa a aparecer neste servidor
    const pub = await conectarMqtt(externo.s.portaMqtt!)
    await pub.publishAsync('tcc/sala09/estado', payloadEstado({ dispositivo: 'sala09' }))
    await esperar('sala09 listada', async () => {
      const lista = DispositivoVisto.array().parse(await (await fetch(`${s.url}/api/dispositivos`)).json())
      return lista.some((d) => d.id === 'sala09')
    })
    await pub.endAsync(true)

    // demo indisponível no modo externo
    expect((await fetch(`${s.url}/api/demo`, json({ ativo: true }))).status).toBe(409)
    expect((await fetch(`${s.url}/api/demo/pir`, { method: 'POST' })).status).toBe(409)

    // volta ao embutido: o broker sobe de novo e o demo (preferência ligada) reaparece
    const volta: Configuracoes = { broker: { modo: 'embutido' }, demo: true }
    expect((await fetch(`${s.url}/api/configuracoes`, { ...json(volta), method: 'PUT' })).status).toBe(200)
    await esperar('demo efetivo de volta', async () => {
      const sd = await saudeDe(s)
      return sd.broker.modo === 'embutido' && sd.broker.conectado && sd.demo
    })
    await esperar('leitura do simulador', () => ws.mensagens.find((m) => m.tipo === 'estado' && m.dados.dispositivo === 'sala01'))
  })

  it('PUT com configuração inválida responde 400 e não altera nada', async () => {
    const { s } = await iniciar({ broker: { modo: 'embutido' }, demo: false })
    const r = await fetch(`${s.url}/api/configuracoes`, { ...json({ broker: { modo: 'externo' }, demo: true }), method: 'PUT' })
    expect(r.status).toBe(400)
    expect((await saudeDe(s)).broker.modo).toBe('embutido')
  })
})

describe('arquivos estáticos do dashboard', () => {
  function criarEstaticos(): string {
    const dir = join(tmpdir(), `tcc-estatico-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(dir, 'assets'), { recursive: true })
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>painel</title>')
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ok")')
    diretorios.push(dir)
    return dir
  }

  it('serve o build, e devolve index.html para rotas da SPA', async () => {
    const { s } = await iniciar(undefined, { dirEstatico: criarEstaticos() })
    const raiz = await fetch(`${s.url}/`)
    expect(raiz.status).toBe(200)
    expect(await raiz.text()).toContain('<title>painel</title>')
    expect(await (await fetch(`${s.url}/assets/app.js`)).text()).toBe('console.log("ok")')
    expect(await (await fetch(`${s.url}/historico`)).text()).toContain('<title>painel</title>')
    // a API não cai no fallback da SPA
    expect((await fetch(`${s.url}/api/nao-existe`)).headers.get('content-type')).toContain('application/json')
  })

  it('sem dirEstatico não serve arquivos', async () => {
    const { s } = await iniciar()
    expect((await fetch(`${s.url}/`)).status).toBe(404)
  })
})
