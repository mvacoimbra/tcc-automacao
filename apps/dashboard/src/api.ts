// Acesso à API REST do backend. Toda resposta é validada com os esquemas de
// @tcc/contrato: o que vem da rede não é confiável só porque o tipo diz que é.
import {
  Configuracoes,
  DispositivoVisto,
  EstadoDispositivo,
  LIMITE_LEITURAS_MAXIMO,
  LeituraComMetadados,
  Metricas,
  Saude,
  ConfigDispositivo,
  type AmbienteDemo,
  type ConfigPayload,
} from '@tcc/contrato'

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

type Esquema<T> = { parse(dados: unknown): T }

async function requisitar<T>(caminho: string, esquema: Esquema<T>, init?: RequestInit): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(caminho, init)
  } catch {
    throw new ErroApi(0, 'sem conexão com o servidor')
  }
  const corpo: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const mensagem = (corpo as { erro?: unknown } | null)?.erro
    throw new ErroApi(resposta.status, typeof mensagem === 'string' ? mensagem : `erro ${resposta.status}`)
  }
  return esquema.parse(corpo)
}

const enviar = (metodo: 'POST' | 'PUT', corpo?: unknown): RequestInit => ({
  method: metodo,
  headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo),
})

const semValidar: Esquema<unknown> = { parse: (d) => d }
const id = encodeURIComponent

export const obterSaude = () => requisitar('/api/saude', Saude)

export const listarDispositivos = () => requisitar('/api/dispositivos', DispositivoVisto.array())

// Dispositivo ainda sem leituras (404) não é falha: devolve null.
export async function obterEstado(dispositivo: string): Promise<EstadoDispositivo | null> {
  try {
    return await requisitar(`/api/dispositivos/${id(dispositivo)}/estado`, EstadoDispositivo)
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) return null
    throw erro
  }
}

export const listarLeituras = (dispositivo: string, de: number) =>
  requisitar(
    `/api/dispositivos/${id(dispositivo)}/leituras?de=${de}&limite=${LIMITE_LEITURAS_MAXIMO}`,
    LeituraComMetadados.array(),
  )

export const obterMetricas = (dispositivo: string, de: number) =>
  requisitar(`/api/dispositivos/${id(dispositivo)}/metricas?de=${de}`, Metricas)

export const publicarConfig = (dispositivo: string, config: ConfigPayload) =>
  requisitar(`/api/dispositivos/${id(dispositivo)}/config`, ConfigDispositivo, enviar('POST', config))

export const urlCsv = (dispositivo: string, de: number) =>
  `/api/dispositivos/${id(dispositivo)}/export.csv?de=${de}`

export const obterConfiguracoes = () => requisitar('/api/configuracoes', Configuracoes)

export const salvarConfiguracoes = (configuracoes: Configuracoes) =>
  requisitar('/api/configuracoes', Configuracoes, enviar('PUT', configuracoes))

export const ativarDemo = (ativo: boolean) => requisitar('/api/demo', semValidar, enviar('POST', { ativo }))

export const simularMovimento = () => requisitar('/api/demo/pir', semValidar, enviar('POST'))

export const definirAmbienteDemo = (ambiente: AmbienteDemo) =>
  requisitar('/api/demo/ambiente', semValidar, enviar('POST', ambiente))
