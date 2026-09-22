// Relógio que faz o componente redesenhar a cada `intervaloMs` (contagem regressiva,
// "reconectando em N s"). Com `ativo` falso, para de contar e não gasta render.
import { useEffect, useState } from 'react'

export function useAgora(intervaloMs: number, ativo = true): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ativo) return
    setAgora(Date.now())
    const id = setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs, ativo])
  return agora
}
