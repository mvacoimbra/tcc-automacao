// Estado das duas conexões, sempre visível no topo: tela ↔ servidor (WebSocket) e
// servidor ↔ broker MQTT. Cor e texto sempre juntos, para não depender só da cor.
import { usePainel } from '../contexto'
import { useAgora } from '../useAgora'

type Nivel = 'ok' | 'aviso' | 'erro' | 'neutro'

function Item({ rotulo, nivel, texto, dica }: { rotulo: string; nivel: Nivel; texto: string; dica?: string }) {
  return (
    <li className="conexao" title={dica}>
      <span className={`ponto ponto--${nivel}`} aria-hidden="true" />
      <span className="conexao__rotulo">{rotulo}</span>
      <strong className="conexao__texto">{texto}</strong>
    </li>
  )
}

export function IndicadorConexao() {
  const { ws, saude } = usePainel()
  const agora = useAgora(500, ws.situacao === 'reconectando')

  let servidor: { nivel: Nivel; texto: string }
  if (ws.situacao === 'conectado') servidor = { nivel: 'ok', texto: 'conectado' }
  else if (ws.situacao === 'conectando') servidor = { nivel: 'aviso', texto: 'conectando…' }
  else {
    const segundos = Math.max(0, Math.ceil(((ws.proximaTentativaEm ?? agora) - agora) / 1000))
    servidor = { nivel: 'erro', texto: `desconectado (nova tentativa em ${segundos} s)` }
  }

  let broker: { nivel: Nivel; texto: string; dica?: string }
  if (ws.situacao !== 'conectado' || !saude) {
    broker = { nivel: 'neutro', texto: 'desconhecido' }
  } else {
    const modo = saude.broker.modo === 'embutido' ? 'embutido' : 'externo'
    broker = {
      nivel: saude.broker.conectado ? 'ok' : 'erro',
      texto: `${modo}, ${saude.broker.conectado ? 'conectado' : 'desconectado'}`,
      dica: `porta ${saude.broker.porta}`,
    }
  }

  return (
    <ul className="conexoes" aria-label="Estado das conexões">
      <Item rotulo="Servidor" nivel={servidor.nivel} texto={servidor.texto} />
      <Item rotulo="Broker MQTT" nivel={broker.nivel} texto={broker.texto} dica={broker.dica} />
    </ul>
  )
}
