// Executor de roteiros: roda um cenário declarativo (docs/experimentos/roteiros)
// com relógio virtual, sem setInterval e sem esperar tempo real. Usa o mesmo
// passoDispositivo() do modo Demo, então o experimento mede o código que roda na
// demonstração — e não uma segunda implementação (RNF01/D14).
//
// As leituras saem no mesmo formato do export do app (uma por publicação: a cada
// mudança ou a cada 2 s), e as métricas vêm em dois grupos:
//   - `metricas`: calculadas sobre as leituras publicadas, como na tela Histórico;
//   - `cenario`:  amostradas a cada passo, como nos programas de referência em C++
//                 (docs/experimentos/*.cpp), que somam DT enquanto a condição vale.
import type {
  ConfigDispositivo,
  LeituraComMetadados,
  Metricas,
  MetricasCenario,
  Roteiro,
} from '@tcc/contrato'
import { CONFIG_PADRAO_DISPOSITIVO, mesclarConfig } from '../config-dispositivo'
import { calcularMetricas } from '../metricas'
import { novoEstadoDispositivo, passoDispositivo, type Ambiente } from './nucleo'

const ID_DISPOSITIVO = 'sala01'
const PERIODO_PUBLICACAO_MS = 2000 // PERIODO_PUBLICACAO_MS do firmware

export type ExecucaoRoteiro = {
  config: ConfigDispositivo // config final, depois dos eventos
  leituras: LeituraComMetadados[]
  cenario: MetricasCenario
  metricas: Metricas
}

export type OpcoesExecucao = {
  // Epoch usado só para carimbar ts/recebidoEm das leituras. O relógio da simulação
  // é sempre virtual: trocar esta base não muda nenhuma métrica.
  baseEpochMs?: number
}

// Instantes de movimento de um evento periódico. "inicio" conta de `t`;
// "relogio" usa os múltiplos de `cada` (o (int)t % 8 == 0 do ct09_economia.cpp).
function instantesDeMovimento(t: number, ate: number, cada: number, alinhamento: 'inicio' | 'relogio'): number[] {
  const inicio = alinhamento === 'relogio' ? Math.ceil(t / cada) * cada : t
  const instantes: number[] = []
  for (let m = inicio; m <= ate; m += cada) instantes.push(m)
  return instantes
}

export function executarRoteiro(roteiro: Roteiro, opcoes: OpcoesExecucao = {}): ExecucaoRoteiro {
  const baseEpoch = opcoes.baseEpochMs ?? Date.now()
  const passo = roteiro.passoMs

  let config = mesclarConfig(CONFIG_PADRAO_DISPOSITIVO, roteiro.config)
  let ambiente: Ambiente = { ...roteiro.ambienteInicial }
  const dispositivo = novoEstadoDispositivo()

  // Movimentos e mudanças (ambiente/config) resolvidos antes de rodar.
  const movimentos: number[] = []
  const mudancas = [...roteiro.eventos]
    .filter((e) => e.ambiente !== undefined || e.config !== undefined)
    .sort((a, b) => a.t - b.t)
  for (const e of roteiro.eventos) {
    if (e.movimentoACada !== undefined) {
      movimentos.push(...instantesDeMovimento(e.t, e.ate ?? e.t, e.movimentoACada, e.alinhamento))
    } else if (e.movimento === true || (e.ambiente === undefined && e.config === undefined)) {
      movimentos.push(e.t) // evento sem "ate" é um movimento único
    }
  }
  movimentos.sort((a, b) => a - b)
  const primeiroMovimento = movimentos.length > 0 ? movimentos[0] : null

  const leituras: LeituraComMetadados[] = []
  let seq = 0
  let ultimaPublicacao = -Infinity
  let proximoMovimento = 0
  let proximaMudanca = 0
  let ultimoMovimento = -Infinity

  // Métricas amostradas
  let tempoOcupadoMs = 0
  let ocupacaoRealMs = 0
  let ocupadoIndevidoMs = 0
  let caudaMs = 0
  let desocupadoIndevidoMs = 0
  let luzMs = 0
  let hvacMs = 0
  let atrasoAteOcupadoMs: number | null = null

  const blocos = [...roteiro.ocupacaoReal].sort((a, b) => a.de - b.de)

  for (let t = 0; t < roteiro.duracaoMs; t += passo) {
    while (proximaMudanca < mudancas.length && mudancas[proximaMudanca].t <= t) {
      const e = mudancas[proximaMudanca++]
      if (e.ambiente) ambiente = { ...ambiente, ...e.ambiente }
      if (e.config) config = mesclarConfig(config, e.config)
    }
    while (proximoMovimento < movimentos.length && movimentos[proximoMovimento] <= t) {
      ultimoMovimento = movimentos[proximoMovimento++]
    }

    // PIR redisparável: alto por retencaoPirMs após o último movimento.
    const pir = t - ultimoMovimento < roteiro.retencaoPirMs
    const mudou = passoDispositivo(dispositivo, { pir, config, ambiente }, t)

    if (mudou || t - ultimaPublicacao >= PERIODO_PUBLICACAO_MS) {
      ultimaPublicacao = t
      leituras.push({
        dispositivo: ID_DISPOSITIVO,
        seq: seq++,
        ts: baseEpoch + t,
        estado: dispositivo.fsm.estado,
        pir,
        temperatura: ambiente.temperatura,
        umidade: ambiente.umidade,
        lux: ambiente.lux,
        luz: dispositivo.luz,
        hvac: dispositivo.hvac,
        recebidoEm: baseEpoch + t, // sem rede: a leitura chega no instante em que é gerada
        latenciaMs: 0,
        perdidas: 0,
      })
    }

    const ocupado = dispositivo.fsm.estado === 'OCUPADO'
    const bloco = blocos.find((b) => t >= b.de && t < b.ate)
    if (ocupado) {
      tempoOcupadoMs += passo
      if (atrasoAteOcupadoMs === null && primeiroMovimento !== null) atrasoAteOcupadoMs = t - primeiroMovimento
    }
    if (bloco) ocupacaoRealMs += passo
    if (ocupado && !bloco) {
      // Cauda intencional: depois que a sala esvazia, o sistema ainda espera a
      // retenção do PIR mais tOcupado antes de desligar. Não é falso positivo.
      const anterior = blocos.filter((b) => b.ate <= t).pop()
      const naCauda = anterior !== undefined && t < anterior.ate + roteiro.retencaoPirMs + config.tOcupadoMs
      if (naCauda) caudaMs += passo
      else ocupadoIndevidoMs += passo
    }
    if (!ocupado && bloco) desocupadoIndevidoMs += passo
    if (dispositivo.luz) luzMs += passo
    if (dispositivo.hvac) hvacMs += passo
  }

  // Linha de base: atuador ligado durante toda a janela de operação (interruptor manual).
  const reducaoPct = (ligadoMs: number) => (100 * (roteiro.duracaoMs - ligadoMs)) / roteiro.duracaoMs

  return {
    config,
    leituras,
    cenario: {
      passoMs: passo,
      duracaoMs: roteiro.duracaoMs,
      ativou: tempoOcupadoMs > 0,
      atrasoAteOcupadoMs,
      tempoOcupadoMs,
      ocupacaoRealMs,
      ocupadoIndevidoMs,
      caudaMs,
      desocupadoIndevidoMs,
      tempoLigado: { luzMs, hvacMs },
      reducao: { luzPct: reducaoPct(luzMs), hvacPct: reducaoPct(hvacMs) },
    },
    metricas: calcularMetricas(leituras),
  }
}
