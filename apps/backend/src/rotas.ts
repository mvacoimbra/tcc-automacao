// Rotas REST (prefixo /api), seção 5.2 do PRD, e arquivos estáticos do dashboard.
// Erros saem sempre como JSON { erro: string }: 400 validação, 404 dispositivo
// desconhecido, 409 modo Demo indisponível.
import { resolve } from 'node:path'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import {
  AmbienteDemo,
  ComandoDemo,
  ConfigPayload,
  Configuracoes,
  ConsultaLeituras,
  ConsultaPeriodo,
  IdDispositivo,
  type ConfigDispositivo,
  type Saude,
} from '@tcc/contrato'
import type { Armazenamento } from './armazenamento'
import { gerarCsv } from './csv'
import { calcularMetricas } from './metricas'

// Erro com o status HTTP a devolver; lançado pelas rotas e pelo servidor.
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export type ContextoRotas = {
  saude(): Saude
  armazenamento: Armazenamento
  configuracoes(): Configuracoes
  aplicarConfiguracoes(nova: Configuracoes): Promise<void>
  configConhecida(id: string): ConfigDispositivo
  // Publica em <raiz>/<id>/config e devolve a config conhecida já atualizada.
  publicarConfig(id: string, config: ConfigPayload): Promise<ConfigDispositivo>
  demo: {
    ativar(ativo: boolean): Promise<void>
    pulsoPir(): void
    definirAmbiente(ambiente: AmbienteDemo): void
  }
  dirEstatico?: string
}

// Mensagem legível a partir de uma validação zod que falhou.
function motivo(erro: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return erro.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ')
}

export function criarApp(contexto: ContextoRotas): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '10kb' }))

  const { armazenamento } = contexto

  // Valida o id da URL (400) e exige que o dispositivo já tenha enviado leituras (404).
  function dispositivoConhecido(req: Request): string {
    const id = IdDispositivo.safeParse(req.params.id)
    if (!id.success) throw new ErroHttp(400, 'id de dispositivo inválido')
    if (!armazenamento.ultima(id.data)) throw new ErroHttp(404, `dispositivo desconhecido: ${id.data}`)
    return id.data
  }

  function periodo(req: Request) {
    const q = ConsultaPeriodo.safeParse(req.query)
    if (!q.success) throw new ErroHttp(400, motivo(q.error))
    return { de: q.data.de ?? 0, ate: q.data.ate ?? Number.MAX_SAFE_INTEGER }
  }

  app.get('/api/saude', (_req, res) => {
    res.json(contexto.saude())
  })

  app.get('/api/dispositivos', (_req, res) => {
    res.json(armazenamento.dispositivos())
  })

  app.get('/api/dispositivos/:id/estado', (req, res) => {
    const id = dispositivoConhecido(req)
    res.json({ leitura: armazenamento.ultima(id), config: contexto.configConhecida(id) })
  })

  app.get('/api/dispositivos/:id/leituras', (req, res) => {
    const id = dispositivoConhecido(req)
    const q = ConsultaLeituras.safeParse(req.query)
    if (!q.success) throw new ErroHttp(400, motivo(q.error))
    const { de = 0, ate = Number.MAX_SAFE_INTEGER, limite } = q.data
    res.json(armazenamento.listar(id, de, ate, limite))
  })

  app.get('/api/dispositivos/:id/metricas', (req, res) => {
    const id = dispositivoConhecido(req)
    const { de, ate } = periodo(req)
    res.json(calcularMetricas(armazenamento.listar(id, de, ate, Infinity)))
  })

  app.get('/api/dispositivos/:id/export.csv', (req, res) => {
    const id = dispositivoConhecido(req)
    const { de, ate } = periodo(req)
    res.type('text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${id}-leituras.csv"`)
    res.send(gerarCsv(armazenamento.listar(id, de, ate, Infinity)))
  })

  app.post('/api/dispositivos/:id/config', async (req, res) => {
    const id = dispositivoConhecido(req)
    const config = ConfigPayload.safeParse(req.body)
    if (!config.success) throw new ErroHttp(400, motivo(config.error))
    res.json(await contexto.publicarConfig(id, config.data))
  })

  app.get('/api/configuracoes', (_req, res) => {
    res.json(contexto.configuracoes())
  })

  app.put('/api/configuracoes', async (req, res) => {
    const c = Configuracoes.safeParse(req.body)
    if (!c.success) throw new ErroHttp(400, motivo(c.error))
    await contexto.aplicarConfiguracoes(c.data)
    res.json(contexto.configuracoes())
  })

  app.post('/api/demo', async (req, res) => {
    const c = ComandoDemo.safeParse(req.body)
    if (!c.success) throw new ErroHttp(400, motivo(c.error))
    await contexto.demo.ativar(c.data.ativo)
    res.json({ ativo: contexto.saude().demo })
  })

  app.post('/api/demo/pir', (_req, res) => {
    contexto.demo.pulsoPir()
    res.json({ ok: true })
  })

  app.post('/api/demo/ambiente', (req, res) => {
    const a = AmbienteDemo.safeParse(req.body)
    if (!a.success) throw new ErroHttp(400, motivo(a.error))
    contexto.demo.definirAmbiente(a.data)
    res.json({ ok: true })
  })

  // Nada mais em /api existe: JSON, não o HTML padrão do Express nem a página do dashboard.
  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'rota não encontrada' })
  })

  if (contexto.dirEstatico) {
    const raiz = resolve(contexto.dirEstatico)
    app.use(express.static(raiz))
    // Dashboard de página única: qualquer GET fora da API devolve o index.html.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(resolve(raiz, 'index.html'), (erro) => {
        if (erro) next(erro)
      })
    })
  }

  app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (erro instanceof ErroHttp) {
      res.status(erro.status).json({ erro: erro.message })
      return
    }
    // Erros do próprio Express/body-parser (JSON quebrado, corpo grande demais...) trazem `status`.
    const status = (erro as { status?: unknown }).status
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ erro: status === 400 ? 'corpo da requisição inválido' : 'requisição inválida' })
      return
    }
    console.error('[rotas] erro inesperado:', erro)
    res.status(500).json({ erro: 'erro interno' })
  })

  return app
}
