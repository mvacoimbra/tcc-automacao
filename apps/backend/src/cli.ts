// Executável standalone do backend (pnpm dev), sem Electron: serve para desenvolver e testar.
import { criarServidor } from './servidor'

const servidor = await criarServidor({ dirDados: '.dados' })

async function encerrar(): Promise<void> {
  await servidor.parar()
  process.exit(0)
}
process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)
