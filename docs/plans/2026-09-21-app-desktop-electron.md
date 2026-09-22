# App desktop (Electron) do protótipo do TCC Implementation Plan

Created: 2026-09-21
Author: mvacoimbra.dev@gmail.com
Agent: Claude Code
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Numa máquina limpa, instalar o `.dmg` do app "TCC Automação", ligar o modo Demo, clicar no PIR do diagrama e ver FSM, luz/HVAC, gráficos e log MQTT reagirem; o histórico persiste entre aberturas, exporta CSV, e o modo "broker externo" recebe o firmware real rodando no `wokwi-cli` — tudo conforme `docs/PRD-app-desktop.md` (fonte normativa deste plano).

## Out of Scope

- T10 do PRD (CI dos instaladores no GitHub Actions) — fica para a postagem 2.
- Instaladores Windows/Linux **gerados e testados**: a config do electron-builder declara `nsis`/`AppImage`, mas só o `.dmg` mac arm64 é gerado e verificado aqui (critério 1 do PRD).
- Tudo da seção 3 do PRD (hardware, TLS/auth MQTT, assinatura, auto-update, cenários YAML, SUS, UI multi-dispositivo além de um seletor).
- Commits e push.

## Approach

**Chosen:** Monorepo pnpm com 4 pacotes (`@tcc/contrato`, `@tcc/backend`, `@tcc/dashboard`, `@tcc/desktop`) exatamente como a seção 4 do PRD: o backend Express+ws+Aedes+`node:sqlite` roda dentro do processo principal do Electron e a janela só carrega o próprio servidor HTTP.
**Why:** Preserva as Figuras 2 e 3 do TC I (dispositivo → MQTT → Node → WebSocket → React) e permite abrir no navegador/celular, ao custo de um processo principal mais pesado e de portas locais que precisam de fallback.

## Global Constraints

- Gerenciador: **pnpm** (v11.11.0 instalado); nunca npm. Workspace `apps/*`.
- TypeScript `strict: true`; **`type`, nunca `interface`**.
- Textos, logs, comentários e UI em **português**; identificadores do domínio em português (`estado`, `leituras`, `ocupado`), consistentes com o firmware.
- Node do projeto: v22.23.1 (arm64). `node:sqlite` funciona sem flag (verificado; emite `ExperimentalWarning`).
- Versões atuais (verificadas via `pnpm view` em 21/09/2026): aedes 1.2.0, mqtt 5.16.0, express 5.2.1, ws 8.21.3, zod 4.6.5, vitest 5.0.1, tsx 4.23.15, tsup 8.5.1, electron 44.4.3, electron-builder 26.15.3, react/react-dom 19.3.0, recharts 3.10.1, vite 8.3.0, @vitejs/plugin-react 6.1.1, typescript 7.0.2.
- Aedes 1.x (verificado no context7): `import { Aedes } from 'aedes'`; `const aedes = await Aedes.createBroker()`; `net.createServer(aedes.handle)`; `aedes.close(cb)`.
- Portas padrão: HTTP `3000`, MQTT `1883`; WebSocket em `/ws`; REST em `/api`. Vite dev `5173`.
- Raiz MQTT: `tcc` (embutido) / `tcc-unip-7f3a9c` (externo, padrão, `broker.hivemq.com:1883`).
- Padrões de config do firmware: `tOcupadoMs 30000`, `janelaConfMs 0`, `pulsosConf 1`, `luxLimiar 300`, `tempAlvo 26`.
- electron-builder: `appId` `br.unip.tcc.automacao`, `productName` `TCC Automação`.
- Wokwi: no máximo **3 execuções de 30 s**, sempre com `--timeout`; repetir uma vez se `code 1006`.
- Não fazer commit nem push.
- Cada tarefa termina com `pnpm -r typecheck` e `pnpm -r test` passando (e, a partir da T3, `pnpm test:fsm`).

## Context for Implementer

O PRD (`docs/PRD-app-desktop.md`) é normativo: nomes, portas, rotas, formatos e tipos das seções 5–6 são decisões tomadas — copiar, não reinterpretar. Onde o PRD marca **VERIFICAR**, confirmar na doc atual (context7 / `pnpm view` / script mínimo) antes de escrever código. Toda divergência do modelo preliminar (Figuras 2 e 3 do TC I) entra em `docs/decisoes.md` no formato contexto → decisão → consequência, **na mesma tarefa que a introduz** (D09–D14 distribuídas abaixo); as entradas D01–D08 não são reescritas. O código é citado no TCC: comentários curtos e explicativos em português, no estilo de `firmware/src/main.cpp`.

## Autonomous Decisions

Extensões aditivas e escolhas que o PRD deixa em aberto (nenhuma muda algo que ele fixa):

- `GET /api/saude` ganha campos aditivos `portaHttp` e `enderecosLan: string[]` (a tela Configurações precisa mostrar `http://<ip>:<porta>`).
- `saude.demo` é o demo **efetivo**: `configuracoes.demo && configuracoes.broker.modo === 'embutido'`. A preferência gravada `demo` é preservada ao trocar de modo; no modo externo o simulador não roda e as rotas de demo respondem 409. A UI decide pelos controles de demo apenas por `saude.demo`.
- `OpcoesServidor` ganha `agora?: () => number` (relógio do simulador, só para testes — PRD 6.5 exige relógio injetável).
- "Config conhecida" em `/estado` = padrões do firmware mesclados com a última config publicada pelo backend para aquele id (memória; perde-se ao reiniciar, como no firmware).
- Tempo ligado (5.4): soma dos intervalos entre leituras consecutivas em que a primeira tem `luz`/`hvac = true`; lacunas > 10 s não contam (dispositivo offline). Declarar como limitação.
- CSV: colunas `recebidoEm,dispositivo,seq,ts,latenciaMs,perdidas,estado,pir,temperatura,umidade,lux,luz,hvac`; booleanos `1/0`; nulos vazios.
- Navegação do dashboard por hash (`#/`, `#/historico`, `#/configuracoes`), sem biblioteca de rotas.
- Dev: Vite faz proxy para `http://127.0.0.1:3000`; em dev assume-se 3000 livre (o fallback de porta vale para o app e o backend, não para o proxy do Vite).
- TypeScript 7.0.2 (compilador nativo) só para `tsc --noEmit`; transpilação fica com tsx/tsup/Vite. Se o TS 7 quebrar alguma ferramenta na T1, fixar `typescript@~6` e registrar.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `node:sqlite` indisponível no Node embutido do Electron 44 | Baixa | Alto | Portão na Task 2 com script executado via `ELECTRON_RUN_AS_NODE`/processo principal; plano B `better-sqlite3` isolado em `armazenamento.ts` + registro em D12 |
| pnpm 11 bloquear pós-instalação de `electron`/`esbuild` | Alta | Alto | Task 1 verifica a chave atual (`allowBuilds`/`onlyBuiltDependencies`) em `pnpm-workspace.yaml` e confirma que `node_modules/electron/dist` existe |
| Bundle do main (tsup) quebrar em requires opcionais do `ws` | Média | Médio | Marcar `bufferutil` e `utf-8-validate` como `external` (o `ws` os carrega em try/catch) |
| electron-builder × symlinks do pnpm | Média | Médio | Main num arquivo CJS só, sem `node_modules` no pacote (`files` restrito); fallback `node-linker=hoisted` em `.npmrc` |
| Estourar orçamento do Wokwi | Baixa | Médio | Task 8: no máx. 3 execuções de 30 s, sempre `--timeout 30000` |

## File Structure

- `pnpm-workspace.yaml` (modify) — liberar build scripts de `electron`/`esbuild` (chave VERIFICAR na T1).
- `tsconfig.base.json` (create) — `strict`, `moduleResolution: bundler`, `module: ESNext`, `target: ES2023`, `skipLibCheck`.
- `package.json` (modify) — scripts da raiz (`typecheck`, `test`, `dev`, `desktop:*`, `firmware:*`, mantidos `test:fsm`, `infra:*`, `mqtt:sub`).
- `apps/contrato/src/index.ts` (create) — esquemas zod + tipos: `EstadoPayload`, `ConfigPayload`, `LeituraComMetadados`, `MensagemWs`, `Configuracoes`, `Saude`, `Metricas`.
- `apps/contrato/src/index.test.ts` (create) — testes do esquema.
- `apps/backend/src/servidor.ts` (create) — `criarServidor(opcoes): Promise<Servidor>`; orquestra tudo e `parar()`.
- `apps/backend/src/cli.ts` (create) — standalone: `criarServidor({ dirDados: '.dados' })`, encerra em SIGINT/SIGTERM.
- `apps/backend/src/portas.ts` (create) — `escutar(server, porta, host)` com fallback `EADDRINUSE` → porta 0.
- `apps/backend/src/broker.ts` (create) — Aedes + `net.Server`.
- `apps/backend/src/cliente-mqtt.ts` (create) — cliente `mqtt` reconectável a quente; assina `<raiz>/+/estado`; publica config.
- `apps/backend/src/processamento.ts` (create) — puro: `calcularLatencia`, `calcularPerdidas`, `processarEstado`.
- `apps/backend/src/metricas.ts` (create) — puro: latência (mín/média/p95/máx/contagem), perda, tempo ligado, ocupação.
- `apps/backend/src/armazenamento.ts` (create) — `criarArmazenamento(caminho): Armazenamento` sobre `node:sqlite`.
- `apps/backend/src/configuracoes.ts` (create) — ler/gravar `configuracoes.json` com padrão.
- `apps/backend/src/rotas.ts` (create) — Express: rotas da 5.2, CSV, estáticos + fallback SPA.
- `apps/backend/src/ws.ts` (create) — `WebSocketServer` em `/ws`, `transmitir(msg)`.
- `apps/backend/src/simulador/fsm.ts` / `fsm.test.ts` (create) — porte de `occupancy_fsm.h` e dos 9 casos.
- `apps/backend/src/simulador/dispositivo.ts` (create) — dispositivo simulado (cliente MQTT, ciclo 100 ms).
- `apps/backend/test/*.test.ts` (create) — unitários (processamento, métricas, armazenamento) e integração (T4, T5, encerramento limpo).
- `apps/dashboard/src/**` (create) — `App.tsx`, `api.ts`, `useWs.ts`, telas `Controladora`, `Historico`, `Configuracoes`, componentes `DiagramaEsp32`, `DiagramaFsm`, `PainelAjuste`, `LogMqtt`, `estilos.css`.
- `apps/desktop/src/main.ts`, `tsup.config.ts`, `electron-builder.yml` (create) — casca Electron e empacotamento.
- `firmware/include/config.h`, `firmware/wokwi.toml` (modify) — broker público + raiz única.
- `docker-compose.yml`, `.env.example`, `.gitignore` (modify).
- `docs/decisoes.md`, `AGENTS.md`, `README.md`, `docs/TCC.md` (modify); `docs/evidencias/` (create) — saída serial e print da T8.

## E2E Test Scenarios

Driver: Orca CLI se `orca status --json` estiver alcançável; senão `playwright-cli`. App empacotado: abrir o `.app`, capturar a janela com `screencapture`, e interagir pelo mesmo endereço HTTP que a janela carrega.

### TS-001: Demo reage ao PIR
**Priority:** Critical
**Preconditions:** `pnpm dev` rodando, configurações padrão (embutido, demo ligado), `.dados/` novo
**Mapped Tasks:** Task 5, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navegar para `http://localhost:5173/` | Tela Controladora; indicadores WebSocket e broker "conectado"; FSM destaca `DESOCUPADO`; valores 28 °C / 55 % / 120 lux ao lado dos sensores |
| 2 | Clicar no PIR do diagrama | PIR pulsa; FSM anima para `OCUPADO`; LED amarelo (Luz) e azul (HVAC) acesos; contador regressivo de `tOcupadoMs` aparece após o PIR baixar (5 s) |
| 3 | Ler o painel de log MQTT | Linhas de entrada `tcc/sala01/estado` com `"estado":"OCUPADO"` |
| 4 | Clicar em "Pausar" no log e depois "Limpar" | Log para de rolar; lista esvazia |

### TS-002: Ajuste de parâmetro pelo diagrama
**Priority:** Critical
**Preconditions:** TS-001 passo 2 concluído (OCUPADO, HVAC aceso)
**Mapped Tasks:** Task 5, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clicar no DHT22 | Painel de ajuste com `tempAlvo` = 26 |
| 2 | Definir `tempAlvo` = 30 e aplicar | Log mostra saída `tcc/sala01/config` com `{"tempAlvo":30}`; LED azul apaga |
| 3 | Mover o slider de temperatura (demo) para 32 | HVAC acende de novo; valor exibido 32 °C |
| 4 | Clicar no PIR e definir `janelaConfMs` = 0 (já padrão) | Nó `CONFIRMANDO` aparece esmaecido |

### TS-003: Histórico, métricas e CSV
**Priority:** High
**Preconditions:** Demo rodou ≥ 1 min com ao menos uma ocupação
**Mapped Tasks:** Task 4, Task 5, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navegar para `#/historico`, período "15 min" | Gráficos de temperatura e lux com linhas de `tempAlvo`/`luxLimiar`; faixas de ocupação, luz e HVAC |
| 2 | Ler os cartões de métricas | Latência (mín/média/p95/máx/contagem), perda (0 perdidas), tempo de luz/HVAC ligados, transições de ocupação > 0 |
| 3 | Clicar em "Exportar CSV" | Download de CSV cuja 1ª linha é o cabeçalho definido e as demais são leituras |

### TS-004: Desconexão e estados vazios
**Priority:** High
**Preconditions:** `pnpm dev` rodando
**Mapped Tasks:** Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parar o backend (encerrar o processo) | Indicador WebSocket "desconectado"; tela continua renderizada (não em branco) |
| 2 | Reiniciar o backend | Cliente reconecta sozinho em ≤ 10 s; dados voltam a chegar |
| 3 | Com `.dados/` vazio e demo desligado, abrir Histórico | Estado "sem dados ainda", sem erro |
| 4 | Redimensionar para 380 px e emular `prefers-color-scheme: dark` | Layout utilizável (navegação acessível, sem rolagem horizontal); tema escuro aplicado; foco visível ao navegar com Tab |

### TS-005: Configurações e modo externo
**Priority:** High
**Preconditions:** `pnpm dev` rodando; `pnpm infra:up` (Mosquitto local na 1883)
**Mapped Tasks:** Task 4, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navegar para `#/configuracoes` | Mostra portas em uso (MQTT embutido em porta ≠ 1883 por causa do Mosquitto) e `http://<ip-lan>:3000` |
| 2 | Trocar para externo `127.0.0.1`, 1883, raiz `tcc`, salvar | Sem reiniciar: broker "externo conectado"; controles de Demo somem da Controladora |
| 3 | `docker exec tcc-mosquitto mosquitto_pub -t tcc/sala02/estado -m '<payload válido>'` | Seletor de dispositivo passa a listar `sala02`; Controladora mostra os valores |
| 4 | Voltar para embutido e ligar Demo | Demo volta a publicar `sala01` |

### TS-006: App empacotado persiste histórico
**Priority:** Critical
**Preconditions:** `.dmg` gerado; app instalado/aberto pelo `.app` de `apps/desktop/release`
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Abrir o `.app` empacotado | Janela "TCC Automação" com a Controladora funcionando (captura de tela) |
| 2 | Clicar no PIR (pela janela ou pelo mesmo endereço no navegador) | `OCUPADO`, LEDs acesos |
| 3 | Encerrar o app (Cmd+Q) e confirmar que o processo terminou | Nenhum processo "TCC Automação" restante |
| 4 | Reabrir e ir ao Histórico "tudo" | Leituras anteriores ao fechamento aparecem |

### TS-007: Firmware real via broker público
**Priority:** High
**Preconditions:** Firmware da Task 8 compilado; app em modo externo `broker.hivemq.com`, 1883, `tcc-unip-7f3a9c`
**Mapped Tasks:** Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rodar `pnpm firmware:sim` | Serial mostra `[mqtt] conectado` |
| 2 | Observar a Controladora durante a simulação | Leituras de `sala01` chegam; latência numérica (se NTP sincronizou) ou indefinida (`ts = 0`) |

## Progress Tracking

- [x] Task 1: Workspace pnpm com os 4 pacotes
- [x] Task 2: Contrato zod e portão do SQLite
- [x] Task 3: FSM portada para TypeScript
- [x] Task 4: Núcleo do backend
- [x] Task 5: REST, CSV e dispositivo simulado
- [x] Task 6: Dashboard React
- [x] Task 7: Casca Electron e instalador
- [x] Task 8: Firmware no broker público
- [x] Task 9: Infra, scripts e documentação

## Deviations

- Task 9 (tactical): script extra `mqtt:sub:publico` no `package.json` da raiz (assina `tcc-unip-7f3a9c/#` no broker público), no lugar de só documentar a variante. `README.md` e `AGENTS.md` documentam o `pnpm --filter @tcc/desktop exec install-electron` (deviation da Task 1). Na cópia limpa, o `rsync --files-from` precisou ignorar arquivos rastreados já apagados do working tree (`apps/.gitkeep`).

- Task 7 (tactical): o `.app` do electron-builder encerrava com SIGTRAP ao abrir (o `pnpm dev` funcionava). Causa: no macOS o electron-builder normaliza em NFD o nome do `.app`, do executável e dos Helpers derivado de `productName`, e o `CFBundleName` fica em NFC; renomear só esses arquivos para NFC fez o app abrir → `apps/desktop/electron-builder.yml` usa `productName: TCC Automacao` + `mac.extendInfo.CFBundleDisplayName: TCC Automação` (diverge do `productName` dos Global Constraints; registrado em D15). O `.dmg` passa a ser `apps/desktop/release/TCC Automacao-0.1.0-arm64.dmg`.
- Task 7 (tactical): durante a investigação o crash foi atribuído ao `node:sqlite` e o plano B (`better-sqlite3` + rebuild para o ABI do Electron com `apps/desktop/scripts/rebuild-native.cjs` e `apps/desktop/scripts/after-pack.cjs`) chegou a ser implementado; com a causa real corrigida, tudo foi desfeito (scripts removidos; `apps/backend/package.json`, `apps/desktop/package.json`, `apps/desktop/tsup.config.ts` e `pnpm-workspace.yaml` voltaram ao estado sem módulo nativo). Líquido: só o comentário de cabeçalho de `apps/backend/src/armazenamento.ts` mudou.
- Task 7 (tactical): o `package.json` empacotado não tem `productName`, então `userData` é `~/Library/Application Support/@tcc/desktop`, o mesmo do `pnpm --filter @tcc/desktop dev` — dev e app instalado compartilham o banco. Aceito para o protótipo; a Task 9 documenta no README.

- Task 1 (tactical): `.nvmrc` (novo, não rastreado, criado fora deste plano) fixa Node 24, e o Electron 44 embute Node 24 → todos os comandos rodam com Node 24.20.0 (`/opt/homebrew/opt/node@24/bin` no `PATH`), não com o 22.23.1 dos Global Constraints. `node:sqlite` também funciona no 24.
- Task 1 (tactical): pnpm 11.11.0 trava sem erro nem CPU ao resolver o `electron-builder` com `autoInstallPeers: true` (peers circulares `app-builder-lib` ⇄ `dmg-builder`; reproduzido em projeto isolado, corrigido só por `autoInstallPeers: false`) → `pnpm-workspace.yaml` ganha `autoInstallPeers: false`, e o peer exigido `react-is` (do `recharts`) entra em `apps/dashboard/package.json`.
- Task 1 (tactical): `pnpm-workspace.yaml` → `allowBuilds` também precisa de `electron-winstaller: false` (Squirrel.Windows, não usado; o pnpm 11 exige decisão explícita) e `peerDependencyRules.ignoreMissing: [electron-builder-squirrel-windows]`. O binário do Electron 44 não é baixado no `pnpm install`: vem por `pnpm --filter @tcc/desktop exec install-electron`; a Task 9 deve documentar isso no README.
- Task 6 (tactical): arquivos de apoio criados fora da lista do plano — `src/formatar.ts` (+ teste), `src/serie.ts` (+ teste; períodos, decimação e `ticksDoEixo`), `src/useAgora.ts`, `src/contexto.tsx` (estado compartilhado entre as telas: WebSocket + REST, log MQTT, dispositivo selecionado), `src/componentes/Graficos.tsx`. `EstadoDispositivo`, `DispositivoVisto`, `ConfigDispositivo`, `ComandoDemo`, `AmbienteDemo`, `ConsultaPeriodo`/`ConsultaLeituras` (Task 5) são reaproveitados por `api.ts` em vez de o dashboard duplicar tipos.
- Task 6 (user-agreed, achado no E2E TS-005): a mensagem `conexao` do WebSocket não carrega a porta do broker (só `modo`/`conectado` — contrato da seção 5.3). Ao trocar de modo, a tela ficava mostrando a porta do broker anterior em Configurações. Corrigido buscando `/api/saude` de novo a cada evento `conexao`, em vez de mesclar parcialmente o estado local. Sem mudança no contrato.
- Task 6 (tactical): `tsconfig.base.json` ganhou `"types": ["node", "vite/client"]` no `apps/dashboard/tsconfig.json` (import de `estilos.css` precisa dos tipos do cliente Vite).
- Task 5 (tactical): arquivos novos além da lista do plano: `apps/backend/src/config-dispositivo.ts` (padrões do firmware, `aplicarConfigFirmware` espelhando `onConfig`, `mesclarConfig`), `apps/backend/src/csv.ts` (+ `test/csv.test.ts`) e `apps/backend/test/simulador.test.ts`. `@tcc/contrato` ganhou os esquemas das rotas (`DispositivoVisto`, `ConfigDispositivo`, `EstadoDispositivo`, `ComandoDemo`, `AmbienteDemo`, `ConsultaPeriodo`, `ConsultaLeituras` e as constantes `LIMITE_LEITURAS_*`), para o backend não depender de `zod` direto e o dashboard reutilizar os mesmos tipos. `parar()` encerra o simulador **antes** do cliente MQTT e do broker (o PRD lista o simulador depois do broker, mas parar o broker antes faria o simulador, que é cliente dele, tentar reconectar).
- Task 5 (tactical): decisões que o PRD deixa em aberto: `POST /api/dispositivos/:id/config` devolve a config conhecida já mesclada (200) e responde 503 se o cliente MQTT estiver desconectado; `id` malformado → 400 e id nunca visto → 404 em todas as rotas por id (inclusive `POST config`); `limite` acima de 10000 vira 10000 (não é erro); o `POST /api/demo/pir`, `/ambiente` e `/demo` respondem `{ ok: true }` / `{ ativo }`. O simulador publica a primeira leitura ao iniciar (o firmware só ~2 s depois do boot). Verificação de fumaça com `src/cli.ts` (portas padrão, relógio real): 1883 ocupada pelo Mosquitto do Docker → fallback funcionou; PIR → OCUPADO em ~200 ms; SIGTERM encerra limpo.
- Task 4 (tactical): `apps/backend/src/rotas.ts` nasce aqui (só `GET /api/saude`, exigido pelo teste de fallback de porta) e a Task 5 o estende; `aplicarConfiguracoes()` (reconexão a quente) fica para a Task 5, junto com `PUT /api/configuracoes`, que é o único jeito de exercitá-la por um teste; `publicar()` do cliente MQTT idem (POST de config).
- Task 4 (tactical): arquivos de apoio aos testes criados fora da lista do plano: `apps/backend/test/ajudantes.ts`, `apps/backend/test/fixtures/encerra-limpo.ts` (processo filho do teste de encerramento) e `apps/backend/test/configuracoes.test.ts` (persistência de `configuracoes.json`).
- Task 4 (tactical): `apps/backend/src/ws.ts` trata o `upgrade` manualmente (`noServer: true`); com `{ server, path }` o ws repassava o `EADDRINUSE` do fallback de porta como erro dele. `GET /api/dispositivos/:id/leituras` (Task 5) devolve, quando há mais linhas que `limite`, as **mais recentes** em ordem crescente (`armazenamento.listar`), decisão que o PRD não fixa.
- Task 4 (tactical): TypeScript 7 não inclui `@types/*` sozinho (padrão de `types` é `[]`) → `tsconfig.base.json` ganhou `"types": ["node"]`.
- Task 3 (tactical): `ocupacaoStr` do C++ não foi portado — em TS o tipo `Ocupacao` (de `@tcc/contrato`, união de strings) já é o texto publicado, então a função seria a identidade. `Ocupacao` é reexportado de `apps/backend/src/simulador/fsm.ts`.
- Task 1 (tactical): dentro do shell do agente o filtro `rtk` deixa `pnpm install` sem saída até terminar; usar `rtk proxy /opt/homebrew/bin/pnpm ...` para saída direta.

## Implementation Tasks

### Task 1: Criar o workspace pnpm com os 4 pacotes

**Objective:** Criar `@tcc/contrato`, `@tcc/backend`, `@tcc/dashboard` e `@tcc/desktop` com `package.json`, `tsconfig` estendendo um `tsconfig.base.json` da raiz e scripts `dev`, `build`, `typecheck`, `test`, garantindo que o pós-instalação do Electron e do esbuild rode sob o pnpm 11.

**Files:**

- Create: `tsconfig.base.json`, `apps/{contrato,backend,dashboard,desktop}/package.json`, `apps/*/tsconfig.json`, arquivos-fonte mínimos (`src/index.ts` etc.) para o typecheck ter entrada
- Modify: `pnpm-workspace.yaml`, `package.json` (scripts `typecheck` = `pnpm -r typecheck`, `test` = `pnpm -r test`), `.gitignore` (`.dados/`, `apps/desktop/release/`)
- Delete: `apps/.gitkeep`

**Key Decisions / Notes:**

- pnpm 11 (verificado no context7, release notes 11.0): `onlyBuiltDependencies` foi substituído por `allowBuilds`, um mapa em `pnpm-workspace.yaml` — usar `allowBuilds: { electron: true, esbuild: true }`. Confirmar com `pnpm install` + existência de `node_modules/.pnpm/electron@*/node_modules/electron/dist/Electron.app`.
- `@tcc/contrato`: `"exports": { ".": "./src/index.ts" }`, sem build (`build` = `tsc --noEmit`). Dependentes usam `"@tcc/contrato": "workspace:*"`.
- `typecheck` = `tsc --noEmit -p .` em cada pacote. Testar TS 7.0.2; se o `tsc` do TS 7 falhar por motivo de ferramenta, fixar `typescript@~6` (ver Autonomous Decisions).
- `@tcc/desktop` sem testes próprios: `test` imprime que a verificação é pelo app empacotado (Task 7), sem falhar.
- Dependências exatas por pacote conforme §4.2 do PRD e Global Constraints.

**Definition of Done:**

- [x] `pnpm install` conclui sem erro e o binário do Electron está baixado
- [x] `apps/.gitkeep` removido
- [x] Verify: `pnpm install && pnpm -r typecheck && pnpm -r test`

### Task 2: Contrato zod e portão do SQLite

**Objective:** Implementar em `@tcc/contrato` os esquemas zod e tipos da seção 5 do PRD e executar o portão da 6.4 (`node:sqlite` no Node do projeto e no processo principal do Electron 44), tomando a decisão do banco com evidência.

**Files:**

- Create: `apps/contrato/src/index.ts`, `apps/contrato/src/index.test.ts`
- Create: `apps/desktop/scripts/portao-sqlite.cjs` (script mínimo: abre banco em diretório temporário, `CREATE`/`INSERT`/`SELECT`, imprime resultado e sai)
- Modify: `docs/decisoes.md` (D12)

**Key Decisions / Notes:**

- `EstadoPayload`: `estado` enum `DESOCUPADO|CONFIRMANDO|OCUPADO`; `temperatura`/`umidade` `number | null`; `seq` inteiro 0..2^32-1; `ts` inteiro ≥ 0. `ConfigPayload`: todos opcionais, `.strict()` para rejeitar chaves desconhecidas no POST. `Configuracoes` como união discriminada por `broker.modo`. `MensagemWs` exatamente como §5.3.
- Tipos derivados com `z.infer` e exportados com `export type` (nunca `interface`). **VERIFICAR** API do zod 4 no context7 (ex.: `z.int()`, mensagens de erro).
- Portão: rodar o script com `node` e com o Electron (`ELECTRON_RUN_AS_NODE=1 <electron> script` **e** um `main` mínimo via `electron script`, que é o ambiente real do processo principal). Registrar versões (Node embutido do Electron) e saída em D12.
- Se o Electron falhar: `better-sqlite3` + `electron-builder install-app-deps`, e D12 registra a troca. O código do backend não muda (acesso atrás de `Armazenamento`), mas o empacotamento da Task 7 muda: ver a nota de fallback nela.
- D12 (SQLite no lugar do InfluxDB) fica escrita aqui, com a evidência do portão.

**Definition of Done:**

- [x] Testes aceitam payload válido e `temperatura: null`, e rejeitam `estado: "OUTRO"` e config com campo desconhecido
- [x] Portão executado no Node e no processo principal do Electron, com saída registrada em D12
- [x] Verify: `pnpm --filter @tcc/contrato test && node apps/desktop/scripts/portao-sqlite.cjs && pnpm --filter @tcc/desktop exec electron scripts/portao-sqlite.cjs`

### Task 3: Portar a FSM para TypeScript

**Objective:** Portar `firmware/include/occupancy_fsm.h` para `apps/backend/src/simulador/fsm.ts` ramo a ramo, com aritmética `uint32`, e portar os 9 casos de `firmware/test/fsm_test.cpp` com os mesmos nomes e valores, provando que o Demo se comporta como o firmware.

**Files:**

- Create: `apps/backend/src/simulador/fsm.ts`, `apps/backend/src/simulador/fsm.test.ts`

**Key Decisions / Notes:**

- Mesmos nomes: `fsmStep`, `FsmState`, `FsmConfig`, `Ocupacao`, `ocupacaoStr` (`occupancy_fsm.h:12-78`). `FsmState` como objeto mutável com fábrica `novoFsmState()` (valores padrão do struct C++).
- Toda subtração de tempo `(agora - t) >>> 0`; todo incremento `(t + n) >>> 0`; `pulsos` como `uint8` (`(p + 1) & 0xff`).
- `rodar(s, c, pir, relogio, ms)` itera por contagem de passos (`fsm_test.cpp:17-19`); como TS não tem referência a `uint32_t&`, o tempo vive num objeto `{ t }` e avança com `>>> 0`.
- 9 casos com os nomes literais: "fig3: inicia desocupado" … "overflow: desocupa no tempo certo"; o caso overflow parte de `0xFFFFFFFF - 1000`.

**Definition of Done:**

- [x] Os 9 casos passam com nomes idênticos aos do C++
- [x] Mutação controlada: trocar `(agora - s.tUltimo) >>> 0` por `agora - s.tUltimo` faz o caso "overflow: desocupa no tempo certo" falhar (verificar e reverter)
- [x] Verify: `pnpm --filter @tcc/backend test -- fsm && pnpm test:fsm`

### Task 4: Núcleo do backend

**Objective:** Implementar `criarServidor(opcoes)` com broker Aedes embutido, cliente MQTT reconectável a quente, armazenamento SQLite, processamento (latência e perda), métricas, configurações persistidas, WebSocket e fallback de porta, com `parar()` encerrando tudo limpo.

**Files:**

- Create: `apps/backend/src/{servidor,cli,portas,broker,cliente-mqtt,processamento,metricas,armazenamento,configuracoes,ws}.ts`
- Test: `apps/backend/test/processamento.test.ts`, `apps/backend/test/metricas.test.ts`, `apps/backend/test/armazenamento.test.ts`, `apps/backend/test/integracao-mqtt.test.ts`, `apps/backend/test/encerramento.test.ts`
- Modify: `docs/decisoes.md` (D11, D13)

**Key Decisions / Notes:**

- Tipos `OpcoesServidor`, `Servidor`, `Armazenamento`, `Configuracoes` copiados da 6.1/6.2/6.4 (mais os aditivos de Autonomous Decisions). `parar()` na ordem da 6.1: WebSocket → HTTP → cliente MQTT → broker → simulador → banco.
- `escutar()` em `portas.ts`: tenta a porta pedida; em `EADDRINUSE` escuta na `0` e loga a porta real. HTTP em `0.0.0.0`; broker em `0.0.0.0`. Porta 0 explícita (testes) não dispara fallback.
- `processamento.ts` (puro): `calcularLatencia(recebidoEm, ts)` → `null` se `ts === 0`; `calcularPerdidas(ultimoSeq | undefined, seq)` → `seq > ultimo+1 ? seq-ultimo-1 : 0` (reinício quando `seq <= ultimo`). `ultimoSeq` por dispositivo em memória, semeado por `armazenamento.ultima(id)` na primeira mensagem.
- Mensagem inválida (JSON ou zod): `console.warn` com tópico e motivo; descarta sem lançar. Emite no WS `mqtt` (entrada) para toda mensagem e `estado` só para as válidas.
- Armazenamento: `PRAGMA journal_mode = WAL`, tabela e índice da 6.4, statements preparados; `listar` ordena por `recebido_em` com `LIMIT`. `PUT /api/configuracoes` (implementado na Task 5) chama `aplicarConfiguracoes()` exposta aqui: grava JSON, sobe/derruba broker, para/inicia o simulador conforme o demo efetivo (Autonomous Decisions), reconecta cliente, emite `conexao` e `demo`.

**Definition of Done:**

- [x] Unitários: latência `ts = 0` → `null` e `ts > 0` → diferença; perda para lacuna (5→8 = 2), sequência normal (0), reinício (10→0 = 0); ida e volta no armazenamento incluindo nulos; métricas com série conhecida (p95, tempo ligado com lacuna > 10 s ignorada, transições)
- [x] Integração: servidor em portas efêmeras e `dirDados` temporário; um cliente `mqtt` publica `tcc/sala01/estado`; a linha aparece no banco e o cliente WS recebe `estado` e `mqtt`
- [x] Payload inválido publicado não derruba o servidor e não gera linha
- [x] Encerramento: processo filho (`tsx`) cria o servidor, chama `parar()` e sai sozinho com código 0 em < 5 s (sem handles abertos)
- [x] Fallback: com um `net.Server` ocupando a porta pedida, `criarServidor` sobe em outra e a informa em `portaMqtt`/`portaHttp`
- [x] Verify: `pnpm --filter @tcc/backend test`

### Task 5: REST, CSV e dispositivo simulado

**Objective:** Expor as rotas da seção 5.2 (incluindo CSV, métricas, configurações e demo) e implementar o dispositivo simulado da 6.5, que conecta ao broker embutido como cliente MQTT comum, aplica `config` como o `onConfig` do firmware e decide igual a `taskDecisao`.

**Files:**

- Create: `apps/backend/src/rotas.ts`, `apps/backend/src/simulador/dispositivo.ts`
- Test: `apps/backend/test/integracao-rest-demo.test.ts`
- Modify: `apps/backend/src/servidor.ts`, `docs/decisoes.md` (D14)

**Key Decisions / Notes:**

- Erros `{ erro }`: 400 (zod/params), 404 (id nunca visto), 409 (rota de demo com demo desligado ou modo externo). `limite` padrão 1000, máx. 10000; `de`/`ate` padrão `0`/`Date.now()`.
- Estáticos: se `dirEstatico` existe, `express.static` + fallback `index.html` para GET fora de `/api` e `/ws`.
- Simulador: ciclo `setInterval` 100 ms usando `agora()` injetável; `luz = ocupado && lux < luxLimiar`; `hvac = ocupado && temperatura != null && temperatura > tempAlvo` (`main.cpp:103-106`); publica a cada 2 s e a cada mudança; `seq` crescente; `ts = Date.now()`; ambiente inicial 28 °C / 55 % / 120 lux; pulso de PIR alto até `agora() + 5000`. Assina `<raiz>/sala01/config` e aplica só os campos presentes (`main.cpp:138-152`).
- `POST /api/demo` grava `demo` nas configurações e emite `{ tipo: 'demo' }`.
- D14 (FSM portada + métricas do Cap. 4 vêm do firmware real) escrita aqui.

**Definition of Done:**

- [x] Integração com relógio injetado: liga demo, injeta PIR, recebe via WS `OCUPADO` com `luz = true` e `hvac = true`; `POST config {tempAlvo: 30}` → próximo `estado` com `hvac = false`
- [x] `export.csv` retorna o cabeçalho definido e ≥ 1 linha; `Content-Type: text/csv`
- [x] `POST /api/demo/pir` com demo desligado → 409; `POST config` inválido → 400; `/estado` de id desconhecido → 404
- [x] Verify: `pnpm --filter @tcc/backend test && pnpm test:fsm`

### Task 6: Dashboard React

**Objective:** Construir as três telas da 6.6 (Controladora com diagrama SVG do ESP32 e FSM da Figura 3, Histórico com Recharts e métricas, Configurações) contra o backend standalone, com reconexão do WebSocket, estados vazios/desconectado, responsivo até 380 px e tema claro/escuro.

**Files:**

- Create: `apps/dashboard/index.html`, `apps/dashboard/vite.config.ts`, `apps/dashboard/src/{main.tsx,App.tsx,api.ts,useWs.ts,reconexao.ts,estilos.css}`
- Create: `apps/dashboard/src/telas/{Controladora,Historico,Configuracoes}.tsx`
- Create: `apps/dashboard/src/componentes/{DiagramaEsp32,DiagramaFsm,PainelAjuste,LogMqtt,IndicadorConexao}.tsx`
- Test: `apps/dashboard/src/reconexao.test.ts`
- Modify: `package.json` da raiz (`dev` = `pnpm --parallel --filter @tcc/backend --filter @tcc/dashboard dev`)

**Key Decisions / Notes:**

- `vite.config.ts`: proxy `/api` e `/ws` (com `ws: true`) para `http://127.0.0.1:3000`.
- `reconexao.ts` (puro): espera 1 s, dobrando até 10 s, zera ao conectar (§5.3) — única lógica com teste unitário; o resto é verificado pelos E2E.
- Diagrama: pinos 27 (PIR), 15 (DHT22), 34 (LDR), 26 (Luz, LED amarelo "Luz (relé)"), 25 (HVAC, LED azul "HVAC (IR)") com rótulos visíveis (`firmware/diagram.json`). Componentes clicáveis como `<button>`/`role="button"` com `aria-label` e foco visível.
- Log MQTT: buffer circular de 200 mensagens, pausar/limpar. Controles de demo (clique no PIR injeta movimento, sliders) só quando `saude.demo`; clique no PIR fora do demo abre só o painel de ajuste.
- CSS puro com variáveis e `@media (prefers-color-scheme: dark)`; sem biblioteca de componentes. Recharts: evitar recomputar séries a cada mensagem WS no Histórico (buscar por REST ao trocar período; atualizar no máx. a cada 2 s).

**Definition of Done:**

- [x] TS-001, TS-002, TS-003, TS-004 e TS-005 executados de verdade no navegador, com capturas
- [x] `reconexao.test.ts` cobre a sequência 1, 2, 4, 8, 10, 10 s e o reinício após conectar
- [x] Verify: `pnpm -r typecheck && pnpm -r test && pnpm --filter @tcc/dashboard build`

### Task 7: Casca Electron e instalador macOS

**Objective:** Criar o processo principal do Electron que sobe `criarServidor` com `userData`, abre a janela no próprio servidor (sem IPC/preload), e empacotar com electron-builder num `.dmg` arm64 cujo app instalado persiste o histórico entre aberturas.

**Files:**

- Create: `apps/desktop/src/main.ts`, `apps/desktop/tsup.config.ts`, `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json` (scripts `dev`, `build`, `dist`), `docs/decisoes.md` (D10, D15, evidência em D12), `apps/backend/src/armazenamento.ts` (só o comentário de cabeçalho; ver Deviations)

**Key Decisions / Notes:**

- `main.ts`: `requestSingleInstanceLock` (segunda instância foca a janela); `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`; `setWindowOpenHandler` + `will-navigate` para abrir links externos com `shell.openExternal`; `before-quit` com `preventDefault` até `servidor.parar()` resolver, depois `app.exit()`.
- Produção: `dirEstatico = path.join(process.resourcesPath, 'dashboard')`, carrega `http://127.0.0.1:<portaHttp>`. Dev (`!app.isPackaged`): sem `dirEstatico`, carrega `http://localhost:5173` com nova tentativa a cada 500 ms até 30 s; script `dev` roda o Vite do dashboard e o Electron em paralelo.
- tsup: entrada `src/main.ts`, `format: 'cjs'`, `platform: 'node'`, `noExternal: [/.*/]`, `external: ['electron', 'bufferutil', 'utf-8-validate']`, saída `dist/main.cjs`.
- electron-builder: `appId`/`productName` dos Global Constraints; `files: ['dist/**', 'package.json']`; `extraResources: [{ from: '../dashboard/dist', to: 'dashboard' }]`; `mac.target: dmg (arm64)`, `win.target: nsis (x64)`, `linux.target: AppImage (x64)`; `npmRebuild: false`; sem assinatura (`mac.identity: null`). Fallback `node-linker=hoisted` em `.npmrc` só se falhar.
- Se a Task 2 adotar `better-sqlite3` (módulo nativo, não entra no bundle): acrescentá-lo ao `external` do tsup, incluí-lo no pacote (`files` com `node_modules/better-sqlite3/**` e dependências, ou `extraResources`), e rodar `electron-builder install-app-deps` antes do `dist` (ou `npmRebuild: true`).
- D10 (app Electron como forma de entrega) escrita aqui.

**Definition of Done:**

- [x] `pnpm --filter @tcc/desktop dev` abre a janela com a Controladora funcionando (captura)
- [x] `pnpm --filter @tcc/desktop dist` gera `apps/desktop/release/*.dmg`
- [x] TS-006 executado com o `.app` empacotado: histórico persiste após fechar e reabrir; após Cmd+Q nenhum processo do app permanece
- [x] Verify: `pnpm --filter @tcc/dashboard build && pnpm --filter @tcc/desktop dist && ls apps/desktop/release/*.dmg`

### Task 8: Firmware no broker público

**Objective:** Apontar o firmware para `broker.hivemq.com` com a raiz `tcc-unip-7f3a9c`, remover o gateway da extensão do VS Code, validar no `wokwi-cli` dentro do orçamento e ver os dados chegarem no app em modo externo, guardando a evidência para o Cap. 3.

**Files:**

- Modify: `firmware/include/config.h`, `firmware/wokwi.toml`, `docs/decisoes.md` (D09)
- Create: `docs/evidencias/2026-09-21-wokwi-serial.txt`, `docs/evidencias/2026-09-21-controladora-firmware-real.png`

**Key Decisions / Notes:**

- `config.h`: `#define TOPIC_RAIZ "tcc-unip-7f3a9c"`; `TOPIC_ESTADO TOPIC_RAIZ "/" DEVICE_ID "/estado"`; `TOPIC_CONFIG` idem; `MQTT_HOST "broker.hivemq.com"`; comentário novo explica broker público + raiz única (sem VS Code/Private Gateway).
- `wokwi.toml`: remover `[net] gateway = true` e o comentário acima dele.
- Execução: `pnpm infra:up` → assinante `docker exec tcc-mosquitto mosquitto_sub -h broker.hivemq.com -t 'tcc-unip-7f3a9c/#' -v -C 2 -W 60` em segundo plano → `WOKWI_CLI_TOKEN` carregado de `.env` → `wokwi-cli firmware --timeout 30000 --timeout-exit-code 0`. No máx. 3 execuções; `code 1006` → repetir uma vez. Segunda/terceira execução só para a verificação no app.
- Latência via Wokwi inclui internet + nuvem: citar em D09 como limitação.

**Definition of Done:**

- [x] `cd firmware && pio run` compila
- [x] Serial contém `[mqtt] conectado` e o assinante imprime 2 mensagens `estado`; saída serial salva em `docs/evidencias/`
- [x] TS-007: app em modo externo mostra dados de `sala01`; captura salva em `docs/evidencias/`
- [x] Verify: `cd firmware && pio run && pnpm test:fsm`

### Task 9: Infra, scripts da raiz e documentação

**Objective:** Remover o InfluxDB da infra, fechar os scripts da raiz e atualizar `AGENTS.md`, `README.md` e `docs/TCC.md` para que um leitor siga só o README e consiga rodar em desenvolvimento e gerar o instalador.

**Files:**

- Modify: `docker-compose.yml` (remove serviço `influxdb` e volume), `.env.example` (sai `INFLUX_*`, entra `WOKWI_CLI_TOKEN=`), `package.json` da raiz, `AGENTS.md`, `README.md`, `docs/TCC.md`

**Key Decisions / Notes:**

- Scripts da raiz: `dev` (Task 6), `desktop:dev`, `desktop:dist` (build do dashboard + dist do desktop), `firmware:build` (`cd firmware && pio run`), `firmware:sim` (carrega `.env` via `sh -c 'set -a; . ./.env; …'` e roda `wokwi-cli firmware --timeout 30000 --timeout-exit-code 0`); manter `test:fsm`, `infra:up`, `infra:down`, `mqtt:sub` (este passa a aceitar a raiz `tcc/#`; documentar a variante do broker público).
- `AGENTS.md`: Estrutura (4 pacotes), Comandos, stack da Regra de ouro apontando D10–D13, Atenção (Wokwi CLI, token no `.env`, 50 min/mês, broker público). `CLAUDE.md` não muda.
- `README.md`: desenvolvimento, gerar instalador (incluindo "Abrir" pelo menu de contexto no macOS por não haver assinatura), validar firmware.
- `docs/TCC.md`: marcar concluídos no roadmap da postagem 1; trocar menções a InfluxDB pelo SQLite (D12).
- Validar o critério seguindo o README numa cópia limpa: copiar os arquivos rastreados e novos (`git ls-files -co --exclude-standard`) para o diretório de rascunho da sessão com `rsync --files-from`, sem tocar no working tree.

**Definition of Done:**

- [x] `docker compose config` válido, só com `mosquitto`
- [x] Nenhuma menção restante a InfluxDB/`host.wokwi.internal`/Private Gateway em `AGENTS.md`, `README.md`, `.env.example`, `docker-compose.yml` (fora do histórico em `docs/decisoes.md`)
- [x] Seguindo só o README numa cópia limpa do repositório: `pnpm install`, `pnpm dev` abre o dashboard e `pnpm desktop:dist` gera o `.dmg`
- [x] Verify: `pnpm -r typecheck && pnpm -r test && pnpm test:fsm && docker compose config --services`

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 | Critical | PASS | 0 | Task 6, navegador (Orca) contra `pnpm dev`; na verificação, repetido no dashboard servido pelo app empacotado (clique no PIR → Luz/HVAC ligados, log com `OCUPADO`; Histórico com gráficos de temperatura, luminosidade e latência) |
| TS-002 | Critical | PASS | 0 | Task 6, idem |
| TS-003 | High | PASS | 0 | Task 6; CSV conferido de novo no app empacotado (200, `text/csv`, cabeçalho do contrato, 1761 leituras) |
| TS-004 | High | PASS | 0 | Task 6, incluindo 380 px e tema escuro |
| TS-005 | High | PASS | 1 | Fixed: porta do broker desatualizada em Configurações após trocar de modo (ver Deviations, Task 6) |
| TS-006 | Critical | PASS | 1 | Fixed: crash do app empacotado (nomes NFD; D15). `.app` instalado do `.dmg`: PIR → OCUPADO com luz e HVAC; Cmd+Q sem processos restantes em ~1 s; ao reabrir, as 1717 leituras anteriores continuam lá; captura em `docs/evidencias/2026-09-21-app-empacotado-ocupado.png` |
| TS-007 | High | PASS | 0 | `wokwi-cli` + app empacotado em modo externo: `sala01` com os valores do firmware (905 lux), latência 2791 ms; evidências em `docs/evidencias/` |
