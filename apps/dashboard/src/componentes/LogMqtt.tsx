// Log das mensagens MQTT (as últimas 200), mais recentes primeiro.
import { TAMANHO_LOG, usePainel } from '../contexto'
import { formatarHora } from '../formatar'

export function LogMqtt() {
  const { log } = usePainel()

  return (
    <section className="cartao" aria-labelledby="titulo-log">
      <header className="cartao__cabecalho">
        <h2 id="titulo-log" className="cartao__titulo">
          Log MQTT
        </h2>
        <span className="cartao__nota">
          {log.entradas.length} de {TAMANHO_LOG} mensagens
          {log.pausado && log.novasDuranteAPausa > 0 ? ` · ${log.novasDuranteAPausa} novas durante a pausa` : ''}
        </span>
        <div className="cartao__acoes">
          <button type="button" className="botao botao--secundario" aria-pressed={log.pausado} onClick={log.alternarPausa}>
            {log.pausado ? 'Retomar' : 'Pausar'}
          </button>
          <button type="button" className="botao botao--quieto" onClick={log.limpar} disabled={log.entradas.length === 0}>
            Limpar
          </button>
        </div>
      </header>

      {log.entradas.length === 0 ? (
        <p className="vazio">Nenhuma mensagem ainda. As leituras do dispositivo e as configurações publicadas aparecem aqui.</p>
      ) : (
        <ol className="log" tabIndex={0} aria-label="Mensagens MQTT, mais recentes primeiro">
          {log.entradas.map((e) => (
            <li key={e.id} className="log__linha">
              <time className="log__hora">{formatarHora(e.em)}</time>
              <span className={`selo selo--${e.direcao}`}>{e.direcao === 'entrada' ? 'entrada' : 'saída'}</span>
              <code className="log__topico">{e.topico}</code>
              <code className="log__payload" title={e.payload}>
                {e.payload}
              </code>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
