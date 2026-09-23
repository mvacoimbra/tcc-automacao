// CT-09 — Estimativa de economia pelo tempo de atuador ligado, em simulação.
// Jornada sintética de 8 h em uma sala: blocos de ocupação com movimento
// intermitente, intervalos vazios. Compara o controle por presença com a
// linha de base (luz ligada durante toda a jornada, como em um interruptor
// manual acionado na chegada e desligado na saída).
#include <cstdio>
#include <vector>
#include <utility>
#include "occupancy_fsm.h"

struct Bloco { double ini, fim; };

int main() {
  const double H = 5.0, DT = 0.5, JORNADA = 8 * 3600;
  // Ocupação real: chegada 8h, saídas curtas, almoço, saída final às 16h.
  // Perfil 1: sala de trabalho individual (ocupação densa).
  std::vector<Bloco> denso = {{0, 3600}, {3900, 7200}, {7500, 14400}, {16200, 25200}, {25500, 28800}};
  // Perfil 2: sala de reuniões (ocupação esparsa).
  std::vector<Bloco> esparso = {{1800, 5400}, {10800, 12600}, {18000, 21600}, {25200, 26100}};
  std::vector<std::pair<const char*, std::vector<Bloco>>> perfis = {{"densa", denso}, {"esparsa", esparso}};
  struct Cfg { const char* nome; FsmConfig c; };
  std::vector<Cfg> cfgs = {{"A sem janela", {30000, 0, 1}}, {"D bordas ou nivel sustentado", {30000, 10000, 2}}};
  std::printf("perfil;config;ocupacao_real_h;luz_ligada_h;linha_base_h;reducao_pct;desocupado_indevido_min\n");
  for (auto& pf : perfis) for (auto& cf : cfgs) {
    const std::vector<Bloco>& ocupacao = pf.second;
    FsmState s; double ultimoMov = -1e9, gAlto = 0; bool pirAnt = false;
    double ligada = 0, ocupReal = 0, fn = 0;
    size_t b = 0;
    for (double t = 0; t < JORNADA; t += DT) {
      while (b < ocupacao.size() && t >= ocupacao[b].fim) b++;
      bool gt = b < ocupacao.size() && t >= ocupacao[b].ini && t < ocupacao[b].fim;
      // movimento a cada 8 s enquanto ocupado (modelo do CT-07, cenário S4)
      if (gt && (int)(t) % 8 == 0) ultimoMov = t;
      bool pir = (t - ultimoMov) < H;
      const uint32_t ms = (uint32_t)(t * 1000);
      if (pir && !pirAnt) gAlto = t;
      pirAnt = pir;
      fsmStep(s, cf.c, pir, ms);
      if (cf.c.janelaConfMs && s.estado == Ocupacao::CONFIRMANDO && pir && (t - gAlto) >= 7.0) {
        s.estado = Ocupacao::OCUPADO; s.tUltimo = ms;
      }
      bool ocupado = s.estado == Ocupacao::OCUPADO;
      if (ocupado) ligada += DT;      // luz acesa: ocupado e luminosidade abaixo do limiar
      if (gt) ocupReal += DT;
      if (gt && !ocupado) fn += DT;
    }
    std::printf("%s;%s;%.2f;%.2f;%.2f;%.1f;%.1f\n", pf.first, cf.nome, ocupReal / 3600, ligada / 3600,
                JORNADA / 3600, 100.0 * (JORNADA - ligada) / JORNADA, fn / 60);
  }
}
