// Conexão WebSocket com reconexão automática (espera de 1 s, dobrando até 10 s).
import { useEffect, useRef, useState } from 'react'
import { MensagemWs } from '@tcc/contrato'
import { criarReconexao } from './reconexao'

export type SituacaoWs = 'conectando' | 'conectado' | 'reconectando'

export type EstadoWs = {
  situacao: SituacaoWs
  // Instante (epoch ms) da próxima tentativa, enquanto reconecta.
  proximaTentativaEm: number | null
}

export function useWs(aoMensagem: (mensagem: MensagemWs) => void): EstadoWs {
  const [estado, setEstado] = useState<EstadoWs>({ situacao: 'conectando', proximaTentativaEm: null })
  // O callback muda a cada render; a conexão não pode reabrir por causa disso.
  const callback = useRef(aoMensagem)
  callback.current = aoMensagem

  useEffect(() => {
    const reconexao = criarReconexao()
    let socket: WebSocket | null = null
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let encerrado = false

    function conectar() {
      const protocolo = location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${protocolo}://${location.host}/ws`)

      socket.addEventListener('open', () => {
        reconexao.zerar()
        setEstado({ situacao: 'conectado', proximaTentativaEm: null })
      })
      socket.addEventListener('message', (evento) => {
        let bruto: unknown
        try {
          bruto = JSON.parse(String(evento.data))
        } catch {
          return
        }
        const mensagem = MensagemWs.safeParse(bruto)
        if (mensagem.success) callback.current(mensagem.data)
      })
      socket.addEventListener('close', () => {
        if (encerrado) return
        const espera = reconexao.proxima()
        setEstado({ situacao: 'reconectando', proximaTentativaEm: Date.now() + espera })
        temporizador = setTimeout(conectar, espera)
      })
    }

    conectar()
    return () => {
      encerrado = true
      clearTimeout(temporizador)
      socket?.close()
    }
  }, [])

  return estado
}
