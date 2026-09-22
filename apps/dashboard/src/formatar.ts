// Formatação dos valores exibidos (pt-BR: vírgula decimal, ponto nos milhares).

const dois = (n: number) => String(n).padStart(2, '0')

// Duração legível: "42 s", "1 min 01 s", "1 h 02 min". Acima de 1 h os segundos somem.
export function formatarDuracao(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total} s`
  const minutos = Math.floor(total / 60)
  if (total < 3600) return `${minutos} min ${dois(total % 60)} s`
  return `${Math.floor(minutos / 60)} h ${dois(minutos % 60)} min`
}

// Valor ausente (sensor ainda sem leitura) vira travessão.
export function formatarNumero(valor: number | null, casas = 1): string {
  if (valor === null) return '—'
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Razão (0 a 1) como porcentagem com uma casa.
export function formatarPercentual(razao: number): string {
  return `${formatarNumero(razao * 100, 1)} %`
}

// Tempo que falta para desocupar: t_ocupado menos o tempo desde o último movimento.
// Sem movimento conhecido (página aberta depois dele), não há como estimar.
export function contagemRegressiva(tOcupadoMs: number, movimentoEm: number | null, agora: number): number | null {
  if (movimentoEm === null) return null
  return Math.max(0, tOcupadoMs - (agora - movimentoEm))
}

// Hora local para os eixos dos gráficos e o log.
export function formatarHora(ms: number, comSegundos = true): string {
  return new Date(ms).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: comSegundos ? '2-digit' : undefined,
    hour12: false,
  })
}

export function formatarDataHora(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
