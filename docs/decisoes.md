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
