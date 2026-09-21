# TCC — Controle de iluminação e temperatura baseado em presença

Protótipo do Trabalho de Curso (TC II) de Ciência da Computação — UNIP, polo Anápolis.
Autores: Alex Gabriel Alves Machado e Gabriel Pio da Silva.
Orientadora: Profa. Dra. Vanessa Santos Lessa.

Implementa o modelo arquitetural preliminar (Figuras 2 e 3 do pré-projeto) como prova de
conceito, confrontada com uma revisão integrativa de literatura.

- Contexto acadêmico, cronograma e roadmap: [`docs/TCC.md`](docs/TCC.md)
- Registro de decisões técnicas: [`docs/decisoes.md`](docs/decisoes.md)
- Instruções para o Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Pré-projeto e manual: [`docs/referencias/`](docs/referencias/)

```
firmware/   ESP32 + FreeRTOS (simulado no Wokwi)
infra/      configuração do Mosquitto
apps/       backend (Node/TS) e dashboard (React/TS) — próxima etapa
docs/       contexto do TCC, decisões e PDFs de referência
```

## Subir a infraestrutura

```bash
cp .env.example .env      # ajuste senha e token
pnpm infra:up             # Mosquitto :1883 + InfluxDB :8086
pnpm mqtt:sub             # acompanha as mensagens tcc/#
```

## Firmware

1. VS Code + extensões **PlatformIO** e **Wokwi Simulator**
2. `cd firmware && pio run` (compila)
3. Abrir `diagram.json` → Start Simulation
4. Clicar no PIR simula movimento; DHT22 e LDR têm sliders

Sem o Private Gateway, troque `MQTT_HOST` em `include/config.h` por `broker.hivemq.com`.

### Ajuste de parâmetros em tempo real

```bash
docker exec tcc-mosquitto mosquitto_pub -t tcc/sala01/config \
  -m '{"tOcupadoMs":10000,"janelaConfMs":10000,"pulsosConf":2}'
```

## Testes da máquina de estados (no PC)

```bash
pnpm test:fsm
```
