import { describe, expect, it } from 'vitest'
import { PERIODOS, inicioDoPeriodo, reduzirSerie, ticksDoEixo } from './serie'

describe('reduzirSerie (decimação para os gráficos)', () => {
  const numeros = (n: number) => Array.from({ length: n }, (_, i) => i)

  it('série que já cabe no máximo não muda', () => {
    const serie = numeros(5)
    expect(reduzirSerie(serie, 5)).toBe(serie)
    expect(reduzirSerie(serie, 100)).toBe(serie)
  })

  it('mantém primeiro e último, não passa do máximo e preserva a ordem', () => {
    const reduzida = reduzirSerie(numeros(10_000), 1500)
    expect(reduzida).toHaveLength(1500)
    expect(reduzida[0]).toBe(0)
    expect(reduzida[reduzida.length - 1]).toBe(9999)
    expect([...reduzida].sort((a, b) => a - b)).toEqual(reduzida)
    expect(new Set(reduzida).size).toBe(reduzida.length) // sem repetição
  })

  it('escolhe pontos igualmente espaçados', () => {
    expect(reduzirSerie(numeros(10), 5)).toEqual([0, 2, 5, 7, 9])
  })

  it('série vazia continua vazia', () => {
    expect(reduzirSerie([], 10)).toEqual([])
  })
})

describe('períodos do Histórico', () => {
  it('oferece 15 min, 1 h, 24 h e tudo, nessa ordem', () => {
    expect(PERIODOS.map((p) => p.id)).toEqual(['15min', '1h', '24h', 'tudo'])
  })

  it('o início do período é "agora" menos a duração; "tudo" começa em 0', () => {
    const agora = 1_790_000_000_000
    expect(inicioDoPeriodo('15min', agora)).toBe(agora - 15 * 60_000)
    expect(inicioDoPeriodo('1h', agora)).toBe(agora - 3_600_000)
    expect(inicioDoPeriodo('24h', agora)).toBe(agora - 86_400_000)
    expect(inicioDoPeriodo('tudo', agora)).toBe(0)
  })
})

describe('ticksDoEixo (escala de tempo dos gráficos)', () => {
  const T = 1_790_000_000_000
  const PASSOS_ACEITOS = [
    1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
    3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000, 172_800_000, 604_800_000,
  ]

  function espacamentos(ticks: number[]): number[] {
    return ticks.slice(1).map((t, i) => t - ticks[i])
  }

  it.each([
    ['15 min', 15 * 60_000],
    ['1 h', 3_600_000],
    ['24 h', 86_400_000],
    ['30 dias', 30 * 86_400_000],
  ])('janela de %s: ticks ordenados, dentro do intervalo, com passo redondo e no máximo 8', (_nome, span) => {
    const ticks = ticksDoEixo(T, T + span)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.length).toBeLessThanOrEqual(8)
    expect(ticks[0]).toBeGreaterThanOrEqual(T)
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(T + span)
    const passos = new Set(espacamentos(ticks))
    expect(passos.size).toBe(1)
    expect(PASSOS_ACEITOS).toContain([...passos][0])
  })

  it('cobre toda a janela, não só a região dos dados: primeiro e último tick perto das pontas', () => {
    const span = 15 * 60_000
    const ticks = ticksDoEixo(T, T + span)
    const passo = espacamentos(ticks)[0]
    expect(ticks[0] - T).toBeLessThan(passo)
    expect(T + span - ticks[ticks.length - 1]).toBeLessThan(passo)
  })

  it('passos de uma hora ou mais caem em hora cheia no fuso local', () => {
    for (const t of ticksDoEixo(T, T + 6 * 3_600_000)) {
      const d = new Date(t)
      expect([d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0])
    }
  })

  it('intervalo vazio ou invertido devolve só o início', () => {
    expect(ticksDoEixo(T, T)).toEqual([T])
    expect(ticksDoEixo(T, T - 1000)).toEqual([T])
  })
})
