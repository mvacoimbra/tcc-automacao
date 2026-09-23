// Painel de ajuste do componente clicado no diagrama. Publica a config no tópico
// <raiz>/<dispositivo>/config: PIR -> tempo/janela/pulsos; LDR e lâmpada -> limiar de
// lux; DHT22 e HVAC -> temperatura-alvo.
import { useEffect, useState, type SyntheticEvent } from 'react'
import type { ConfigDispositivo, ConfigPayload } from '@tcc/contrato'
import { publicarConfig, simularMovimento } from '../api'
import { usePainel } from '../contexto'
import type { AlvoAjuste } from './DiagramaEsp32'

type Campo = keyof ConfigDispositivo

type DefinicaoCampo = {
  rotulo: string
  unidade: string
  // O firmware guarda tempos em ms; a tela pergunta em segundos.
  escala: number
  min: number
  max: number
  passo: number
  ajuda: string
}

const CAMPOS: Record<Campo, DefinicaoCampo> = {
  tOcupadoMs: {
    rotulo: 'Tempo até desocupar',
    unidade: 's',
    escala: 1000,
    min: 1,
    max: 3600,
    passo: 1,
    ajuda: 'Sem movimento por este tempo, a sala volta a DESOCUPADO.',
  },
  janelaConfMs: {
    rotulo: 'Janela de confirmação',
    unidade: 's',
    escala: 1000,
    min: 0,
    max: 600,
    passo: 1,
    ajuda: '0 desativa a janela (modelo da Figura 3).',
  },
  pulsosConf: {
    rotulo: 'Detecções na janela',
    unidade: '',
    escala: 1,
    min: 1,
    max: 20,
    passo: 1,
    ajuda: 'Quantas detecções dentro da janela confirmam a ocupação.',
  },
  confirmacaoPorNivelMs: {
    rotulo: 'Confirmar por presença contínua',
    unidade: 's',
    escala: 1000,
    min: 0,
    max: 600,
    passo: 1,
    ajuda: 'Tempo de PIR em alto que confirma sozinho, para quem fica parado. 0 desativa.',
  },
  luxLimiar: {
    rotulo: 'Limiar de luminosidade',
    unidade: 'lux',
    escala: 1,
    min: 0,
    max: 100_000,
    passo: 10,
    ajuda: 'A luz só acende com a sala ocupada e abaixo deste valor.',
  },
  tempAlvo: {
    rotulo: 'Temperatura-alvo',
    unidade: '°C',
    escala: 1,
    min: 10,
    max: 40,
    passo: 0.5,
    ajuda: 'O HVAC só liga com a sala ocupada e acima deste valor.',
  },
}

const PAINEIS: Record<AlvoAjuste, { titulo: string; campos: Campo[] }> = {
  pir: { titulo: 'PIR (presença)', campos: ['tOcupadoMs', 'janelaConfMs', 'pulsosConf', 'confirmacaoPorNivelMs'] },
  ldr: { titulo: 'LDR (luminosidade)', campos: ['luxLimiar'] },
  luz: { titulo: 'Luz (relé)', campos: ['luxLimiar'] },
  dht: { titulo: 'DHT22 (temperatura)', campos: ['tempAlvo'] },
  hvac: { titulo: 'HVAC (ar-condicionado)', campos: ['tempAlvo'] },
}

const paraTela = (campo: Campo, config: ConfigDispositivo): string => String(config[campo] / CAMPOS[campo].escala)

type Resultado = { tipo: 'ocioso' } | { tipo: 'enviando' } | { tipo: 'ok'; texto: string } | { tipo: 'erro'; texto: string }

export function PainelAjuste({ alvo, demo, aoFechar }: { alvo: AlvoAjuste; demo: boolean; aoFechar(): void }) {
  const { config, dispositivoId, recarregarConfig } = usePainel()
  const definicao = PAINEIS[alvo]
  const [valores, setValores] = useState<Partial<Record<Campo, string>>>({})
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({})
  const [resultado, setResultado] = useState<Resultado>({ tipo: 'ocioso' })

  // Os campos acompanham a config conhecida (inclusive a que volta do servidor depois de aplicar)...
  useEffect(() => {
    if (!config) return
    setValores(Object.fromEntries(definicao.campos.map((c) => [c, paraTela(c, config)])))
  }, [config, definicao])

  // ...mas erros e resultado só zeram ao trocar de componente. Zerar o resultado a cada
  // config nova apagaria a confirmação de "publicada" no instante em que ela aparece.
  useEffect(() => {
    setErros({})
    setResultado({ tipo: 'ocioso' })
  }, [alvo])

  async function aplicar(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!dispositivoId) return

    const novosErros: Partial<Record<Campo, string>> = {}
    const payload: Record<string, number> = {}
    for (const campo of definicao.campos) {
      const d = CAMPOS[campo]
      const bruto = (valores[campo] ?? '').replace(',', '.').trim()
      const numero = Number(bruto)
      if (bruto === '' || !Number.isFinite(numero)) novosErros[campo] = 'Informe um número.'
      else if (numero < d.min || numero > d.max) novosErros[campo] = `Use um valor entre ${d.min} e ${d.max}${d.unidade ? ` ${d.unidade}` : ''}.`
      else payload[campo] = Math.round(numero * d.escala * 1000) / 1000
    }
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return

    setResultado({ tipo: 'enviando' })
    try {
      await publicarConfig(dispositivoId, payload as ConfigPayload)
      await recarregarConfig()
      setResultado({ tipo: 'ok', texto: 'Configuração publicada para o dispositivo.' })
    } catch (erro) {
      setResultado({ tipo: 'erro', texto: (erro as Error).message })
    }
  }

  return (
    <section className="cartao" aria-labelledby="titulo-ajuste">
      <header className="cartao__cabecalho">
        <h2 id="titulo-ajuste" className="cartao__titulo">
          Ajuste: {definicao.titulo}
        </h2>
        <div className="cartao__acoes">
          <button type="button" className="botao botao--quieto" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </header>

      {!config ? (
        <p className="vazio">Aguardando a configuração do dispositivo…</p>
      ) : (
        <form className="formulario" onSubmit={aplicar} noValidate>
          {definicao.campos.map((campo) => {
            const d = CAMPOS[campo]
            const idCampo = `ajuste-${campo}`
            return (
              <div key={campo} className="campo">
                <label htmlFor={idCampo}>{d.rotulo}</label>
                <div className="campo__entrada">
                  <input
                    id={idCampo}
                    type="text"
                    inputMode="decimal"
                    value={valores[campo] ?? ''}
                    onChange={(ev) => setValores((v) => ({ ...v, [campo]: ev.target.value }))}
                    aria-invalid={erros[campo] ? true : undefined}
                    aria-describedby={`${idCampo}-ajuda`}
                  />
                  {d.unidade && <span className="campo__unidade">{d.unidade}</span>}
                </div>
                <p id={`${idCampo}-ajuda`} className={erros[campo] ? 'campo__ajuda campo__ajuda--erro' : 'campo__ajuda'}>
                  {erros[campo] ?? d.ajuda}
                </p>
              </div>
            )
          })}

          <div className="formulario__acoes">
            <button type="submit" className="botao botao--primario" disabled={resultado.tipo === 'enviando'}>
              {resultado.tipo === 'enviando' ? 'Publicando…' : 'Aplicar'}
            </button>
            {alvo === 'pir' && demo && (
              <button type="button" className="botao botao--secundario" onClick={() => void simularMovimento()}>
                Simular movimento
              </button>
            )}
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
  )
}
