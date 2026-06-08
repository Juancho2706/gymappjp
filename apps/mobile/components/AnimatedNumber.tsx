import { useEffect, useRef, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useEvaMotion } from '../lib/motion'

interface Props {
  value: number
  duration?: number
  format?: (n: number) => string
  style?: StyleProp<TextStyle>
}

/**
 * Número con "count-up" al montar/cambiar (deleite v1). RAF + easeOutCubic, una sola
 * vez por cambio de valor. Respeta reduce-motion (muestra el valor final directo).
 */
export function AnimatedNumber({ value, duration = 700, format, style }: Props) {
  const motion = useEvaMotion()
  const [display, setDisplay] = useState(motion.reduced ? value : 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (motion.reduced) { setDisplay(value); return }
    const start = Date.now()
    const from = 0
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (value - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration, motion.reduced])

  return <Text style={style}>{format ? format(display) : String(Math.round(display))}</Text>
}
