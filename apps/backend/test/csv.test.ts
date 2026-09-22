import { describe, expect, it } from 'vitest'
import type { LeituraComMetadados } from '@tcc/contrato'
import { CABECALHO_CSV, gerarCsv } from '../src/csv'

function leitura(sobre: Partial<LeituraComMetadados> = {}): LeituraComMetadados {
  return {
    dispositivo: 'sala01',
    seq: 42,
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

describe('gerarCsv', () => {
  it('sem leituras, devolve só o cabeçalho', () => {
    expect(gerarCsv([])).toBe(`${CABECALHO_CSV}\n`)
    expect(CABECALHO_CSV).toBe(
      'recebidoEm,dispositivo,seq,ts,latenciaMs,perdidas,estado,pir,temperatura,umidade,lux,luz,hvac',
    )
  })

  it('uma linha por leitura: separador vírgula, decimal com ponto, booleanos 1/0', () => {
    expect(gerarCsv([leitura()])).toBe(
      `${CABECALHO_CSV}\n1790000000100,sala01,42,1790000000000,100,0,OCUPADO,1,28.5,55,120.5,1,0\n`,
    )
  })

  it('valores nulos (sem NTP, DHT sem leitura) viram campo vazio', () => {
    const linhas = gerarCsv([leitura({ ts: 0, latenciaMs: null, temperatura: null, umidade: null, pir: false })]).split('\n')
    expect(linhas[1]).toBe('1790000000100,sala01,42,0,,0,OCUPADO,0,,,120.5,1,0')
  })

  it('mantém a ordem recebida e a quantidade de colunas do cabeçalho em toda linha', () => {
    const csv = gerarCsv([leitura({ seq: 1 }), leitura({ seq: 2 })])
    const linhas = csv.trimEnd().split('\n')
    expect(linhas).toHaveLength(3)
    expect(linhas[1].split(',')[2]).toBe('1')
    expect(linhas[2].split(',')[2]).toBe('2')
    for (const l of linhas) expect(l.split(',')).toHaveLength(CABECALHO_CSV.split(',').length)
  })
})
