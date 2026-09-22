// Armazenamento das leituras em SQLite (`node:sqlite`, embutido no Node e no Electron),
// em modo WAL. O resto do backend só conhece o tipo `Armazenamento`: se o banco
// precisar ser trocado, apenas este arquivo muda (ver D12 em docs/decisoes.md).
import { DatabaseSync } from 'node:sqlite'
import type { LeituraComMetadados, Ocupacao } from '@tcc/contrato'

export type Armazenamento = {
  gravar(l: LeituraComMetadados): void
  ultima(dispositivo: string): LeituraComMetadados | null
  // Leituras com recebidoEm em [de, ate], em ordem crescente. Se houver mais que
  // `limite`, devolve as mais recentes. Limite não finito significa sem limite.
  listar(dispositivo: string, de: number, ate: number, limite: number): LeituraComMetadados[]
  dispositivos(): { id: string; vistoEm: number }[]
  fechar(): void
}

// Formato da linha na tabela (colunas em snake_case, booleanos como 0/1).
type Linha = {
  dispositivo: string
  seq: number
  ts: number
  recebido_em: number
  latencia_ms: number | null
  perdidas: number
  estado: string
  pir: number
  temperatura: number | null
  umidade: number | null
  lux: number
  luz: number
  hvac: number
}

function paraLeitura(linha: Linha): LeituraComMetadados {
  return {
    dispositivo: linha.dispositivo,
    seq: linha.seq,
    ts: linha.ts,
    estado: linha.estado as Ocupacao,
    pir: linha.pir === 1,
    temperatura: linha.temperatura,
    umidade: linha.umidade,
    lux: linha.lux,
    luz: linha.luz === 1,
    hvac: linha.hvac === 1,
    recebidoEm: linha.recebido_em,
    latenciaMs: linha.latencia_ms,
    perdidas: linha.perdidas,
  }
}

export function criarArmazenamento(caminho: string): Armazenamento {
  const banco = new DatabaseSync(caminho)
  banco.exec('PRAGMA journal_mode = WAL')
  banco.exec(`
    CREATE TABLE IF NOT EXISTS leituras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispositivo TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      recebido_em INTEGER NOT NULL,
      latencia_ms INTEGER,
      perdidas INTEGER NOT NULL,
      estado TEXT NOT NULL,
      pir INTEGER NOT NULL,
      temperatura REAL,
      umidade REAL,
      lux REAL NOT NULL,
      luz INTEGER NOT NULL,
      hvac INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_recebido_em
      ON leituras (dispositivo, recebido_em);
  `)

  const inserir = banco.prepare(`
    INSERT INTO leituras (dispositivo, seq, ts, recebido_em, latencia_ms, perdidas,
                          estado, pir, temperatura, umidade, lux, luz, hvac)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const buscarUltima = banco.prepare(`
    SELECT * FROM leituras WHERE dispositivo = ?
    ORDER BY recebido_em DESC, id DESC LIMIT 1
  `)
  // As mais recentes primeiro (para aplicar o LIMIT) e depois reordena em ordem crescente.
  const buscarIntervalo = banco.prepare(`
    SELECT * FROM (
      SELECT * FROM leituras
      WHERE dispositivo = ? AND recebido_em BETWEEN ? AND ?
      ORDER BY recebido_em DESC, id DESC LIMIT ?
    ) ORDER BY recebido_em ASC, id ASC
  `)
  const buscarDispositivos = banco.prepare(`
    SELECT dispositivo AS id, MAX(recebido_em) AS visto_em
    FROM leituras GROUP BY dispositivo ORDER BY dispositivo
  `)

  let aberto = true

  return {
    gravar(l) {
      inserir.run(
        l.dispositivo, l.seq, l.ts, l.recebidoEm, l.latenciaMs, l.perdidas,
        l.estado, l.pir ? 1 : 0, l.temperatura, l.umidade, l.lux, l.luz ? 1 : 0, l.hvac ? 1 : 0,
      )
    },
    ultima(dispositivo) {
      const linha = buscarUltima.get(dispositivo)
      return linha ? paraLeitura(linha as unknown as Linha) : null
    },
    listar(dispositivo, de, ate, limite) {
      const teto = Number.isFinite(limite) ? Math.max(0, Math.trunc(limite)) : -1 // -1 = sem limite no SQLite
      return buscarIntervalo
        .all(dispositivo, de, ate, teto)
        .map((linha) => paraLeitura(linha as unknown as Linha))
    },
    dispositivos() {
      return (buscarDispositivos.all() as { id: string; visto_em: number }[]).map((linha) => ({
        id: linha.id,
        vistoEm: linha.visto_em,
      }))
    },
    fechar() {
      if (!aberto) return
      aberto = false
      banco.close()
    },
  }
}
