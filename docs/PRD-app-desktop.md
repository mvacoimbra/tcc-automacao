# PRD — App desktop (Electron) do protótipo do TCC

> **Para quem vai executar (agente ou pessoa):** leia `AGENTS.md` e `docs/TCC.md` antes de
> começar. Execute as tarefas da seção 9 **na ordem**, uma por vez, e só avance quando o
> critério de aceite da tarefa passar. Tudo que este documento fixa (nomes, portas, rotas,
> formatos) é decisão tomada — não reabra. Onde estiver escrito **VERIFICAR**, confirme na
> documentação atual (context7 / `pnpm view <pacote>`) antes de escrever código; não confie
> na memória para API de biblioteca. **Não faça commit nem push** sem o usuário pedir.

## 1. Contexto

Protótipo do TC II (UNIP): controle de iluminação e temperatura baseado em presença. Hoje o
repositório tem só o firmware ESP32 (compila; 9 testes da FSM passam) e um `docker-compose`
com Mosquitto + InfluxDB. `apps/` está vazio.

Decisões tomadas com o autor em 21/09/2026:

1. **Nada físico.** Não haverá placa nem sensores. É prova de conceito em simulação.
2. **Nada de extensão do VS Code.** O firmware real roda só pela **Wokwi CLI** (`wokwi-cli`).
3. **A entrega é um app Electron** instalável, multiplataforma, que roda sozinho: sem Docker,
   sem Node instalado, sem terminal, sem internet. É o que será aberto na banca.
4. O app tem um **modo Demo** com um dispositivo simulado interno e uma tela **Controladora**
   com diagrama interativo.

Fatos já verificados (não precisa repetir):

- `pio run` compila o firmware (RAM 13,9 %, flash 59,9 %). PlatformIO está em `~/.local/bin/pio`.
- `wokwi-cli` 0.27.1 está em `~/.local/bin/wokwi-cli`; o token está em `.env` (`WOKWI_CLI_TOKEN`).
- No Wokwi CLI o firmware sobe e conecta no Wi-Fi simulado, mas **não alcança a máquina
  local** (`host.wokwi.internal` dá "connection reset"; o Mosquitto local não recebe nada).
  Logo o firmware real precisa de **broker público**.
- A API da Wokwi às vezes cai com `code 1006` na primeira tentativa; repetir resolve.
- Plano grátis: **50 minutos de simulação por mês**. Já foi gasto ~1 min.

## 2. Objetivo e critérios de sucesso

Ao final, numa máquina limpa:

1. Instalar o app (no mínimo o `.dmg` para macOS arm64) e abrir com duplo clique.
2. Ligar o modo Demo, clicar no PIR do diagrama e ver: estado `DESOCUPADO → OCUPADO`, luz e
   HVAC reagindo conforme lux/temperatura, gráficos andando, log MQTT rolando.
3. Fechar e reabrir: o histórico continua lá.
4. Exportar CSV das leituras.
5. Trocar para "broker externo" e receber dados do firmware real rodando no `wokwi-cli`.

## 3. Fora de escopo

- Hardware físico, descoberta de dispositivos na rede, TLS/autenticação MQTT (seção 1.5 do TC I).
- Assinatura de código dos instaladores, auto-update.
- Cenários YAML de automação do Wokwi e plano de testes (postagem 2).
- Teste de usabilidade SUS (postagem 3).
- Múltiplos dispositivos simultâneos na UI: o backend aceita N dispositivos, a UI mostra um seletor simples e nada além disso.

## 4. Arquitetura

O Electron é **empacotamento**, não arquitetura: por dentro continua o modelo das Figuras 2
e 3 do TC I (dispositivo → MQTT → backend Node/Express → WebSocket → dashboard React).

```
┌──────────────── App Electron (@tcc/desktop) ─────────────────┐
│ Processo principal                                           │
│  └─ @tcc/backend (em processo)                               │
│      ├─ broker MQTT embutido (Aedes)      porta 1883*        │
│      ├─ cliente MQTT (mqtt.js) ──► embutido OU broker externo│
│      ├─ Express (REST) + ws (WebSocket)   porta 3000*        │
│      ├─ SQLite (arquivo em userData)                         │
│      └─ dispositivo simulado (modo Demo)                     │
│ Janela                                                       │
│  └─ carrega http://127.0.0.1:<porta>  ← o próprio Express    │
│     serve o build do @tcc/dashboard                          │
└──────────────────────────────────────────────────────────────┘
* se a porta estiver ocupada, usa uma livre (ver 6.1)
```

Consequências deliberadas:

- A janela do Electron é só um navegador apontando para o servidor local. **Sem IPC, sem
  preload, sem `nodeIntegration`** (`contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`). O mesmo endereço abre no navegador ou no celular da rede local.
- O backend também roda sozinho (`pnpm dev`), sem Electron, para desenvolver e testar.

### 4.1 Pacotes (workspace pnpm `apps/*`)

| Pacote | Pasta | Conteúdo |
|---|---|---|
| `@tcc/contrato` | `apps/contrato` | Tipos + esquemas zod do contrato MQTT, REST e WebSocket. Só TypeScript-fonte (`exports` aponta para `src/index.ts`), sem build próprio. |
| `@tcc/backend` | `apps/backend` | Broker, cliente MQTT, armazenamento, REST, WebSocket, simulador. Exporta `criarServidor()`. |
| `@tcc/dashboard` | `apps/dashboard` | React + Vite + TypeScript + Recharts. |
| `@tcc/desktop` | `apps/desktop` | Casca Electron + electron-builder. |

### 4.2 Bibliotecas

| Uso | Biblioteca | Observação |
|---|---|---|
| Broker embutido | `aedes` | **VERIFICAR** a API da versão atual (a forma de criar a instância mudou entre versões). Servir com `net.createServer`. |
| Cliente MQTT | `mqtt` | |
| HTTP | `express` | versão estável atual |
| WebSocket | `ws` | no mesmo servidor HTTP, caminho `/ws` |
| Validação | `zod` | |
| Banco | `node:sqlite` (embutido no Node) | ver 6.4 — há um portão de verificação e um plano B |
| Testes | `vitest` | |
| Dev/build backend e desktop | `tsx`, `tsup` | |
| UI | `react`, `recharts`, `vite` | CSS puro com variáveis; **sem** biblioteca de componentes |
| Empacotamento | `electron`, `electron-builder` | |

Regras do repositório que valem aqui: **pnpm, nunca npm**; TypeScript `strict`, usar
**`type`, nunca `interface`**; textos, logs, comentários e UI em **português**; identificadores
do domínio em português (`estado`, `leituras`, `ocupado`), consistentes com o firmware.

## 5. Contrato

### 5.1 MQTT (já existe no firmware — não mudar o formato)

Tópicos: `<raiz>/<dispositivo>/estado` (dispositivo → broker) e `<raiz>/<dispositivo>/config`
(broker → dispositivo).

- `raiz` = `tcc` no broker embutido.
- `raiz` = `tcc-unip-7f3a9c` no broker público (evita colisão e interferência de terceiros).
  É configurável na tela de Configurações; esse é o valor padrão do modo externo.

Payload de `estado` (a cada 2 s e a cada mudança):

```json
{ "dispositivo": "sala01", "seq": 42, "ts": 1790000000000, "estado": "OCUPADO",
  "pir": true, "temperatura": 28.0, "umidade": 55.0, "lux": 120.5,
  "luz": true, "hvac": true }
```

- `estado` ∈ `DESOCUPADO | CONFIRMANDO | OCUPADO`.
- `ts` = epoch ms; **`0` significa "NTP não sincronizou"** → latência indefinida (`null`).
- `temperatura`/`umidade` podem vir **`null`** (o firmware serializa `NaN` como `null` antes
  da primeira leitura do DHT). O esquema zod precisa aceitar `null`.
- `seq` é `uint32` e reinicia em 0 quando o dispositivo reinicia.

Payload de `config` (todos opcionais): `tOcupadoMs`, `janelaConfMs`, `pulsosConf`,
`luxLimiar`, `tempAlvo`. Padrões do firmware: `30000`, `0`, `1`, `300`, `26`.

### 5.2 REST (prefixo `/api`)

| Método e rota | Função |
|---|---|
| `GET /api/saude` | `{ ok, versao, broker: { modo, conectado, porta }, demo: boolean }` |
| `GET /api/dispositivos` | lista de ids já vistos + último `recebidoEm` |
| `GET /api/dispositivos/:id/estado` | última leitura + config conhecida |
| `GET /api/dispositivos/:id/leituras?de=&ate=&limite=` | série histórica (epoch ms; `limite` padrão 1000, máx. 10000) |
| `GET /api/dispositivos/:id/metricas?de=&ate=` | ver 5.4 |
| `GET /api/dispositivos/:id/export.csv?de=&ate=` | CSV com cabeçalho, separador `,`, decimal `.` |
| `POST /api/dispositivos/:id/config` | valida com zod e publica em `<raiz>/:id/config` |
| `GET /api/configuracoes` · `PUT /api/configuracoes` | ver 6.2 |
| `POST /api/demo` `{ ativo: boolean }` | liga/desliga o dispositivo simulado |
| `POST /api/demo/pir` | injeta um pulso de movimento (PIR alto por 5 s) |
| `POST /api/demo/ambiente` `{ temperatura?, umidade?, lux? }` | altera os sensores simulados |

Erros: JSON `{ erro: string }` com 400 (validação), 404 (dispositivo desconhecido), 409 (rota
de demo com demo desligado).

### 5.3 WebSocket (`/ws`, JSON, servidor → cliente)

```ts
type MensagemWs =
  | { tipo: 'estado'; dados: LeituraComMetadados }
  | { tipo: 'mqtt'; direcao: 'entrada' | 'saida'; topico: string; payload: string; em: number }
  | { tipo: 'conexao'; broker: { modo: 'embutido' | 'externo'; conectado: boolean } }
  | { tipo: 'demo'; ativo: boolean }
```

`LeituraComMetadados` = payload de `estado` + `recebidoEm`, `latenciaMs | null`, `perdidas`.
O cliente reconecta sozinho (espera de 1 s, dobrando até 10 s).

### 5.4 Métricas (evidência do Cap. 4 — precisam ser exportáveis)

- **Latência:** `recebidoEm - ts`, só quando `ts > 0`. Expor mín., média, p95, máx. e contagem.
  Depende do relógio do dispositivo e do PC (NTP); registrar isso como limitação.
- **Perda de mensagens**, por dispositivo: se `seq > ultimoSeq + 1`, `perdidas = seq - ultimoSeq - 1`.
  Se `seq <= ultimoSeq`, é **reinício do dispositivo**, não perda: `perdidas = 0`. Expor total
  perdido, total recebido e taxa.
- **Tempo ligado:** soma dos intervalos com `luz = true` e com `hvac = true` no período.
- **Ocupação:** número de transições e tempo total em `OCUPADO`.

## 6. Requisitos por componente

### 6.1 Backend — `criarServidor(opcoes)`

```ts
type OpcoesServidor = {
  dirDados: string            // onde ficam o banco e configuracoes.json
  portaHttp?: number          // padrão 3000
  portaMqtt?: number          // padrão 1883
  dirEstatico?: string        // build do dashboard; se ausente, não serve estáticos
}
type Servidor = { url: string; portaHttp: number; portaMqtt: number | null; parar(): Promise<void> }
```

- **Porta ocupada (`EADDRINUSE`):** tentar a padrão; se falhar, abrir numa porta livre
  (porta `0`) e informar a porta real em `/api/saude` e no log. Isso é obrigatório porque o
  Mosquitto do `docker-compose` costuma estar na 1883 durante o desenvolvimento.
- Express escuta em `0.0.0.0` (para abrir no celular); o Electron carrega `127.0.0.1`.
- `parar()` fecha WebSocket, HTTP, cliente MQTT, broker, simulador e banco, nessa ordem, e
  precisa deixar o processo terminar limpo (os testes dependem disso).
- Executável standalone: `apps/backend/src/cli.ts` chama `criarServidor({ dirDados: '.dados' })`.
  Adicionar `.dados/` ao `.gitignore`.

### 6.2 Configurações (`<dirDados>/configuracoes.json`)

```ts
type Configuracoes = {
  broker:
    | { modo: 'embutido' }
    | { modo: 'externo'; host: string; porta: number; raiz: string }
  demo: boolean
}
```

Padrão na primeira execução: `{ broker: { modo: 'embutido' }, demo: true }`.
`PUT /api/configuracoes` valida, grava e **reconecta o cliente MQTT a quente** (sem reiniciar
o app). No modo externo o broker embutido não sobe e o modo Demo fica indisponível (409).

### 6.3 Assinatura MQTT

Assinar `<raiz>/+/estado`. Para cada mensagem: validar com zod (descartar e logar as
inválidas, sem derrubar o processo) → calcular `latenciaMs` e `perdidas` → gravar → emitir
`estado` e `mqtt` no WebSocket.

### 6.4 Armazenamento (SQLite)

Esconder atrás de um tipo, para o banco poder ser trocado sem tocar no resto:

```ts
type Armazenamento = {
  gravar(l: LeituraComMetadados): void
  ultima(dispositivo: string): LeituraComMetadados | null
  listar(dispositivo: string, de: number, ate: number, limite: number): LeituraComMetadados[]
  dispositivos(): { id: string; vistoEm: number }[]
  fechar(): void
}
```

Tabela `leituras`: `id` PK, `dispositivo`, `seq`, `ts`, `recebido_em`, `latencia_ms` (nulo),
`perdidas`, `estado`, `pir`, `temperatura` (nulo), `umidade` (nulo), `lux`, `luz`, `hvac`.
Índice em `(dispositivo, recebido_em)`. Usar `PRAGMA journal_mode = WAL`.

**Portão de verificação (fazer na T2, antes de construir em cima):** usar `node:sqlite`.
**VERIFICAR** que (a) funciona no Node do projeto sem flag e (b) funciona **dentro do
processo principal do Electron** na versão escolhida — escrever um script mínimo que abre um
banco e faz um `INSERT`/`SELECT` nos dois ambientes. Se (b) falhar, trocar só a implementação
de `Armazenamento` por `better-sqlite3` (módulo nativo: exige rebuild para o Electron via
`electron-builder install-app-deps`) e registrar a troca em `docs/decisoes.md`.

### 6.5 Dispositivo simulado (modo Demo)

Reproduz o firmware em TypeScript, em `apps/backend/src/simulador/`:

- **`fsm.ts`: porte fiel de `firmware/include/occupancy_fsm.h`.** Mesmos nomes (`fsmStep`,
  `FsmState`, `FsmConfig`), mesma lógica ramo a ramo. O C++ usa `uint32_t`; em TS toda
  subtração de tempo é `(agora - t) >>> 0` e todo incremento é `(t + n) >>> 0`. Sem isso o
  caso do estouro do `millis()` quebra.
- **`fsm.test.ts`: porte dos 9 casos de `firmware/test/fsm_test.cpp`**, com os mesmos nomes
  e valores, incluindo o helper `rodar` (passos de 100 ms, iterando por contagem de passos e
  não por `t < fim`). É a prova de que o Demo se comporta como o firmware.
- Decisão idêntica a `taskDecisao` de `main.cpp`:
  `luz = ocupado && lux < luxLimiar`; `hvac = ocupado && temperatura != null && temperatura > tempAlvo`.
- Ciclo de decisão a cada 100 ms; publica a cada 2 s **e** a cada mudança; `seq` crescente;
  `ts = Date.now()`; `dispositivo = "sala01"`.
- Conecta no broker embutido como cliente MQTT comum (mesmo caminho de um dispositivo real) e
  assina `<raiz>/sala01/config`, aplicando os campos como o `onConfig` do firmware.
- Ambiente inicial: 28 °C, 55 %, 120 lux. Pulso de PIR fica alto por 5 s (igual ao
  `delayTime` do `diagram.json`).
- O relógio é injetável (`agora: () => number`) para os testes não dependerem de tempo real.

### 6.6 Dashboard

Três telas, navegação lateral simples, seletor de dispositivo no topo, indicador de conexão
(WebSocket e broker) sempre visível.

**Controladora** (tela inicial)
- Diagrama SVG: placa ESP32 no centro; à esquerda PIR, DHT22 e LDR; à direita a lâmpada (LED
  amarelo, "Luz (relé)") e o ar (LED azul, "HVAC (IR)"); fios ligando aos pinos 27, 15, 34, 26
  e 25 (rótulos dos pinos visíveis — o diagrama vai para o Cap. 3).
- Vivo: PIR pulsa quando `pir = true`; LEDs acendem com `luz`/`hvac`; valores de temperatura,
  umidade e lux ao lado de cada sensor.
- Ao lado, a **FSM da Figura 3**: os três estados como nós, o atual destacado, a transição
  animando quando o estado muda. Em `OCUPADO` sem movimento, contador regressivo do
  `tOcupadoMs`. O nó `CONFIRMANDO` aparece esmaecido quando `janelaConfMs = 0`.
- Clicar num componente abre um painel com o ajuste dele e publica a config: PIR →
  `tOcupadoMs`, `janelaConfMs`, `pulsosConf`; LDR → `luxLimiar`; DHT22/HVAC → `tempAlvo`.
- **Só no modo Demo:** clicar no PIR injeta movimento; sliders de temperatura, umidade e lux.
  Fora do Demo esses controles não aparecem (o dispositivo real não é comandável assim).
- Painel de log MQTT (últimas 200 mensagens, entrada/saída, pausar, limpar).

**Histórico**
- Recharts: temperatura e lux no tempo, com as linhas de `tempAlvo` e `luxLimiar`; faixa de
  ocupação (estado no tempo); faixas de luz e HVAC ligados.
- Períodos: 15 min, 1 h, 24 h, tudo. Cartões com as métricas da 5.4. Botão **Exportar CSV**.

**Configurações**
- Modo do broker (embutido/externo) com host, porta e raiz; liga/desliga Demo; mostra o
  endereço para abrir no celular (`http://<ip-da-máquina>:<porta>`) e as portas em uso.

Requisitos de UI: funcionar de 1024 px para cima e de forma utilizável em 380 px (celular);
tema claro e escuro por `prefers-color-scheme`; foco visível e controles alcançáveis por
teclado; estados de "sem dados ainda" e "desconectado" tratados, nunca tela em branco.

### 6.7 Desktop (Electron)

- `main.ts`: sobe `criarServidor({ dirDados: app.getPath('userData'), dirEstatico })`, cria a
  janela apontando para `servidor.url`, e chama `servidor.parar()` no `before-quit`.
- Em desenvolvimento, a janela carrega o Vite (`http://localhost:5173`) e o Vite faz proxy de
  `/api` e `/ws` para o backend.
- Instância única (`requestSingleInstanceLock`). Links externos abrem no navegador do sistema.
- **Build do main com `tsup`, formato CJS, empacotando `@tcc/backend` e `@tcc/contrato` num
  arquivo só** (externo: apenas `electron`). Assim o app não precisa de `node_modules` dentro
  do pacote, o que evita os problemas conhecidos de symlinks do pnpm com o electron-builder.
- `electron-builder`: `appId` `br.unip.tcc.automacao`, `productName` `TCC Automação`; build do
  dashboard em `extraResources`; alvos `dmg` (mac arm64), `nsis` (win x64), `AppImage` (linux x64).
- Sem assinatura: no macOS o primeiro uso exige "Abrir" pelo menu de contexto — documentar.

## 7. Mudanças no firmware e na infra

- `firmware/include/config.h`: novo `#define TOPIC_RAIZ "tcc-unip-7f3a9c"`; `TOPIC_ESTADO` e
  `TOPIC_CONFIG` passam a usar `TOPIC_RAIZ "/" DEVICE_ID "/..."`; `MQTT_HOST` vira
  `"broker.hivemq.com"`. Atualizar o comentário (sai a menção a VS Code/Private Gateway).
- `firmware/wokwi.toml`: remover o bloco `[net] gateway = true` e o comentário dele (é recurso
  da extensão).
- `docker-compose.yml`: remover o serviço `influxdb` e o volume; manter o `mosquitto` (serve
  para testar o modo "broker externo" localmente). `.env.example`: sai o bloco `INFLUX_*`,
  entra `WOKWI_CLI_TOKEN=` vazio. `package.json` da raiz: ajustar os scripts (ver T9).
- **Orçamento do Wokwi:** no máximo **3 execuções de 30 s** para validar. Se der `code 1006`,
  repetir uma vez. Não deixar simulação rodando sem `--timeout`.

## 8. Documentação (no mesmo trabalho, não depois)

- `docs/decisoes.md` — acrescentar, no formato contexto → decisão → consequência (não
  reescrever as entradas antigas; a D01 continua como histórico):
  - **D09** Wokwi CLI no lugar da extensão do VS Code; firmware com broker público e raiz única.
  - **D10** App Electron como forma de entrega (sem hospedagem, sem instalação de dependências).
  - **D11** Broker embutido (Aedes) no lugar do Mosquitto obrigatório; mesmo protocolo, Mosquitto continua como opção externa.
  - **D12** SQLite no lugar do InfluxDB (banco embutível; CSV atende à exportação do Cap. 4).
  - **D13** Express + WebSocket mantidos dentro do Electron em vez de IPC (preserva as Figuras 2 e 3; abre no celular).
  - **D14** Modo Demo: FSM portada para TypeScript e validada pelos mesmos 9 casos do C++. Métricas do Cap. 4 vêm do firmware real, não do simulador.
- `AGENTS.md` — atualizar **Estrutura**, **Comandos**, a stack citada na **Regra de ouro**
  (apontando para D10–D13) e a seção **Atenção** (sai VS Code/Private Gateway; entra Wokwi
  CLI, token, limite de 50 min e broker público). `CLAUDE.md` é só `@AGENTS.md`: não mexer.
- `README.md` — como rodar em desenvolvimento, como gerar o instalador, como validar o firmware.
- `docs/TCC.md` — marcar no roadmap o que foi concluído e ajustar os itens que citam InfluxDB.

## 9. Tarefas (em ordem)

Cada tarefa termina com `pnpm -r typecheck` e `pnpm -r test` passando.

**T1 — Workspace.** Criar os 4 pacotes com `package.json`, `tsconfig` (um `tsconfig.base.json`
na raiz, `strict: true`) e scripts `dev`, `build`, `typecheck`, `test`. Remover `apps/.gitkeep`.
**VERIFICAR** como o pnpm instalado (v11) libera scripts de instalação de dependências: o
`electron` e o `esbuild` precisam rodar o pós-instalação (o do Electron baixa o binário) e o
pnpm bloqueia isso por padrão.
*Aceite:* `pnpm install` limpo; `pnpm -r typecheck` passa.

**T2 — Contrato e portão do SQLite.** Esquemas zod e tipos da seção 5 em `@tcc/contrato`.
Rodar o portão da 6.4 nos dois ambientes e registrar o resultado.
*Aceite:* testes do esquema (payload válido, `temperatura: null`, `estado` inválido rejeitado);
decisão do banco tomada com evidência.

**T3 — FSM em TypeScript.** `fsm.ts` + `fsm.test.ts` (6.5).
*Aceite:* os 9 casos passam com os mesmos nomes do C++; `pnpm test:fsm` (C++) continua passando.

**T4 — Núcleo do backend.** `criarServidor`, broker embutido, cliente MQTT, armazenamento,
métricas, configurações, fallback de porta.
*Aceite:* testes unitários de latência (`ts = 0` → `null`), de perda (lacuna, sequência normal,
reinício com `seq` menor) e de ida e volta no armazenamento; teste de integração que sobe o
servidor em portas efêmeras, publica um `estado` por um cliente MQTT e confere a linha no
banco e a mensagem no WebSocket; `parar()` encerra sem deixar handles abertos.

**T5 — REST, CSV e simulador.** Rotas da 5.2 e o dispositivo simulado ligado às rotas de demo.
*Aceite:* teste de integração com relógio injetado: liga o demo, injeta PIR, observa
`OCUPADO` com `luz = true` (120 lux < 300) e `hvac = true` (28 °C > 26); publica
`tempAlvo = 30` e observa `hvac = false`; `export.csv` devolve cabeçalho + linhas; rota de
demo com demo desligado → 409.

**T6 — Dashboard.** As três telas da 6.6, contra o backend standalone.
*Aceite:* com `pnpm dev`, abrir no navegador e **exercitar de verdade**: clicar no PIR, ver
FSM, LEDs e log reagirem; mudar `tempAlvo` pelo painel; conferir Histórico e o CSV baixado;
derrubar o backend e ver o estado "desconectado"; conferir 380 px e tema escuro.

**T7 — Desktop.** Casca Electron em desenvolvimento e empacotada.
*Aceite:* `pnpm --filter @tcc/desktop dev` abre a janela funcionando; `pnpm --filter @tcc/desktop dist`
gera o `.dmg`; **abrir o app empacotado** (não o de desenvolvimento), usar o Demo, fechar,
reabrir e confirmar que o histórico persiste.

**T8 — Firmware no broker público.** Mudanças da seção 7; `cd firmware && pio run`.
*Aceite:* com um assinante aberto antes
(`docker exec tcc-mosquitto mosquitto_sub -h broker.hivemq.com -t 'tcc-unip-7f3a9c/#' -v -C 2 -W 60`),
rodar `wokwi-cli firmware --timeout 30000 --timeout-exit-code 0` e ver `[mqtt] conectado` na
serial e 2 mensagens `estado` no assinante. Depois, com o app em modo externo
(`broker.hivemq.com`, 1883, `tcc-unip-7f3a9c`), ver os dados chegarem na tela Controladora.
Guardar a saída serial e um print: é evidência do Cap. 3.

**T9 — Infra, scripts e documentação.** `docker-compose`, `.env.example`, scripts da raiz
(`dev` = backend + dashboard juntos; `desktop:dev`; `desktop:dist`; `firmware:build`;
`firmware:sim`; manter `test:fsm`, `infra:up`, `infra:down`, `mqtt:sub`) e toda a seção 8.
*Aceite:* um leitor que siga só o `README.md` consegue rodar em desenvolvimento e gerar o instalador.

**T10 (opcional, pode ficar para a postagem 2) — CI dos instaladores.** Workflow do GitHub
Actions com matriz macOS/Windows/Linux publicando os artefatos de `desktop:dist`.

## 10. Testes e verificação

- Testar contratos, não implementação: esquema, cálculo de latência e perda, FSM, persistência,
  e os dois testes de integração (T4, T5). Não criar teste que só confirma que um mock foi chamado.
- Testes de integração usam portas efêmeras e `dirDados` temporário; nunca tocam em `.dados/`
  nem no `userData` real.
- Afirmar que a UI funciona exige **interagir com ela** e olhar o resultado renderizado —
  typecheck e página carregando não bastam. O mesmo vale para o app empacotado na T7.
- Se algo falhar fora do escopo da tarefa, reproduzir e relatar com evidência; não "consertar"
  reescrevendo código alheio.

## 11. Riscos conhecidos

| Risco | Tratamento |
|---|---|
| `node:sqlite` não funcionar no Electron | Portão na T2 + plano B isolado atrás de `Armazenamento` (6.4) |
| pnpm bloquear o pós-instalação do Electron | Verificar na T1 |
| electron-builder × symlinks do pnpm | Main empacotado num arquivo só (6.7); se ainda falhar, `node-linker=hoisted` em `.npmrc` |
| Porta 1883/3000 ocupada | Fallback para porta livre (6.1) |
| Broker público instável ou com terceiros publicando | Raiz única; validar payload com zod; alternativa `test.mosquitto.org` |
| Latência via Wokwi inclui internet + nuvem | Declarar no texto; medir o pipeline local separadamente com o Demo |
| Estourar os 50 min/mês do Wokwi | Sempre `--timeout`; no máx. 3 execuções na T8 |
| Prazo: 1ª postagem fecha em 28/09/2026 | T1–T6 já dão "protótipo funcional básico"; T7–T9 em seguida; T10 depois |
