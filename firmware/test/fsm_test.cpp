// Testes da máquina de estados, rodando no PC (sem ESP32).
// Execução: pnpm test:fsm
#include <cstdio>
#include <cstdlib>
#include "occupancy_fsm.h"

static int falhas = 0;
#define CHECK(cond, msg)                                   \
  do {                                                     \
    if (!(cond)) { std::printf("FALHOU: %s\n", msg); ++falhas; } \
    else { std::printf("ok: %s\n", msg); }                 \
  } while (0)

// Simula 'ms' milissegundos em passos de 100 ms com o PIR fixo.
// Itera por número de passos (e não "t < fim"): comparar instantes absolutos
// quebra quando o contador estoura — o mesmo erro que a FSM evita.
static void rodar(FsmState& s, const FsmConfig& c, bool pir, uint32_t& t, uint32_t ms) {
  for (uint32_t passos = ms / 100; passos > 0; --passos, t += 100) fsmStep(s, c, pir, t);
}

int main() {
  // --- Modelo da Figura 3 (sem janela de confirmação) ---
  {
    const FsmConfig c{30000, 0, 1};
    FsmState s;
    uint32_t t = 0;
    rodar(s, c, false, t, 1000);
    CHECK(s.estado == Ocupacao::DESOCUPADO, "fig3: inicia desocupado");
    rodar(s, c, true, t, 500);
    CHECK(s.estado == Ocupacao::OCUPADO, "fig3: movimento -> OCUPADO");
    rodar(s, c, false, t, 29000);
    CHECK(s.estado == Ocupacao::OCUPADO, "fig3: mantém ocupado antes de t_ocupado");
    rodar(s, c, false, t, 2000);
    CHECK(s.estado == Ocupacao::DESOCUPADO, "fig3: desocupa após t_ocupado");
  }

  // --- Com janela de confirmação (2 pulsos em 10 s) ---
  {
    const FsmConfig c{30000, 10000, 2};
    FsmState s;
    uint32_t t = 0;
    rodar(s, c, true, t, 300);
    CHECK(s.estado == Ocupacao::CONFIRMANDO, "janela: 1º pulso -> CONFIRMANDO");
    rodar(s, c, false, t, 11000);
    CHECK(s.estado == Ocupacao::DESOCUPADO, "janela: pulso isolado descartado (falso positivo)");

    rodar(s, c, true, t, 300);
    rodar(s, c, false, t, 2000);
    rodar(s, c, true, t, 300);
    CHECK(s.estado == Ocupacao::OCUPADO, "janela: 2 pulsos na janela -> OCUPADO");
  }

  // --- Estouro do millis() (~49,7 dias) ---
  {
    const FsmConfig c{30000, 0, 1};
    FsmState s;
    uint32_t t = 0xFFFFFFFFu - 1000;  // 1 s antes do estouro
    rodar(s, c, true, t, 300);
    rodar(s, c, false, t, 10000);  // atravessa o estouro
    CHECK(s.estado == Ocupacao::OCUPADO, "overflow: não desocupa antes da hora");
    rodar(s, c, false, t, 25000);
    CHECK(s.estado == Ocupacao::DESOCUPADO, "overflow: desocupa no tempo certo");
  }

  std::printf("\n%s (%d falha(s))\n", falhas ? "FALHOU" : "TODOS OK", falhas);
  return falhas ? EXIT_FAILURE : EXIT_SUCCESS;
}
