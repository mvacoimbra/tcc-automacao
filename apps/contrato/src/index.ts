// Contrato compartilhado entre firmware, backend e dashboard (seção 5 do PRD).
// Cada esquema zod tem um tipo de mesmo nome, derivado com z.infer.
import { z } from 'zod'

// ---------------------------------------------------------------------------
// MQTT: <raiz>/<dispositivo>/estado (dispositivo -> broker)
// ---------------------------------------------------------------------------

export const Ocupacao = z.enum(['DESOCUPADO', 'CONFIRMANDO', 'OCUPADO'])
export type Ocupacao = z.infer<typeof Ocupacao>

// O id vira segmento de tópico MQTT e parâmetro de URL REST: só caracteres seguros.
export const IdDispositivo = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export type IdDispositivo = z.infer<typeof IdDispositivo>

// Payload publicado pelo firmware a cada 2 s e a cada mudança de estado.
export const EstadoPayload = z.object({
  dispositivo: IdDispositivo,
  seq: z.uint32(), // reinicia em 0 quando o dispositivo reinicia
  ts: z.int().min(0), // epoch ms; 0 = NTP ainda não sincronizou
  estado: Ocupacao,
  pir: z.boolean(),
  temperatura: z.number().nullable(), // null antes da primeira leitura do DHT
  umidade: z.number().nullable(),
  lux: z.number(),
  luz: z.boolean(),
  hvac: z.boolean(),
})
export type EstadoPayload = z.infer<typeof EstadoPayload>

// ---------------------------------------------------------------------------
// MQTT: <raiz>/<dispositivo>/config (broker -> dispositivo)
// ---------------------------------------------------------------------------

// Todos os campos são opcionais; campo desconhecido é rejeitado.
export const ConfigPayload = z.strictObject({
  tOcupadoMs: z.uint32().optional(),
  janelaConfMs: z.uint32().optional(),
  pulsosConf: z.int().min(0).max(255).optional(), // uint8 no firmware
  confirmacaoPorNivelMs: z.uint32().optional(), // variante D; 0 = desativada
  luxLimiar: z.number().min(0).optional(),
  tempAlvo: z.number().optional(),
})
export type ConfigPayload = z.infer<typeof ConfigPayload>

// ---------------------------------------------------------------------------
// Leitura armazenada e transmitida (payload de estado + metadados do backend)
// ---------------------------------------------------------------------------

export const LeituraComMetadados = EstadoPayload.extend({
  recebidoEm: z.int().min(0), // epoch ms no relógio do backend
  latenciaMs: z.int().nullable(), // recebidoEm - ts; null quando ts = 0
  perdidas: z.uint32(), // mensagens perdidas antes desta (lacuna em seq)
})
export type LeituraComMetadados = z.infer<typeof LeituraComMetadados>

// ---------------------------------------------------------------------------
// REST: GET /api/dispositivos e GET /api/dispositivos/:id/estado
// ---------------------------------------------------------------------------

export const DispositivoVisto = z.object({
  id: IdDispositivo,
  vistoEm: z.int().min(0), // recebidoEm da última leitura
})
export type DispositivoVisto = z.infer<typeof DispositivoVisto>

// Config conhecida do dispositivo: todos os campos presentes (o payload de config
// publicado é parcial, mas quem consulta quer o valor efetivo de cada parâmetro).
export const ConfigDispositivo = z.object({
  tOcupadoMs: z.uint32(),
  janelaConfMs: z.uint32(),
  pulsosConf: z.int().min(0).max(255),
  confirmacaoPorNivelMs: z.uint32(),
  luxLimiar: z.number().min(0),
  tempAlvo: z.number(),
})
export type ConfigDispositivo = z.infer<typeof ConfigDispositivo>

export const EstadoDispositivo = z.object({
  leitura: LeituraComMetadados,
  config: ConfigDispositivo,
})
export type EstadoDispositivo = z.infer<typeof EstadoDispositivo>

// ---------------------------------------------------------------------------
// REST: parâmetros de consulta (query string) de leituras, métricas e CSV
// ---------------------------------------------------------------------------

export const LIMITE_LEITURAS_PADRAO = 1000
export const LIMITE_LEITURAS_MAXIMO = 10_000

// Na URL tudo chega como texto; coerce converte e o restante valida.
const InstanteMs = z.coerce.number().int().min(0)

// ?de=&ate= (epoch ms). Ausentes: sem limite inferior / superior.
export const ConsultaPeriodo = z.object({
  de: InstanteMs.optional(),
  ate: InstanteMs.optional(),
})
export type ConsultaPeriodo = z.infer<typeof ConsultaPeriodo>

// Acima do máximo não é erro: o limite vira o máximo.
export const ConsultaLeituras = ConsultaPeriodo.extend({
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, LIMITE_LEITURAS_MAXIMO))
    .default(LIMITE_LEITURAS_PADRAO),
})
export type ConsultaLeituras = z.infer<typeof ConsultaLeituras>

// ---------------------------------------------------------------------------
// REST: comandos do modo Demo (POST /api/demo e /api/demo/ambiente)
// ---------------------------------------------------------------------------

export const ComandoDemo = z.strictObject({ ativo: z.boolean() })
export type ComandoDemo = z.infer<typeof ComandoDemo>

// Faixas físicas dos sensores simulados: DHT22 (-40 a 80 °C, 0 a 100 %) e LDR (lux).
export const AmbienteDemo = z.strictObject({
  temperatura: z.number().min(-40).max(80).optional(),
  umidade: z.number().min(0).max(100).optional(),
  lux: z.number().min(0).max(100_000).optional(),
})
export type AmbienteDemo = z.infer<typeof AmbienteDemo>

// ---------------------------------------------------------------------------
// Configurações do app (<dirDados>/configuracoes.json)
// ---------------------------------------------------------------------------

export const ModoBroker = z.enum(['embutido', 'externo'])
export type ModoBroker = z.infer<typeof ModoBroker>

// Raiz dos tópicos: um ou mais segmentos, sem curingas (+ e #) nem espaços.
const RaizMqtt = z.string().regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/)

export const ConfiguracaoBroker = z.discriminatedUnion('modo', [
  z.strictObject({ modo: z.literal('embutido') }),
  z.strictObject({
    modo: z.literal('externo'),
    host: z.string().regex(/^\S+$/),
    porta: z.int().min(1).max(65535),
    raiz: RaizMqtt,
  }),
])
export type ConfiguracaoBroker = z.infer<typeof ConfiguracaoBroker>

export const Configuracoes = z.strictObject({
  broker: ConfiguracaoBroker,
  demo: z.boolean(),
})
export type Configuracoes = z.infer<typeof Configuracoes>

// ---------------------------------------------------------------------------
// REST: GET /api/saude
// ---------------------------------------------------------------------------

export const Saude = z.object({
  ok: z.boolean(),
  versao: z.string(),
  broker: z.object({
    modo: ModoBroker,
    conectado: z.boolean(),
    porta: z.int().min(1).max(65535),
  }),
  // Demo efetivo: preferência ligada E broker embutido (no externo o simulador não roda).
  demo: z.boolean(),
  portaHttp: z.int().min(1).max(65535),
  enderecosLan: z.array(z.string()), // IPv4 da máquina, para abrir no celular
})
export type Saude = z.infer<typeof Saude>

// ---------------------------------------------------------------------------
// REST: GET /api/dispositivos/:id/metricas (evidência do Cap. 4, seção 5.4)
// ---------------------------------------------------------------------------

export const Metricas = z.object({
  latencia: z.object({
    minMs: z.number().nullable(),
    mediaMs: z.number().nullable(),
    p95Ms: z.number().nullable(),
    maxMs: z.number().nullable(),
    amostras: z.int().min(0), // só leituras com ts > 0
  }),
  perda: z.object({
    recebidas: z.int().min(0),
    perdidas: z.int().min(0),
    taxa: z.number().min(0).max(1), // perdidas / (recebidas + perdidas)
  }),
  tempoLigado: z.object({
    luzMs: z.number().min(0),
    hvacMs: z.number().min(0),
  }),
  ocupacao: z.object({
    transicoes: z.int().min(0),
    tempoOcupadoMs: z.number().min(0),
  }),
})
export type Metricas = z.infer<typeof Metricas>

// ---------------------------------------------------------------------------
// WebSocket /ws (servidor -> cliente)
// ---------------------------------------------------------------------------

export const MensagemWs = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('estado'), dados: LeituraComMetadados }),
  z.object({
    tipo: z.literal('mqtt'),
    direcao: z.enum(['entrada', 'saida']),
    topico: z.string(),
    payload: z.string(),
    em: z.int().min(0),
  }),
  z.object({
    tipo: z.literal('conexao'),
    broker: z.object({ modo: ModoBroker, conectado: z.boolean() }),
  }),
  z.object({ tipo: z.literal('demo'), ativo: z.boolean() }),
])
export type MensagemWs = z.infer<typeof MensagemWs>
