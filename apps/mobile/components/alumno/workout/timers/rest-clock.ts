import { useEffect, useState } from 'react'

/**
 * Mini-store del RELOJ del descanso vivo (W5.1b · R3b, enmienda E1 del owner del 12-09).
 *
 * ¿Por qué existe? Con el descanso MINIMIZADO, el `KeypadHost` (un `Modal` con la hoja abajo) tapa la
 * `RestTimerBar`, así que el alumno anota kg/reps sin ver cuánto le queda. El owner pidió que VEA el
 * contador mientras escribe ⇒ hace falta un chip vivo DENTRO del teclado.
 *
 * ¿Por qué un store module-level y no estado de React? Porque el chip tiene que latir una vez por
 * segundo y el descanso vive en el `WorkoutTimerProvider`, que es ANCESTRO del ejecutor entero: un
 * `setState` por tick allá arriba re-renderizaría todo el ejecutor mientras el alumno teclea. Acá el
 * tick lo consume SÓLO quien se suscribe (el chip, y sólo mientras está montado).
 *
 * ¿Por qué en su propio archivo y no dentro de `TimerProvider.tsx`? Porque el `RestTimerHost` —que es
 * quien conoce las pausas y los ±15 s— también publica, y `TimerProvider` ya lo importa: ponerlo allá
 * cerraba un ciclo de imports entre los dos módulos. Este archivo no importa nada de React Native, lo
 * que además lo hace testeable en node sin un solo mock.
 *
 * La verdad se publica en DOS puntos, ninguno de los cuales re-renderiza al provider:
 *  · `WorkoutTimerProvider.startRest` — el arranque (fin absoluto desde los segundos pedidos).
 *  · `RestTimerHost` — cada transición del motor: tick, pausa, ±15 s, reset y el 0.
 */

export interface RestClock {
  /** Fin ABSOLUTO (epoch ms) mientras el descanso CORRE. `null` en pausa, al llegar a 0 o sin descanso. */
  endAtMs: number | null
  /**
   * Segundos congelados cuando NO corre: pausa (> 0) o descanso agotado (0). `null` cuando corre o
   * cuando no hay descanso — la diferencia entre «0» y «null» es la que decide si el chip dice
   * «¡A entrenar!» o directamente no existe.
   */
  pausedRemainingSec: number | null
}

/** Sin descanso: ni fin ni segundos congelados. El chip no se pinta. */
export const REST_CLOCK_IDLE: RestClock = { endAtMs: null, pausedRemainingSec: null }

const restClockRef: { current: RestClock } = { current: REST_CLOCK_IDLE }
const listeners = new Set<() => void>()

/** Lectura sincrónica del reloj publicado (para el primer valor y para los tests). */
export function readRestClock(): RestClock {
  return restClockRef.current
}

/**
 * Publica el reloj. Ignora la publicación si nada cambió, así el tick del motor no despierta a los
 * suscriptores cuando el valor es idéntico (p. ej. dos renders seguidos con el mismo `timeLeft`).
 */
export function publishRestClock(next: RestClock): void {
  const cur = restClockRef.current
  if (cur.endAtMs === next.endAtMs && cur.pausedRemainingSec === next.pausedRemainingSec) return
  restClockRef.current = next
  // Copia defensiva: un listener que se da de baja durante la notificación no puede romper el barrido.
  for (const listener of Array.from(listeners)) listener()
}

/** No hay descanso (se canceló, se cerró o se desmontó el host). */
export function clearRestClock(): void {
  publishRestClock(REST_CLOCK_IDLE)
}

/** Suscripción al reloj. Devuelve la baja. */
export function subscribeRestClock(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Segundos restantes según el reloj publicado, o `null` si no hay descanso. Puro (recibe el `now`):
 * el que corre lo recomputa desde el fin ABSOLUTO —igual que el motor— así que no se desfasa aunque
 * el intervalo del chip se atrase.
 */
export function restRemainingSecFrom(clock: RestClock, nowMs: number): number | null {
  if (clock.endAtMs != null) return Math.max(0, Math.ceil((clock.endAtMs - nowMs) / 1000))
  if (clock.pausedRemainingSec != null) return Math.max(0, Math.round(clock.pausedRemainingSec))
  return null
}

/** `1:27`, y `¡A entrenar!` en el 0 (mismo copy que la barra/interstitial al terminar). */
export function formatRestRemaining(sec: number): string {
  if (sec <= 0) return '¡A entrenar!'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Etiqueta hablada del chip: «Descanso, quedan 1 minuto 27 segundos». */
export function restRemainingA11yLabel(sec: number): string {
  if (sec <= 0) return 'Descanso terminado, a entrenar'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  const parts: string[] = []
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`)
  if (s > 0) parts.push(`${s} ${s === 1 ? 'segundo' : 'segundos'}`)
  const verb = sec === 1 || sec === 60 ? 'queda' : 'quedan'
  return `Descanso, ${verb} ${parts.join(' ')}`
}

/**
 * Segundos restantes del descanso vivo, o `null` si no hay ninguno. Late SOLO mientras el componente
 * que lo usa está montado (su `setInterval` de 1 s nace y muere con él), y además se despierta con
 * cada publicación —pausa, ±15 s, cierre— para no mostrar un segundo viejo.
 *
 * El primer valor sale en el efecto y no en el render porque `Date.now()` no puede leerse durante el
 * render (regla `react-hooks/purity`): el consumidor ve `null` por un frame y después el número.
 */
export function useRestRemainingSec(): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const sync = () => {
      const next = restRemainingSecFrom(readRestClock(), Date.now())
      setRemaining((prev) => (prev === next ? prev : next))
    }
    sync()
    const unsubscribe = subscribeRestClock(sync)
    const interval = setInterval(sync, 1000)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  return remaining
}
