// Exportação CSV das leituras (métricas do Cap. 4 precisam ser exportáveis).
// Separador vírgula, decimal com ponto, booleanos 1/0, valor ausente = campo vazio.
// Nenhum campo precisa de aspas: o id do dispositivo é restrito a [A-Za-z0-9_-]
// pelo contrato, o estado é um enum e os demais são números.
import type { LeituraComMetadados } from '@tcc/contrato'

export const CABECALHO_CSV =
  'recebidoEm,dispositivo,seq,ts,latenciaMs,perdidas,estado,pir,temperatura,umidade,lux,luz,hvac'

const campo = (v: number | string | null): string => (v === null ? '' : String(v))
const bool = (v: boolean): string => (v ? '1' : '0')

export function gerarCsv(leituras: LeituraComMetadados[]): string {
  const linhas = leituras.map((l) =>
    [
      campo(l.recebidoEm),
      l.dispositivo,
      campo(l.seq),
      campo(l.ts),
      campo(l.latenciaMs),
      campo(l.perdidas),
      l.estado,
      bool(l.pir),
      campo(l.temperatura),
      campo(l.umidade),
      campo(l.lux),
      bool(l.luz),
      bool(l.hvac),
    ].join(','),
  )
  return [CABECALHO_CSV, ...linhas].join('\n') + '\n'
}
