// Parâmetros de um dispositivo (padrões do firmware, config.h) e como uma mensagem
// em <raiz>/<dispositivo>/config os altera.
import type { ConfigDispositivo, ConfigPayload } from '@tcc/contrato'

// T_OCUPADO_MS, JANELA_CONF_MS, PULSOS_CONF, LUX_LIMIAR e TEMP_ALVO de firmware/include/config.h.
export const CONFIG_PADRAO_DISPOSITIVO: ConfigDispositivo = {
  tOcupadoMs: 30000,
  janelaConfMs: 0,
  pulsosConf: 1,
  luxLimiar: 300,
  tempAlvo: 26,
}

const ehInteiro = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// Espelha onConfig() de firmware/src/main.cpp: cada campo é aplicado só se existir
// e tiver o tipo certo (doc["x"].is<T>()); o resto é ignorado, sem rejeitar a mensagem toda.
export function aplicarConfigFirmware(atual: ConfigDispositivo, bruto: unknown): ConfigDispositivo {
  if (typeof bruto !== 'object' || bruto === null) return atual
  const m = bruto as Record<string, unknown>
  return {
    tOcupadoMs: ehInteiro(m.tOcupadoMs, 0xffffffff) ? m.tOcupadoMs : atual.tOcupadoMs,
    janelaConfMs: ehInteiro(m.janelaConfMs, 0xffffffff) ? m.janelaConfMs : atual.janelaConfMs,
    pulsosConf: ehInteiro(m.pulsosConf, 0xff) ? m.pulsosConf : atual.pulsosConf,
    luxLimiar: ehNumero(m.luxLimiar) ? m.luxLimiar : atual.luxLimiar,
    tempAlvo: ehNumero(m.tempAlvo) ? m.tempAlvo : atual.tempAlvo,
  }
}

// Config conhecida depois de publicar um payload já validado (só os campos presentes mudam).
export function mesclarConfig(atual: ConfigDispositivo, parcial: ConfigPayload): ConfigDispositivo {
  return {
    tOcupadoMs: parcial.tOcupadoMs ?? atual.tOcupadoMs,
    janelaConfMs: parcial.janelaConfMs ?? atual.janelaConfMs,
    pulsosConf: parcial.pulsosConf ?? atual.pulsosConf,
    luxLimiar: parcial.luxLimiar ?? atual.luxLimiar,
    tempAlvo: parcial.tempAlvo ?? atual.tempAlvo,
  }
}
