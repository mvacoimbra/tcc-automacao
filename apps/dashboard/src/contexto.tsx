// Estado compartilhado entre as telas: conexão, saúde do servidor, dispositivos,
// última leitura do dispositivo selecionado e log MQTT. Vem do REST na abertura e do
// WebSocket depois.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  ConfigDispositivo,
  DispositivoVisto,
  LeituraComMetadados,
  MensagemWs,
  Ocupacao,
  Saude,
} from '@tcc/contrato'
import { obterEstado, obterSaude, listarDispositivos } from './api'
import { useWs, type EstadoWs } from './useWs'

export const TAMANHO_LOG = 200

export type EntradaLog = {
  id: number
  direcao: 'entrada' | 'saida'
  topico: string
  payload: string
  em: number
}

// Última mudança de estado da FSM, para animar a transição no diagrama.
export type Transicao = { id: number; de: Ocupacao; para: Ocupacao }

export type Painel = {
  ws: EstadoWs
  saude: Saude | null
  dispositivos: DispositivoVisto[]
  dispositivoId: string | null
  selecionar(id: string): void
  leitura: LeituraComMetadados | null
  // Config conhecida pelo servidor para o dispositivo selecionado.
  config: ConfigDispositivo | null
  recarregarConfig(): Promise<void>
  // recebidoEm da última leitura com PIR alto (estimativa para a contagem regressiva).
  movimentoEm: number | null
  transicao: Transicao | null
  log: {
    entradas: EntradaLog[] // mais recentes primeiro
    pausado: boolean
    novasDuranteAPausa: number
    alternarPausa(): void
    limpar(): void
  }
}

const ContextoPainel = createContext<Painel | null>(null)

export function usePainel(): Painel {
  const painel = useContext(ContextoPainel)
  if (!painel) throw new Error('usePainel fora do PainelProvider')
  return painel
}

export function PainelProvider({ children }: { children: ReactNode }) {
  const [saude, setSaude] = useState<Saude | null>(null)
  const [dispositivos, setDispositivos] = useState<DispositivoVisto[]>([])
  const [dispositivoId, setDispositivoId] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<LeituraComMetadados | null>(null)
  const [config, setConfig] = useState<ConfigDispositivo | null>(null)
  const [movimentoEm, setMovimentoEm] = useState<number | null>(null)
  const [transicao, setTransicao] = useState<Transicao | null>(null)
  const [entradasLog, setEntradasLog] = useState<EntradaLog[]>([])
  const [snapshotLog, setSnapshotLog] = useState<EntradaLog[] | null>(null)

  // O manipulador do WebSocket precisa ver sempre o dispositivo selecionado atual.
  const selecionadoRef = useRef<string | null>(null)
  selecionadoRef.current = dispositivoId
  const proximoId = useRef(1)
  const ultimoEstado = useRef<Ocupacao | null>(null)

  const aoMensagem = useCallback((m: MensagemWs) => {
    switch (m.tipo) {
      case 'mqtt':
        setEntradasLog((atual) =>
          [{ id: proximoId.current++, direcao: m.direcao, topico: m.topico, payload: m.payload, em: m.em }, ...atual].slice(
            0,
            TAMANHO_LOG,
          ),
        )
        break
      case 'estado': {
        const l = m.dados
        setDispositivos((atual) => {
          const semEste = atual.filter((d) => d.id !== l.dispositivo)
          return [...semEste, { id: l.dispositivo, vistoEm: l.recebidoEm }].sort((a, b) => a.id.localeCompare(b.id))
        })
        // primeiro dispositivo que aparece vira o selecionado
        if (selecionadoRef.current === null) {
          selecionadoRef.current = l.dispositivo
          setDispositivoId(l.dispositivo)
        }
        if (selecionadoRef.current !== l.dispositivo) break
        setLeitura(l)
        if (l.pir) setMovimentoEm(l.recebidoEm)
        if (ultimoEstado.current !== null && ultimoEstado.current !== l.estado) {
          const de = ultimoEstado.current
          setTransicao({ id: proximoId.current++, de, para: l.estado })
        }
        ultimoEstado.current = l.estado
        break
      }
      case 'conexao':
        // A mensagem não traz a porta (troca de modo pode trocar a porta do broker
        // embutido para a do externo, ou vice-versa): busca a saúde completa de novo.
        void obterSaude().then(setSaude).catch(() => undefined)
        break
      case 'demo':
        setSaude((s) => (s ? { ...s, demo: m.ativo } : s))
        break
    }
  }, [])

  const ws = useWs(aoMensagem)

  // Estado atual pelo REST: na abertura e sempre que o WebSocket (re)conecta,
  // porque mensagens perdidas durante a queda não voltam.
  useEffect(() => {
    if (ws.situacao !== 'conectado') return
    let cancelado = false
    void (async () => {
      try {
        const [s, lista] = await Promise.all([obterSaude(), listarDispositivos()])
        if (cancelado) return
        setSaude(s)
        setDispositivos(lista)
        setDispositivoId((atual) => atual ?? lista[0]?.id ?? null)
      } catch {
        // sem resposta agora; o próximo evento do WebSocket ou a reconexão corrige
      }
    })()
    return () => {
      cancelado = true
    }
  }, [ws.situacao])

  const recarregarConfig = useCallback(async () => {
    const id = selecionadoRef.current
    if (!id) return
    try {
      const estado = await obterEstado(id)
      if (selecionadoRef.current !== id) return
      setConfig(estado?.config ?? null)
      if (estado) {
        setLeitura((atual) => atual ?? estado.leitura)
        setMovimentoEm((atual) => atual ?? (estado.leitura.pir ? estado.leitura.recebidoEm : null))
        ultimoEstado.current ??= estado.leitura.estado
      }
    } catch {
      // mantém o que já havia
    }
  }, [])

  // Trocar de dispositivo descarta o que era do anterior...
  useEffect(() => {
    setLeitura(null)
    setConfig(null)
    setMovimentoEm(null)
    setTransicao(null)
    ultimoEstado.current = null
  }, [dispositivoId])

  // ...e carrega leitura e config do novo. Ao reconectar, recarrega de novo. Já uma
  // queda de conexão não apaga nada: a tela segue mostrando o último valor conhecido.
  useEffect(() => {
    if (dispositivoId && ws.situacao === 'conectado') void recarregarConfig()
  }, [dispositivoId, ws.situacao, recarregarConfig])

  const alternarPausa = useCallback(() => {
    setSnapshotLog((atual) => (atual === null ? entradasLog : null))
  }, [entradasLog])

  const limpar = useCallback(() => {
    setEntradasLog([])
    setSnapshotLog((atual) => (atual === null ? null : []))
  }, [])

  const selecionar = useCallback((id: string) => setDispositivoId(id), [])

  const painel = useMemo<Painel>(
    () => ({
      ws,
      saude,
      dispositivos,
      dispositivoId,
      selecionar,
      leitura,
      config,
      recarregarConfig,
      movimentoEm,
      transicao,
      log: {
        entradas: snapshotLog ?? entradasLog,
        pausado: snapshotLog !== null,
        novasDuranteAPausa: snapshotLog === null ? 0 : entradasLog.filter((e) => e.id > (snapshotLog[0]?.id ?? 0)).length,
        alternarPausa,
        limpar,
      },
    }),
    [ws, saude, dispositivos, dispositivoId, selecionar, leitura, config, recarregarConfig, movimentoEm, transicao, snapshotLog, entradasLog, alternarPausa, limpar],
  )

  return <ContextoPainel.Provider value={painel}>{children}</ContextoPainel.Provider>
}
