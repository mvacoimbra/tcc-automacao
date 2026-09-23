// Núcleo do dispositivo simulado, sem relógio e sem MQTT: um passo da taskDecisao
// do firmware (firmware/src/main.cpp). É o mesmo código nos dois caminhos — o modo
// Demo em tempo real (dispositivo.ts) e o executor de roteiros (roteiro.ts) —, para
// o experimento medir exatamente o que a demonstração faz.
import type { ConfigDispositivo } from '@tcc/contrato'
import { fsmStep, novoFsmState, type FsmState } from './fsm'

export type Ambiente = { temperatura: number; umidade: number; lux: number }

export type EstadoDispositivo = {
  fsm: FsmState
  luz: boolean
  hvac: boolean
}

export type EntradasDispositivo = {
  pir: boolean
  config: ConfigDispositivo
  ambiente: Ambiente
}

export function novoEstadoDispositivo(): EstadoDispositivo {
  return { fsm: novoFsmState(), luz: false, hvac: false }
}

// Avança um ciclo de decisão: FSM, depois luz e HVAC (main.cpp:103-106).
// Retorna true quando mudou o estado de ocupação ou alguma saída — é o que o
// firmware usa para publicar antes do período de 2 s.
export function passoDispositivo(s: EstadoDispositivo, e: EntradasDispositivo, agora: number): boolean {
  const mudouEstado = fsmStep(s.fsm, e.config, e.pir, agora)
  const ocupado = s.fsm.estado === 'OCUPADO'
  const novaLuz = ocupado && e.ambiente.lux < e.config.luxLimiar
  const novoHvac = ocupado && e.ambiente.temperatura > e.config.tempAlvo
  const mudou = mudouEstado || novaLuz !== s.luz || novoHvac !== s.hvac
  s.luz = novaLuz
  s.hvac = novoHvac
  return mudou
}
