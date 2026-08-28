import { useEffect, useState } from 'react'

const fmt = (total: number) => {
  const s = Math.max(0, total)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Linear blend between two hex colours. */
const mix = (a: string, b: string, t: number) => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`
}

const WHITE = '#e2e4e5'
const PALE = '#f2e6a8'
const ORANGE = '#ffa94d'
const RED = '#ff6f57'

/**
 * Cools down after each review and heats up as the next one approaches:
 * white → pale yellow → orange → red.
 * `left` is the fraction of the window still remaining (1 = just reviewed).
 */
export const heatColor = (left: number) => {
  const t = Math.min(1, Math.max(0, 1 - left)) // 0 = fresh, 1 = imminent
  if (t < 0.4) return mix(WHITE, PALE, t / 0.4)
  if (t < 0.75) return mix(PALE, ORANGE, (t - 0.4) / 0.35)
  return mix(ORANGE, RED, (t - 0.75) / 0.25)
}

/** Time until the next `every`-minute boundary, ticking live. */
export function useCountdown(every = 15) {
  const read = () => {
    const n = new Date()
    const seconds = (every - (n.getMinutes() % every)) * 60 - n.getSeconds()
    return { seconds, label: fmt(seconds), left: seconds / (every * 60) }
  }

  const [state, setState] = useState(read)

  useEffect(() => {
    const id = setInterval(() => setState(read()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [every])

  return { ...state, color: heatColor(state.left) }
}
