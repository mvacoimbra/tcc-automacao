// Só no modo Demo: injeta movimento e ajusta os sensores simulados. Um dispositivo
// real não é comandável assim, então estes controles não existem fora do Demo.
import { useEffect, useRef, useState } from 'react'
import type { AmbienteDemo } from '@tcc/contrato'
import { definirAmbienteDemo, simularMovimento } from '../api'
import { usePainel } from '../contexto'
import { formatarNumero } from '../formatar'

type Sensor = keyof AmbienteDemo

const SENSORES: { id: Sensor; rotulo: string; unidade: string; min: number; max: number; passo: number; casas: number }[] = [
  { id: 'temperatura', rotulo: 'Temperatura', unidade: '°C', min: 10, max: 45, passo: 0.5, casas: 1 },
  { id: 'umidade', rotulo: 'Umidade', unidade: '%', min: 0, max: 100, passo: 1, casas: 0 },
  { id: 'lux', rotulo: 'Luminosidade', unidade: 'lux', min: 0, max: 1000, passo: 10, casas: 0 },
]

const ATRASO_ENVIO_MS = 150

export function ControlesDemo() {
  const { leitura } = usePainel()
  const [valores, setValores] = useState<Record<Sensor, number>>({ temperatura: 28, umidade: 55, lux: 120 })
  const [erro, setErro] = useState<string | null>(null)
  const [movendo, setMovendo] = useState(false)
  const inicializado = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Começa a partir do que o dispositivo está publicando; depois o controle manda.
  useEffect(() => {
    if (inicializado.current || !leitura) return
    inicializado.current = true
    setValores({ temperatura: leitura.temperatura ?? 28, umidade: leitura.umidade ?? 55, lux: leitura.lux })
  }, [leitura])

  useEffect(() => () => clearTimeout(temporizador.current), [])

  function alterar(sensor: Sensor, valor: number) {
    setValores((v) => ({ ...v, [sensor]: valor }))
    clearTimeout(temporizador.current)
    // um envio só depois que o controle para de se mover
    temporizador.current = setTimeout(() => {
      definirAmbienteDemo({ [sensor]: valor })
        .then(() => setErro(null))
        .catch((e: Error) => setErro(e.message))
    }, ATRASO_ENVIO_MS)
  }

  async function movimento() {
    setMovendo(true)
    try {
      await simularMovimento()
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      // o PIR fica alto por 5 s; o botão volta logo, o feedback está no diagrama
      setTimeout(() => setMovendo(false), 600)
    }
  }

  return (
    <section className="cartao" aria-labelledby="titulo-demo">
      <header className="cartao__cabecalho">
        <h2 id="titulo-demo" className="cartao__titulo">
          Ambiente simulado
        </h2>
        <span className="selo selo--demo">modo Demo</span>
      </header>

      <button type="button" className="botao botao--primario botao--cheio" onClick={movimento} disabled={movendo}>
        {movendo ? 'Movimento enviado' : 'Simular movimento (5 s)'}
      </button>

      <div className="campos">
        {SENSORES.map((s) => (
          <label key={s.id} className="deslizante">
            <span className="deslizante__topo">
              <span>{s.rotulo}</span>
              <output aria-live="off">
                {formatarNumero(valores[s.id], s.casas)} {s.unidade}
              </output>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.passo}
              value={valores[s.id]}
              onChange={(e) => alterar(s.id, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      {erro && (
        <p className="mensagem mensagem--erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  )
}
