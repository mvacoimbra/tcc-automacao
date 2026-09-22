// Diagrama do circuito (vai para o Cap. 3): placa ESP32 no centro; à esquerda PIR,
// DHT22 e LDR; à direita a lâmpada (LED amarelo) e o ar-condicionado (LED azul).
// Pinos e cores dos fios seguem firmware/diagram.json. Cada componente é clicável e
// mostra ao lado o valor que o dispositivo está publicando.
import type { KeyboardEvent, ReactNode } from 'react'
import type { ConfigDispositivo, LeituraComMetadados } from '@tcc/contrato'
import { formatarNumero } from '../formatar'

export type AlvoAjuste = 'pir' | 'dht' | 'ldr' | 'luz' | 'hvac'

type Props = {
  leitura: LeituraComMetadados | null
  config: ConfigDispositivo | null
  demo: boolean
  selecionado: AlvoAjuste | null
  aoEscolher(alvo: AlvoAjuste): void
}

const LARGURA = 190
const ALTURA = 96
const PLACA = { x: 290, y: 30, w: 180, h: 380 }

type Ativavel = {
  alvo: AlvoAjuste
  x: number
  y: number
  titulo: string
  linhas: [string, string?]
  descricao: string
}

function Componente({
  item,
  selecionado,
  aoEscolher,
  children,
}: {
  item: Ativavel
  selecionado: boolean
  aoEscolher(alvo: AlvoAjuste): void
  children?: ReactNode
}) {
  const acionar = () => aoEscolher(item.alvo)
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      acionar()
    }
  }
  return (
    <g
      className={`componente${selecionado ? ' componente--selecionado' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selecionado}
      aria-label={item.descricao}
      onClick={acionar}
      onKeyDown={aoTeclar}
    >
      <rect className="quadro" x={item.x} y={item.y} width={LARGURA} height={ALTURA} rx={10} />
      <text className="d-titulo" x={item.x + 14} y={item.y + 28}>
        {item.titulo}
      </text>
      <text className="d-valor" x={item.x + 14} y={item.y + 54}>
        {item.linhas[0]}
      </text>
      {item.linhas[1] && (
        <text className="d-detalhe" x={item.x + 14} y={item.y + 76}>
          {item.linhas[1]}
        </text>
      )}
      {children}
    </g>
  )
}

export function DiagramaEsp32({ leitura, config, demo, selecionado, aoEscolher }: Props) {
  const temperatura = leitura ? formatarNumero(leitura.temperatura, 1) : '—'
  const umidade = leitura ? formatarNumero(leitura.umidade, 0) : '—'
  const lux = leitura ? formatarNumero(leitura.lux, 0) : '—'
  const limiar = config ? formatarNumero(config.luxLimiar, 0) : '—'
  const alvo = config ? formatarNumero(config.tempAlvo, 1) : '—'
  const pir = leitura?.pir ?? false
  const luz = leitura?.luz ?? false
  const hvac = leitura?.hvac ?? false

  const esquerda: Ativavel[] = [
    {
      alvo: 'pir',
      x: 30,
      y: 82,
      titulo: 'PIR',
      linhas: [pir ? 'movimento' : 'sem movimento', 'sensor de presença'],
      descricao: `PIR, ${pir ? 'movimento detectado' : 'sem movimento'}. ${demo ? 'Simula movimento e abre os ajustes.' : 'Abre os ajustes.'}`,
    },
    {
      alvo: 'dht',
      x: 30,
      y: 187,
      titulo: 'DHT22',
      linhas: [`${temperatura} °C`, `${umidade} % UR`],
      descricao: `DHT22, ${temperatura} graus Celsius e ${umidade} por cento de umidade. Abre os ajustes.`,
    },
    {
      alvo: 'ldr',
      x: 30,
      y: 292,
      titulo: 'LDR',
      linhas: [`${lux} lux`, `limiar ${limiar} lux`],
      descricao: `LDR, ${lux} lux, limiar de ${limiar} lux. Abre os ajustes.`,
    },
  ]
  const direita: Ativavel[] = [
    {
      alvo: 'luz',
      x: 540,
      y: 82,
      titulo: 'Luz (relé)',
      linhas: [luz ? 'ligada' : 'desligada', `limiar ${limiar} lux`],
      descricao: `Luz, ${luz ? 'ligada' : 'desligada'}. Abre o ajuste do limiar.`,
    },
    {
      alvo: 'hvac',
      x: 540,
      y: 292,
      titulo: 'HVAC (IR)',
      linhas: [hvac ? 'ligado' : 'desligado', `alvo ${alvo} °C`],
      descricao: `HVAC, ${hvac ? 'ligado' : 'desligado'}. Abre o ajuste da temperatura-alvo.`,
    },
  ]
  const pinos = { pir: 130, dht: 235, ldr: 340, luz: 130, hvac: 340 }

  return (
    <div className="diagrama-rolagem" role="group" aria-label="Diagrama do circuito, rolável na horizontal em telas estreitas">
      <svg className="diagrama" viewBox="0 0 760 440" role="img" aria-label="Circuito do ESP32 com PIR, DHT22, LDR, lâmpada e HVAC">
        {/* fios */}
        <g className="fios" aria-hidden="true">
          <line className="fio fio--verde" x1={220} y1={pinos.pir} x2={PLACA.x} y2={pinos.pir} />
          <line className="fio fio--verde" x1={220} y1={pinos.dht} x2={PLACA.x} y2={pinos.dht} />
          <line className="fio fio--laranja" x1={220} y1={pinos.ldr} x2={PLACA.x} y2={pinos.ldr} />
          <line className="fio fio--dourado" x1={PLACA.x + PLACA.w} y1={pinos.luz} x2={540} y2={pinos.luz} />
          <line className="fio fio--azul" x1={PLACA.x + PLACA.w} y1={pinos.hvac} x2={540} y2={pinos.hvac} />
          <text className="d-fio" x={232} y={pinos.pir - 8}>OUT</text>
          <text className="d-fio" x={232} y={pinos.dht - 8}>SDA</text>
          <text className="d-fio" x={232} y={pinos.ldr - 8}>AO</text>
          <text className="d-fio" x={480} y={pinos.luz - 8}>220 Ω</text>
          <text className="d-fio" x={480} y={pinos.hvac - 8}>220 Ω</text>
        </g>

        {/* placa */}
        <g aria-hidden="true">
          <rect className="placa" x={PLACA.x} y={PLACA.y} width={PLACA.w} height={PLACA.h} rx={16} />
          <text className="d-placa" x={PLACA.x + PLACA.w / 2} y={PLACA.y + 40} textAnchor="middle">ESP32</text>
          <text className="d-fio" x={PLACA.x + PLACA.w / 2} y={PLACA.y + 62} textAnchor="middle">DevKit C V4</text>
          {(
            [
              ['GPIO27', pinos.pir, 'esq'],
              ['GPIO15', pinos.dht, 'esq'],
              ['GPIO34', pinos.ldr, 'esq'],
              ['GPIO26', pinos.luz, 'dir'],
              ['GPIO25', pinos.hvac, 'dir'],
            ] as const
          ).map(([nome, y, lado]) => (
            <g key={nome}>
              <circle className="pino" cx={lado === 'esq' ? PLACA.x : PLACA.x + PLACA.w} cy={y} r={6} />
              <text
                className="d-pino"
                x={lado === 'esq' ? PLACA.x + 16 : PLACA.x + PLACA.w - 16}
                y={y + 5}
                textAnchor={lado === 'esq' ? 'start' : 'end'}
              >
                {nome}
              </text>
            </g>
          ))}
          <text className="d-fio" x={PLACA.x + 16} y={pinos.ldr + 24}>ADC1</text>
        </g>

        {esquerda.map((item) => (
          <Componente key={item.alvo} item={item} selecionado={selecionado === item.alvo} aoEscolher={aoEscolher}>
            {item.alvo === 'pir' && (
              <g aria-hidden="true">
                {pir && <circle className="anel" cx={item.x + LARGURA - 32} cy={item.y + 30} r={10} />}
                <circle className={`sensor${pir ? ' sensor--ativo' : ''}`} cx={item.x + LARGURA - 32} cy={item.y + 30} r={10} />
              </g>
            )}
          </Componente>
        ))}
        {direita.map((item) => (
          <Componente key={item.alvo} item={item} selecionado={selecionado === item.alvo} aoEscolher={aoEscolher}>
            <circle
              className={`led led--${item.alvo}${(item.alvo === 'luz' ? luz : hvac) ? ' led--aceso' : ''}`}
              cx={item.x + LARGURA - 32}
              cy={item.y + 30}
              r={13}
              aria-hidden="true"
            />
          </Componente>
        ))}
      </svg>
    </div>
  )
}
