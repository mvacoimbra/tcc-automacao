// Histórico: temperatura e lux no tempo (com as linhas de tempAlvo e luxLimiar), faixas
// de ocupação/luz/HVAC, métricas do Cap. 4 e exportação CSV. Atualiza a cada 5 s.
import { useEffect, useMemo, useState } from 'react'
import type { LeituraComMetadados, Metricas } from '@tcc/contrato'
import { listarLeituras, obterMetricas, urlCsv } from '../api'
import { GraficoFaixa, GraficoLinha, type Ponto } from '../componentes/Graficos'
import { usePainel } from '../contexto'
import { formatarDuracao, formatarNumero, formatarPercentual } from '../formatar'
import { PERIODOS, inicioDoPeriodo, reduzirSerie, type PeriodoId } from '../serie'

const ATUALIZACAO_MS = 5000
const PONTOS_MAXIMOS = 1500

type Dados = { leituras: LeituraComMetadados[]; metricas: Metricas; de: number; ate: number }

function paraPonto(l: LeituraComMetadados): Ponto {
  return {
    t: l.recebidoEm,
    temperatura: l.temperatura,
    lux: l.lux,
    ocupacao: l.estado === 'OCUPADO' ? 1 : l.estado === 'CONFIRMANDO' ? 0.5 : 0,
    luz: l.luz ? 1 : 0,
    hvac: l.hvac ? 1 : 0,
  }
}

function extremos(valores: number[], casas: number, unidade: string): string {
  if (valores.length === 0) return 'sem dados'
  return `mín. ${formatarNumero(Math.min(...valores), casas)} ${unidade}, máx. ${formatarNumero(Math.max(...valores), casas)} ${unidade}`
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="metrica">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  )
}

export function Historico() {
  const { dispositivoId, config } = usePainel()
  const [periodo, setPeriodo] = useState<PeriodoId>('15min')
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!dispositivoId) {
      setDados(null)
      setCarregando(false)
      return
    }
    let cancelado = false
    setDados(null)
    setCarregando(true)

    async function carregar(id: string) {
      const ate = Date.now()
      const de = inicioDoPeriodo(periodo, ate)
      try {
        const [leituras, metricas] = await Promise.all([listarLeituras(id, de), obterMetricas(id, de)])
        if (cancelado) return // resposta de um período ou dispositivo que já não está na tela
        setDados({ leituras, metricas, de, ate })
        setErro(null)
      } catch (e) {
        if (!cancelado) setErro((e as Error).message)
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    void carregar(dispositivoId)
    const id = setInterval(() => void carregar(dispositivoId), ATUALIZACAO_MS)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [dispositivoId, periodo])

  const pontos = useMemo(() => (dados ? reduzirSerie(dados.leituras, PONTOS_MAXIMOS).map(paraPonto) : []), [dados])

  // "Tudo" abre o eixo na primeira leitura; os demais, na janela pedida.
  const eixo = useMemo(() => {
    if (!dados) return { de: 0, ate: 1 }
    const de = periodo === 'tudo' ? (dados.leituras[0]?.recebidoEm ?? dados.ate - 60_000) : dados.de
    return { de, ate: Math.max(dados.ate, de + 1000) }
  }, [dados, periodo])

  const semLeituras = dados !== null && dados.leituras.length === 0
  const m = dados?.metricas

  return (
    <>
      <header className="tela__cabecalho">
        <h1 className="tela__titulo">Histórico</h1>
        <div className="tela__acoes">
          <fieldset className="segmentado">
            <legend className="somente-leitor">Período</legend>
            {PERIODOS.map((p) => (
              <label key={p.id} className={`segmentado__opcao${periodo === p.id ? ' segmentado__opcao--ativa' : ''}`}>
                <input type="radio" name="periodo" value={p.id} checked={periodo === p.id} onChange={() => setPeriodo(p.id)} />
                <span>{p.rotulo}</span>
              </label>
            ))}
          </fieldset>
          {dispositivoId ? (
            <a className="botao botao--primario" href={urlCsv(dispositivoId, dados?.de ?? inicioDoPeriodo(periodo, Date.now()))} download>
              Exportar CSV
            </a>
          ) : (
            <button type="button" className="botao botao--primario" disabled>
              Exportar CSV
            </button>
          )}
        </div>
      </header>

      {erro && (
        <div className="faixa faixa--erro" role="alert">
          Não foi possível atualizar o histórico: {erro}. Os dados abaixo podem estar desatualizados.
        </div>
      )}

      {!dispositivoId ? (
        <section className="cartao">
          <h2 className="cartao__titulo">Sem dados ainda</h2>
          <p className="vazio">Nenhum dispositivo enviou leituras. Ligue o modo Demo em Configurações ou conecte um dispositivo ao broker.</p>
        </section>
      ) : carregando && !dados ? (
        <section className="cartao" aria-busy="true">
          <p className="vazio">Carregando o histórico…</p>
        </section>
      ) : semLeituras ? (
        <section className="cartao">
          <h2 className="cartao__titulo">Nenhuma leitura neste período</h2>
          <p className="vazio">Escolha um período maior ou aguarde novas leituras do dispositivo {dispositivoId}.</p>
        </section>
      ) : dados && m ? (
        <>
          <section className="cartao" aria-labelledby="titulo-graficos">
            <h2 id="titulo-graficos" className="cartao__titulo">
              Sensores
            </h2>
            <GraficoLinha
              titulo="Temperatura"
              unidade="°C"
              dados={pontos}
              campo="temperatura"
              cor="var(--grafico-temperatura)"
              referencia={config ? { valor: config.tempAlvo, rotulo: `alvo ${formatarNumero(config.tempAlvo, 1)} °C` } : null}
              eixo={eixo}
              resumo={extremos(pontos.flatMap((p) => (p.temperatura === null ? [] : [p.temperatura])), 1, '°C')}
            />
            <GraficoLinha
              titulo="Luminosidade"
              unidade="lux"
              dados={pontos}
              campo="lux"
              cor="var(--grafico-lux)"
              referencia={config ? { valor: config.luxLimiar, rotulo: `limiar ${formatarNumero(config.luxLimiar, 0)} lux` } : null}
              eixo={eixo}
              resumo={extremos(pontos.map((p) => p.lux), 0, 'lux')}
            />
          </section>

          <section className="cartao" aria-labelledby="titulo-estados">
            <h2 id="titulo-estados" className="cartao__titulo">
              Ocupação e atuadores
            </h2>
            <GraficoFaixa
              titulo="Ocupação"
              dados={pontos}
              campo="ocupacao"
              cor="var(--ocupado)"
              eixo={eixo}
              mostrarEixoX={false}
              nomeLigado="ocupado"
              resumo={`${m.ocupacao.transicoes} mudanças de estado, ${formatarDuracao(m.ocupacao.tempoOcupadoMs)} ocupado`}
            />
            <GraficoFaixa
              titulo="Luz"
              dados={pontos}
              campo="luz"
              cor="var(--grafico-luz)"
              eixo={eixo}
              mostrarEixoX={false}
              nomeLigado="ligada"
              resumo={`${formatarDuracao(m.tempoLigado.luzMs)} ligada`}
            />
            <GraficoFaixa
              titulo="HVAC"
              dados={pontos}
              campo="hvac"
              cor="var(--grafico-hvac)"
              eixo={eixo}
              mostrarEixoX
              nomeLigado="ligado"
              resumo={`${formatarDuracao(m.tempoLigado.hvacMs)} ligado`}
            />
          </section>

          <section className="cartao" aria-labelledby="titulo-metricas">
            <h2 id="titulo-metricas" className="cartao__titulo">
              Métricas do período
            </h2>
            <div className="metricas">
              <div className="metricas__grupo">
                <h3>Latência fim a fim</h3>
                <dl>
                  <Metrica rotulo="Mínima" valor={m.latencia.minMs === null ? '—' : `${formatarNumero(m.latencia.minMs, 0)} ms`} />
                  <Metrica rotulo="Média" valor={m.latencia.mediaMs === null ? '—' : `${formatarNumero(m.latencia.mediaMs, 1)} ms`} />
                  <Metrica rotulo="p95" valor={m.latencia.p95Ms === null ? '—' : `${formatarNumero(m.latencia.p95Ms, 0)} ms`} />
                  <Metrica rotulo="Máxima" valor={m.latencia.maxMs === null ? '—' : `${formatarNumero(m.latencia.maxMs, 0)} ms`} />
                  <Metrica rotulo="Amostras" valor={formatarNumero(m.latencia.amostras, 0)} />
                </dl>
              </div>
              <div className="metricas__grupo">
                <h3>Perda de mensagens</h3>
                <dl>
                  <Metrica rotulo="Recebidas" valor={formatarNumero(m.perda.recebidas, 0)} />
                  <Metrica rotulo="Perdidas" valor={formatarNumero(m.perda.perdidas, 0)} />
                  <Metrica rotulo="Taxa" valor={formatarPercentual(m.perda.taxa)} />
                </dl>
              </div>
              <div className="metricas__grupo">
                <h3>Tempo ligado</h3>
                <dl>
                  <Metrica rotulo="Luz" valor={formatarDuracao(m.tempoLigado.luzMs)} />
                  <Metrica rotulo="HVAC" valor={formatarDuracao(m.tempoLigado.hvacMs)} />
                </dl>
              </div>
              <div className="metricas__grupo">
                <h3>Ocupação</h3>
                <dl>
                  <Metrica rotulo="Mudanças de estado" valor={formatarNumero(m.ocupacao.transicoes, 0)} />
                  <Metrica rotulo="Tempo ocupado" valor={formatarDuracao(m.ocupacao.tempoOcupadoMs)} />
                </dl>
              </div>
            </div>
            <p className="nota">
              A latência é recebidoEm − ts e depende dos relógios do dispositivo e deste computador; leituras com ts = 0 (sem NTP) ficam de fora.
              Intervalos entre leituras maiores que 10 s não contam como tempo ligado.
            </p>
          </section>
        </>
      ) : null}
    </>
  )
}
