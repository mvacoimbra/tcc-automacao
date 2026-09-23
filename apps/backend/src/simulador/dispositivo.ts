// Dispositivo simulado do modo Demo: reproduz o firmware (firmware/src/main.cpp) em
// TypeScript. Conecta ao broker embutido como cliente MQTT comum, exatamente como um
// ESP32 real faria, então o caminho dos dados é o mesmo do dispositivo de verdade (D14).
import { randomBytes } from 'node:crypto'
import { connectAsync } from 'mqtt'
import type { AmbienteDemo, ConfigDispositivo, EstadoPayload } from '@tcc/contrato'
import { CONFIG_PADRAO_DISPOSITIVO, aplicarConfigFirmware } from '../config-dispositivo'
import { novoEstadoDispositivo, passoDispositivo } from './nucleo'

export type OpcoesDispositivoSimulado = {
  porta: number // porta do broker embutido
  raiz: string
  // Relógio em ms usado pela FSM, pelo pulso do PIR e pelo período de publicação.
  // Injetável para os testes não dependerem de tempo real. O `ts` publicado é sempre Date.now().
  agora?: () => number
}

export type DispositivoSimulado = {
  pulsoPir(): void // PIR alto por 5 s (igual ao delayTime do diagrama do Wokwi)
  definirAmbiente(ambiente: AmbienteDemo): void
  parar(): Promise<void>
}

const ID_DISPOSITIVO = 'sala01'
const PERIODO_DECISAO_MS = 100 // PERIODO_DECISAO_MS do firmware
const PERIODO_PUBLICACAO_MS = 2000 // PERIODO_PUBLICACAO_MS do firmware
const DURACAO_PULSO_PIR_MS = 5000

export async function iniciarDispositivoSimulado(opcoes: OpcoesDispositivoSimulado): Promise<DispositivoSimulado> {
  const agora = opcoes.agora ?? Date.now
  const topicoEstado = `${opcoes.raiz}/${ID_DISPOSITIVO}/estado`
  const topicoConfig = `${opcoes.raiz}/${ID_DISPOSITIVO}/config`

  // Estado do "dispositivo": mesmos valores iniciais do diagrama do Wokwi.
  let config: ConfigDispositivo = { ...CONFIG_PADRAO_DISPOSITIVO }
  let ambiente = { temperatura: 28, umidade: 55, lux: 120 }
  const dispositivo = novoEstadoDispositivo()
  let pirAte = -Infinity
  let seq = 0
  let ultimaPublicacao = -Infinity

  const cliente = await connectAsync({
    protocol: 'mqtt',
    host: '127.0.0.1',
    port: opcoes.porta,
    clientId: `tcc-demo-${randomBytes(4).toString('hex')}`,
    reconnectPeriod: 1000,
  })
  cliente.on('error', (erro) => console.warn(`[demo] erro MQTT: ${erro.message}`))
  cliente.on('message', (_topico, corpo) => {
    try {
      config = aplicarConfigFirmware(config, JSON.parse(corpo.toString('utf8')))
    } catch {
      console.warn('[demo] config inválida') // igual ao "[mqtt] config inválida" do firmware
    }
  })
  await cliente.subscribeAsync(topicoConfig)

  function publicar(t: number, pir: boolean): void {
    if (!cliente.connected) return // tenta de novo no próximo ciclo
    const estado: EstadoPayload = {
      dispositivo: ID_DISPOSITIVO,
      seq: seq++,
      ts: Date.now(),
      estado: dispositivo.fsm.estado,
      pir,
      temperatura: ambiente.temperatura,
      umidade: ambiente.umidade,
      lux: ambiente.lux,
      luz: dispositivo.luz,
      hvac: dispositivo.hvac,
    }
    ultimaPublicacao = t
    cliente.publish(topicoEstado, JSON.stringify(estado), (erro) => {
      if (erro) console.warn(`[demo] falha ao publicar: ${erro.message}`)
    })
  }

  // Ciclo de decisão (taskDecisao do firmware): FSM, depois luz e HVAC, e publica
  // a cada mudança de estado ou de saída, ou a cada 2 s.
  function ciclo(): void {
    const t = agora()
    const pir = t < pirAte
    const mudou = passoDispositivo(dispositivo, { pir, config, ambiente }, t)
    if (mudou || t - ultimaPublicacao >= PERIODO_PUBLICACAO_MS) publicar(t, pir)
  }

  const temporizador = setInterval(ciclo, PERIODO_DECISAO_MS)
  ciclo() // primeira publicação imediata, para a tela não começar vazia
  console.log(`[demo] dispositivo simulado ${ID_DISPOSITIVO} conectado ao broker embutido`)

  let parado = false
  return {
    pulsoPir() {
      pirAte = agora() + DURACAO_PULSO_PIR_MS
    },
    definirAmbiente(novo) {
      ambiente = {
        temperatura: novo.temperatura ?? ambiente.temperatura,
        umidade: novo.umidade ?? ambiente.umidade,
        lux: novo.lux ?? ambiente.lux,
      }
    },
    async parar() {
      if (parado) return
      parado = true
      clearInterval(temporizador)
      await cliente.endAsync(true)
    },
  }
}
