import { describe, expect, it } from 'vitest'
import { criarReconexao } from './reconexao'

describe('criarReconexao (espera entre tentativas do WebSocket)', () => {
  it('começa em 1 s, dobra a cada tentativa e para em 10 s', () => {
    const r = criarReconexao()
    expect([1, 2, 3, 4, 5, 6, 7].map(() => r.proxima())).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000])
  })

  it('zerar() volta a esperar 1 s (depois de conectar)', () => {
    const r = criarReconexao()
    r.proxima()
    r.proxima()
    r.proxima()
    r.zerar()
    expect(r.proxima()).toBe(1000)
    expect(r.proxima()).toBe(2000)
  })

  it('cada reconexão tem a sua própria contagem', () => {
    const a = criarReconexao()
    const b = criarReconexao()
    a.proxima()
    a.proxima()
    expect(b.proxima()).toBe(1000)
  })
})
