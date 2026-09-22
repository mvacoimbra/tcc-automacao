import { describe, expect, it } from 'vitest'
import {
  calcularLatencia,
  calcularPerdidas,
  interpretarEstado,
  processarEstado,
} from '../src/processamento'

const payloadValido = {
  dispositivo: 'sala01',
  seq: 42,
  ts: 1790000000000,
  estado: 'OCUPADO',
  pir: true,
  temperatura: 28,
  umidade: 55,
  lux: 120.5,
  luz: true,
  hvac: true,
}

describe('calcularLatencia', () => {
  it('ts = 0 (NTP não sincronizou) → latência indefinida (null)', () => {
    expect(calcularLatencia(1790000000500, 0)).toBeNull()
  })

  it('ts > 0 → recebidoEm - ts', () => {
    expect(calcularLatencia(1790000000350, 1790000000000)).toBe(350)
  })

  it('mantém o sinal quando os relógios divergem (latência negativa)', () => {
    expect(calcularLatencia(1790000000000, 1790000000200)).toBe(-200)
  })
})

describe('calcularPerdidas', () => {
  it('lacuna em seq: 5 → 8 perdeu 2 mensagens', () => {
    expect(calcularPerdidas(5, 8)).toBe(2)
  })

  it('sequência normal: 5 → 6 não perdeu nada', () => {
    expect(calcularPerdidas(5, 6)).toBe(0)
  })

  it('reinício do dispositivo (seq menor) não é perda', () => {
    expect(calcularPerdidas(10, 0)).toBe(0)
  })

  it('seq repetido não é perda', () => {
    expect(calcularPerdidas(10, 10)).toBe(0)
  })

  it('primeira mensagem do dispositivo (sem referência) não é perda', () => {
    expect(calcularPerdidas(undefined, 37)).toBe(0)
  })
})

describe('interpretarEstado', () => {
  it('aceita o payload do contrato', () => {
    const r = interpretarEstado(JSON.stringify(payloadValido))
    expect(r).toEqual({ ok: true, dados: payloadValido })
  })

  it('aceita temperatura nula (DHT ainda sem leitura)', () => {
    const r = interpretarEstado(JSON.stringify({ ...payloadValido, temperatura: null }))
    expect(r.ok).toBe(true)
  })

  it('rejeita texto que não é JSON, sem lançar', () => {
    const r = interpretarEstado('isto não é json')
    expect(r.ok).toBe(false)
  })

  it('rejeita JSON fora do contrato e diz qual campo falhou', () => {
    const r = interpretarEstado(JSON.stringify({ ...payloadValido, estado: 'OUTRO' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('estado')
  })
})

describe('processarEstado', () => {
  it('acrescenta recebidoEm, latência e perdidas ao payload', () => {
    const l = processarEstado(payloadValido as never, 1790000000100, 39)
    expect(l).toMatchObject({
      ...payloadValido,
      recebidoEm: 1790000000100,
      latenciaMs: 100,
      perdidas: 2, // 39 → 42 perdeu 40 e 41
    })
  })
})
