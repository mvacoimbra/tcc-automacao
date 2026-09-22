// Processo principal do Electron: sobe o backend (@tcc/backend) e abre uma janela
// que é só um navegador apontando para o próprio servidor local. Sem IPC, sem
// preload e sem nodeIntegration (seção 4 do PRD): o mesmo endereço abre no
// navegador ou no celular da rede local.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { criarServidor, type Servidor } from '@tcc/backend'

const URL_DEV = 'http://localhost:5173'
const TEMPO_LIMITE_DEV_MS = 30_000
const INTERVALO_TENTATIVA_DEV_MS = 500

let servidor: Servidor | null = null
let janela: BrowserWindow | null = null

// Segunda instância: foca a janela existente em vez de abrir duas.
const instanciaUnica = app.requestSingleInstanceLock()
if (!instanciaUnica) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore()
      janela.focus()
    }
  })

  app.whenReady().then(iniciar)
}

async function esperarVite(url: string, limiteMs: number): Promise<void> {
  const fim = Date.now() + limiteMs
  for (;;) {
    try {
      const resposta = await fetch(url)
      if (resposta.ok) return
    } catch {
      // Vite ainda não subiu; tenta de novo
    }
    if (Date.now() > fim) throw new Error(`Vite não respondeu em ${url} a tempo`)
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_TENTATIVA_DEV_MS))
  }
}

function criarJanela(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'TCC Automação',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Links externos (ex.: futuros links de documentação) abrem no navegador do sistema,
  // nunca dentro da janela do app.
  win.webContents.setWindowOpenHandler(({ url: destino }) => {
    void shell.openExternal(destino)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (evento, destino) => {
    if (new URL(destino).origin !== new URL(url).origin) {
      evento.preventDefault()
      void shell.openExternal(destino)
    }
  })

  void win.loadURL(url)
  return win
}

async function iniciar(): Promise<void> {
  const producao = app.isPackaged
  const dirDados = app.getPath('userData')
  const dirEstatico = producao ? join(process.resourcesPath, 'dashboard') : undefined

  if (producao && dirEstatico && !existsSync(dirEstatico)) {
    throw new Error(`build do dashboard não encontrado em ${dirEstatico}`)
  }

  servidor = await criarServidor({ dirDados, dirEstatico })

  if (producao) {
    janela = criarJanela(servidor.url)
  } else {
    await esperarVite(URL_DEV, TEMPO_LIMITE_DEV_MS)
    janela = criarJanela(URL_DEV)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && servidor) {
      janela = criarJanela(producao ? servidor.url : URL_DEV)
    }
  })
}

// Encerra o servidor (banco, broker, WebSocket) antes de sair, para os testes de
// persistência e o encerramento limpo valerem também para o app empacotado.
let parando: Promise<void> | null = null
app.on('before-quit', (evento) => {
  if (!servidor || parando) return
  evento.preventDefault()
  parando = servidor.parar().then(() => {
    servidor = null
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
