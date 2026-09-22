import { defineConfig } from 'tsup'

// Processo principal num único arquivo CJS: sem node_modules dentro do pacote,
// o que evita os problemas conhecidos de symlinks do pnpm com o electron-builder.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  // O tsup resolve `noExternal` ANTES de `external`: um `noExternal: [/.*/]` puro
  // pegaria "electron" também, embutindo o pacote npm (que só localiza o binário)
  // no lugar da API real que o runtime do Electron injeta. A regex exclui os três
  // nomes abaixo, e qualquer `node:*` (o forçar a "bundlar" faz o esbuild reescrever
  // `node:sqlite` para `sqlite`, sem o prefixo, quebrando o require em runtime).
  noExternal: [/^(?!electron$|bufferutil$|utf-8-validate$|node:).*$/],
  // electron é fornecido pelo runtime; bufferutil/utf-8-validate são opcionais do
  // pacote ws, carregados em try/catch — não existem no bundle e não fazem falta.
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  // Sem isto o tsup reescreve "node:sqlite" para "sqlite" (compatibilidade com Node
  // < 14.18, irrelevante aqui), quebrando o require em runtime.
  removeNodeProtocol: false,
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
})
