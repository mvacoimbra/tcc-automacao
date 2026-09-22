// FSM de ocupação (Figura 3 do TC I): três estados como nós, o atual destacado, e a
// transição animada quando o estado muda. CONFIRMANDO fica esmaecido quando a janela
// de confirmação está desativada (janelaConfMs = 0), como no modelo original.
import { useEffect, useState } from 'react'
import type { ConfigDispositivo, LeituraComMetadados, Ocupacao } from '@tcc/contrato'
import { usePainel, type Transicao } from '../contexto'
import { contagemRegressiva, formatarDuracao } from '../formatar'
import { useAgora } from '../useAgora'

type Aresta = 'D-C' | 'C-O' | 'D-O' | 'O-D' | 'C-D'

const ARESTAS: Record<Aresta, { d: string; rotulo: string; x: number; y: number }> = {
  'D-C': { d: 'M170,110 L243,110', rotulo: 'movimento', x: 207, y: 98 },
  'C-O': { d: 'M395,110 L468,110', rotulo: 'N pulsos', x: 431, y: 98 },
  'D-O': { d: 'M95,80 C95,22 545,22 545,78', rotulo: 'movimento, sem janela', x: 320, y: 32 },
  // As duas voltas para DESOCUPADO ficam aninhadas (a rasa dentro da funda), sem se cruzar.
  'O-D': { d: 'M545,140 C545,240 60,240 60,142', rotulo: 'sem movimento por t_ocupado', x: 302, y: 238 },
  'C-D': { d: 'M300,140 C300,165 130,165 130,142', rotulo: 'janela expirou', x: 215, y: 184 },
}

const NOS: { estado: Ocupacao; x: number }[] = [
  { estado: 'DESOCUPADO', x: 20 },
  { estado: 'CONFIRMANDO', x: 245 },
  { estado: 'OCUPADO', x: 470 },
]

const INICIAL: Record<Ocupacao, 'D' | 'C' | 'O'> = { DESOCUPADO: 'D', CONFIRMANDO: 'C', OCUPADO: 'O' }

function arestaDe(t: Transicao | null): Aresta | null {
  if (!t) return null
  const id = `${INICIAL[t.de]}-${INICIAL[t.para]}`
  return id in ARESTAS ? (id as Aresta) : null
}

const DURACAO_DESTAQUE_MS = 1600

export function DiagramaFsm({
  leitura,
  config,
}: {
  leitura: LeituraComMetadados | null
  config: ConfigDispositivo | null
}) {
  const { transicao, movimentoEm } = usePainel()
  const estado = leitura?.estado ?? null
  const janelaAtiva = (config?.janelaConfMs ?? 0) > 0

  // A aresta da última transição fica destacada por um instante.
  const [destacada, setDestacada] = useState<{ id: number; aresta: Aresta } | null>(null)
  useEffect(() => {
    const aresta = arestaDe(transicao)
    if (!transicao || !aresta) return
    setDestacada({ id: transicao.id, aresta })
    const t = setTimeout(() => setDestacada(null), DURACAO_DESTAQUE_MS)
    return () => clearTimeout(t)
  }, [transicao])

  const contando = estado === 'OCUPADO' && !leitura?.pir
  const agora = useAgora(500, contando)
  const restante = contando && config ? contagemRegressiva(config.tOcupadoMs, movimentoEm, agora) : null

  function subrotulo(no: Ocupacao): string {
    if (no === 'CONFIRMANDO' && !janelaAtiva) return 'desativado'
    if (no !== estado) return ''
    if (no === 'OCUPADO') {
      if (leitura?.pir) return 'movimento'
      return restante === null ? 'sem movimento' : `desocupa em ≈${formatarDuracao(restante)}`
    }
    return 'atual'
  }

  return (
    <div className="diagrama-rolagem">
      <svg className="fsm" viewBox="0 0 640 252" role="img" aria-label={`Máquina de estados de ocupação${estado ? `, estado atual ${estado}` : ''}`}>
        <defs>
          <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="seta" />
          </marker>
          <marker id="seta-ativa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="seta seta--ativa" />
          </marker>
        </defs>

        {(Object.keys(ARESTAS) as Aresta[]).map((id) => {
          const ativa = destacada?.aresta === id
          return (
            <g key={ativa ? `${id}-${destacada!.id}` : id}>
              <path
                className={`aresta${ativa ? ' aresta--ativa' : ''}${id === 'C-D' || id === 'C-O' ? (janelaAtiva ? '' : ' aresta--apagada') : ''}`}
                d={ARESTAS[id].d}
                markerEnd={`url(#${ativa ? 'seta-ativa' : 'seta'})`}
                fill="none"
              />
              <text className="d-aresta" x={ARESTAS[id].x} y={ARESTAS[id].y} textAnchor="middle">
                {ARESTAS[id].rotulo}
              </text>
            </g>
          )
        })}

        {NOS.map(({ estado: no, x }) => {
          const atual = no === estado
          const apagado = no === 'CONFIRMANDO' && !janelaAtiva
          return (
            <g key={no} className={`no no--${no.toLowerCase()}${atual ? ' no--atual' : ''}${apagado ? ' no--apagado' : ''}`} aria-current={atual ? 'step' : undefined}>
              <rect x={x} y={80} width={150} height={60} rx={10} />
              <text className="d-no" x={x + 75} y={106} textAnchor="middle">
                {no}
              </text>
              <text className="d-sub" x={x + 75} y={126} textAnchor="middle">
                {subrotulo(no)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
