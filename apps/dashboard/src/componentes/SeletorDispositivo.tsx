import { usePainel } from '../contexto'

export function SeletorDispositivo() {
  const { dispositivos, dispositivoId, selecionar } = usePainel()
  const vazio = dispositivos.length === 0

  return (
    <label className="seletor">
      <span className="seletor__rotulo">Dispositivo</span>
      <select
        value={dispositivoId ?? ''}
        onChange={(e) => selecionar(e.target.value)}
        disabled={vazio}
        aria-label="Dispositivo"
      >
        {vazio && <option value="">Nenhum dispositivo ainda</option>}
        {dispositivos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.id}
          </option>
        ))}
      </select>
    </label>
  )
}
