// Configurações do app, persistidas em <dirDados>/configuracoes.json (seção 6.2 do PRD).
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Configuracoes } from '@tcc/contrato'

const NOME_ARQUIVO = 'configuracoes.json'

// Padrão da primeira execução.
export const CONFIGURACOES_PADRAO: Configuracoes = { broker: { modo: 'embutido' }, demo: true }

// Sem arquivo → padrão. Arquivo corrompido ou fora do contrato também volta ao padrão
// (com aviso): uma configuração ruim não pode impedir o app de abrir.
export function lerConfiguracoes(dirDados: string): Configuracoes {
  const caminho = join(dirDados, NOME_ARQUIVO)
  let texto: string
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return CONFIGURACOES_PADRAO
    throw erro
  }
  try {
    const r = Configuracoes.safeParse(JSON.parse(texto))
    if (r.success) return r.data
    console.warn(`[configuracoes] ${NOME_ARQUIVO} fora do contrato (${r.error.issues[0]?.message}); usando o padrão`)
  } catch {
    console.warn(`[configuracoes] ${NOME_ARQUIVO} não é JSON válido; usando o padrão`)
  }
  return CONFIGURACOES_PADRAO
}

// Grava em arquivo temporário e renomeia, para uma queda no meio da escrita
// nunca deixar o arquivo de configuração pela metade.
export function gravarConfiguracoes(dirDados: string, configuracoes: Configuracoes): void {
  const caminho = join(dirDados, NOME_ARQUIVO)
  const temporario = `${caminho}.tmp`
  writeFileSync(temporario, JSON.stringify(configuracoes, null, 2) + '\n')
  renameSync(temporario, caminho)
}
