// Porte dos 9 casos de firmware/test/fsm_test.cpp, com os mesmos nomes e valores.
// É a prova de que o modo Demo se comporta como o firmware.
import { describe, expect, it } from 'vitest'
import { fsmStep, novoFsmState, type FsmConfig, type FsmState } from './fsm'

// Relógio de teste: `t` avança em passos de 100 ms com aritmética uint32,
// como o millis() do ESP32.
type Relogio = { t: number }

// Simula 'ms' milissegundos em passos de 100 ms com o PIR fixo.
// Itera por número de passos (e não "t < fim"): comparar instantes absolutos
// quebra quando o contador estoura — o mesmo erro que a FSM evita.
function rodar(s: FsmState, c: FsmConfig, pir: boolean, relogio: Relogio, ms: number): void {
  for (let passos = Math.floor(ms / 100); passos > 0; --passos, relogio.t = (relogio.t + 100) >>> 0) {
    fsmStep(s, c, pir, relogio.t)
  }
}

describe('Modelo da Figura 3 (sem janela de confirmação)', () => {
  const c: FsmConfig = { tOcupadoMs: 30000, janelaConfMs: 0, pulsosConf: 1 }
  const s = novoFsmState()
  const relogio: Relogio = { t: 0 }

  it('fig3: inicia desocupado', () => {
    rodar(s, c, false, relogio, 1000)
    expect(s.estado).toBe('DESOCUPADO')
  })

  it('fig3: movimento -> OCUPADO', () => {
    rodar(s, c, true, relogio, 500)
    expect(s.estado).toBe('OCUPADO')
  })

  it('fig3: mantém ocupado antes de t_ocupado', () => {
    rodar(s, c, false, relogio, 29000)
    expect(s.estado).toBe('OCUPADO')
  })

  it('fig3: desocupa após t_ocupado', () => {
    rodar(s, c, false, relogio, 2000)
    expect(s.estado).toBe('DESOCUPADO')
  })
})

describe('Com janela de confirmação (2 pulsos em 10 s)', () => {
  const c: FsmConfig = { tOcupadoMs: 30000, janelaConfMs: 10000, pulsosConf: 2 }
  const s = novoFsmState()
  const relogio: Relogio = { t: 0 }

  it('janela: 1º pulso -> CONFIRMANDO', () => {
    rodar(s, c, true, relogio, 300)
    expect(s.estado).toBe('CONFIRMANDO')
  })

  it('janela: pulso isolado descartado (falso positivo)', () => {
    rodar(s, c, false, relogio, 11000)
    expect(s.estado).toBe('DESOCUPADO')
  })

  it('janela: 2 pulsos na janela -> OCUPADO', () => {
    rodar(s, c, true, relogio, 300)
    rodar(s, c, false, relogio, 2000)
    rodar(s, c, true, relogio, 300)
    expect(s.estado).toBe('OCUPADO')
  })
})

describe('Estouro do millis() (~49,7 dias)', () => {
  const c: FsmConfig = { tOcupadoMs: 30000, janelaConfMs: 0, pulsosConf: 1 }
  const s = novoFsmState()
  const relogio: Relogio = { t: 0xffffffff - 1000 } // 1 s antes do estouro

  it('overflow: não desocupa antes da hora', () => {
    rodar(s, c, true, relogio, 300)
    rodar(s, c, false, relogio, 10000) // atravessa o estouro
    expect(s.estado).toBe('OCUPADO')
  })

  it('overflow: desocupa no tempo certo', () => {
    rodar(s, c, false, relogio, 25000)
    expect(s.estado).toBe('DESOCUPADO')
  })
})
