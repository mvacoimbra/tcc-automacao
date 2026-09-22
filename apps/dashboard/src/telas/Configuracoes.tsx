// Configurações: modo do broker (embutido ou externo, trocado a quente), modo Demo e
// os endereços para abrir o dashboard em outro dispositivo.
import { useEffect, useState, type SyntheticEvent } from 'react'
import { Configuracoes as EsquemaConfiguracoes, type Configuracoes as TipoConfiguracoes } from '@tcc/contrato'
import { obterConfiguracoes, obterSaude, salvarConfiguracoes } from '../api'
import { usePainel } from '../contexto'

type Formulario = { modo: 'embutido' | 'externo'; host: string; porta: string; raiz: string; demo: boolean }
type Erros = Partial<Record<'host' | 'porta' | 'raiz', string>>
type Resultado = { tipo: 'ocioso' } | { tipo: 'salvando' } | { tipo: 'ok'; texto: string } | { tipo: 'erro'; texto: string }

// Broker público usado pelo firmware no Wokwi (raiz única, para não colidir com terceiros).
const BROKER_PUBLICO = { host: 'broker.hivemq.com', porta: '1883', raiz: 'tcc-unip-7f3a9c' }

function deConfiguracoes(c: TipoConfiguracoes): Formulario {
  return c.broker.modo === 'externo'
    ? { modo: 'externo', host: c.broker.host, porta: String(c.broker.porta), raiz: c.broker.raiz, demo: c.demo }
    : { modo: 'embutido', ...BROKER_PUBLICO, demo: c.demo }
}

function paraConfiguracoes(f: Formulario): unknown {
  return {
    broker: f.modo === 'externo' ? { modo: 'externo', host: f.host.trim(), porta: Number(f.porta), raiz: f.raiz.trim() } : { modo: 'embutido' },
    demo: f.demo,
  }
}

const MENSAGENS: Record<keyof Erros, string> = {
  host: 'Informe o endereço do broker, sem espaços.',
  porta: 'Use um número inteiro de 1 a 65535.',
  raiz: 'Use letras, números, - e _ (segmentos separados por /), sem # nem +.',
}

export function Configuracoes() {
  const { saude } = usePainel()
  const [form, setForm] = useState<Formulario | null>(null)
  const [erros, setErros] = useState<Erros>({})
  const [resultado, setResultado] = useState<Resultado>({ tipo: 'ocioso' })
  const [falhaAoCarregar, setFalhaAoCarregar] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    obterConfiguracoes()
      .then((c) => !cancelado && setForm(deConfiguracoes(c)))
      .catch((e: Error) => !cancelado && setFalhaAoCarregar(e.message))
    return () => {
      cancelado = true
    }
  }, [])

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => (f ? { ...f, [campo]: valor } : f))
    setResultado({ tipo: 'ocioso' })
  }

  async function salvar(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form) return
    const candidato = EsquemaConfiguracoes.safeParse(paraConfiguracoes(form))
    if (!candidato.success) {
      const novos: Erros = {}
      for (const problema of candidato.error.issues) {
        const campo = problema.path[1]
        if (campo === 'host' || campo === 'porta' || campo === 'raiz') novos[campo] = MENSAGENS[campo]
      }
      setErros(novos)
      return
    }
    setErros({})
    setResultado({ tipo: 'salvando' })
    try {
      await salvarConfiguracoes(candidato.data)
      await obterSaude() // o servidor também avisa pelo WebSocket; isto só confirma que respondeu
      setResultado({ tipo: 'ok', texto: 'Configuração aplicada, sem reiniciar o aplicativo.' })
    } catch (erro) {
      setResultado({ tipo: 'erro', texto: (erro as Error).message })
    }
  }

  const externo = form?.modo === 'externo'
  const portaBroker = saude?.broker.porta

  return (
    <>
      <header className="tela__cabecalho">
        <h1 className="tela__titulo">Configurações</h1>
      </header>

      <div className="grade grade--configuracoes">
        <section className="cartao" aria-labelledby="titulo-broker">
          <h2 id="titulo-broker" className="cartao__titulo">
            Broker MQTT e modo Demo
          </h2>
          {falhaAoCarregar ? (
            <p className="mensagem mensagem--erro" role="alert">
              Não foi possível carregar as configurações: {falhaAoCarregar}
            </p>
          ) : !form ? (
            <p className="vazio">Carregando…</p>
          ) : (
            <form className="formulario" onSubmit={salvar} noValidate>
              <fieldset className="opcoes">
                <legend>Broker</legend>
                <label className="opcao">
                  <input type="radio" name="modo" checked={form.modo === 'embutido'} onChange={() => alterar('modo', 'embutido')} />
                  <span>
                    <strong>Embutido</strong>
                    <small>O aplicativo sobe o próprio broker. Não precisa instalar nada.</small>
                  </span>
                </label>
                <label className="opcao">
                  <input type="radio" name="modo" checked={form.modo === 'externo'} onChange={() => alterar('modo', 'externo')} />
                  <span>
                    <strong>Externo</strong>
                    <small>Recebe de um broker que já existe, como o Mosquitto ou um broker público.</small>
                  </span>
                </label>
              </fieldset>

              {externo && (
                <>
                  <div className="campo">
                    <label htmlFor="cfg-host">Endereço do broker</label>
                    <input
                      id="cfg-host"
                      type="text"
                      value={form.host}
                      onChange={(ev) => alterar('host', ev.target.value)}
                      aria-invalid={erros.host ? true : undefined}
                      aria-describedby="cfg-host-ajuda"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p id="cfg-host-ajuda" className={erros.host ? 'campo__ajuda campo__ajuda--erro' : 'campo__ajuda'}>
                      {erros.host ?? 'Nome ou IP, por exemplo broker.hivemq.com.'}
                    </p>
                  </div>
                  <div className="campo">
                    <label htmlFor="cfg-porta">Porta</label>
                    <input
                      id="cfg-porta"
                      type="text"
                      inputMode="numeric"
                      value={form.porta}
                      onChange={(ev) => alterar('porta', ev.target.value)}
                      aria-invalid={erros.porta ? true : undefined}
                      aria-describedby="cfg-porta-ajuda"
                    />
                    <p id="cfg-porta-ajuda" className={erros.porta ? 'campo__ajuda campo__ajuda--erro' : 'campo__ajuda'}>
                      {erros.porta ?? 'A porta MQTT padrão é 1883.'}
                    </p>
                  </div>
                  <div className="campo">
                    <label htmlFor="cfg-raiz">Raiz dos tópicos</label>
                    <input
                      id="cfg-raiz"
                      type="text"
                      value={form.raiz}
                      onChange={(ev) => alterar('raiz', ev.target.value)}
                      aria-invalid={erros.raiz ? true : undefined}
                      aria-describedby="cfg-raiz-ajuda"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p id="cfg-raiz-ajuda" className={erros.raiz ? 'campo__ajuda campo__ajuda--erro' : 'campo__ajuda'}>
                      {erros.raiz ?? 'O aplicativo assina <raiz>/+/estado. O firmware do TCC usa tcc-unip-7f3a9c.'}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="botao botao--quieto"
                      onClick={() => setForm((f) => (f ? { ...f, ...BROKER_PUBLICO } : f))}
                    >
                      Preencher com o broker público do TCC
                    </button>
                  </div>
                </>
              )}

              <div className="campo">
                <label className="interruptor">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={form.demo}
                    onChange={(ev) => alterar('demo', ev.target.checked)}
                    aria-describedby="cfg-demo-ajuda"
                  />
                  <span>Modo Demo (dispositivo simulado)</span>
                </label>
                <p id="cfg-demo-ajuda" className="campo__ajuda">
                  {externo
                    ? 'A preferência é guardada, mas o Demo só funciona com o broker embutido: com o externo o simulador não roda.'
                    : 'Liga um dispositivo simulado (sala01) que publica leituras e responde à configuração.'}
                </p>
              </div>

              <div className="formulario__acoes">
                <button type="submit" className="botao botao--primario" disabled={resultado.tipo === 'salvando'}>
                  {resultado.tipo === 'salvando' ? 'Aplicando…' : 'Salvar e aplicar'}
                </button>
              </div>

              <p
                className={`mensagem${resultado.tipo === 'erro' ? ' mensagem--erro' : resultado.tipo === 'ok' ? ' mensagem--ok' : ''}`}
                role={resultado.tipo === 'erro' ? 'alert' : 'status'}
              >
                {resultado.tipo === 'ok' || resultado.tipo === 'erro' ? resultado.texto : ''}
              </p>
            </form>
          )}
        </section>

        <section className="cartao" aria-labelledby="titulo-rede">
          <h2 id="titulo-rede" className="cartao__titulo">
            Abrir em outro dispositivo
          </h2>
          {!saude ? (
            <p className="vazio">Sem resposta do servidor.</p>
          ) : (
            <>
              <p className="nota">Na mesma rede local, abra um destes endereços no navegador do celular ou de outro computador:</p>
              {saude.enderecosLan.length === 0 ? (
                <p className="vazio">Nenhuma rede local encontrada neste computador.</p>
              ) : (
                <ul className="enderecos">
                  {saude.enderecosLan.map((ip) => (
                    <li key={ip}>
                      <code>{`http://${ip}:${saude.portaHttp}`}</code>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="subtitulo">Portas em uso</h3>
              <dl className="portas">
                <div className="metrica">
                  <dt>HTTP (dashboard e API)</dt>
                  <dd>{saude.portaHttp}</dd>
                </div>
                <div className="metrica">
                  <dt>WebSocket</dt>
                  <dd>{saude.portaHttp}, caminho /ws</dd>
                </div>
                <div className="metrica">
                  <dt>{saude.broker.modo === 'embutido' ? 'MQTT (broker embutido)' : 'MQTT (broker externo)'}</dt>
                  <dd>{portaBroker}</dd>
                </div>
              </dl>
              {saude.broker.modo === 'embutido' && saude.broker.porta !== 1883 && (
                <p className="nota">A porta padrão 1883 estava ocupada (por exemplo, pelo Mosquitto do Docker); o broker embutido usou a {saude.broker.porta}.</p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
