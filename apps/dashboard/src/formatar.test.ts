import { describe, expect, it } from 'vitest'
import { contagemRegressiva, formatarDuracao, formatarNumero, formatarPercentual } from './formatar'

describe('formatarDuracao', () => {
  it.each([
    [0, '0 s'],
    [42_000, '42 s'],
    [61_000, '1 min 01 s'],
    [3_599_000, '59 min 59 s'],
    [3_600_000, '1 h 00 min'],
    [3_725_000, '1 h 02 min'],
    [-5000, '0 s'],
  ])('%i ms → %s', (ms, esperado) => {
    expect(formatarDuracao(ms)).toBe(esperado)
  })
})

describe('formatarNumero (pt-BR)', () => {
  it('usa vírgula decimal e o número de casas pedido', () => {
    expect(formatarNumero(28.5, 1)).toBe('28,5')
    expect(formatarNumero(28, 1)).toBe('28,0')
    expect(formatarNumero(120.5, 0)).toMatch(/^12[01]$/)
  })

  it('separa milhares com ponto', () => {
    expect(formatarNumero(1200, 0)).toBe('1.200')
  })

  it('valor ausente (sensor sem leitura) vira travessão', () => {
    expect(formatarNumero(null)).toBe('—')
  })
})

describe('formatarPercentual', () => {
  it('converte razão em porcentagem com uma casa', () => {
    expect(formatarPercentual(0.125)).toBe('12,5 %')
    expect(formatarPercentual(0)).toBe('0,0 %')
  })
})

describe('contagemRegressiva (tempo até desocupar)', () => {
  it('t_ocupado menos o tempo desde o último movimento', () => {
    expect(contagemRegressiva(30_000, 1_000, 11_000)).toBe(20_000)
  })

  it('não fica negativa', () => {
    expect(contagemRegressiva(30_000, 1_000, 99_000)).toBe(0)
  })

  it('sem movimento conhecido, não há contagem', () => {
    expect(contagemRegressiva(30_000, null, 11_000)).toBeNull()
  })
})
