// Escuta numa porta com fallback: a porta padrão costuma estar ocupada durante o
// desenvolvimento (o Mosquitto do docker-compose usa a 1883).
import type { AddressInfo, Server } from 'node:net'

function tentar(servidor: Server, porta: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const aoErrar = (erro: Error) => {
      servidor.off('listening', aoOuvir)
      reject(erro)
    }
    const aoOuvir = () => {
      servidor.off('error', aoErrar)
      resolve((servidor.address() as AddressInfo).port)
    }
    servidor.once('error', aoErrar)
    servidor.once('listening', aoOuvir)
    servidor.listen(porta, host)
  })
}

// Tenta a porta pedida; se estiver ocupada (EADDRINUSE), abre numa porta livre.
// Pedir a porta 0 explicitamente já é "qualquer livre" e não dispara o aviso.
// Devolve a porta realmente usada.
export async function escutar(servidor: Server, porta: number, host: string): Promise<number> {
  try {
    return await tentar(servidor, porta, host)
  } catch (erro) {
    if (porta !== 0 && (erro as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.warn(`[portas] porta ${porta} ocupada; usando uma porta livre`)
      return tentar(servidor, 0, host)
    }
    throw erro
  }
}
