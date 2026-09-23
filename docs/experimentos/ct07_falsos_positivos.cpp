// CT-07 — Experimento de falsos positivos/negativos da máquina de estados.
// Usa o MESMO occupancy_fsm.h do firmware. Modelo do PIR: redisparável, com
// saída alta por H = 5 s após o último movimento (delayTime padrão do Wokwi).
// Compilar: g++ -std=c++17 -I<repo>/firmware/include ct07_falsos_positivos.cpp
#include <cstdio>
#include <vector>
#include <functional>
#include "occupancy_fsm.h"

// Variante proposta (D): confirma por N bordas OU por PIR em nível alto
// continuamente por mais que tSustMs (maior que o tempo de retenção do PIR).
static uint32_t gAltoDesde = 0;
static bool fsmStepVariante(FsmState& s, const FsmConfig& c, bool pir, uint32_t agora, uint32_t tSustMs) {
  if (pir && !s.pirAnterior) gAltoDesde = agora;
  const bool sustentado = pir && (agora - gAltoDesde) >= tSustMs;
  const bool mudou = fsmStep(s, c, pir, agora);
  if (s.estado == Ocupacao::CONFIRMANDO && sustentado) { s.estado = Ocupacao::OCUPADO; s.tUltimo = agora; return true; }
  return mudou;
}

struct Cenario { const char* nome; std::vector<double> movimentos; double gtIni, gtFim; };

static std::vector<double> faixa(double a, double b, double passo) {
  std::vector<double> v; for (double t = a; t <= b + 1e-9; t += passo) v.push_back(t); return v;
}

int main() {
  const double H = 5.0, HORIZONTE = 150.0, DT = 0.1;
  std::vector<Cenario> cenarios = {
    {"S1 passagem isolada", {10}, -1, -1},
    {"S2 duas passagens (60 s)", {10, 70}, -1, -1},
    {"S3 permanencia, mov. continuo", faixa(10, 90, 0.5), 10, 90},
    {"S4 permanencia, mov. a cada 8 s", faixa(10, 90, 8), 10, 90},
    {"S5 permanencia, pessoa parada", {10}, 10, 90},
  };
  struct Cfg { const char* nome; FsmConfig c; uint32_t tSust; };
  std::vector<Cfg> cfgs = {
    {"A janela desativada", {30000, 0, 1}, 0},
    {"B janela 10 s, 2 pulsos", {30000, 10000, 2}, 0},
    {"C janela 20 s, 2 pulsos", {30000, 20000, 2}, 0},
    {"D janela 10 s, 2 pulsos ou 7 s em alto", {30000, 10000, 2}, 7000},
  };
  std::printf("config;cenario;ativou;atraso_s;ocupado_s;falso_pos_s;falso_neg_s\n");
  for (auto& cf : cfgs) for (auto& sc : cenarios) {
    FsmState s; double ultimoMov = -1e9; size_t k = 0;
    double atraso = -1, ocup = 0, fp = 0, fn = 0; bool ativou = false;
    for (double t = 0; t < HORIZONTE; t += DT) {
      while (k < sc.movimentos.size() && sc.movimentos[k] <= t + 1e-9) ultimoMov = sc.movimentos[k++];
      bool pir = (t - ultimoMov) < H;
      const uint32_t ms = (uint32_t)(t * 1000 + 0.5);
      if (cf.tSust) fsmStepVariante(s, cf.c, pir, ms, cf.tSust); else fsmStep(s, cf.c, pir, ms);
      bool o = s.estado == Ocupacao::OCUPADO;
      bool gt = sc.gtIni >= 0 && t >= sc.gtIni && t < sc.gtFim;
      if (o) { ocup += DT; if (!ativou) { ativou = true; atraso = t - sc.movimentos[0]; } }
      if (o && !gt) fp += DT;
      if (!o && gt) fn += DT;
    }
    std::printf("%s;%s;%s;%.1f;%.1f;%.1f;%.1f\n", cf.nome, sc.nome, ativou ? "sim" : "nao",
                atraso, ocup, fp, fn);
  }
}
