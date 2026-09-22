# CLAUDE.md

Este repositório é o **protótipo do Trabalho de Curso (TC II)** de Ciência da Computação
da UNIP (polo Anápolis). Não é um produto: todo código aqui vira evidência escrita no
texto do TCC (Cap. 3 – Desenvolvimento da solução e Cap. 4 – Resultados e discussão).

Leia `docs/TCC.md` antes de qualquer tarefa: contém o contexto acadêmico, o cronograma
de postagens, as decisões já tomadas e o roadmap.

## Tema

Sistema automatizado de controle de iluminação e temperatura baseado em presença.
Método: **revisão integrativa de literatura + prova de conceito**. O protótipo implementa
o modelo arquitetural preliminar do TC I (hipótese); a revisão confronta essa hipótese;
os ajustes no protótipo são o resultado dessa confrontação.

## Regra de ouro

**Não mudar a arquitetura das Figuras 2 e 3 do TC I sem registrar o motivo.** Toda
divergência do modelo preliminar precisa estar em `docs/decisoes.md` (vira texto do TCC).
A stack é a que o TC I declarou: ESP32 + FreeRTOS, MQTT, Node + Express,
React + TypeScript + Recharts + WebSocket — com as divergências já registradas:
app Electron como entrega (D10), broker Aedes embutido no lugar do Mosquitto
obrigatório (D11), SQLite embutido como banco das leituras (D12), Express + WebSocket dentro do
Electron em vez de IPC (D13) e firmware no broker público (D09).

## Estrutura

```
firmware/        ESP32 (C++/Arduino/FreeRTOS), simulado no Wokwi via PlatformIO
  include/occupancy_fsm.h   FSM pura, sem hardware — testável no PC
  include/config.h          pinos, broker, tópicos, parâmetros
  src/main.cpp              4 tasks: aquisição, decisão, atuação, comunicação
  test/fsm_test.cpp         testes da FSM (g++)
apps/
  contrato/      @tcc/contrato — esquemas zod e tipos (MQTT, REST, WebSocket)
  backend/       @tcc/backend — broker Aedes, cliente MQTT, SQLite, REST, WS, modo Demo
                 (src/simulador/fsm.ts é o porte da FSM do firmware, com os 9 casos)
  dashboard/     @tcc/dashboard — React + Recharts: Controladora, Histórico, Configurações
  desktop/       @tcc/desktop — casca Electron + electron-builder (.dmg)
infra/           configuração do Mosquitto (opcional, para o modo "broker externo")
docs/            contexto do TCC, decisões, planos, evidências, PDFs de referência
```

## Comandos

```bash
pnpm install
pnpm --filter @tcc/desktop exec install-electron   # baixa o binário do Electron
pnpm dev               # backend :3000 + dashboard (Vite) :5173 no navegador
pnpm desktop:dev       # mesmo, dentro da janela do Electron
pnpm desktop:dist      # instalador do SO atual em apps/desktop/release/ (.dmg no macOS, -setup.exe no Windows)
pnpm typecheck && pnpm test && pnpm test:fsm
pnpm firmware:build    # cd firmware && pio run
pnpm firmware:sim      # wokwi-cli por 30 s (precisa de WOKWI_CLI_TOKEN no .env)
pnpm infra:up          # Mosquitto :1883 (opcional)
pnpm mqtt:sub          # observar tcc/# no Mosquitto local
pnpm mqtt:sub:publico  # observar tcc-unip-7f3a9c/# no broker.hivemq.com
```

CI (`.github/workflows/instaladores.yml`): testes a cada push/PR; instaladores macOS
(arm64) e Windows (x64) sob demanda (`gh workflow run instaladores.yml`) ou numa tag
`v<versão>` igual à de `apps/desktop/package.json`, que publica uma Release.

## Contrato MQTT

Raiz `<raiz>` = `tcc` no broker embutido do app; `tcc-unip-7f3a9c` no broker público
(`broker.hivemq.com`), usada pelo firmware (D09).

- `<raiz>/<dispositivo>/estado` (ESP32 → broker), a cada 2 s e a cada mudança:
  ```json
  { "dispositivo": "sala01", "seq": 42, "ts": 1790000000000, "estado": "OCUPADO",
    "pir": true, "temperatura": 28.0, "umidade": 55.0, "lux": 120.5,
    "luz": true, "hvac": true }
  ```
  `ts` = epoch ms via NTP (0 se não sincronizado). `seq` detecta perda de mensagens.
- `<raiz>/<dispositivo>/config` (broker → ESP32), campos opcionais:
  `tOcupadoMs`, `janelaConfMs`, `pulsosConf`, `luxLimiar`, `tempAlvo`.

## Convenções

- Gerenciador de pacotes: **pnpm** (workspace em `apps/*`). Nunca npm.
- TypeScript: usar **`type`**, nunca `interface`. `strict: true`.
- Textos, logs e comentários em **português** (o código é citado no TCC).
- Nomes de identificadores podem ficar em português quando representam conceitos
  do domínio do TCC (estado, ocupado, leituras), mantendo consistência com o firmware.
- Mudanças relevantes: registrar em `docs/decisoes.md` com contexto → decisão → consequência.
- Métricas para o Cap. 4 devem ser exportáveis (CSV: `GET /api/dispositivos/:id/export.csv`).

## Atenção

- Wokwi: validação pelo `wokwi-cli` (token em `.env`, `WOKWI_CLI_TOKEN`). O plano
  gratuito tem ~50 min/mês: sempre `--timeout`, execuções curtas. O ESP32 simulado só
  alcança a internet, por isso o firmware usa `broker.hivemq.com` (público, sem TLS nem
  autenticação) com a raiz única `tcc-unip-7f3a9c`; o app recebe no modo "externo".
- A latência medida via Wokwi inclui internet + nuvem do Wokwi (limitação em D09).
- macOS: o nome de arquivo do app é "TCC Automacao" (sem acentos) por causa de um
  crash com nomes em NFD gerados pelo electron-builder (D15). Não reintroduzir acentos
  no `productName`.
- ESP32: LDR precisa ficar em pino ADC1 (ADC2 não funciona com Wi-Fi).
- O LED azul representa o comando IR (não simulável no Wokwi) — limitação declarada.
