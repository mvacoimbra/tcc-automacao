# Contexto acadêmico do TCC

## Identificação

- **Instituição:** UNIP – Universidade Paulista, Ciências da Computação, Polo Anápolis
- **Autores:** Alex Gabriel Alves Machado; Gabriel Pio da Silva
- **Orientadora:** Profa. Dra. Vanessa Santos Lessa
- **Título:** Sistema automatizado de controle de iluminação e temperatura baseado em presença
- **Referências:** `docs/referencias/TC1_pre-projeto.pdf` e `docs/referencias/Manual_TC2_UNIP.pdf`

## Do TC I para o TC II

O TC I propôs uma **revisão integrativa pura**, sem protótipo (seção 1.5). O Manual do TC II
e o cronograma de postagens, porém, exigem desenvolvimento da solução, protótipo funcional,
dados práticos, plano de testes, código-fonte, documentação técnica e manual do usuário.

**Decisão:** revisão integrativa + prova de conceito.

1. O modelo preliminar do TC I (Figuras 2 e 3) é a **hipótese**; o protótipo a implementa.
2. A revisão integrativa confronta a hipótese com a literatura (2016–2026).
3. Ajustes no protótipo derivados da revisão = resultado.
4. Cap. 4 compara protótipo inicial × ajustado × valores da literatura.

O tema é o mesmo do TC I (exigência do manual). A seção 1.5 (delimitação) precisa ser
reescrita e a mudança comunicada à orientadora na 1ª postagem.

## Cronograma de postagens (AVA)

| Postagem | Período | Mínimo requerido |
|---|---|---|
| 1ª | 21/09 – 28/09/2026 | Documentação do processo de desenvolvimento, desafios e como foram superados; protótipo funcional básico |
| 2ª | 13/10 – 19/10/2026 | Resultados iniciais, coleta e tratamento de dados concluídos; ajustes no protótipo; plano de testes |
| 3ª | 27/10 – 03/11/2026 | Trabalho completo; metodologia, experimentos, análise dos resultados; ajustes no protótipo; feedback/usabilidade; código-fonte, documentação técnica e manual do usuário |

Mínimo de 3 postagens no TC II regular, sendo a última obrigatória. **Entrega final: 03/11/2026.**

## Estrutura exigida pelo manual

60–70 páginas no total (incluindo pré-textuais); 50–60 de conteúdo. Referências, apêndices
e anexos não contam. Arial ou Times 12, espaçamento 1,5; resumo ~300 palavras, espaçamento simples.

| Parte | Conteúdo | Páginas (meta) |
|---|---|---|
| Pré-textuais | capa, folha de rosto, epígrafe, resumo, abstract, listas, sumário | 8–10 |
| Introdução | **texto corrido**: contexto, tema, delimitação, problema, hipóteses, objetivos (específicos em itens), justificativa | 5 |
| Cap. 1 – Referencial teórico | mínimo **10 autores** diferentes | 10–12 |
| Cap. 2 – Método | metodologia, tipo de pesquisa, universo e amostra, coleta, tratamento dos dados | 6–8 |
| Cap. 3 – Desenvolvimento | contexto, requisitos (RF/RNF), arquitetura com diagramas, tecnologias justificadas pelo Cap. 1, passo a passo, trechos de código | 15–18 |
| Cap. 4 – Resultados e discussão | gráficos/tabelas, comparação com hipóteses e literatura, limitações, trabalhos futuros | 10–12 |
| Considerações finais | | 3 |
| Apêndices | protocolo de extração (Apêndice A do TC I), código, documentação técnica, manual do usuário | — |

Critérios de banca incluem "consistência das respostas às arguições": os autores
precisam dominar cada decisão técnica. Plágio reprova.

## Pendências do texto herdadas do TC I

- [ ] Introdução: remover subseções 1.1–1.6 (manual pede texto corrido) e incluir **hipóteses**
- [ ] Seção 1.5: reescrever delimitação (agora há protótipo)
- [ ] Referencial: citar ≥ 10 autores; hoje ~7–8. Faltam fontes para MQTT, ESP32 e a frase sobre sistemas híbridos (2.2)
- [ ] 2.2 e 2.5 afirmam "trabalhos analisados" / "predominante nos estudos analisados" antes da análise — ajustar ao que a revisão encontrar
- [ ] Referência Radioenge: "Acesso em: maio 2026" num documento de março de 2026
- [ ] Figura 1 atribuída ao HC-SR501, mas a imagem é de um sensor PIR comercial de parede
- [ ] Figura 4 é tabela → "Quadro" (ABNT)
- [ ] Conferir na fonte os números do DOE 2012 (20–60% iluminação, 15–40% climatização)
- [ ] Capa: sobrenome em maiúsculas (Alex Gabriel Alves MACHADO)
- [ ] Todo o texto do futuro para o passado ("serão selecionados" → "foram selecionados")
- [ ] Remover cronograma (3.6) e substituir Cap. 4 do TC I por Resultados e discussão

## Roadmap técnico

### Postagem 1 (até 28/09)
- [x] Monorepo pnpm, docker-compose (Mosquitto, opcional)
- [x] Firmware: 4 tasks FreeRTOS, FSM da Figura 3, MQTT, config remota
- [x] Testes da FSM no PC (inclui estouro do `millis()`)
- [x] Compilar e rodar o firmware no Wokwi (`wokwi-cli`, broker público — D09; evidência em `docs/evidencias/`)
- [x] `apps/backend`: Node + Express + TS — broker Aedes embutido, assina `<raiz>/+/estado`, grava no SQLite (D12), calcula latência (`recebidoEm - ts`), detecta perda por `seq`, expõe REST + WebSocket + CSV; modo Demo com a FSM portada (D14)
- [x] `apps/dashboard`: React + TS + Recharts — Controladora (diagrama do circuito e da FSM), Histórico (gráficos, métricas, CSV), Configurações
- [x] App desktop Electron com instalador `.dmg` (D10, D15)
- [ ] Prints/diagramas para o Cap. 3
- [ ] Rascunho do Cap. 3

### Postagem 2 (13–19/10)
- [ ] Protocolo da revisão, busca e seleção (diagrama PRISMA), fichas do Apêndice A
- [ ] Plano de testes com cenários reproduzíveis (script que publica sequências de eventos)
- [ ] Métricas: latência fim a fim, perda de mensagens, taxa de falsos positivos da FSM (com e sem janela), tempo de resposta do acionamento, estimativa de tempo de luz/HVAC ligados
- [ ] Rascunho do Cap. 2 e resultados iniciais

### Postagem 3 (27/10–03/11)
- [ ] Ajustes no protótipo derivados da revisão (ex.: janela de confirmação, histerese no LDR, setback em vez de desligar)
- [ ] Teste de usabilidade do dashboard (SUS com poucos participantes)
- [ ] Documentação técnica e manual do usuário (apêndices)
- [ ] Texto completo, revisão ABNT

## Limitações do protótipo (declarar no texto)

- Simulação (Wokwi), sem hardware físico: sem ruído real de sensores
- Comando IR representado por LED
- Conversão LDR → lux pela fórmula do Wokwi, sem calibração
- Loop de realimentação luz → LDR não existe na simulação (em hardware real exigiria histerese)
- Segurança MQTT (TLS/autenticação) fora do escopo (seção 1.5 do TC I)
