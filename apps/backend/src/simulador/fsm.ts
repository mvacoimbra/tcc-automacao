// Porte fiel de firmware/include/occupancy_fsm.h (Figura 3 do TC I) para TypeScript.
//
// Mesma lógica, ramo a ramo, para o modo Demo se comportar como o firmware. O C++
// usa uint32_t (millis()); aqui toda subtração de tempo é `(agora - t) >>> 0` e todo
// incremento é `(t + n) >>> 0`, senão o caso do estouro do millis() (~49,7 dias) quebra.
//
// Com janelaConfMs = 0 o comportamento é idêntico à Figura 3 (hipótese).
// Com janelaConfMs > 0 entra o estado CONFIRMANDO, que exige N detecções
// dentro da janela para aceitar a ocupação (redução de falsos positivos,
// citada na seção 2.5).
//
// Com confirmacaoPorNivelMs > 0 (variante D do Capítulo 4), a ocupação também é
// aceita quando o PIR fica em nível alto continuamente por mais que esse tempo:
// uma pessoa parada mantém o sensor em alto sem gerar novas bordas.
import type { Ocupacao } from '@tcc/contrato'

// Em TS o próprio valor de Ocupacao é o texto publicado; o ocupacaoStr() do C++
// seria a função identidade e por isso não existe aqui.
export type { Ocupacao }

export type FsmConfig = {
  tOcupadoMs: number // uint32
  janelaConfMs: number // uint32
  pulsosConf: number // uint8
  confirmacaoPorNivelMs?: number // uint32; 0 ou ausente = variante desativada
}

export type FsmState = {
  estado: Ocupacao
  tUltimo: number // uint32
  tInicioJanela: number // uint32
  tPirAlto: number // uint32; última borda de subida, para a confirmação por nível
  pulsos: number // uint8
  pirAnterior: boolean
}

// Valores iniciais do struct FsmState do C++.
export function novoFsmState(): FsmState {
  return { estado: 'DESOCUPADO', tUltimo: 0, tInicioJanela: 0, tPirAlto: 0, pulsos: 0, pirAnterior: false }
}

// Avança um ciclo. Retorna true se o estado mudou.
// `agora` é o relógio em ms como uint32 (o millis() do firmware).
export function fsmStep(s: FsmState, c: FsmConfig, pir: boolean, agora: number): boolean {
  agora = agora >>> 0
  const antes = s.estado
  const borda = pir && !s.pirAnterior // borda de subida do PIR
  if (borda) s.tPirAlto = agora
  s.pirAnterior = pir

  switch (s.estado) {
    case 'DESOCUPADO':
      if (borda) {
        s.tUltimo = agora
        if (c.janelaConfMs === 0 || c.pulsosConf <= 1) {
          s.estado = 'OCUPADO'
        } else {
          s.estado = 'CONFIRMANDO'
          s.tInicioJanela = agora
          s.pulsos = 1
        }
      }
      break

    case 'CONFIRMANDO':
      if (((agora - s.tInicioJanela) >>> 0) > c.janelaConfMs) {
        s.estado = 'DESOCUPADO' // detecção isolada descartada
        s.pulsos = 0
      } else if (borda) {
        s.tUltimo = agora
        s.pulsos = (s.pulsos + 1) & 0xff // ++pulsos em uint8_t
        if (s.pulsos >= c.pulsosConf) s.estado = 'OCUPADO'
      } else if (
        (c.confirmacaoPorNivelMs ?? 0) !== 0 &&
        pir &&
        ((agora - s.tPirAlto) >>> 0) >= (c.confirmacaoPorNivelMs ?? 0)
      ) {
        s.tUltimo = agora // pessoa parada: o nível alto sustentado confirma
        s.estado = 'OCUPADO'
      }
      break

    case 'OCUPADO':
      if (pir) {
        s.tUltimo = agora
      } else if (((agora - s.tUltimo) >>> 0) > c.tOcupadoMs) {
        s.estado = 'DESOCUPADO'
      }
      break
  }
  return s.estado !== antes
}
