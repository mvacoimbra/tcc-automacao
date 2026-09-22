import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MqttClient } from 'mqtt'
import { EstadoPayload } from '@tcc/contrato'
import { iniciarBroker, type BrokerEmbutido } from '../src/broker'
import { iniciarDispositivoSimulado, type DispositivoSimulado } from '../src/simulador/dispositivo'
import { conectarMqtt, esperar } from './ajudantes'

// Relógio controlado pelo teste: o ciclo de 100 ms roda em tempo real, mas o que
// ele entende por "agora" (FSM, pulso do PIR, publicação de 2 s) só anda quando o teste manda.
let t: number
let broker: BrokerEmbutido
let observador: MqttClient
let dispositivo: DispositivoSimulado
let recebidas: EstadoPayload[]

beforeEach(async () => {
  t = 1_000_000
  recebidas = []
  broker = await iniciarBroker(0)
  observador = await conectarMqtt(broker.porta)
  observador.on('message', (_topico, corpo) => {
    recebidas.push(EstadoPayload.parse(JSON.parse(corpo.toString())))
  })
  await observador.subscribeAsync('tcc/+/estado')
  dispositivo = await iniciarDispositivoSimulado({ porta: broker.porta, raiz: 'tcc', agora: () => t })
})

afterEach(async () => {
  await dispositivo.parar()
  await observador.endAsync(true)
  await broker.parar()
})

const ultima = () => recebidas[recebidas.length - 1]
const esperarEstado = (descricao: string, pred: (e: EstadoPayload) => boolean) =>
  esperar(descricao, () => recebidas.find(pred))

async function ocupar(): Promise<void> {
  dispositivo.pulsoPir()
  await esperarEstado('OCUPADO', (e) => e.estado === 'OCUPADO')
}

describe('dispositivo simulado (modo Demo)', () => {
  it('publica logo ao iniciar: DESOCUPADO com o ambiente inicial e seq 0', async () => {
    const primeira = await esperar('primeira publicação', () => recebidas[0])
    expect(primeira).toMatchObject({
      dispositivo: 'sala01',
      seq: 0,
      estado: 'DESOCUPADO',
      pir: false,
      temperatura: 28,
      umidade: 55,
      lux: 120,
      luz: false,
      hvac: false,
    })
    expect(Math.abs(primeira.ts - Date.now())).toBeLessThan(5000) // ts é o relógio real
  })

  it('pulso de PIR: OCUPADO com luz (120 < 300 lux) e HVAC (28 > 26 °C), publicado na hora', async () => {
    await esperar('primeira publicação', () => recebidas[0])
    await ocupar()
    expect(recebidas.find((e) => e.estado === 'OCUPADO')).toMatchObject({ pir: true, luz: true, hvac: true })
  })

  it('o PIR fica alto por 5 s; sem movimento por t_ocupado volta a DESOCUPADO; seq sempre crescente', async () => {
    await ocupar()

    t += 5001 // o pulso acabou; a publicação periódica de 2 s mostra o PIR baixo
    await esperarEstado('PIR baixo, ainda OCUPADO', (e) => e.estado === 'OCUPADO' && !e.pir)

    t += 30_001 // passou tOcupadoMs (30 s) sem movimento
    const livre = await esperarEstado('DESOCUPADO', (e) => e.estado === 'DESOCUPADO' && e.seq > 0)
    expect(livre).toMatchObject({ luz: false, hvac: false })

    expect(recebidas.map((e) => e.seq)).toEqual(recebidas.map((_, i) => i))
  })

  it('config pelo broker: tempAlvo 30 desliga o HVAC; luxLimiar 50 apaga a luz', async () => {
    await ocupar()

    await observador.publishAsync('tcc/sala01/config', JSON.stringify({ tempAlvo: 30 }))
    const semHvac = await esperarEstado('HVAC desligado', (e) => e.estado === 'OCUPADO' && !e.hvac)
    expect(semHvac.luz).toBe(true)

    await observador.publishAsync('tcc/sala01/config', JSON.stringify({ luxLimiar: 50 }))
    await esperarEstado('luz apagada', (e) => e.estado === 'OCUPADO' && !e.luz)
  })

  it('config parcialmente inválida aplica só o que vale, como o onConfig do firmware', async () => {
    await ocupar()

    await observador.publishAsync('tcc/sala01/config', JSON.stringify({ tempAlvo: 'quente', luxLimiar: 50, inventado: 1 }))
    const r = await esperarEstado('luz apagada', (e) => e.estado === 'OCUPADO' && !e.luz)
    expect(r.hvac).toBe(true) // tempAlvo veio como texto: ignorado, continua 26 °C
  })

  it('definirAmbiente muda os sensores publicados', async () => {
    await esperar('primeira publicação', () => recebidas[0])
    dispositivo.definirAmbiente({ temperatura: 20, lux: 500 })
    t += 2001 // próxima publicação periódica
    const r = await esperarEstado('ambiente novo', (e) => e.temperatura === 20 && e.lux === 500)
    expect(r.umidade).toBe(55) // o que não foi informado fica como estava
  })

  it('parar() interrompe as publicações', async () => {
    await esperar('primeira publicação', () => recebidas[0])
    await dispositivo.parar()
    const antes = recebidas.length
    t += 10_000
    await new Promise((r) => setTimeout(r, 400)) // ausência de evento: só dá para esperar
    expect(recebidas).toHaveLength(antes)
    expect(ultima()).toBeDefined()
  })
})
