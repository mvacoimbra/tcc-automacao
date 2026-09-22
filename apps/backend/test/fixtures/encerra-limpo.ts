// Executado como processo filho por encerramento.test.ts.
// Sobe o servidor, chama parar() e NÃO chama process.exit(): se restar qualquer
// handle aberto (socket, timer, banco), o processo não termina sozinho e o teste falha.
import { criarServidor } from '../../src/servidor'

const dirDados = process.argv[2]
if (!dirDados) throw new Error('uso: encerra-limpo.ts <dirDados>')

const servidor = await criarServidor({ dirDados, portaHttp: 0, portaMqtt: 0 })
console.log('PRONTO')
await servidor.parar()
console.log('PARADO')
