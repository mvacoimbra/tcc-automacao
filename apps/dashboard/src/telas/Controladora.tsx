// Tela inicial: o circuito ao vivo, a FSM, os ajustes e o log MQTT.
import { useState } from 'react'
import { simularMovimento } from '../api'
import { ControlesDemo } from '../componentes/ControlesDemo'
import { DiagramaEsp32, type AlvoAjuste } from '../componentes/DiagramaEsp32'
import { DiagramaFsm } from '../componentes/DiagramaFsm'
import { LogMqtt } from '../componentes/LogMqtt'
import { PainelAjuste } from '../componentes/PainelAjuste'
import { usePainel } from '../contexto'
import { formatarDuracao } from '../formatar'
import { useAgora } from '../useAgora'

// Acima disto sem leitura nova, o dispositivo provavelmente parou (o firmware publica a cada 2 s).
const LIMITE_SEM_LEITURA_MS = 6000

function IdadeDaLeitura({ recebidoEm }: { recebidoEm: number }) {
  const agora = useAgora(1000)
  const idade = Math.max(0, agora - recebidoEm)
  const atrasada = idade > LIMITE_SEM_LEITURA_MS
  return (
    <span className={`selo ${atrasada ? 'selo--aviso' : 'selo--neutro'}`}>
      {atrasada ? `sem leituras há ${formatarDuracao(idade)}` : `leitura há ${formatarDuracao(idade)}`}
    </span>
  )
}

export function Controladora() {
  const { leitura, config, saude, dispositivoId } = usePainel()
  const [alvo, setAlvo] = useState<AlvoAjuste | null>(null)
  const demo = saude?.demo ?? false

  function escolher(a: AlvoAjuste) {
    setAlvo(a)
    // No Demo, clicar no PIR também injeta movimento (o dispositivo real não é comandável).
    if (a === 'pir' && demo) void simularMovimento().catch(() => undefined)
  }

  return (
    <>
      <header className="tela__cabecalho">
        <h1 className="tela__titulo">Controladora</h1>
        <div className="tela__estado" role="status" aria-live="polite">
          {leitura ? (
            <>
              <span className={`selo selo--estado selo--${leitura.estado.toLowerCase()}`}>Estado: {leitura.estado}</span>
              <IdadeDaLeitura recebidoEm={leitura.recebidoEm} />
            </>
          ) : (
            <span className="selo selo--neutro">Sem dados ainda</span>
          )}
        </div>
      </header>

      {!leitura && (
        <div className="faixa faixa--info">
          {dispositivoId
            ? 'Carregando a última leitura do dispositivo…'
            : demo
              ? 'O dispositivo simulado está iniciando. A primeira leitura chega em instantes.'
              : 'Nenhum dispositivo enviou dados ainda. Ligue o modo Demo em Configurações ou conecte um dispositivo ao broker.'}
        </div>
      )}

      <section className="cartao" aria-labelledby="titulo-circuito">
        <header className="cartao__cabecalho">
          <h2 id="titulo-circuito" className="cartao__titulo">
            Circuito
          </h2>
          <span className="cartao__nota">
            {demo ? 'Clique no PIR para simular movimento; clique nos demais componentes para ajustar.' : 'Clique em um componente para ajustar.'}
          </span>
        </header>
        <DiagramaEsp32 leitura={leitura} config={config} demo={demo} selecionado={alvo} aoEscolher={escolher} />
      </section>

      <section className="cartao" aria-labelledby="titulo-fsm">
        <header className="cartao__cabecalho">
          <h2 id="titulo-fsm" className="cartao__titulo">
            Máquina de estados
          </h2>
          <span className="cartao__nota">Figura 3 do TC I</span>
        </header>
        <DiagramaFsm leitura={leitura} config={config} />
      </section>

      <div className="grade">
        {alvo ? (
          <PainelAjuste alvo={alvo} demo={demo} aoFechar={() => setAlvo(null)} />
        ) : (
          <section className="cartao" aria-labelledby="titulo-dica">
            <h2 id="titulo-dica" className="cartao__titulo">
              Ajustes
            </h2>
            <p className="vazio">Escolha um componente no circuito para ver e alterar o parâmetro que ele controla.</p>
          </section>
        )}

        {demo && <ControlesDemo />}
      </div>

      <LogMqtt />
    </>
  )
}
