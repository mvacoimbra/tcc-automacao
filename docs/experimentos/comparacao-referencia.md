# Executor de roteiros × programas de referência

Gerado a partir de `ct07.csv` (programa em C++) e do `resumo.csv` da execução
de 2026-09-23. A diferença de 0,1 s vem do acúmulo de `double` no programa em C++;
a explicação está em D16 de `docs/decisoes.md`. **O texto do TCC deve usar a
coluna do executor**, que é o sistema que roda na demonstração.

## CT-07 — falsos positivos e negativos

| Cenário | Config | Ativou (ref / exec) | Ocupado s (ref / exec) | Desocupado indevido s (ref / exec) |
|---|---|---|---|---|
| S1 | A | sim / sim | 35.1 / 35.0 | 0.0 / 0.0 |
| S1 | B | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S1 | C | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S1 | D | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S2 | A | sim / sim | 70.1 / 70.0 | 0.0 / 0.0 |
| S2 | B | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S2 | C | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S2 | D | nao / nao | 0.0 / 0.0 | 0.0 / 0.0 |
| S3 | A | sim / sim | 115.1 / 115.0 | 0.0 / 0.0 |
| S3 | B | nao / nao | 0.0 / 0.0 | 80.0 / 80.0 |
| S3 | C | nao / nao | 0.0 / 0.0 | 80.0 / 80.0 |
| S3 | D | sim / sim | 108.1 / 108.0 | 6.9 / 7.0 |
| S4 | A | sim / sim | 115.1 / 115.0 | 0.0 / 0.0 |
| S4 | B | sim / sim | 107.1 / 107.0 | 7.9 / 8.0 |
| S4 | C | sim / sim | 107.1 / 107.0 | 7.9 / 8.0 |
| S4 | D | sim / sim | 107.1 / 107.0 | 7.9 / 8.0 |
| S5 | A | sim / sim | 35.1 / 35.0 | 45.0 / 45.0 |
| S5 | B | nao / nao | 0.0 / 0.0 | 80.0 / 80.0 |
| S5 | C | nao / nao | 0.0 / 0.0 | 80.0 / 80.0 |
| S5 | D | nao / nao | 0.0 / 0.0 | 80.0 / 80.0 |

## CT-09 — economia na jornada de 8 h

| Perfil | Config | Ocupação real h (ref / exec) | Luz ligada h (ref / exec) | Redução % (ref / exec) |
|---|---|---|---|---|
| densa | A | 7.25 / 7.25 | 7.28 / 7.28 | 9.0 / 9.0 |
| densa | D | 7.25 / 7.25 | 7.27 / 7.27 | 9.2 / 9.2 |
| esparsa | A | 2.75 / 2.75 | 2.78 / 2.78 | 65.2 / 65.2 |
| esparsa | D | 2.75 / 2.75 | 2.77 / 2.77 | 65.3 / 65.3 |
