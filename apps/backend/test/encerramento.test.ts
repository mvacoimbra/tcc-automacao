import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarDirDados } from './ajudantes'

const raizBackend = fileURLToPath(new URL('..', import.meta.url))
const script = fileURLToPath(new URL('./fixtures/encerra-limpo.ts', import.meta.url))

let dirDados: string

beforeEach(() => {
  dirDados = criarDirDados()
})

afterEach(() => {
  rmSync(dirDados, { recursive: true, force: true })
})

describe('parar()', () => {
  it('deixa o processo terminar sozinho, com código 0, em menos de 5 s (sem handles abertos)', async () => {
    const inicio = Date.now()
    const filho = spawn(process.execPath, ['--import', 'tsx', script, dirDados], {
      cwd: raizBackend,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let saida = ''
    let erros = ''
    filho.stdout.on('data', (d) => (saida += d))
    filho.stderr.on('data', (d) => (erros += d))

    const codigo = await new Promise<number | null>((resolve) => {
      const guarda = setTimeout(() => {
        filho.kill('SIGKILL') // travado por handle aberto: o teste falha abaixo
      }, 15000)
      filho.once('exit', (c) => {
        clearTimeout(guarda)
        resolve(c)
      })
    })

    // o servidor também registra linhas de log; interessam as marcas do script
    expect({ codigo, marcas: saida.split('\n').filter((l) => l === 'PRONTO' || l === 'PARADO') }, erros).toEqual({
      codigo: 0,
      marcas: ['PRONTO', 'PARADO'],
    })
    expect(Date.now() - inicio).toBeLessThan(5000)
  }, 20000)
})
