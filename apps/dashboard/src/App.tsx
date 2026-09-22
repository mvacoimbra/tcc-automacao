import { useEffect, useState } from 'react'
import { IndicadorConexao } from './componentes/IndicadorConexao'
import { SeletorDispositivo } from './componentes/SeletorDispositivo'
import { PainelProvider, usePainel } from './contexto'
import { Configuracoes } from './telas/Configuracoes'
import { Controladora } from './telas/Controladora'
import { Historico } from './telas/Historico'

type TelaId = 'controladora' | 'historico' | 'configuracoes'

const TELAS: { id: TelaId; rotulo: string; hash: string }[] = [
  { id: 'controladora', rotulo: 'Controladora', hash: '#/' },
  { id: 'historico', rotulo: 'Histórico', hash: '#/historico' },
  { id: 'configuracoes', rotulo: 'Configurações', hash: '#/configuracoes' },
]

// Navegação por hash (#/, #/historico, #/configuracoes): sem biblioteca de rotas e
// funciona igual servido pelo Express, pelo Vite ou aberto em outro dispositivo.
function useTela(): TelaId {
  const ler = (): TelaId => TELAS.find((t) => t.hash === location.hash)?.id ?? 'controladora'
  const [tela, setTela] = useState<TelaId>(ler)
  useEffect(() => {
    const aoMudar = () => setTela(ler())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])
  return tela
}

function FaixaDesconexao() {
  const { ws } = usePainel()
  if (ws.situacao !== 'reconectando') return null
  return (
    <div className="faixa faixa--erro" role="alert">
      Sem conexão com o servidor. Os valores exibidos são os últimos recebidos; a tela reconecta sozinha.
    </div>
  )
}

function Estrutura() {
  const tela = useTela()
  const rotulo = TELAS.find((t) => t.id === tela)!.rotulo

  useEffect(() => {
    document.title = `${rotulo} · TCC Automação`
  }, [rotulo])

  return (
    <>
      <button type="button" className="pular" onClick={() => document.getElementById('conteudo')?.focus()}>
        Ir para o conteúdo
      </button>
      <div className="app">
        <header className="topo">
          <p className="marca">TCC Automação</p>
          <SeletorDispositivo />
          <IndicadorConexao />
        </header>

        <nav className="lateral" aria-label="Telas">
          <ul>
            {TELAS.map((t) => (
              <li key={t.id}>
                <a href={t.hash} aria-current={t.id === tela ? 'page' : undefined}>
                  {t.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main id="conteudo" className="principal" tabIndex={-1}>
          <FaixaDesconexao />
          {tela === 'controladora' && <Controladora />}
          {tela === 'historico' && <Historico />}
          {tela === 'configuracoes' && <Configuracoes />}
        </main>
      </div>
    </>
  )
}

export function App() {
  return (
    <PainelProvider>
      <Estrutura />
    </PainelProvider>
  )
}
