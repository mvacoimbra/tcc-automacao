// Métricas do Cap. 4 (seção 5.4 do PRD), calculadas sobre uma série de leituras.
import type { LeituraComMetadados, Metricas } from '@tcc/contrato'

// Entre duas leituras consecutivas mais distantes que isto, o dispositivo é tratado
// como offline: o intervalo não conta como tempo ligado nem como tempo ocupado.
// O firmware publica a cada 2 s; 10 s tolera algumas perdas seguidas.
export const LACUNA_MAXIMA_MS = 10_000

// p95 por posto mais próximo (nearest-rank) sobre valores já ordenados.
function percentil95(ordenados: number[]): number {
  return ordenados[Math.ceil(0.95 * ordenados.length) - 1]
}

export function calcularMetricas(leituras: LeituraComMetadados[]): Metricas {
  const serie = [...leituras].sort((a, b) => a.recebidoEm - b.recebidoEm)

  // Latência: só leituras com ts > 0 (latenciaMs nula = NTP não sincronizou).
  const latencias = serie
    .map((l) => l.latenciaMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  const soma = latencias.reduce((acc, v) => acc + v, 0)

  const perdidas = serie.reduce((acc, l) => acc + l.perdidas, 0)
  const recebidas = serie.length

  let luzMs = 0
  let hvacMs = 0
  let tempoOcupadoMs = 0
  let transicoes = 0
  for (let i = 1; i < serie.length; i++) {
    const anterior = serie[i - 1]
    const atual = serie[i]
    if (atual.estado !== anterior.estado) transicoes++
    const intervalo = atual.recebidoEm - anterior.recebidoEm
    if (intervalo > LACUNA_MAXIMA_MS) continue
    if (anterior.luz) luzMs += intervalo
    if (anterior.hvac) hvacMs += intervalo
    if (anterior.estado === 'OCUPADO') tempoOcupadoMs += intervalo
  }

  return {
    latencia: {
      minMs: latencias.length ? latencias[0] : null,
      mediaMs: latencias.length ? soma / latencias.length : null,
      p95Ms: latencias.length ? percentil95(latencias) : null,
      maxMs: latencias.length ? latencias[latencias.length - 1] : null,
      amostras: latencias.length,
    },
    perda: {
      recebidas,
      perdidas,
      taxa: recebidas + perdidas > 0 ? perdidas / (recebidas + perdidas) : 0,
    },
    tempoLigado: { luzMs, hvacMs },
    ocupacao: { transicoes, tempoOcupadoMs },
  }
}
