// pnpm exp <arquivo-ou-pasta> — executa roteiros e grava os resultados em
// docs/experimentos/resultados/<data>/: um CSV de leituras e um JSON de métricas
// por roteiro, mais um resumo.csv com uma linha por roteiro (tabela do Capítulo 4).
//
// Determinístico: duas execuções do mesmo roteiro produzem os mesmos números.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Roteiro, type ResultadoRoteiro } from '@tcc/contrato'
import { gerarCsv } from '../csv'
import { executarRoteiro } from '../simulador/roteiro'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIR_RESULTADOS = join(RAIZ, 'docs/experimentos/resultados')

function arquivosDeRoteiro(alvo: string): string[] {
  if (statSync(alvo).isFile()) return [alvo]
  const achados: string[] = []
  for (const entrada of readdirSync(alvo, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const caminho = join(alvo, entrada.name)
    if (entrada.isDirectory()) achados.push(...arquivosDeRoteiro(caminho))
    else if (entrada.name.endsWith('.json')) achados.push(caminho)
  }
  return achados
}

const seg = (ms: number) => (ms / 1000).toFixed(1)

// Uma linha por roteiro, com os mesmos campos que as tabelas do Capítulo 4 usam.
const CABECALHO_RESUMO =
  'roteiro;arquivo;tOcupadoMs;janelaConfMs;pulsosConf;confirmacaoPorNivelMs;ativou;atraso_s;' +
  'ocupado_s;ocupacao_real_s;ocupado_indevido_s;cauda_s;desocupado_indevido_s;' +
  'luz_ligada_s;hvac_ligado_s;reducao_luz_pct;reducao_hvac_pct;leituras;perdidas'

function linhaResumo(r: ResultadoRoteiro, leituras: number): string {
  const c = r.cenario
  return [
    r.roteiro,
    r.arquivo,
    r.config.tOcupadoMs,
    r.config.janelaConfMs,
    r.config.pulsosConf,
    r.config.confirmacaoPorNivelMs,
    c.ativou ? 'sim' : 'nao',
    c.atrasoAteOcupadoMs === null ? '' : seg(c.atrasoAteOcupadoMs),
    seg(c.tempoOcupadoMs),
    seg(c.ocupacaoRealMs),
    seg(c.ocupadoIndevidoMs),
    seg(c.caudaMs),
    seg(c.desocupadoIndevidoMs),
    seg(c.tempoLigado.luzMs),
    seg(c.tempoLigado.hvacMs),
    c.reducao.luzPct.toFixed(1),
    c.reducao.hvacPct.toFixed(1),
    leituras,
    r.metricas.perda.perdidas,
  ].join(';')
}

function main(): void {
  const argumento = process.argv[2]
  if (!argumento) {
    console.error('uso: pnpm exp <arquivo-ou-pasta de roteiros>')
    process.exit(2)
  }
  const alvo = resolve(process.env.INIT_CWD ?? process.cwd(), argumento)
  const arquivos = arquivosDeRoteiro(alvo)
  if (arquivos.length === 0) {
    console.error(`nenhum roteiro .json em ${alvo}`)
    process.exit(1)
  }

  const data = new Date().toISOString().slice(0, 10)
  const dirSaida = join(DIR_RESULTADOS, data)
  mkdirSync(dirSaida, { recursive: true })

  const resumo: string[] = [CABECALHO_RESUMO]
  for (const arquivo of arquivos) {
    const bruto: unknown = JSON.parse(readFileSync(arquivo, 'utf8'))
    const roteiro = Roteiro.parse(bruto)
    const execucao = executarRoteiro(roteiro)
    const nome = arquivo.split('/').pop()!.replace(/\.json$/, '')

    const resultado: ResultadoRoteiro = {
      roteiro: roteiro.nome,
      arquivo: relative(RAIZ, arquivo),
      executadoEm: Date.now(),
      config: execucao.config,
      cenario: execucao.cenario,
      metricas: execucao.metricas,
    }

    writeFileSync(join(dirSaida, `${nome}.csv`), gerarCsv(execucao.leituras))
    writeFileSync(join(dirSaida, `${nome}.json`), JSON.stringify(resultado, null, 2) + '\n')
    resumo.push(linhaResumo(resultado, execucao.leituras.length))
    console.log(
      `${roteiro.nome}: ocupado ${seg(execucao.cenario.tempoOcupadoMs)} s, ` +
        `indevido ${seg(execucao.cenario.ocupadoIndevidoMs)} s, ` +
        `desocupado indevido ${seg(execucao.cenario.desocupadoIndevidoMs)} s, ` +
        `${execucao.leituras.length} leituras`,
    )
  }

  writeFileSync(join(dirSaida, 'resumo.csv'), resumo.join('\n') + '\n')
  console.log(`\n${arquivos.length} roteiro(s) em ${relative(RAIZ, dirSaida)}/ (resumo.csv)`)
}

main()
