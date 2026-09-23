# PRD — Experimentos reprodutíveis no modo Demo

Documento para o Claude Code executar no repositório `tcc-automacao`.
Contexto acadêmico: `docs/TCC.md`. Decisões anteriores: `docs/decisoes.md`.

## 1. Problema

Os experimentos do Capítulo 4 do TCC existem, mas em dois mundos separados:

| Experimento | Onde roda hoje | Situação |
|---|---|---|
| CT-01 lógica de ocupação | `pnpm test`, `pnpm test:fsm` | OK |
| CT-02 a CT-05 funcionais | `docs/experimentos/funcional.py` contra a API do Demo | OK |
| CT-06 latência e perda | `curl` manual em `/api/.../metricas` | Sem script; janela de medição definida na mão |
| CT-07 falsos positivos/negativos | `docs/experimentos/ct07_falsos_positivos.cpp` (simulador C++ à parte) | Não reproduzível na demo |
| CT-09 estimativa de economia | `docs/experimentos/ct09_economia.cpp` (idem) | Não reproduzível na demo |

Três lacunas impedem CT-07 e CT-09 de rodarem na demo:

1. **Sem roteiro de movimentação.** `POST /api/demo/pir` dispara um pulso fixo de 5 s. Não há como descrever "entra às 8h, move-se a cada 8 s, sai às 12h".
2. **Sem controle de tempo.** O dispositivo simulado usa `setInterval` em tempo real. Uma jornada de 8 h levaria 8 h. O relógio já é injetável (`OpcoesDispositivoSimulado.agora`), mas só de dentro do processo, para os testes.
3. **Sem ocupação de referência.** O app não sabe quando o ambiente estava de fato ocupado, então não calcula falso positivo, falso negativo nem economia ante uma linha de base.

Além disso, a variante de confirmação avaliada no Capítulo 4 (aceitar ocupação com N bordas **ou** com o PIR em nível alto por mais de um limiar) existe apenas no arquivo do experimento, e não no firmware nem na FSM em TypeScript.

## 2. Objetivo

Permitir que **todos** os experimentos do Capítulo 4 sejam executados por um comando do repositório, sobre o mesmo código que roda no firmware e na demo, com saída em CSV/JSON pronta para o texto — sem hardware e sem depender do Wokwi.

## 3. Não objetivos

- Hardware físico, medição de consumo elétrico real e teste de usabilidade com pessoas. Continuam fora do escopo e declarados como limitações no TCC.
- Substituir o Wokwi: a execução do firmware real no simulador continua sendo a referência do dispositivo.
- Mudar a arquitetura das Figuras 2 e 3 do TC I (regra de ouro do `CLAUDE.md`).

## 4. Requisitos funcionais

### RF01 — Roteiro de cenário
Formato JSON declarativo, versionado em `docs/experimentos/roteiros/`:

```jsonc
{
  "nome": "CT-07 S3 permanencia com movimento continuo",
  "duracaoMs": 150000,
  "passoMs": 100,
  "config": { "tOcupadoMs": 30000, "janelaConfMs": 0, "pulsosConf": 1,
              "luxLimiar": 300, "tempAlvo": 26 },
  "ambienteInicial": { "temperatura": 28, "umidade": 55, "lux": 120 },
  "ocupacaoReal": [{ "de": 10000, "ate": 90000 }],
  "eventos": [
    { "t": 10000, "ate": 90000, "movimentoACada": 500 },
    { "t": 60000, "ambiente": { "lux": 600 } },
    { "t": 90000, "config": { "tempAlvo": 30 } }
  ]
}
```

- `ocupacaoReal` é a referência para as métricas de erro; opcional.
- `movimentoACada` gera movimentos periódicos; um evento sem `ate` é um movimento único.
- O modelo do PIR permanece o do diagrama do Wokwi: saída alta por 5 s após o último movimento, redisparável. O tempo de retenção deve ser um parâmetro do roteiro (`retencaoPirMs`, padrão 5000) para permitir estudos de sensibilidade.

### RF02 — Execução determinística com relógio virtual
Criar `apps/backend/src/simulador/roteiro.ts`, que executa o roteiro passo a passo com relógio virtual, sem `setInterval` e sem esperar tempo real. Para isso, extrair de `dispositivo.ts` um núcleo puro (`passoDispositivo(estado, entradas, agora)`) reutilizado pelos dois caminhos: o dispositivo em tempo real (modo Demo atual) e o executor de roteiro. O comportamento do dispositivo em tempo real não pode mudar.

### RF03 — Métricas do roteiro
Ao final da execução, produzir:

- latência, perda, tempo ligado e ocupação, reutilizando `calcularMetricas` de `metricas.ts`;
- **tempo ocupado indevidamente** (estado OCUPADO fora de `ocupacaoReal`), descontando a cauda intencional de `retencaoPir + tOcupado` após cada saída, que deve ser reportada em campo próprio (`caudaMs`);
- **tempo desocupado indevidamente** (ocupação real sem estado OCUPADO);
- **atraso até OCUPADO** a partir do primeiro movimento de cada bloco de ocupação;
- **tempo de atuador ligado** e **redução ante a linha de base**, definida como o atuador ligado durante toda a janela de operação do roteiro (acionamento manual).

### RF04 — Execução em lote e saída
`pnpm exp <arquivo-ou-pasta>` executa um roteiro ou todos os de uma pasta e grava em `docs/experimentos/resultados/<data>/`:

- `<roteiro>.csv` com uma linha por leitura, mesmas colunas do export atual;
- `<roteiro>.json` com as métricas do RF03;
- `resumo.csv` com uma linha por roteiro, pronto para virar tabela do TCC.

O comando deve ser determinístico: duas execuções com o mesmo roteiro produzem os mesmos números (exceto `recebidoEm`, que usa o relógio real).

### RF05 — Roteiros dos experimentos do Capítulo 4
Traduzir para roteiros JSON, com os valores hoje usados nos programas C++:

- **CT-07**: cenários S1 a S5 (passagem isolada; duas passagens com 60 s; permanência de 80 s com movimento contínuo; permanência com movimento a cada 8 s; permanência com pessoa parada) × configurações A, B, C, D.
- **CT-09**: jornada de 8 h nos perfis denso e esparso, configurações A e D.
- **CT-02 a CT-05**: os mesmos estímulos do `funcional.py`, para que os cenários funcionais também tenham forma declarativa.

### RF06 — Variante D no código de produção
Acrescentar à FSM o parâmetro `confirmacaoPorNivelMs` (0 = desativado): em `CONFIRMANDO`, a ocupação também é aceita quando o PIR permanece em nível alto por mais que esse tempo. Implementar nos dois lugares, mantendo a paridade exigida por D14:

- `firmware/include/occupancy_fsm.h` e `firmware/include/config.h`;
- `apps/backend/src/simulador/fsm.ts`;
- contrato (`apps/contrato`), rota de configuração e painel de ajuste do PIR no dashboard.

Adicionar casos de teste espelhados em C++ e TypeScript: nível sustentado confirma; nível sustentado menor que o limiar não confirma; com `confirmacaoPorNivelMs = 0` o comportamento é idêntico ao atual.

### RF07 — Script de latência (CT-06)
`pnpm exp:latencia --minutos 5` sobe o backend em modo Demo (ou usa um já em execução), marca o início da janela, aguarda, consulta `/metricas` e `/export.csv` para a janela exata e grava em `docs/experimentos/resultados/`. Deve registrar também qual caminho foi medido (broker embutido ou externo), porque a distinção é essencial no texto do Capítulo 4.

### RF08 — Disparo pela interface (opcional, menor prioridade)
Na tela Controladora, em modo Demo, um seletor de roteiro com botão "Executar" que roda o roteiro em tempo real (sem aceleração) e mostra o progresso. Serve para demonstração na banca; os números do TCC continuam vindo do RF04.

## 5. Requisitos não funcionais

- **RNF01 Paridade.** A lógica de ocupação continua idêntica entre C++ e TypeScript; qualquer mudança entra nas duas e nos dois conjuntos de teste.
- **RNF02 Sem regressão.** `pnpm typecheck`, `pnpm test` e `pnpm test:fsm` seguem verdes; o modo Demo em tempo real não muda de comportamento.
- **RNF03 Convenções.** pnpm, TypeScript com `type` (nunca `interface`), textos e identificadores de domínio em português, validação de entrada com zod no contrato.
- **RNF04 Reprodutibilidade.** Roteiros e resultados versionados no repositório; cada tabela do Capítulo 4 rastreável até um arquivo de resultado.
- **RNF05 Desempenho.** Uma jornada de 8 h com passo de 500 ms deve executar em poucos segundos.

## 6. Critérios de aceitação

1. `pnpm exp docs/experimentos/roteiros/ct07` reproduz a Tabela 2 do TCC, com estes valores de referência (segundos):

   | Cenário | A sem janela | B 2 bordas/10 s | C 2 bordas/20 s | D 2 bordas ou 7 s |
   |---|---|---|---|---|
   | S1 passagem isolada | 35,1 ocupado | 0 | 0 | 0 |
   | S2 duas passagens (60 s) | 70,1 ocupado | 0 | 0 | 0 |
   | S3 movimento contínuo 80 s | 0 desocupado | 80,0 desocupado | 80,0 desocupado | 6,9 desocupado |
   | S4 movimento a cada 8 s | 0 desocupado | 7,9 desocupado | 7,9 desocupado | 7,9 desocupado |
   | S5 pessoa parada | 45,0 desocupado | 80,0 desocupado | 80,0 desocupado | 80,0 desocupado |

2. `pnpm exp docs/experimentos/roteiros/ct09` reproduz a Tabela 3: redução de 9,0% (perfil denso, configuração A), 9,2% (denso, D), 65,2% (esparso, A) e 65,3% (esparso, D).
3. `pnpm exp:latencia --minutos 5` gera CSV e JSON com número de amostras, mínimo, média, p95, máximo e taxa de perda. Referência da execução de 22/09/2026 no pipeline local: 149 leituras, 0 / 0,77 / 1 / 3 ms, 0% de perda.
4. Os roteiros CT-02 a CT-05 reproduzem os resultados do `funcional.py`: desocupação em ~29 s com `tOcupadoMs` de 30 s e em ~9 s com 10 s; luz apagada acima de 300 lux; HVAC desligado com alvo de 30 °C.
5. Com `confirmacaoPorNivelMs = 0`, todos os resultados anteriores permanecem inalterados.
6. `docs/decisoes.md` ganha uma entrada (D16) registrando contexto, decisão e consequência da adoção do executor de roteiros e da variante de confirmação.

## 7. Impacto no texto do TCC

Depois de implementado, ajustar no TC II:

- seção 2.4.2: os cenários passam a ser roteiros declarativos executados pelo próprio sistema, e não por um programa externo em C++;
- seção 4.4: citar que a variante D passou a existir no firmware e na demo, e não apenas em simulação;
- Apêndice C: substituir a lista de programas avulsos pelos comandos `pnpm exp` e `pnpm exp:latencia`.

## 8. Ordem sugerida de implementação

1. RF06 (variante D com testes espelhados) — menor e destrava o restante.
2. RF02 e RF01 (núcleo puro + executor de roteiro).
3. RF03 e RF04 (métricas e CLI).
4. RF05 (roteiros do Capítulo 4) e validação contra os critérios de aceitação.
5. RF07 (latência) e, por último, RF08 (disparo pela interface).
