// WebSocket /ws: empurra para o dashboard as leituras, o log MQTT e as mudanças de
// conexão/demo (seção 5.3 do PRD). É só servidor → cliente; mensagens recebidas são ignoradas.
import type { Server as ServidorHttp } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { MensagemWs } from '@tcc/contrato'

export type ServidorWs = {
  transmitir(mensagem: MensagemWs): void
  parar(): Promise<void>
}

// `aoConectar` recebe uma função que envia só àquele cliente: serve para informar
// o estado atual (conexão e demo) a quem acabou de abrir ou reabrir a página.
export function criarServidorWs(
  http: ServidorHttp,
  aoConectar?: (enviar: (mensagem: MensagemWs) => void) => void,
): ServidorWs {
  // noServer: o upgrade é tratado aqui. Com `{ server }` o ws repassa os erros do
  // servidor HTTP (como EADDRINUSE no fallback de porta) como se fossem dele.
  const wss = new WebSocketServer({ noServer: true })
  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (cliente) => wss.emit('connection', cliente, req))
  })

  wss.on('error', (erro) => console.warn(`[ws] erro: ${erro.message}`))
  wss.on('connection', (socket) => {
    socket.on('error', (erro) => console.warn(`[ws] erro no cliente: ${erro.message}`))
    aoConectar?.((mensagem) => socket.send(JSON.stringify(mensagem)))
  })

  return {
    transmitir(mensagem) {
      const texto = JSON.stringify(mensagem)
      for (const cliente of wss.clients) {
        if (cliente.readyState === WebSocket.OPEN) cliente.send(texto)
      }
    },
    async parar() {
      for (const cliente of wss.clients) cliente.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
