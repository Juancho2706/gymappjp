import { useEffect, useRef, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'

/**
 * Ticker de la pantalla Final V3 (E4.3) — "numeros que cuentan" 0→valor con easing de salida, formateados
 * por un `format` arbitrario (reloj mm:ss, miles es-CL "4.860", peso "62,5"). reduced-motion (o `play=false`)
 * ⇒ VALOR DIRECTO sin animar (contrato de accesibilidad).
 *
 * Se conduce por `requestAnimationFrame` en el hilo JS (no Reanimated worklets): el formateo es-CL con
 * coma/miles NO es worklet-safe (String/replace + separador manual), y la Final es una pantalla ESTATICA
 * (sin scroll ni gestos compitiendo), asi que un RAF de ~650ms sobre 3-4 nodos Text no produce jank. El
 * confeti corre en su propio driver. Al desmontar cancela el frame pendiente.
 */
export function NumberTicker({
  value,
  format,
  play,
  reduced,
  durationMs = 650,
  delayMs = 0,
  style,
  testID,
}: {
  /** Valor final del contador. */
  value: number
  /** Formatea el valor intermedio a texto (ej. reloj, miles, peso). */
  format: (n: number) => string
  /** Arranca la cuenta (fase 2 revelada). */
  play: boolean
  /** reduced-motion: pinta el valor final directo. */
  reduced: boolean
  durationMs?: number
  /** Retardo antes de arrancar (stagger). */
  delayMs?: number
  style?: StyleProp<TextStyle>
  testID?: string
}) {
  const [display, setDisplay] = useState(() => (reduced || !play ? value : 0))
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cancel = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current)
      rafRef.current = null
      timeoutRef.current = null
    }

    if (reduced || !play) {
      cancel()
      setDisplay(value)
      return cancel
    }

    setDisplay(0)
    const run = () => {
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const t = Math.min(1, elapsed / durationMs)
        // easeOutCubic — arranca rapido, desacelera al valor final.
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(value * eased)
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          setDisplay(value)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    if (delayMs > 0) {
      timeoutRef.current = setTimeout(run, delayMs)
    } else {
      run()
    }
    return cancel
  }, [value, play, reduced, durationMs, delayMs])

  return (
    <Text style={style} testID={testID} numberOfLines={1}>
      {format(display)}
    </Text>
  )
}

/** Miles con punto es-CL, Hermes-safe (sin Intl): 4860 → "4.860", 950 → "950". */
export function formatThousandsEsCl(n: number): string {
  const neg = n < 0
  const s = String(Math.round(Math.abs(n)))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.'
    out += s[i]
  }
  return neg ? `-${out}` : out
}
