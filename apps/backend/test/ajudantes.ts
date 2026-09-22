// Ajudantes dos testes de integração: portas efêmeras, diretório temporário,
// espera por condição (com limite de tempo) e clientes de WebSocket/MQTT.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectAsync, type MqttClient } from 'mqtt'
import { WebSocket } from 'ws'
import { MensagemWs, type Configuracoes } from '@tcc/contrato'

// Espera até a condição devolver algo verdadeiro, ou falha com o texto dado.
export async function esperar<T>(
  descricao: string,
  condicao: () => T | undefined | null | false,
  limiteMs = 5000,
): Promise<T> {
  const fim = Date.now() + limiteMs
  for (;;) {
    const valor = condicao()
    if (valor) return valor
    if (Date.now() > fim) throw new Error(`tempo esgotado esperando: ${descricao}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

// Diretório de dados temporário, com o demo desligado para o simulador não
// publicar leituras próprias durante os testes.
export function criarDirDados(configuracoes?: Configuracoes): string {
  const dir = mkdtempSync(join(tmpdir(), 'tcc-teste-'))
  const c: Configuracoes = configuracoes ?? { broker: { modo: 'embutido' }, demo: false }
  writeFileSync(join(dir, 'configuracoes.json'), JSON.stringify(c))
  return dir
}

// Lê o banco do servidor por uma conexão própria (o WAL permite leitor concorrente).
export function contarLeituras(dirDados: string, dispositivo?: string): number {
  const banco = new DatabaseSync(join(dirDados, 'leituras.db'), { readOnly: true })
  try {
    const linha = dispositivo
      ? banco.prepare('SELECT COUNT(*) AS n FROM leituras WHERE dispositivo = ?').get(dispositivo)
      : banco.prepare('SELECT COUNT(*) AS n FROM leituras').get()
    return Number(linha?.n)
  } finally {
    banco.close()
  }
}

export function lerLinhas(dirDados: string): Record<string, unknown>[] {
  const banco = new DatabaseSync(join(dirDados, 'leituras.db'), { readOnly: true })
  try {
    return banco.prepare('SELECT * FROM leituras ORDER BY id').all() as Record<string, unknown>[]
  } finally {
    banco.close()
  }
}

export type ClienteWs = {
  mensagens: MensagemWs[]
  fechar(): Promise<void>
}

// Conecta em /ws e acumula as mensagens, validando cada uma contra o contrato.
export async function conectarWs(url: string): Promise<ClienteWs> {
  const socket = new WebSocket(url)
  const mensagens: MensagemWs[] = []
  socket.on('message', (dado) => {
    mensagens.push(MensagemWs.parse(JSON.parse(dado.toString())))
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
  return {
    mensagens,
    fechar: () =>
      new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve()
        socket.once('close', () => resolve())
        socket.close()
      }),
  }
}

export function conectarMqtt(porta: number): Promise<MqttClient> {
  return connectAsync(`mqtt://127.0.0.1:${porta}`, { reconnectPeriod: 0 })
}

export function payloadEstado(sobre: Record<string, unknown> = {}): string {
  return JSON.stringify({
    dispositivo: 'sala01',
    seq: 1,
    ts: Date.now(),
    estado: 'OCUPADO',
    pir: true,
    temperatura: 28,
    umidade: 55,
    lux: 120.5,
    luz: true,
    hvac: true,
    ...sobre,
  })
}
