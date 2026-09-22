// Portão de verificação do SQLite (seção 6.4 do PRD): confirma que `node:sqlite`
// funciona no ambiente onde roda. Executado em dois ambientes na Task 2:
//   1. Node do projeto:            node scripts/portao-sqlite.cjs
//   2. Processo principal Electron: electron scripts/portao-sqlite.cjs
// Sai com código 0 se o ciclo criar/inserir/consultar passar, e 1 caso contrário.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function executar() {
  const { DatabaseSync } = require('node:sqlite')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portao-sqlite-'))
  const banco = new DatabaseSync(path.join(dir, 'teste.db'))
  try {
    const modo = banco.prepare('PRAGMA journal_mode = WAL').get()
    banco.exec('CREATE TABLE leituras (id INTEGER PRIMARY KEY, dispositivo TEXT, temperatura REAL)')
    banco
      .prepare('INSERT INTO leituras (dispositivo, temperatura) VALUES (?, ?)')
      .run('sala01', null)
    const linha = banco.prepare('SELECT dispositivo, temperatura FROM leituras').get()
    if (linha.dispositivo !== 'sala01' || linha.temperatura !== null) {
      throw new Error(`leitura inesperada: ${JSON.stringify(linha)}`)
    }
    return { journal_mode: modo.journal_mode, linha }
  } finally {
    banco.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function relatar(ambiente, resultado) {
  console.log(`[portao-sqlite] ambiente=${ambiente} node=${process.versions.node}` +
    (process.versions.electron ? ` electron=${process.versions.electron}` : '') +
    ` ${resultado}`)
}

// No Electron, `app` só existe no processo principal (e não em ELECTRON_RUN_AS_NODE).
let app = null
try {
  app = require('electron').app
} catch {
  app = null
}
const ambiente = app ? 'electron-principal' : process.versions.electron ? 'electron-como-node' : 'node'

function concluir(codigo) {
  if (app) app.exit(codigo)
  else process.exit(codigo)
}

function rodar() {
  try {
    const r = executar()
    relatar(ambiente, `OK journal_mode=${r.journal_mode} linha=${JSON.stringify(r.linha)}`)
    concluir(0)
  } catch (erro) {
    relatar(ambiente, `FALHOU ${erro && erro.message}`)
    concluir(1)
  }
}

if (app) app.whenReady().then(rodar)
else rodar()
