import { describe, expect, it } from 'vitest'
import {
  AmbienteDemo,
  ComandoDemo,
  ConfigDispositivo,
  ConsultaLeituras,
  ConsultaPeriodo,
  ConfigPayload,
  Configuracoes,
  EstadoDispositivo,
  EstadoPayload,
  MensagemWs,
} from './index'

const estadoValido = {
  dispositivo: 'sala01',
  seq: 42,
  ts: 1790000000000,
  estado: 'OCUPADO',
  pir: true,
  temperatura: 28.0,
  umidade: 55.0,
  lux: 120.5,
  luz: true,
  hvac: true,
}

describe('EstadoPayload (MQTT firmware → broker)', () => {
  it('aceita o payload do contrato', () => {
    expect(EstadoPayload.safeParse(estadoValido).success).toBe(true)
  })

  it('aceita temperatura e umidade nulas (DHT ainda sem leitura)', () => {
    const r = EstadoPayload.safeParse({ ...estadoValido, temperatura: null, umidade: null })
    expect(r.success).toBe(true)
  })

  it('aceita ts = 0 (NTP não sincronizou)', () => {
    expect(EstadoPayload.safeParse({ ...estadoValido, ts: 0 }).success).toBe(true)
  })

  it('rejeita estado fora de DESOCUPADO | CONFIRMANDO | OCUPADO', () => {
    expect(EstadoPayload.safeParse({ ...estadoValido, estado: 'OUTRO' }).success).toBe(false)
  })

  it('rejeita seq fora de uint32', () => {
    expect(EstadoPayload.safeParse({ ...estadoValido, seq: -1 }).success).toBe(false)
    expect(EstadoPayload.safeParse({ ...estadoValido, seq: 4294967296 }).success).toBe(false)
  })

  it('rejeita id de dispositivo que quebraria tópico MQTT ou URL', () => {
    for (const dispositivo of ['', 'a/b', 'sala+01', 'sala#', '../x', 'com espaço']) {
      expect(EstadoPayload.safeParse({ ...estadoValido, dispositivo }).success).toBe(false)
    }
  })

  it('aceita seq nos limites de uint32 (reinício em 0 e valor máximo)', () => {
    expect(EstadoPayload.safeParse({ ...estadoValido, seq: 0 }).success).toBe(true)
    expect(EstadoPayload.safeParse({ ...estadoValido, seq: 4294967295 }).success).toBe(true)
  })
})

describe('ConfigPayload (broker → firmware)', () => {
  it('aceita todos os campos opcionais ausentes', () => {
    expect(ConfigPayload.safeParse({}).success).toBe(true)
  })

  it('aceita um subconjunto dos campos', () => {
    expect(ConfigPayload.safeParse({ tempAlvo: 30 }).success).toBe(true)
  })

  it('rejeita campo desconhecido', () => {
    expect(ConfigPayload.safeParse({ tempAlvo: 30, inventado: 1 }).success).toBe(false)
  })

  it('rejeita tipo errado', () => {
    expect(ConfigPayload.safeParse({ tOcupadoMs: 'muito' }).success).toBe(false)
  })
})

describe('Configuracoes (configuracoes.json)', () => {
  it('aceita broker embutido', () => {
    const r = Configuracoes.safeParse({ broker: { modo: 'embutido' }, demo: true })
    expect(r.success).toBe(true)
  })

  it('aceita broker externo completo', () => {
    const r = Configuracoes.safeParse({
      broker: { modo: 'externo', host: 'broker.hivemq.com', porta: 1883, raiz: 'tcc-unip-7f3a9c' },
      demo: false,
    })
    expect(r.success).toBe(true)
  })

  it('rejeita broker externo sem host', () => {
    const r = Configuracoes.safeParse({
      broker: { modo: 'externo', porta: 1883, raiz: 'tcc' },
      demo: false,
    })
    expect(r.success).toBe(false)
  })

  it('rejeita raiz MQTT com curinga ou barra nas pontas', () => {
    for (const raiz of ['', 'tcc/#', 'tcc/+', '/tcc', 'tcc/']) {
      const r = Configuracoes.safeParse({
        broker: { modo: 'externo', host: 'h', porta: 1883, raiz },
        demo: false,
      })
      expect(r.success).toBe(false)
    }
  })

  it('aceita raiz MQTT com mais de um segmento', () => {
    const r = Configuracoes.safeParse({
      broker: { modo: 'externo', host: 'h', porta: 1883, raiz: 'unip/tcc' },
      demo: false,
    })
    expect(r.success).toBe(true)
  })

  it('rejeita porta fora de 1..65535', () => {
    const r = Configuracoes.safeParse({
      broker: { modo: 'externo', host: 'h', porta: 70000, raiz: 'tcc' },
      demo: false,
    })
    expect(r.success).toBe(false)
  })
})

describe('MensagemWs (servidor → cliente)', () => {
  it('aceita mensagem mqtt de entrada', () => {
    const r = MensagemWs.safeParse({
      tipo: 'mqtt',
      direcao: 'entrada',
      topico: 'tcc/sala01/estado',
      payload: '{}',
      em: 1790000000000,
    })
    expect(r.success).toBe(true)
  })

  it('aceita estado com metadados, com latência nula', () => {
    const r = MensagemWs.safeParse({
      tipo: 'estado',
      dados: { ...estadoValido, recebidoEm: 1790000000100, latenciaMs: null, perdidas: 0 },
    })
    expect(r.success).toBe(true)
  })

  it('rejeita tipo desconhecido', () => {
    expect(MensagemWs.safeParse({ tipo: 'nada' }).success).toBe(false)
  })
})

const configCompleta = {
  tOcupadoMs: 30000,
  janelaConfMs: 0,
  pulsosConf: 1,
  confirmacaoPorNivelMs: 0,
  luxLimiar: 300,
  tempAlvo: 26,
}

describe('ConfigDispositivo e EstadoDispositivo (GET /api/dispositivos/:id/estado)', () => {
  it('a config conhecida exige todos os campos (ao contrário do payload de config)', () => {
    expect(ConfigDispositivo.safeParse(configCompleta).success).toBe(true)
    expect(ConfigDispositivo.safeParse({ tempAlvo: 26 }).success).toBe(false)
  })

  it('EstadoDispositivo junta a última leitura e a config conhecida', () => {
    const r = EstadoDispositivo.safeParse({
      leitura: { ...estadoValido, recebidoEm: 1790000000100, latenciaMs: 100, perdidas: 0 },
      config: configCompleta,
    })
    expect(r.success).toBe(true)
  })
})

describe('Comandos do modo Demo', () => {
  it('AmbienteDemo aceita um subconjunto dos sensores dentro da faixa física', () => {
    expect(AmbienteDemo.safeParse({ temperatura: 32 }).success).toBe(true)
    expect(AmbienteDemo.safeParse({ temperatura: 20, umidade: 60, lux: 5000 }).success).toBe(true)
  })

  it('AmbienteDemo rejeita valor fora da faixa, tipo errado e campo desconhecido', () => {
    expect(AmbienteDemo.safeParse({ umidade: 150 }).success).toBe(false)
    expect(AmbienteDemo.safeParse({ lux: -1 }).success).toBe(false)
    expect(AmbienteDemo.safeParse({ temperatura: '30' }).success).toBe(false)
    expect(AmbienteDemo.safeParse({ pressao: 1 }).success).toBe(false)
  })

  it('ComandoDemo exige um booleano', () => {
    expect(ComandoDemo.safeParse({ ativo: true }).success).toBe(true)
    expect(ComandoDemo.safeParse({ ativo: 'sim' }).success).toBe(false)
    expect(ComandoDemo.safeParse({}).success).toBe(false)
  })
})

describe('Consultas REST de período e de leituras (query string)', () => {
  it('converte texto em número e aceita parâmetros ausentes', () => {
    expect(ConsultaPeriodo.parse({})).toEqual({})
    expect(ConsultaPeriodo.parse({ de: '100', ate: '200' })).toEqual({ de: 100, ate: 200 })
  })

  it('limite: padrão 1000, e acima de 10000 vira 10000', () => {
    expect(ConsultaLeituras.parse({}).limite).toBe(1000)
    expect(ConsultaLeituras.parse({ limite: '250' }).limite).toBe(250)
    expect(ConsultaLeituras.parse({ limite: '50000' }).limite).toBe(10000)
  })

  it('rejeita valor não inteiro, negativo, não numérico ou limite menor que 1', () => {
    for (const q of [{ de: 'abc' }, { de: '1.5' }, { ate: '-1' }, { limite: '0' }, { limite: '1.5' }, { limite: 'x' }]) {
      expect(ConsultaLeituras.safeParse(q).success, JSON.stringify(q)).toBe(false)
    }
  })

  it('parâmetro repetido na URL (?de=1&de=2) não é aceito', () => {
    expect(ConsultaPeriodo.safeParse({ de: ['1', '2'] }).success).toBe(false)
  })
})
