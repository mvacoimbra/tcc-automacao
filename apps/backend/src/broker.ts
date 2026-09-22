// Broker MQTT embutido (Aedes): permite ao app funcionar sem Mosquitto nem Docker.
// O protocolo é o mesmo de um broker externo (D11 em docs/decisoes.md).
import { createServer } from 'node:net'
import { Aedes } from 'aedes'
import { escutar } from './portas'

export type BrokerEmbutido = {
  porta: number
  parar(): Promise<void>
}

export async function iniciarBroker(portaPedida: number): Promise<BrokerEmbutido> {
  const aedes = await Aedes.createBroker()
  const servidor = createServer(aedes.handle)

  // Erros de um cliente ou de uma conexão só devem ser registrados, nunca derrubar o app.
  aedes.on('clientError', (cliente, erro) => {
    console.warn(`[broker] erro do cliente ${cliente.id}: ${erro.message}`)
  })
  aedes.on('connectionError', (_cliente, erro) => {
    console.warn(`[broker] erro de conexão: ${erro.message}`)
  })

  let porta: number
  try {
    porta = await escutar(servidor, portaPedida, '0.0.0.0')
  } catch (erro) {
    await new Promise<void>((resolve) => aedes.close(() => resolve()))
    throw erro
  }
  console.log(`[broker] MQTT embutido escutando na porta ${porta}`)

  return {
    porta,
    async parar() {
      // fecha os clientes (o que encerra as conexões) e só depois o servidor TCP
      await new Promise<void>((resolve) => aedes.close(() => resolve()))
      await new Promise<void>((resolve) => servidor.close(() => resolve()))
    },
  }
}
