# Registro de decisões técnicas

Formato: contexto → decisão → consequência. Cada entrada é candidata a texto do Cap. 3
("desafios encontrados e como foram superados").

## D01 — Simulação no Wokwi em vez de hardware físico
- **Contexto:** prazo de 6 semanas e ausência de hardware.
- **Decisão:** ESP32 simulado no Wokwi (extensão VS Code + PlatformIO).
- **Consequência:** reprodutível por qualquer avaliador; perde ruído real dos sensores e o IR.

## D02 — FSM isolada do hardware
- **Contexto:** a lógica de ocupação é o núcleo do trabalho e precisa ser validada.
- **Decisão:** `occupancy_fsm.h` sem dependência de Arduino, testado com g++ no PC.
- **Consequência:** testes rápidos e determinísticos; o mesmo código roda no ESP32.

## D03 — Janela de confirmação opcional
- **Contexto:** a seção 2.5 do TC I cita janelas de confirmação contra falsos positivos, mas a Figura 3 não as representa.
- **Decisão:** estado `CONFIRMANDO` ativado por `janelaConfMs > 0`; com 0, o comportamento é idêntico à Figura 3.
- **Consequência:** permite comparar hipótese × ajuste no Cap. 4.

## D04 — Separação de núcleos
- **Contexto:** a pilha Wi-Fi pode bloquear; o controle não pode depender da rede.
- **Decisão:** comunicação no core 0; aquisição, decisão e atuação no core 1.
- **Consequência:** automação continua sem rede (decisão na borda).

## D05 — Sincronização entre tasks
- **Contexto:** três tasks acessam leituras e saídas compartilhadas.
- **Decisão:** mutex FreeRTOS com RAII (`Lock`); PubSubClient usado só pela task de comunicação (não é thread-safe).
- **Consequência:** sem condições de corrida; seções críticas curtas.

## D06 — Restrições de hardware do ESP32 / DHT22
- LDR no GPIO34 (ADC1): ADC2 fica indisponível com Wi-Fi ativo.
- DHT22 lido a cada 2 s: intervalo mínimo do sensor.
- `mqtt.setBufferSize(512)`: o padrão de 256 B descarta payloads maiores sem erro.

## D07 — Tempo e estouro do contador
- **Contexto:** `millis()` estoura em ~49,7 dias.
- **Decisão:** comparar sempre durações (`agora - t`) em `uint32_t`, nunca instantes absolutos.
- **Consequência:** coberto por teste. O próprio helper de teste tinha o bug (`t < fim`) e foi corrigido — exemplo concreto para o texto.

## D08 — Latência fim a fim
- **Decisão:** payload inclui `ts` (epoch ms via NTP) e `seq`; o backend calcula `recebidoEm - ts` e perdas por lacunas em `seq`.
- **Consequência:** métricas quantitativas para o Cap. 4, comparáveis à literatura.

## D09 — Firmware no broker público (HiveMQ), sem Private IoT Gateway
- **Contexto:** o firmware usava `host.wokwi.internal`, que só existe com o Private IoT Gateway da extensão do VS Code. A validação passou a ser feita pelo `wokwi-cli` no terminal, em que o ESP32 simulado só alcança a internet.
- **Decisão:** `MQTT_HOST = "broker.hivemq.com"` (porta 1883) e raiz de tópicos própria, `tcc-unip-7f3a9c` (`TOPIC_RAIZ` em `firmware/include/config.h`), porque o broker é compartilhado com o mundo todo. O `[net] gateway` saiu do `firmware/wokwi.toml`. O app recebe os dados no modo "externo" (Configurações: `broker.hivemq.com`, 1883, raiz `tcc-unip-7f3a9c`); o modo embutido continua usando a raiz `tcc`.
- **Evidência:** `docs/evidencias/2026-09-21-wokwi-serial.txt` (serial com `[mqtt] conectado` + duas mensagens `estado` recebidas por um assinante independente) e `docs/evidencias/2026-09-21-controladora-firmware-real.png` (app em modo externo exibindo `sala01` com os valores do firmware; latência medida de 2791 ms numa das leituras).
- **Consequência:** a validação do firmware não depende de VS Code nem de plano pago. Limitações a declarar no Cap. 4: a latência medida inclui a internet e a nuvem do Wokwi (simulação remota) e não representa uma rede local; o broker público é anônimo e sem TLS, e qualquer pessoa que conheça a raiz pode ler ou publicar nesses tópicos (segurança fora do escopo, seção 1.5 do TC I); `ts = 0` enquanto o NTP não sincroniza, e nessas leituras a latência fica indefinida.

## D10 — Aplicativo desktop (Electron) como forma de entrega do protótipo
- **Contexto:** o TC I descreve dashboard web + backend Node + broker + banco como serviços separados (Figura 2). Para a banca e para quem avalia o trabalho, subir Docker, broker e banco antes de ver o sistema funcionando é uma barreira; e sem hardware físico (D01) o protótipo precisa se demonstrar sozinho.
- **Decisão:** empacotar backend e dashboard num app Electron 44 (`apps/desktop`), distribuído como `.dmg` (macOS arm64; a config já declara NSIS/Windows e AppImage/Linux). O processo principal chama `criarServidor()` do `@tcc/backend`, com os dados em `userData`, e a janela carrega o próprio servidor HTTP local (D13). O firmware no Wokwi continua sendo o dispositivo de referência.
- **Consequência:** o sistema abre com duplo clique, sem instalar nada além do app, e a arquitetura das Figuras 2 e 3 é preservada dentro de um único processo (D11–D13). Limitações: o app não é assinado nem notarizado (no macOS, abrir pela primeira vez pelo menu de contexto → "Abrir"); só o instalador macOS arm64 foi gerado e testado.

## D12 — SQLite no lugar do InfluxDB
- **Contexto:** o TC I previa InfluxDB, mas o app precisa rodar sozinho, sem Docker (decisão D10). O InfluxDB é um servidor à parte e não pode ser embutido no aplicativo.
- **Decisão:** armazenar as leituras em SQLite (`node:sqlite`, módulo embutido no Node), em modo WAL, atrás do tipo `Armazenamento` (`apps/backend`). A exportação em CSV atende à necessidade de análise do Cap. 4.
- **Evidência (portão da seção 6.4 do PRD):** `apps/desktop/scripts/portao-sqlite.cjs` cria um banco temporário, ativa o WAL, insere uma linha com `temperatura` nula e a consulta. Resultado nos três ambientes, todos com `journal_mode=wal` e a linha recuperada intacta:
  - Node 24.20.0 (o do projeto, `.nvmrc`), sem flag;
  - Electron 44.4.3 como Node (`ELECTRON_RUN_AS_NODE=1`), Node 24.21.0 embutido;
  - processo principal do Electron 44.4.3 (após `app.whenReady()`), o ambiente real do app.

  Depois, no app empacotado (`.dmg`, Task 7 do plano), o histórico gravado persistiu entre fechar (Cmd+Q) e reabrir: 1717 leituras antes, as mesmas 1717 e novas depois (cenário TS-006).
- **Consequência:** sem módulo nativo, sem rebuild para o Electron e sem `node_modules` dentro do pacote. Limitação: a API `node:sqlite` ainda emite `ExperimentalWarning`; se mudar numa versão futura, só a implementação de `Armazenamento` precisa ser trocada (plano B: `better-sqlite3`, que exigiria `electron-builder install-app-deps` e sair do bundle único).

## D11 — Broker embutido (Aedes) no lugar do Mosquitto obrigatório
- **Contexto:** o TC I usa o Mosquitto como broker, mas o app precisa abrir com duplo clique, sem Docker nem instalação de serviços.
- **Decisão:** o backend sobe um broker MQTT Aedes 1.2.0 dentro do próprio processo (`apps/backend/src/broker.ts`), na porta 1883 (com fallback para uma porta livre). O backend fala com ele como qualquer cliente MQTT. O Mosquitto continua como opção: na tela Configurações o modo "externo" aponta para qualquer broker, e o `docker-compose.yml` mantém o serviço para testar isso localmente.
- **Consequência:** o caminho dos dados é o mesmo com broker embutido ou externo (dispositivo → MQTT → backend), e o firmware não muda. Limitações: o Aedes atende MQTT 3.1/3.1.1 (o suficiente para o PubSubClient do firmware) e, como a segurança em IoT está fora do escopo (seção 1.5 do TC I), o broker aceita conexões anônimas, sem TLS. A porta 1883 costuma estar ocupada durante o desenvolvimento pelo Mosquitto do Docker, por isso o fallback de porta é obrigatório.

## D13 — Express + WebSocket mantidos dentro do Electron, em vez de IPC
- **Contexto:** o Electron oferece IPC entre o processo principal e a janela, o que dispensaria servidor HTTP. Mas o modelo das Figuras 2 e 3 do TC I descreve backend Node/Express e dashboard alimentado por WebSocket.
- **Decisão:** manter Express (REST) e `ws` (WebSocket em `/ws`) dentro do processo principal. A janela do Electron é só um navegador apontado para o servidor local, sem IPC, sem `preload` e com `nodeIntegration` desligado (`contextIsolation` e `sandbox` ligados).
- **Consequência:** a arquitetura do TC I é preservada e o backend roda e é testado sozinho, sem Electron (`pnpm dev`). O mesmo dashboard abre no navegador e no celular da rede local, porque o Express escuta em `0.0.0.0`. Custo: as portas HTTP e MQTT ficam acessíveis na rede local, sem autenticação (fora do escopo, como em D11), e ambas precisam de fallback quando ocupadas.

## D14 — Modo Demo: FSM portada para TypeScript e validada pelos mesmos 9 casos
- **Contexto:** o app precisa demonstrar o sistema sem Wokwi, sem internet e sem hardware, mas a lógica de ocupação (Figura 3) é o núcleo do trabalho e não pode ser reinventada só para a demonstração.
- **Decisão:** o modo Demo é um dispositivo simulado em TypeScript (`apps/backend/src/simulador/`). A `fsm.ts` é um porte, ramo a ramo, de `firmware/include/occupancy_fsm.h`, com aritmética `uint32` (`>>> 0`) para reproduzir o estouro do `millis()`. O `fsm.test.ts` porta, com os mesmos nomes e valores, os 9 casos de `firmware/test/fsm_test.cpp`. O dispositivo simulado decide luz e HVAC como a `taskDecisao` do firmware, publica a cada 2 s e a cada mudança, e conecta ao broker embutido como cliente MQTT comum, aplicando a config recebida como o `onConfig` do firmware (campo a campo, ignorando o que tem tipo errado).
- **Consequência:** o Demo e o firmware compartilham a mesma máquina de estados, com o mesmo conjunto de testes nas duas linguagens. Limitação a declarar no Cap. 4: **as métricas de desempenho (latência, perda, tempo de resposta) vêm do firmware real rodando no Wokwi, não do simulador**, cujos números refletem apenas o pipeline local (um simulador em memória não tem ruído de sensor nem latência de rede real). Em relação ao firmware, o simulador publica a primeira leitura ao iniciar (o firmware só publica ~2 s depois do boot) para a tela não começar vazia.

## D15 — Nome de arquivo do app em ASCII ("TCC Automacao")
- **Contexto:** com `productName: TCC Automação`, o `.app` gerado pelo electron-builder 26.15.3 encerrava ao abrir (SIGTRAP no processo principal, antes de `app.whenReady()` resolver), enquanto o mesmo código funcionava em `pnpm dev`. No macOS, o electron-builder grava o nome do `.app`, do executável e dos Helpers normalizado em **NFD** ("ç" e "ã" viram letra + acento combinante; `builder-util/out/filename.js`), mas o `CFBundleName` do `Info.plist` fica em **NFC**. Diagnóstico: os binários eram idênticos (SHA-256) aos do Electron que funcionava; renomear só esses arquivos para NFC, sem mudar mais nada, fez o app abrir e iniciar os Helpers. Observado no macOS 27.0 beta (26A428). Antes de achar a causa, o erro foi atribuído ao `node:sqlite` (o relatório de falha, sem símbolos de depuração, apontava para ele) e o banco chegou a ser trocado por `better-sqlite3`; com a causa real corrigida, a troca foi desfeita e D12 vale como estava.
- **Decisão:** `productName: TCC Automacao` (sem acentos) em `apps/desktop/electron-builder.yml`, com `CFBundleDisplayName: TCC Automação` via `mac.extendInfo`. O título da janela e a interface continuam com acentos.
- **Consequência:** o `.app` e o `.dmg` aparecem no Finder como "TCC Automacao"; Dock, menu e janela mostram "TCC Automação". Sem scripts de contorno no empacotamento nem módulo nativo. Lição para o texto: um relatório de falha sem símbolos de depuração aponta para o símbolo exportado mais próximo, não necessariamente para o culpado.
