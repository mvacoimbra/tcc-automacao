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
A stack é a que o TC I declarou: ESP32 + FreeRTOS, MQTT (Mosquitto), Node + Express,
InfluxDB, React + TypeScript + Recharts + WebSocket.

## Estrutura

```
firmware/        ESP32 (C++/Arduino/FreeRTOS), simulado no Wokwi via PlatformIO
  include/occupancy_fsm.h   FSM pura, sem hardware — testável no PC
  include/config.h          pinos, tópicos, parâmetros
  src/main.cpp              4 tasks: aquisição, decisão, atuação, comunicação
  test/fsm_test.cpp         testes da FSM (g++)
infra/           configuração do Mosquitto
apps/            (a criar) backend e dashboard
docs/            contexto do TCC, decisões, PDFs de referência
```

## Comandos

```bash
cp .env.example .env
pnpm infra:up        # Mosquitto :1883 + InfluxDB :8086
pnpm mqtt:sub        # observar tcc/#
pnpm test:fsm        # testes da FSM no PC
cd firmware && pio run   # compilar firmware (ainda não compilado — validar primeiro)
```

## Contrato MQTT

- `tcc/<dispositivo>/estado` (ESP32 → broker), a cada 2 s e a cada mudança:
  ```json
  { "dispositivo": "sala01", "seq": 42, "ts": 1790000000000, "estado": "OCUPADO",
    "pir": true, "temperatura": 28.0, "umidade": 55.0, "lux": 120.5,
    "luz": true, "hvac": true }
  ```
  `ts` = epoch ms via NTP (0 se não sincronizado). `seq` detecta perda de mensagens.
- `tcc/<dispositivo>/config` (broker → ESP32), campos opcionais:
  `tOcupadoMs`, `janelaConfMs`, `pulsosConf`, `luxLimiar`, `tempAlvo`.

## Convenções

- Gerenciador de pacotes: **pnpm** (workspace em `apps/*`). Nunca npm.
- TypeScript: usar **`type`**, nunca `interface`. `strict: true`.
- Textos, logs e comentários em **português** (o código é citado no TCC).
- Nomes de identificadores podem ficar em português quando representam conceitos
  do domínio do TCC (estado, ocupado, leituras), mantendo consistência com o firmware.
- Mudanças relevantes: registrar em `docs/decisoes.md` com contexto → decisão → consequência.
- Métricas para o Cap. 4 devem ser exportáveis (CSV ou consulta Flux documentada).

## Atenção

- Wokwi: `MQTT_HOST = "host.wokwi.internal"` exige o Private IoT Gateway da extensão
  VS Code. Se indisponível no plano, usar `broker.hivemq.com` e o backend assina lá.
- ESP32: LDR precisa ficar em pino ADC1 (ADC2 não funciona com Wi-Fi).
- O LED azul representa o comando IR (não simulável no Wokwi) — limitação declarada.
