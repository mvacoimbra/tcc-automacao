// Funções puras que transformam o payload MQTT de estado em uma leitura armazenável
// (seção 5.4 do PRD): validação, latência fim a fim e perda de mensagens.
import { EstadoPayload, type LeituraComMetadados } from '@tcc/contrato'

// Latência = recebidoEm - ts. Com ts = 0 o dispositivo não sincronizou o NTP e a
// latência é indefinida. Depende do relógio do dispositivo e do PC (limitação a declarar).
export function calcularLatencia(recebidoEm: number, ts: number): number | null {
  return ts > 0 ? recebidoEm - ts : null
}

// Perda por lacuna em seq. Um seq menor ou igual ao anterior é reinício do
// dispositivo (seq volta a 0), não perda. Sem referência anterior, não há como medir.
export function calcularPerdidas(ultimoSeq: number | undefined, seq: number): number {
  if (ultimoSeq === undefined || seq <= ultimoSeq) return 0
  return seq - ultimoSeq - 1
}

export type ResultadoInterpretacao =
  | { ok: true; dados: EstadoPayload }
  | { ok: false; motivo: string }

// Valida o texto recebido do broker. Nunca lança: mensagem inválida vira `ok: false`
// para o chamador descartar e registrar sem derrubar o processo.
export function interpretarEstado(payload: string): ResultadoInterpretacao {
  let bruto: unknown
  try {
    bruto = JSON.parse(payload)
  } catch {
    return { ok: false, motivo: 'JSON inválido' }
  }
  const r = EstadoPayload.safeParse(bruto)
  if (!r.success) {
    const motivo = r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ')
    return { ok: false, motivo }
  }
  return { ok: true, dados: r.data }
}

export function processarEstado(
  dados: EstadoPayload,
  recebidoEm: number,
  ultimoSeq: number | undefined,
): LeituraComMetadados {
  return {
    ...dados,
    recebidoEm,
    latenciaMs: calcularLatencia(recebidoEm, dados.ts),
    perdidas: calcularPerdidas(ultimoSeq, dados.seq),
  }
}
