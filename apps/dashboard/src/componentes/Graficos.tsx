// Gráficos do Histórico (Recharts). Cada um é uma <figure> com título e resumo em
// texto, para não depender só do desenho. Sem animação: a série é redesenhada a cada
// atualização e a animação só atrapalharia.
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatarDataHora, formatarHora, formatarNumero } from '../formatar'
import { ticksDoEixo } from '../serie'

export type Ponto = {
  t: number
  temperatura: number | null
  lux: number
  ocupacao: number
  luz: number
  hvac: number
}

type Eixo = { de: number; ate: number }

// Rótulo do eixo X conforme a largura da janela: com segundos até 10 min, só hora até 24 h,
// e com data acima disso.
const rotuloX = (eixo: Eixo) => (t: number) => {
  const intervalo = eixo.ate - eixo.de
  if (intervalo > 24 * 3_600_000) return formatarDataHora(t)
  return formatarHora(t, intervalo <= 10 * 60_000)
}
const LARGURA_EIXO_Y = 72
const estiloTooltip = {
  background: 'var(--superficie)',
  border: '1px solid var(--borda)',
  borderRadius: 8,
  color: 'var(--texto)',
  fontSize: 14,
}

// Eixo Y que sempre inclui a linha de referência (tempAlvo, luxLimiar). Com 'auto' ela
// ficaria fora do gráfico sempre que os dados estão longe dela, e é justamente essa
// distância que explica por que a luz ou o HVAC estão ligados ou desligados.
// `folga` (na unidade do gráfico) afasta a linha e os dados das bordas do desenho.
function dominioY(
  referencia: number | null,
  folga: number,
): ['auto', 'auto'] | [(min: number) => number, (max: number) => number] {
  if (referencia === null) return ['auto', 'auto']
  return [
    (min) => Math.floor(Math.min(min, referencia) - folga),
    (max) => Math.ceil(Math.max(max, referencia) + folga),
  ]
}

export function GraficoLinha({
  titulo,
  unidade,
  dados,
  campo,
  cor,
  referencia,
  eixo,
  resumo,
}: {
  titulo: string
  unidade: string
  dados: Ponto[]
  campo: 'temperatura' | 'lux'
  cor: string
  referencia: { valor: number; rotulo: string } | null
  eixo: Eixo
  resumo: string
}) {
  return (
    <figure className="grafico">
      <figcaption className="grafico__legenda">
        <span className="grafico__titulo">{titulo}</span>
        <span className="grafico__resumo">{resumo}</span>
      </figcaption>
      <div className="grafico__area" role="img" aria-label={`${titulo}. ${resumo}`}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dados} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--borda)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[eixo.de, eixo.ate]}
              allowDataOverflow
              ticks={ticksDoEixo(eixo.de, eixo.ate)}
              tickFormatter={rotuloX(eixo)}
              stroke="var(--texto-suave)"
              tick={{ fontSize: 13 }}
              scale="time"
            />
            <YAxis
              domain={dominioY(referencia?.valor ?? null, campo === 'lux' ? 20 : 1)}
              width={LARGURA_EIXO_Y}
              stroke="var(--texto-suave)"
              tick={{ fontSize: 13 }}
              tickFormatter={(v: number) => formatarNumero(v, campo === 'lux' ? 0 : 1)}
            />
            <Tooltip
              contentStyle={estiloTooltip}
              labelFormatter={(t) => formatarHora(Number(t))}
              formatter={(v) => [`${formatarNumero(Number(v), campo === 'lux' ? 0 : 1)} ${unidade}`, titulo]}
            />
            {referencia && (
              <ReferenceLine
                y={referencia.valor}
                stroke="var(--texto-suave)"
                strokeDasharray="6 4"
                label={{ value: referencia.rotulo, position: 'insideTopRight', fill: 'var(--texto-suave)', fontSize: 13 }}
              />
            )}
            <Line type="monotone" dataKey={campo} stroke={cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

// Faixa de estado no tempo (ocupação, luz ou HVAC): degrau entre desligado e ligado.
export function GraficoFaixa({
  titulo,
  dados,
  campo,
  cor,
  eixo,
  mostrarEixoX,
  resumo,
  nomeLigado,
}: {
  titulo: string
  dados: Ponto[]
  campo: 'ocupacao' | 'luz' | 'hvac'
  cor: string
  eixo: Eixo
  mostrarEixoX: boolean
  resumo: string
  nomeLigado: string
}) {
  return (
    <figure className="grafico grafico--faixa">
      <figcaption className="grafico__legenda">
        <span className="grafico__titulo">{titulo}</span>
        <span className="grafico__resumo">{resumo}</span>
      </figcaption>
      <div className="grafico__area" role="img" aria-label={`${titulo}. ${resumo}`}>
        <ResponsiveContainer width="100%" height={mostrarEixoX ? 96 : 72}>
          <AreaChart data={dados} margin={{ top: 6, right: 16, bottom: 6, left: 0 }}>
            <CartesianGrid stroke="var(--borda)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[eixo.de, eixo.ate]}
              allowDataOverflow
              ticks={ticksDoEixo(eixo.de, eixo.ate)}
              tickFormatter={rotuloX(eixo)}
              stroke="var(--texto-suave)"
              tick={{ fontSize: 13 }}
              scale="time"
              hide={!mostrarEixoX}
            />
            <YAxis domain={[0, 1]} width={LARGURA_EIXO_Y} ticks={[0, 1]} stroke="var(--texto-suave)" tick={{ fontSize: 13 }} tickFormatter={(v: number) => (v >= 1 ? nomeLigado : 'não')} />
            <Tooltip
              contentStyle={estiloTooltip}
              labelFormatter={(t) => formatarHora(Number(t))}
              formatter={(v) => [Number(v) >= 1 ? nomeLigado : Number(v) > 0 ? 'confirmando' : 'não', titulo]}
            />
            <Area type="stepAfter" dataKey={campo} stroke={cor} strokeWidth={2} fill={cor} fillOpacity={0.22} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
