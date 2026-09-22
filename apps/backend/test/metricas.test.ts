import { describe, expect, it } from 'vitest'
import type { LeituraComMetadados } from '@tcc/contrato'
import { calcularMetricas } from '../src/metricas'

function leitura(sobre: Partial<LeituraComMetadados>): LeituraComMetadados {
  return {
    dispositivo: 'sala01',
    seq: 0,
    ts: 1,
    estado: 'DESOCUPADO',
    pir: false,
    temperatura: 28,
    umidade: 55,
    lux: 120,
    luz: false,
    hvac: false,
    recebidoEm: 0,
    latenciaMs: 10,
    perdidas: 0,
    ...sobre,
  }
}

// Série cujos resultados foram calculados à mão (recebidoEm em ms):
//   0     DESOCUPADO           lat 10
//   2000  DESOCUPADO           lat 20
//   4000  OCUPADO  luz         lat 30
//   6000  OCUPADO  luz + hvac  lat 40, 1 perdida
//   8000  OCUPADO  luz + hvac  lat indefinida (ts = 0)
//   30000 DESOCUPADO           lat 50   ← lacuna de 22 s (dispositivo offline)
//   32000 DESOCUPADO           lat 60
const serie: LeituraComMetadados[] = [
  leitura({ recebidoEm: 0, latenciaMs: 10 }),
  leitura({ recebidoEm: 2000, latenciaMs: 20 }),
  leitura({ recebidoEm: 4000, latenciaMs: 30, estado: 'OCUPADO', luz: true }),
  leitura({ recebidoEm: 6000, latenciaMs: 40, estado: 'OCUPADO', luz: true, hvac: true, perdidas: 1 }),
  leitura({ recebidoEm: 8000, latenciaMs: null, estado: 'OCUPADO', luz: true, hvac: true }),
  leitura({ recebidoEm: 30000, latenciaMs: 50 }),
  leitura({ recebidoEm: 32000, latenciaMs: 60 }),
]

describe('calcularMetricas', () => {
  it('latência: ignora leituras sem ts e calcula mín., média, p95, máx. e contagem', () => {
    // amostras 10,20,30,40,50,60 → média 35; p95 por posto mais próximo = 6º valor
    expect(calcularMetricas(serie).latencia).toEqual({
      minMs: 10,
      mediaMs: 35,
      p95Ms: 60,
      maxMs: 60,
      amostras: 6,
    })
  })

  it('latência: p95 por posto mais próximo em 20 amostras é a 19ª', () => {
    const vinte = Array.from({ length: 20 }, (_, i) => leitura({ recebidoEm: i * 1000, latenciaMs: i + 1 }))
    expect(calcularMetricas(vinte).latencia.p95Ms).toBe(19)
  })

  it('perda: total perdido, total recebido e taxa perdidas / (recebidas + perdidas)', () => {
    expect(calcularMetricas(serie).perda).toEqual({ recebidas: 7, perdidas: 1, taxa: 0.125 })
  })

  it('tempo ligado: soma intervalos com luz/hvac ligados e ignora lacuna maior que 10 s', () => {
    // luz: 4000→6000 + 6000→8000 = 4000 (8000→30000 é lacuna, não conta)
    // hvac: só 6000→8000 = 2000
    expect(calcularMetricas(serie).tempoLigado).toEqual({ luzMs: 4000, hvacMs: 2000 })
  })

  it('ocupação: conta mudanças de estado e soma o tempo em OCUPADO (sem a lacuna)', () => {
    // DESOCUPADO→OCUPADO em 4000 e OCUPADO→DESOCUPADO em 30000 = 2 transições
    // OCUPADO: 4000→6000 + 6000→8000 = 4000
    expect(calcularMetricas(serie).ocupacao).toEqual({ transicoes: 2, tempoOcupadoMs: 4000 })
  })

  it('não depende da ordem em que as leituras chegam', () => {
    const embaralhada = [...serie].reverse()
    expect(calcularMetricas(embaralhada)).toEqual(calcularMetricas(serie))
  })

  it('sem leituras: tudo zerado e latência indefinida', () => {
    expect(calcularMetricas([])).toEqual({
      latencia: { minMs: null, mediaMs: null, p95Ms: null, maxMs: null, amostras: 0 },
      perda: { recebidas: 0, perdidas: 0, taxa: 0 },
      tempoLigado: { luzMs: 0, hvacMs: 0 },
      ocupacao: { transicoes: 0, tempoOcupadoMs: 0 },
    })
  })

  it('uma única leitura não forma intervalo', () => {
    const m = calcularMetricas([leitura({ recebidoEm: 0, luz: true, estado: 'OCUPADO' })])
    expect(m.tempoLigado).toEqual({ luzMs: 0, hvacMs: 0 })
    expect(m.ocupacao).toEqual({ transicoes: 0, tempoOcupadoMs: 0 })
  })
})
