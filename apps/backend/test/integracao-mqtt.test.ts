import { rmSync } from 'node:fs'
import { createServer, type Server as ServidorNet } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Saude } from '@tcc/contrato'
import { criarServidor, type Servidor } from '../src/servidor'
import {
  conectarMqtt,
  conectarWs,
  contarLeituras,
  criarDirDados,
  esperar,
  lerLinhas,
  payloadEstado,
  type ClienteWs,
} from './ajudantes'

let dirDados: string
let servidor: Servidor | null = null
let ws: ClienteWs | null = null
const ocupantes: ServidorNet[] = []

beforeEach(() => {
  dirDados = criarDirDados()
})

afterEach(async () => {
  await ws?.fechar()
  ws = null
  await servidor?.parar()
  servidor = null
  for (const s of ocupantes.splice(0)) await new Promise((r) => s.close(() => r(undefined)))
  rmSync(dirDados, { recursive: true, force: true })
})

async function iniciar(opcoes: Partial<Parameters<typeof criarServidor>[0]> = {}): Promise<Servidor> {
  servidor = await criarServidor({ dirDados, portaHttp: 0, portaMqtt: 0, ...opcoes })
  return servidor
}

describe('servidor completo: broker embutido → banco → WebSocket', () => {
  it('um estado publicado por um cliente MQTT vira linha no banco e mensagens no WebSocket', async () => {
    const s = await iniciar()
    ws = await conectarWs(`ws://127.0.0.1:${s.portaHttp}/ws`)
    const publicador = await conectarMqtt(s.portaMqtt!)

    const ts = Date.now() - 50
    const payload = payloadEstado({ seq: 7, ts, estado: 'OCUPADO', luz: true, hvac: false })
    await publicador.publishAsync('tcc/sala01/estado', payload)

    const estado = await esperar('mensagem "estado" no WebSocket', () =>
      ws!.mensagens.find((m) => m.tipo === 'estado'),
    )
    if (estado.tipo !== 'estado') throw new Error('inesperado')
    expect(estado.dados).toMatchObject({ dispositivo: 'sala01', seq: 7, estado: 'OCUPADO', luz: true, hvac: false, perdidas: 0 })
    expect(estado.dados.latenciaMs).toBeGreaterThanOrEqual(50)
    expect(estado.dados.latenciaMs).toBeLessThan(5000)

    const entrada = ws.mensagens.find((m) => m.tipo === 'mqtt')
    expect(entrada).toMatchObject({ tipo: 'mqtt', direcao: 'entrada', topico: 'tcc/sala01/estado', payload })

    const linhas = await esperar('linha no banco', () => {
      const l = lerLinhas(dirDados)
      return l.length ? l : null
    })
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ dispositivo: 'sala01', seq: 7, estado: 'OCUPADO', luz: 1, hvac: 0, perdidas: 0 })

    await publicador.endAsync()
  })

  it('ao conectar, o WebSocket informa o estado atual da conexão e do demo', async () => {
    const s = await iniciar()
    ws = await conectarWs(`ws://127.0.0.1:${s.portaHttp}/ws`)
    await esperar('mensagens iniciais', () => ws!.mensagens.length >= 2)
    expect(ws.mensagens).toEqual(
      expect.arrayContaining([
        { tipo: 'conexao', broker: { modo: 'embutido', conectado: true } },
        { tipo: 'demo', ativo: false },
      ]),
    )
  })

  it('recusa upgrade de WebSocket em qualquer caminho que não seja /ws', async () => {
    const s = await iniciar()
    const codigo = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${s.portaHttp}/outro`)
      socket.once('unexpected-response', (_req, resposta) => resolve(resposta.statusCode ?? 0))
      socket.once('open', () => reject(new Error('não deveria abrir')))
      socket.once('error', () => {}) // o ws também sinaliza erro após a resposta inesperada
    })
    expect(codigo).toBe(400)
  })

  it('detecta perda por lacuna em seq e reinício do dispositivo', async () => {
    const s = await iniciar()
    ws = await conectarWs(`ws://127.0.0.1:${s.portaHttp}/ws`)
    const publicador = await conectarMqtt(s.portaMqtt!)

    for (const seq of [1, 4, 0]) await publicador.publishAsync('tcc/sala01/estado', payloadEstado({ seq }))
    await esperar('3 leituras', () => contarLeituras(dirDados) === 3)

    // 1 (primeira, sem referência) → 4 (perdeu 2 e 3) → 0 (reinício, não é perda)
    expect(lerLinhas(dirDados).map((l) => l.perdidas)).toEqual([0, 2, 0])
    await publicador.endAsync()
  })

  it('ts = 0 (NTP não sincronizou) grava latência nula', async () => {
    const s = await iniciar()
    const publicador = await conectarMqtt(s.portaMqtt!)
    await publicador.publishAsync('tcc/sala01/estado', payloadEstado({ ts: 0, temperatura: null, umidade: null }))
    await esperar('linha no banco', () => contarLeituras(dirDados) === 1)
    expect(lerLinhas(dirDados)[0]).toMatchObject({ ts: 0, latencia_ms: null, temperatura: null, umidade: null })
    await publicador.endAsync()
  })

  it('payload inválido não derruba o servidor nem gera linha; o válido seguinte é gravado', async () => {
    const s = await iniciar()
    ws = await conectarWs(`ws://127.0.0.1:${s.portaHttp}/ws`)
    const publicador = await conectarMqtt(s.portaMqtt!)

    await publicador.publishAsync('tcc/sala01/estado', 'isto não é json')
    await publicador.publishAsync('tcc/sala01/estado', payloadEstado({ estado: 'OUTRO' }))
    await publicador.publishAsync('tcc/sala01/estado', payloadEstado({ seq: 2 }))

    await esperar('estado válido no WebSocket', () => ws!.mensagens.find((m) => m.tipo === 'estado'))
    expect(contarLeituras(dirDados)).toBe(1)
    expect(ws.mensagens.filter((m) => m.tipo === 'mqtt')).toHaveLength(3) // o log MQTT mostra até as descartadas
    expect(ws.mensagens.filter((m) => m.tipo === 'estado')).toHaveLength(1)

    const resposta = await fetch(`${s.url}/api/saude`)
    expect(resposta.status).toBe(200)
    await publicador.endAsync()
  })
})

describe('GET /api/saude', () => {
  it('informa broker embutido conectado e as portas reais', async () => {
    const s = await iniciar() // no modo embutido, criarServidor só resolve com o cliente MQTT conectado
    const saude = Saude.parse(await (await fetch(`${s.url}/api/saude`)).json())
    expect(saude).toMatchObject({
      ok: true,
      broker: { modo: 'embutido', conectado: true, porta: s.portaMqtt },
      demo: false,
      portaHttp: s.portaHttp,
    })
  })

  it('a url do servidor aponta para o loopback na porta HTTP real', async () => {
    const s = await iniciar()
    expect(s.url).toBe(`http://127.0.0.1:${s.portaHttp}`)
  })
})

describe('fallback de porta ocupada (EADDRINUSE)', () => {
  function ocupar(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = createServer()
      s.once('error', reject)
      s.listen(0, '0.0.0.0', () => {
        ocupantes.push(s)
        resolve((s.address() as { port: number }).port)
      })
    })
  }

  it('usa uma porta livre para HTTP e MQTT e informa as reais em /api/saude', async () => {
    const httpOcupada = await ocupar()
    const mqttOcupada = await ocupar()
    const s = await iniciar({ portaHttp: httpOcupada, portaMqtt: mqttOcupada })

    expect(s.portaHttp).not.toBe(httpOcupada)
    expect(s.portaMqtt).not.toBe(mqttOcupada)
    expect(s.portaHttp).toBeGreaterThan(0)
    expect(s.portaMqtt).toBeGreaterThan(0)

    const saude = Saude.parse(await (await fetch(`${s.url}/api/saude`)).json())
    expect(saude.portaHttp).toBe(s.portaHttp)
    expect(saude.broker.porta).toBe(s.portaMqtt)

    // o broker na porta de fallback funciona de verdade
    const publicador = await conectarMqtt(s.portaMqtt!)
    await publicador.publishAsync('tcc/sala01/estado', payloadEstado())
    await esperar('linha no banco', () => contarLeituras(dirDados) === 1)
    await publicador.endAsync()
  })
})
