// O executor de roteiros reproduz o programa de referência do CT-07
// (docs/experimentos/ct07_falsos_positivos.cpp, resultado em ct07.csv).
//
// Diferença conhecida de um passo (100 ms) em algumas células: o programa em C++
// acumula o tempo num double (`t += 0.1`), e 150 somas de 0,1 dão 14,999999999999963
// no lugar de 15. Com isso, lá dentro `t - ultimoMovimento < 5,0` continua verdadeiro
// por mais um passo (a retenção do PIR vira 5,1 s) e `t >= 10` falha no instante
// nominal de 10 s (a ocupação real começa um passo depois). Aqui o tempo é inteiro,
// em ms, então 5000 < 5000 é falso. Os valores esperados abaixo são os exatos, com o
// valor do CSV citado ao lado; ver D16 em docs/decisoes.md.
import { describe, expect, it } from 'vitest'
import { Roteiro } from '@tcc/contrato'
import { executarRoteiro } from '../src/simulador/roteiro'

const CONFIGS = {
  A: { tOcupadoMs: 30000, janelaConfMs: 0, pulsosConf: 1 },
  B: { tOcupadoMs: 30000, janelaConfMs: 10000, pulsosConf: 2 },
  D: { tOcupadoMs: 30000, janelaConfMs: 10000, pulsosConf: 2, confirmacaoPorNivelMs: 7000 },
}

// Cenários do ct07_falsos_positivos.cpp: horizonte de 150 s, passo de 100 ms.
function roteiroCt07(cenario: 'S1' | 'S3' | 'S5', config: keyof typeof CONFIGS) {
  const eventos =
    cenario === 'S3'
      ? [{ t: 10000, ate: 90000, movimentoACada: 500 }] // faixa(10, 90, 0.5)
      : [{ t: 10000 }]
  return Roteiro.parse({
    nome: `CT-07 ${cenario} ${config}`,
    duracaoMs: 150000,
    passoMs: 100,
    config: CONFIGS[config],
    ocupacaoReal: cenario === 'S1' ? [] : [{ de: 10000, ate: 90000 }],
    eventos,
  })
}

describe('Executor de roteiros × programa de referência do CT-07', () => {
  it('S1 com janela desativada: 35 s ocupado por uma passagem isolada (CSV: 35,1)', () => {
    const r = executarRoteiro(roteiroCt07('S1', 'A'), { baseEpochMs: 1790000000000 })
    expect(r.cenario.tempoOcupadoMs).toBe(35000) // 5 s de PIR + 30 s de tOcupado
    expect(r.cenario.atrasoAteOcupadoMs).toBe(0)
    // Sem ocupação real declarada, todo o tempo ocupado é indevido e não há cauda.
    expect(r.cenario.ocupadoIndevidoMs).toBe(35000)
    expect(r.cenario.caudaMs).toBe(0)
  })

  it('S3 com 2 pulsos em 10 s: movimento contínuo nunca confirma (80 s desocupado)', () => {
    const r = executarRoteiro(roteiroCt07('S3', 'B'), { baseEpochMs: 1790000000000 })
    expect(r.cenario.ativou).toBe(false)
    expect(r.cenario.desocupadoIndevidoMs).toBe(80000)
  })

  it('S3 com a variante D: confirma por nível aos 7 s (CSV: 6,9 s desocupado)', () => {
    const r = executarRoteiro(roteiroCt07('S3', 'D'), { baseEpochMs: 1790000000000 })
    expect(r.cenario.atrasoAteOcupadoMs).toBe(7000)
    expect(r.cenario.desocupadoIndevidoMs).toBe(7000)
    expect(r.cenario.tempoOcupadoMs).toBe(108000) // CSV: 108,1
  })

  it('S5 pessoa parada, janela desativada: 45 s desocupado, sem falso positivo', () => {
    const r = executarRoteiro(roteiroCt07('S5', 'A'), { baseEpochMs: 1790000000000 })
    expect(r.cenario.desocupadoIndevidoMs).toBe(45000)
    // O ct07.csv soma 0,1 s de falso positivo aqui; é o passo extra do double.
    expect(r.cenario.ocupadoIndevidoMs).toBe(0)
    expect(r.cenario.caudaMs).toBe(0)
  })
})

describe('Determinismo e formato da saída', () => {
  it('duas execuções do mesmo roteiro dão as mesmas métricas', () => {
    const roteiro = roteiroCt07('S3', 'D')
    const a = executarRoteiro(roteiro, { baseEpochMs: 1 })
    const b = executarRoteiro(roteiro, { baseEpochMs: 999 })
    expect(b.cenario).toEqual(a.cenario)
    expect(b.leituras.map((l) => l.estado)).toEqual(a.leituras.map((l) => l.estado))
  })

  it('publica como o firmware: na mudança e a cada 2 s', () => {
    const r = executarRoteiro(roteiroCt07('S1', 'A'), { baseEpochMs: 0 })
    expect(r.leituras[0].ts).toBe(0) // primeira publicação no instante 0
    const intervalos = r.leituras.slice(1).map((l, i) => l.ts - r.leituras[i].ts)
    expect(Math.max(...intervalos)).toBeLessThanOrEqual(2000)
    expect(r.metricas.perda.perdidas).toBe(0)
  })
})
