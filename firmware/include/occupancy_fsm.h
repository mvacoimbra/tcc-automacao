#pragma once
#include <stdint.h>

// Máquina de estados de ocupação (Figura 3 do TC I), sem dependência de
// hardware: pode ser testada no PC (firmware/test/fsm_test.cpp).
//
// Com janelaConfMs = 0 o comportamento é idêntico à Figura 3 (hipótese).
// Com janelaConfMs > 0 entra o estado CONFIRMANDO, que exige N detecções
// dentro da janela para aceitar a ocupação (redução de falsos positivos,
// citada na seção 2.5).
//
// Com confirmacaoPorNivelMs > 0 (variante D do Capítulo 4), a ocupação também é
// aceita quando o PIR fica em nível alto continuamente por mais que esse tempo.
// Uma pessoa parada não gera novas bordas, mas mantém o sensor em alto: exigir N
// bordas a descartaria (falso negativo). O limiar precisa ser maior que o tempo de
// retenção do PIR (5 s no diagrama do Wokwi), senão um movimento isolado confirma.

enum class Ocupacao : uint8_t { DESOCUPADO, CONFIRMANDO, OCUPADO };

struct FsmConfig {
  uint32_t tOcupadoMs;
  uint32_t janelaConfMs;
  uint8_t pulsosConf;
  // 0 = variante desativada. Sem inicializador de membro: o framework do ESP32
  // compila em gnu++11, onde isso tiraria o struct da inicialização por chaves
  // ({...} em main.cpp). Omitir o campo na chave já o zera.
  uint32_t confirmacaoPorNivelMs;
};

struct FsmState {
  Ocupacao estado = Ocupacao::DESOCUPADO;
  uint32_t tUltimo = 0;
  uint32_t tInicioJanela = 0;
  uint32_t tPirAlto = 0;  // última borda de subida, para a confirmação por nível
  uint8_t pulsos = 0;
  bool pirAnterior = false;
};

inline const char* ocupacaoStr(Ocupacao o) {
  switch (o) {
    case Ocupacao::DESOCUPADO:  return "DESOCUPADO";
    case Ocupacao::CONFIRMANDO: return "CONFIRMANDO";
    case Ocupacao::OCUPADO:     return "OCUPADO";
  }
  return "?";
}

// Avança um ciclo. Retorna true se o estado mudou.
// Subtrações "agora - t" em uint32_t continuam corretas mesmo quando
// millis() estoura (~49 dias), graças à aritmética modular.
inline bool fsmStep(FsmState& s, const FsmConfig& c, bool pir, uint32_t agora) {
  const Ocupacao antes = s.estado;
  const bool borda = pir && !s.pirAnterior;  // borda de subida do PIR
  if (borda) s.tPirAlto = agora;
  s.pirAnterior = pir;

  switch (s.estado) {
    case Ocupacao::DESOCUPADO:
      if (borda) {
        s.tUltimo = agora;
        if (c.janelaConfMs == 0 || c.pulsosConf <= 1) {
          s.estado = Ocupacao::OCUPADO;
        } else {
          s.estado = Ocupacao::CONFIRMANDO;
          s.tInicioJanela = agora;
          s.pulsos = 1;
        }
      }
      break;

    case Ocupacao::CONFIRMANDO:
      if (agora - s.tInicioJanela > c.janelaConfMs) {
        s.estado = Ocupacao::DESOCUPADO;  // detecção isolada descartada
        s.pulsos = 0;
      } else if (borda) {
        s.tUltimo = agora;
        if (++s.pulsos >= c.pulsosConf) s.estado = Ocupacao::OCUPADO;
      } else if (c.confirmacaoPorNivelMs != 0 && pir &&
                 (agora - s.tPirAlto) >= c.confirmacaoPorNivelMs) {
        s.tUltimo = agora;  // pessoa parada: o nível alto sustentado confirma
        s.estado = Ocupacao::OCUPADO;
      }
      break;

    case Ocupacao::OCUPADO:
      if (pir) {
        s.tUltimo = agora;
      } else if (agora - s.tUltimo > c.tOcupadoMs) {
        s.estado = Ocupacao::DESOCUPADO;
      }
      break;
  }
  return s.estado != antes;
}
