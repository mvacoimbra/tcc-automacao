// Os roteiros de docs/experimentos/roteiros são as tabelas do Capítulo 4: se um
// deles deixar de produzir o número publicado, o texto do TCC fica errado. Este
// teste roda os roteiros versionados e confere os valores de aceitação do PRD.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Roteiro } from '@tcc/contrato'
import { executarRoteiro } from '../src/simulador/roteiro'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const DIR_ROTEIROS = join(RAIZ, 'docs/experimentos/roteiros')

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : [],
  )
}

function rodar(caminho: string) {
  const roteiro = Roteiro.parse(JSON.parse(readFileSync(join(DIR_ROTEIROS, caminho), 'utf8')))
  return executarRoteiro(roteiro, { baseEpochMs: 1790000000000 })
}

const horas = (ms: number) => ms / 3_600_000

describe('Roteiros versionados', () => {
  it('todos são válidos pelo contrato', () => {
    const todos = arquivos(DIR_ROTEIROS)
    expect(todos.length).toBeGreaterThanOrEqual(28) // 20 do CT-07, 4 do CT-09, 4 funcionais
    for (const arquivo of todos) {
      const r = Roteiro.safeParse(JSON.parse(readFileSync(arquivo, 'utf8')))
      expect(r.success, `${arquivo}: ${r.success ? '' : r.error.message}`).toBe(true)
    }
  })

  // CT-09: os valores publicados na Tabela 3 (docs/experimentos/ct09.csv).
  it('CT-09 densa reduz 9,0% (A) e 9,2% (D) ante a linha de base', () => {
    const a = rodar('ct09/denso-a.json')
    const d = rodar('ct09/denso-d.json')
    expect(horas(a.cenario.ocupacaoRealMs)).toBeCloseTo(7.25, 2)
    expect(a.cenario.reducao.luzPct).toBeCloseTo(9.0, 1)
    expect(d.cenario.reducao.luzPct).toBeCloseTo(9.2, 1)
    // A variante D confirma por nível, então passa mais tempo desocupada no início
    // de cada bloco: 0,9 min contra 0,2 min da configuração A.
    expect(a.cenario.desocupadoIndevidoMs / 60000).toBeCloseTo(0.2, 1)
    expect(d.cenario.desocupadoIndevidoMs / 60000).toBeCloseTo(0.9, 1)
  })

  it('CT-09 esparsa reduz 65,2% (A) e 65,3% (D)', () => {
    const a = rodar('ct09/esparso-a.json')
    const d = rodar('ct09/esparso-d.json')
    expect(horas(a.cenario.ocupacaoRealMs)).toBeCloseTo(2.75, 2)
    expect(a.cenario.reducao.luzPct).toBeCloseTo(65.2, 1)
    expect(d.cenario.reducao.luzPct).toBeCloseTo(65.3, 1)
  })

  // CT-02 a CT-05: mesmos desfechos do docs/experimentos/funcional.py.
  it('CT-04 desocupa 30 s depois do PIR baixar, e o CT-05 em 10 s', () => {
    expect(rodar('funcionais/ct04-desocupacao-30s.json').cenario.tempoOcupadoMs).toBe(35000) // 5 s de PIR + 30 s
    expect(rodar('funcionais/ct05-config-remota-10s.json').cenario.tempoOcupadoMs).toBe(15000) // 5 s de PIR + 10 s
  })

  it('CT-03: luz apaga acima de 300 lux e HVAC desliga com alvo de 30 °C', () => {
    const r = rodar('funcionais/ct03-limiares.json')
    expect(r.cenario.tempoOcupadoMs).toBe(35000)
    expect(r.cenario.tempoLigado.luzMs).toBe(30000) // 5 s apagada com 600 lux
    expect(r.cenario.tempoLigado.hvacMs).toBe(30000) // 5 s desligado com alvo 30 °C
  })

  // CT-07: a Tabela 2 inteira, com os valores do ct07.csv menos o passo extra que o
  // double do programa em C++ acrescenta (ver cabeçalho de roteiro.test.ts e D16).
  it('CT-07 reproduz a Tabela 2', () => {
    const esperado: Record<string, { ocupado: number; fn: number }> = {
      's1-a': { ocupado: 35000, fn: 0 },
      's1-b': { ocupado: 0, fn: 0 },
      's2-a': { ocupado: 70000, fn: 0 },
      's3-a': { ocupado: 115000, fn: 0 },
      's3-b': { ocupado: 0, fn: 80000 },
      's3-c': { ocupado: 0, fn: 80000 },
      's3-d': { ocupado: 108000, fn: 7000 },
      's4-a': { ocupado: 115000, fn: 0 },
      's4-b': { ocupado: 107000, fn: 8000 },
      's4-d': { ocupado: 107000, fn: 8000 },
      's5-a': { ocupado: 35000, fn: 45000 },
      's5-d': { ocupado: 0, fn: 80000 },
    }
    for (const [nome, alvo] of Object.entries(esperado)) {
      const c = rodar(`ct07/${nome}.json`).cenario
      expect({ nome, ocupado: c.tempoOcupadoMs, fn: c.desocupadoIndevidoMs }).toEqual({ nome, ...alvo })
    }
  })
})
