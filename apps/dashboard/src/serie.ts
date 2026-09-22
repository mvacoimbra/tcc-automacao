// Períodos do Histórico e preparo das séries para os gráficos.

export type PeriodoId = '15min' | '1h' | '24h' | 'tudo'

export type Periodo = { id: PeriodoId; rotulo: string; duracaoMs: number | null }

export const PERIODOS: Periodo[] = [
  { id: '15min', rotulo: '15 min', duracaoMs: 15 * 60_000 },
  { id: '1h', rotulo: '1 h', duracaoMs: 60 * 60_000 },
  { id: '24h', rotulo: '24 h', duracaoMs: 24 * 60 * 60_000 },
  { id: 'tudo', rotulo: 'Tudo', duracaoMs: null },
]

// Início do período em epoch ms; "tudo" começa em 0.
export function inicioDoPeriodo(id: PeriodoId, agora: number): number {
  const duracao = PERIODOS.find((p) => p.id === id)?.duracaoMs ?? null
  return duracao === null ? 0 : agora - duracao
}

// Decimação simples: pontos igualmente espaçados, sempre com o primeiro e o último.
// O Recharts fica lento com dezenas de milhares de pontos e a tela não tem essa resolução.
export function reduzirSerie<T>(serie: T[], maximo: number): T[] {
  if (serie.length <= maximo) return serie
  const passo = (serie.length - 1) / (maximo - 1)
  return Array.from({ length: maximo }, (_, i) => serie[Math.round(i * passo)])
}

// Passos "redondos" para a escala de tempo: 1, 2, 5, 10, 15, 30 s; 1, 2, 5, 10, 15, 30 min;
// 1, 2, 3, 6, 12 h; 1, 2, 7 dias.
const PASSOS_MS = [
  ...[1, 2, 5, 10, 15, 30].map((s) => s * 1000),
  ...[1, 2, 5, 10, 15, 30].map((m) => m * 60_000),
  ...[1, 2, 3, 6, 12].map((h) => h * 3_600_000),
  ...[1, 2, 7].map((d) => d * 86_400_000),
]

// Marcas do eixo X cobrindo todo o intervalo [de, ate], em passos redondos alinhados à
// hora local. O Recharts deriva as marcas dos pontos de dados, o que deixa sem escala
// a parte da janela em que ainda não há leituras.
export function ticksDoEixo(de: number, ate: number, maximo = 8): number[] {
  const intervalo = ate - de
  if (intervalo <= 0) return [de]
  const passo = PASSOS_MS.find((p) => Math.floor(intervalo / p) + 1 <= maximo) ?? PASSOS_MS[PASSOS_MS.length - 1]
  // hora local = UTC + deslocamento; alinhar em hora local evita marcas em "20:47:00"
  const deslocamento = -new Date(de).getTimezoneOffset() * 60_000
  const ticks: number[] = []
  for (let t = Math.ceil((de + deslocamento) / passo) * passo - deslocamento; t <= ate; t += passo) ticks.push(t)
  return ticks
}
