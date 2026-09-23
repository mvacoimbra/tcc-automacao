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

// ---------------------------------------------------------------------------
// Roteiros de experimento (docs/experimentos/roteiros/*.json)
// ---------------------------------------------------------------------------

// Bloco de tempo em ms, meio aberto [de, ate), como a ocupação real dos
// programas de referência (docs/experimentos/ct07_falsos_positivos.cpp).
export const BlocoRoteiro = z.strictObject({
  de: z.int().min(0),
  ate: z.int().min(0),
})
export type BlocoRoteiro = z.infer<typeof BlocoRoteiro>

// Um evento acontece em `t`. Pode injetar movimento (sozinho ou repetido até
// `ate`, inclusive), trocar o ambiente e publicar uma nova configuração.
//
// `alinhamento` decide onde caem os movimentos repetidos: "inicio" conta a partir
// de `t` (t, t+cada, ...) e "relogio" usa os múltiplos de `cada` no relógio do
// roteiro. A distinção não é cosmética: no CT-09 o movimento é amarrado ao relógio
// ((int)t % 8 == 0 no ct09_economia.cpp), então blocos que começam fora da grade
// têm a primeira detecção alguns segundos depois — é de onde vem parte do tempo
// desocupado indevidamente daquela tabela.
export const EventoRoteiro = z
  .strictObject({
    t: z.int().min(0),
    ate: z.int().min(0).optional(),
    movimentoACada: z.int().min(1).optional(),
    alinhamento: z.enum(['inicio', 'relogio']).default('inicio'),
    movimento: z.boolean().optional(),
    ambiente: AmbienteDemo.optional(),
    config: ConfigPayload.optional(),
  })
  .refine((e) => e.ate === undefined || e.movimentoACada !== undefined, {
    message: 'um evento com "ate" precisa de "movimentoACada"',
  })
  .refine((e) => e.ate === undefined || e.ate >= e.t, { message: '"ate" não pode ser antes de "t"' })
export type EventoRoteiro = z.infer<typeof EventoRoteiro>

export const RETENCAO_PIR_PADRAO_MS = 5000 // delayTime do PIR no diagrama do Wokwi

export const Roteiro = z.strictObject({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  duracaoMs: z.int().min(1),
  passoMs: z.int().min(1),
  // Tempo que o PIR fica em alto após o último movimento (redisparável).
  retencaoPirMs: z.int().min(0).default(RETENCAO_PIR_PADRAO_MS),
  config: ConfigPayload.default({}),
  ambienteInicial: z
    .strictObject({
      temperatura: z.number().min(-40).max(80),
      umidade: z.number().min(0).max(100),
      lux: z.number().min(0).max(100_000),
    })
    .default({ temperatura: 28, umidade: 55, lux: 120 }),
  // Referência para as métricas de erro; ausente = cenário sem ocupação real.
  ocupacaoReal: z.array(BlocoRoteiro).default([]),
  eventos: z.array(EventoRoteiro).default([]),
})
export type Roteiro = z.infer<typeof Roteiro>

// Métricas amostradas a cada passo do roteiro (o mesmo que os programas em C++
// fazem), separadas das métricas por leitura publicada (`Metricas`).
export const MetricasCenario = z.object({
  passoMs: z.int().min(1),
  duracaoMs: z.int().min(0),
  ativou: z.boolean(),
  atrasoAteOcupadoMs: z.number().nullable(), // do 1º movimento até o 1º OCUPADO
  tempoOcupadoMs: z.number().min(0),
  ocupacaoRealMs: z.number().min(0),
  // OCUPADO fora da ocupação real, já descontada a cauda intencional
  // (retenção do PIR + tOcupado) depois de cada saída, reportada à parte.
  ocupadoIndevidoMs: z.number().min(0),
  caudaMs: z.number().min(0),
  desocupadoIndevidoMs: z.number().min(0),
  tempoLigado: z.object({ luzMs: z.number().min(0), hvacMs: z.number().min(0) }),
  // Linha de base: atuador ligado durante toda a janela do roteiro (acionamento manual).
  reducao: z.object({ luzPct: z.number(), hvacPct: z.number() }),
})
export type MetricasCenario = z.infer<typeof MetricasCenario>

export const ResultadoRoteiro = z.object({
  roteiro: z.string(),
  arquivo: z.string(),
  executadoEm: z.int().min(0),
  config: ConfigDispositivo,
  cenario: MetricasCenario,
  metricas: Metricas, // calculadas sobre as leituras publicadas, como no app
})
export type ResultadoRoteiro = z.infer<typeof ResultadoRoteiro>
