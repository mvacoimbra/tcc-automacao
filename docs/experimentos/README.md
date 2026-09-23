# Experimentos do Capítulo 4

Os experimentos rodam pelo próprio sistema, a partir de roteiros declarativos
(D16 em `docs/decisoes.md`). Os programas em C++ e o script em Python ficam aqui
como a referência de onde os números vieram.

## Como rodar

```bash
pnpm exp docs/experimentos/roteiros            # todos os roteiros
pnpm exp docs/experimentos/roteiros/ct07       # só o CT-07
pnpm exp:latencia --minutos 5                  # CT-06, no pipeline real
```

`pnpm exp` grava em `resultados/<data>/`: um `.csv` de leituras e um `.json` de
métricas por roteiro, mais um `resumo.csv` com uma linha por roteiro. É
determinístico: a mesma entrada dá os mesmos números.

| Roteiros | Experimento |
|---|---|
| `roteiros/funcionais/` | CT-02 a CT-05: ocupação, limiares de lux e temperatura, desocupação e configuração remota |
| `roteiros/ct07/` | CT-07: falsos positivos e negativos em 5 cenários × 4 configurações |
| `roteiros/ct09/` | CT-09: economia na jornada de 8 h, perfis denso e esparso, configurações A e D |

## Referência original

| Arquivo | O que faz | Como rodar |
|---|---|---|
| `funcional.py` | CT-02 a CT-05 contra a API do backend em modo Demo | `pnpm dev` e, em outro terminal, `python3 funcional.py` |
| `ct07_falsos_positivos.cpp` | CT-07 com o `occupancy_fsm.h` do firmware | `g++ -std=c++17 -Ifirmware/include docs/experimentos/ct07_falsos_positivos.cpp -o /tmp/ct07 && /tmp/ct07` |
| `ct09_economia.cpp` | CT-09, jornada de 8 h | `g++ -std=c++17 -Ifirmware/include docs/experimentos/ct09_economia.cpp -o /tmp/ct09 && /tmp/ct09` |
| `triagem.py` | Decisões de triagem da revisão e contagens do PRISMA | `python3 triagem.py` |

Resultados que esses programas produziram e que estão no texto: `ct07.csv`,
`ct09.csv`, `met_local.json` e `local_5min.csv` (5 min do pipeline local: 149
leituras, latência 0/0,77/1/3 ms, 0% de perda).

**Os roteiros reproduzem o CT-09 exatamente e o CT-07 com diferença de um passo
(0,1 s) em algumas células**, porque os programas em C++ acumulam o tempo num
`double` e o executor usa inteiros em milissegundos. A explicação está em D16.
