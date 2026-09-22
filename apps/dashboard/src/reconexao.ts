// Espera entre tentativas de reconexão do WebSocket (seção 5.3 do PRD):
// começa em 1 s e dobra até 10 s. Zera quando a conexão é reestabelecida.
const ESPERA_INICIAL_MS = 1000
const ESPERA_MAXIMA_MS = 10_000

export type Reconexao = {
  // Espera (ms) antes da próxima tentativa; cada chamada avança na sequência.
  proxima(): number
  zerar(): void
}

export function criarReconexao(): Reconexao {
  let tentativa = 0
  return {
    proxima() {
      const espera = Math.min(ESPERA_INICIAL_MS * 2 ** tentativa, ESPERA_MAXIMA_MS)
      tentativa++
      return espera
    },
    zerar() {
      tentativa = 0
    },
  }
}
