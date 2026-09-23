# Roteiros dos experimentos (Capítulo 4)

Copiar esta pasta para `docs/experimentos/` no repositório.

| Arquivo | O que faz | Como rodar |
|---|---|---|
| `funcional.py` | CT-02 a CT-05 contra a API do backend em modo Demo | `pnpm dev` e, em outro terminal, `python3 funcional.py` |
| `ct07_falsos_positivos.cpp` | CT-07: falsos positivos/negativos da FSM em 5 cenários e 4 configurações | `g++ -std=c++17 -Ifirmware/include docs/experimentos/ct07_falsos_positivos.cpp -o /tmp/ct07 && /tmp/ct07` |
| `ct09_economia.cpp` | CT-09: tempo de luz ligada em jornada de 8 h, perfis denso e esparso | `g++ -std=c++17 -Ifirmware/include docs/experimentos/ct09_economia.cpp -o /tmp/ct09 && /tmp/ct09` |
| `triagem.py` | Registro das decisões de triagem da revisão e contagens do PRISMA | `python3 triagem.py` |

Resultados usados no texto: `ct07.csv`, `ct09.csv`, `met_local.json` e `local_5min.csv`
(5 min do pipeline local: 149 leituras, latência 0/0,77/1/3 ms, 0% de perda).
