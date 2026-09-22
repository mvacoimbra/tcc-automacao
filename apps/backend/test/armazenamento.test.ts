import { mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LeituraComMetadados } from '@tcc/contrato'
import { criarArmazenamento } from '../src/armazenamento'

function leitura(sobre: Partial<LeituraComMetadados> = {}): LeituraComMetadados {
  return {
    dispositivo: 'sala01',
    seq: 1,
    ts: 1790000000000,
    estado: 'OCUPADO',
    pir: true,
    temperatura: 28.5,
    umidade: 55,
    lux: 120.5,
    luz: true,
    hvac: false,
    recebidoEm: 1790000000100,
    latenciaMs: 100,
    perdidas: 0,
    ...sobre,
  }
}

let dir: string
let caminho: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tcc-armazenamento-'))
  caminho = join(dir, 'leituras.db')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Armazenamento (SQLite)', () => {
  it('ida e volta preserva todos os campos, incluindo nulos e booleanos', () => {
    const arm = criarArmazenamento(caminho)
    const original = leitura({ temperatura: null, umidade: null, latenciaMs: null, ts: 0, pir: false, luz: false, hvac: true })
    arm.gravar(original)
    expect(arm.ultima('sala01')).toEqual(original)
    arm.fechar()
  })

  it('ultima() de dispositivo desconhecido é null', () => {
    const arm = criarArmazenamento(caminho)
    expect(arm.ultima('inexistente')).toBeNull()
    arm.fechar()
  })

  it('ultima() devolve a leitura mais recente do dispositivo', () => {
    const arm = criarArmazenamento(caminho)
    arm.gravar(leitura({ seq: 1, recebidoEm: 1000 }))
    arm.gravar(leitura({ seq: 3, recebidoEm: 3000 }))
    arm.gravar(leitura({ seq: 2, recebidoEm: 2000 }))
    arm.gravar(leitura({ dispositivo: 'sala02', seq: 9, recebidoEm: 9000 }))
    expect(arm.ultima('sala01')?.seq).toBe(3)
    arm.fechar()
  })

  it('listar() filtra por dispositivo e intervalo (inclusive) em ordem crescente', () => {
    const arm = criarArmazenamento(caminho)
    for (const t of [1000, 2000, 3000, 4000, 5000]) arm.gravar(leitura({ seq: t / 1000, recebidoEm: t }))
    arm.gravar(leitura({ dispositivo: 'sala02', recebidoEm: 3000 }))
    const r = arm.listar('sala01', 2000, 4000, 100)
    expect(r.map((l) => l.recebidoEm)).toEqual([2000, 3000, 4000])
    expect(r.every((l) => l.dispositivo === 'sala01')).toBe(true)
    arm.fechar()
  })

  it('listar() com limite devolve as leituras mais recentes, ainda em ordem crescente', () => {
    const arm = criarArmazenamento(caminho)
    for (const t of [1000, 2000, 3000, 4000, 5000]) arm.gravar(leitura({ seq: t / 1000, recebidoEm: t }))
    expect(arm.listar('sala01', 0, 10000, 2).map((l) => l.recebidoEm)).toEqual([4000, 5000])
    arm.fechar()
  })

  it('listar() sem limite finito devolve tudo', () => {
    const arm = criarArmazenamento(caminho)
    for (let i = 1; i <= 5; i++) arm.gravar(leitura({ seq: i, recebidoEm: i * 1000 }))
    expect(arm.listar('sala01', 0, 10000, Infinity)).toHaveLength(5)
    arm.fechar()
  })

  it('dispositivos() lista cada id com o instante da última leitura', () => {
    const arm = criarArmazenamento(caminho)
    arm.gravar(leitura({ dispositivo: 'sala02', recebidoEm: 2000 }))
    arm.gravar(leitura({ dispositivo: 'sala01', recebidoEm: 1000 }))
    arm.gravar(leitura({ dispositivo: 'sala01', recebidoEm: 5000 }))
    expect(arm.dispositivos()).toEqual([
      { id: 'sala01', vistoEm: 5000 },
      { id: 'sala02', vistoEm: 2000 },
    ])
    arm.fechar()
  })

  it('os dados persistem depois de fechar e reabrir o arquivo', () => {
    const a = criarArmazenamento(caminho)
    a.gravar(leitura({ seq: 7 }))
    a.fechar()
    const b = criarArmazenamento(caminho)
    expect(b.ultima('sala01')?.seq).toBe(7)
    b.fechar()
  })

  it('usa journal_mode WAL', () => {
    const arm = criarArmazenamento(caminho)
    const leitor = new DatabaseSync(caminho)
    expect(leitor.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
    leitor.close()
    arm.fechar()
  })
})
