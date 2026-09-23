// pnpm exp:latencia [--minutos 5] [--url http://127.0.0.1:3000] — mede latência e
// perda do CT-06 numa janela fechada. Usa um backend já em execução, se houver, ou
// sobe um em modo Demo. Grava métricas (JSON) e as leituras da janela (CSV) em
// docs/experimentos/resultados/<data>/.
//
// Ao contrário dos roteiros, aqui o tempo é real: é o pipeline inteiro
// (dispositivo -> MQTT -> backend -> banco) que está sendo medido, e por isso o
// caminho medido (broker embutido ou externo) vai junto no resultado.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Metricas, Saude } from '@tcc/contrato'
import { criarServidor, type Servidor } from '../servidor'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIR_RESULTADOS = join(RAIZ, 'docs/experimentos/resultados')

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function saudeDe(url: string): Promise<Saude | null> {
  try {
    const r = await fetch(`${url}/api/saude`)
    return r.ok ? ((await r.json()) as Saude) : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const minutos = Number(argumento('minutos') ?? 5)
  if (!Number.isFinite(minutos) || minutos <= 0) {
    console.error('uso: pnpm exp:latencia [--minutos 5] [--url http://127.0.0.1:3000]')
    process.exit(2)
  }
  const urlPedida = argumento('url') ?? 'http://127.0.0.1:3000'

  let servidor: Servidor | null = null
  let dirTemporario: string | null = null
  let url = urlPedida
  let saude = await saudeDe(urlPedida)

  if (saude) {
    console.log(`[latencia] usando o backend já em execução em ${url}`)
  } else {
    dirTemporario = mkdtempSync(join(tmpdir(), 'tcc-latencia-'))
    servidor = await criarServidor({ dirDados: dirTemporario })
    url = servidor.url
    saude = await saudeDe(url)
    console.log(`[latencia] backend próprio em ${url} (dados em ${dirTemporario})`)
  }
  if (!saude) throw new Error(`sem resposta de ${url}/api/saude`)
  if (!saude.demo) console.warn('[latencia] atenção: modo Demo desligado; a janela pode ficar vazia')

  const caminho = saude.broker.modo === 'embutido' ? 'broker embutido (mesma máquina)' : 'broker externo'
  console.log(`[latencia] medindo ${minutos} min pelo ${caminho}, porta MQTT ${saude.broker.porta}`)

  const inicio = Date.now()
  await dormir(minutos * 60_000)
  const fim = Date.now()

  const periodo = `de=${inicio}&ate=${fim}`
  const metricas = (await (await fetch(`${url}/api/dispositivos/sala01/metricas?${periodo}`)).json()) as Metricas
  const csv = await (await fetch(`${url}/api/dispositivos/sala01/export.csv?${periodo}`)).text()

  const data = new Date(fim).toISOString().slice(0, 10)
  const hora = new Date(fim).toISOString().slice(11, 16).replace(':', '')
  const dirSaida = join(DIR_RESULTADOS, data)
  mkdirSync(dirSaida, { recursive: true })
  const base = `latencia-${minutos}min-${hora}`

  const resultado = {
    experimento: 'CT-06 latência fim a fim e perda',
    inicio,
    fim,
    minutos,
    url,
    caminho, // essencial no texto: a latência depende de onde o dispositivo está
    broker: saude.broker,
    demo: saude.demo,
    metricas,
  }
  writeFileSync(join(dirSaida, `${base}.json`), JSON.stringify(resultado, null, 2) + '\n')
  writeFileSync(join(dirSaida, `${base}.csv`), csv)

  const l = metricas.latencia
  console.log(
    `[latencia] ${l.amostras} leituras; min ${l.minMs} / média ${l.mediaMs?.toFixed(2)} / p95 ${l.p95Ms} / máx ${l.maxMs} ms; ` +
      `perda ${metricas.perda.perdidas} de ${metricas.perda.recebidas} (${(metricas.perda.taxa * 100).toFixed(1)}%)`,
  )
  console.log(`[latencia] ${relative(RAIZ, join(dirSaida, base))}.json e .csv`)

  if (servidor) await servidor.parar()
  if (dirTemporario) rmSync(dirTemporario, { recursive: true, force: true })
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
