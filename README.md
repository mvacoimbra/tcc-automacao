# TCC — Controle de iluminação e temperatura baseado em presença

Protótipo do Trabalho de Curso (TC II) de Ciência da Computação — UNIP, polo Anápolis.
Autores: Alex Gabriel Alves Machado e Gabriel Pio da Silva.
Orientadora: Profa. Dra. Vanessa Santos Lessa.

Implementa o modelo arquitetural preliminar (Figuras 2 e 3 do pré-projeto) como prova de
conceito, confrontada com uma revisão integrativa de literatura. O sistema roda inteiro
num app desktop: broker MQTT, backend, banco e dashboard, com um dispositivo simulado
(modo Demo) que usa a mesma máquina de estados do firmware.

- Contexto acadêmico, cronograma e roadmap: [`docs/TCC.md`](docs/TCC.md)
- Registro de decisões técnicas: [`docs/decisoes.md`](docs/decisoes.md)
- Requisitos do app: [`docs/PRD-app-desktop.md`](docs/PRD-app-desktop.md)
- Instruções para agentes de código: [`AGENTS.md`](AGENTS.md)
- Pré-projeto e manual: [`docs/referencias/`](docs/referencias/)

```
firmware/        ESP32 + FreeRTOS (simulado no Wokwi)
apps/contrato    esquemas e tipos compartilhados (zod)
apps/backend     broker MQTT embutido, SQLite, REST, WebSocket, modo Demo
apps/dashboard   React + Recharts
apps/desktop     app Electron e instalador
infra/           Mosquitto (opcional)
docs/            contexto do TCC, decisões, evidências e PDFs de referência
```

## Pré-requisitos

- Node 24 (`.nvmrc`) e pnpm 11
- Para o firmware: PlatformIO (`pio`) e `wokwi-cli`
- Opcional: Docker, para o Mosquitto local

## Desenvolvimento

```bash
pnpm install
pnpm --filter @tcc/desktop exec install-electron   # baixa o binário do Electron
pnpm dev            # backend em :3000 + dashboard em http://localhost:5173
pnpm desktop:dev    # o mesmo dentro da janela do Electron
```

Em desenvolvimento os dados ficam em `apps/backend/.dados/` (`pnpm dev`) ou na pasta de
dados do app (`pnpm desktop:dev`). Com o modo Demo ligado (padrão), clique no PIR do
diagrama para simular movimento.

Testes:

```bash
pnpm typecheck && pnpm test   # pacotes TypeScript
pnpm test:fsm                 # máquina de estados do firmware (g++)
```

## Baixar o instalador

Os instaladores ficam nas [Releases](https://github.com/mvacoimbra/tcc-automacao/releases)
do repositório: `.dmg` para macOS (Apple Silicon) e `-setup.exe` para Windows (x64).
Nenhum dos dois é assinado:

- **macOS:** arraste o app para Aplicativos e abra pelo menu de contexto (botão direito →
  **Abrir**). Se o macOS disser que o app "está danificado", rode
  `xattr -dr com.apple.quarantine "/Applications/TCC Automacao.app"`.
- **Windows:** no aviso do SmartScreen, clique em **Mais informações** → **Executar assim mesmo**.

## Gerar o instalador localmente

```bash
pnpm desktop:dist
```

Gera o instalador do sistema atual em `apps/desktop/release/`
(ex.: `tcc-automacao-0.1.0-macos-arm64.dmg`). No macOS, o histórico fica em
`~/Library/Application Support/@tcc/desktop/`, a mesma pasta usada por `pnpm desktop:dev`.

### Publicar uma versão (CI)

O workflow `.github/workflows/instaladores.yml` roda os testes a cada push e gera os
instaladores de macOS e Windows no GitHub Actions:

```bash
gh workflow run instaladores.yml      # só gera (artefatos na página da execução)
git tag v0.1.0 && git push origin v0.1.0   # gera e publica uma Release
```

A tag precisa ser igual à `version` de `apps/desktop/package.json`.

O app usa a porta HTTP 3000 e o broker MQTT na 1883; se alguma estiver ocupada, sobe
em outra porta livre e mostra qual na tela **Configurações**, junto com o endereço
para abrir o dashboard no celular da mesma rede.

## Firmware no Wokwi

O firmware publica em `broker.hivemq.com` (público) com a raiz `tcc-unip-7f3a9c`.

```bash
cp .env.example .env         # preencha WOKWI_CLI_TOKEN (wokwi.com/dashboard/ci)
pnpm firmware:build
pnpm firmware:sim            # simula por 30 s; a serial mostra "[mqtt] conectado"
```

Para ver os dados no app: **Configurações** → broker externo, host `broker.hivemq.com`,
porta 1883, raiz `tcc-unip-7f3a9c`. Também dá para abrir `firmware/diagram.json` no
VS Code com a extensão Wokwi e clicar no PIR ou mexer nos sliders do DHT22 e do LDR.

### Ajuste de parâmetros em tempo real

Pelo app (clique num componente do diagrama) ou direto no broker:

```bash
pnpm infra:up      # Mosquitto local, só para ter o mosquitto_pub à mão
docker exec tcc-mosquitto mosquitto_pub -h broker.hivemq.com \
  -t tcc-unip-7f3a9c/sala01/config -m '{"tOcupadoMs":10000,"janelaConfMs":10000,"pulsosConf":2}'
pnpm mqtt:sub:publico   # acompanha tcc-unip-7f3a9c/#
```
