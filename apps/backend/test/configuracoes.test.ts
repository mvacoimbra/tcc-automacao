import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Configuracoes } from '@tcc/contrato'
import { CONFIGURACOES_PADRAO, gravarConfiguracoes, lerConfiguracoes } from '../src/configuracoes'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tcc-configuracoes-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('configuracoes.json', () => {
  it('primeira execução (sem arquivo): broker embutido com demo ligado', () => {
    expect(lerConfiguracoes(dir)).toEqual({ broker: { modo: 'embutido' }, demo: true })
    expect(CONFIGURACOES_PADRAO).toEqual({ broker: { modo: 'embutido' }, demo: true })
  })

  it('ida e volta de uma configuração de broker externo', () => {
    const c: Configuracoes = {
      broker: { modo: 'externo', host: 'broker.hivemq.com', porta: 1883, raiz: 'tcc-unip-7f3a9c' },
      demo: false,
    }
    gravarConfiguracoes(dir, c)
    expect(lerConfiguracoes(dir)).toEqual(c)
  })

  it('a gravação não deixa arquivo temporário para trás', () => {
    gravarConfiguracoes(dir, CONFIGURACOES_PADRAO)
    expect(readdirSync(dir)).toEqual(['configuracoes.json'])
    expect(JSON.parse(readFileSync(join(dir, 'configuracoes.json'), 'utf8'))).toEqual(CONFIGURACOES_PADRAO)
  })

  it('arquivo corrompido ou fora do contrato volta ao padrão sem lançar', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeFileSync(join(dir, 'configuracoes.json'), '{ isto não é json')
    expect(lerConfiguracoes(dir)).toEqual(CONFIGURACOES_PADRAO)
    writeFileSync(join(dir, 'configuracoes.json'), JSON.stringify({ broker: { modo: 'externo' }, demo: 'sim' }))
    expect(lerConfiguracoes(dir)).toEqual(CONFIGURACOES_PADRAO)
  })
})
