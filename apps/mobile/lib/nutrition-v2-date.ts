/**
 * nutrition-v2-date — dia local (TZ del producto) para las superficies de nutricion V2.
 *
 * La fecha con la que el alumno lee y ESCRIBE su dia se calculaba con `useMemo(todayInSantiago, [])`
 * dentro de cada pantalla: se congelaba al montar y no volvia a moverse. Con la app viva cruzando
 * medianoche (background o simplemente abierta) el "Hoy" seguia mostrando ayer y un "Lo comí" a las
 * 00:30 se persistia con `log_date` de ayer, aunque su `occurredAt` fuera de hoy (NUT-018).
 *
 * Aqui vive la fecha como VALOR VIVO: las funciones puras (testeables con reloj falso) y el hook
 * `useLocalDay`, que reevalua al proximo cambio de dia local y expone un `recheck()` para que la
 * pantalla lo dispare al volver del background o al recuperar el foco.
 *
 * Modulo sin react-native: solo `react` + `Intl`, para poder testearlo bajo Vitest.
 */
import { useCallback, useEffect, useState } from 'react'

/** Zona horaria canonica del producto (todas las fechas de nutricion V2 son locales a Chile). */
export const NUTRITION_TZ = 'America/Santiago'

const DAY_MS = 24 * 60 * 60 * 1000

/** Dia local `YYYY-MM-DD` en `timeZone` para el instante dado (DST-safe: lo resuelve Intl). */
export function localDayIn(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Dia local de hoy en la TZ del producto. Reemplaza las 6 copias literales de `todayInSantiago`. */
export function todayInSantiago(at: Date = new Date()): string {
  return localDayIn(NUTRITION_TZ, at)
}

/** Hora local `{hour, minute, second}` en `timeZone` (reloj de 24 h, sin depender del host). */
function localClockIn(timeZone: string, at: Date): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  return { hour: value('hour'), minute: value('minute'), second: value('second') }
}

/**
 * Milisegundos hasta el proximo cambio de dia local. Estimacion por reloj de pared: en un dia con
 * salto DST el delta puede quedar corto o largo por una hora, y por eso el consumidor SIEMPRE
 * revalida el dia al despertar y reprograma (nunca asume que ya cambio). Minimo 1 s para no
 * degenerar en un timer caliente.
 */
export function msUntilNextLocalDay(timeZone: string, at: Date = new Date()): number {
  const { hour, minute, second } = localClockIn(timeZone, at)
  const elapsed = ((hour * 60 + minute) * 60 + second) * 1000 + at.getMilliseconds()
  return Math.max(DAY_MS - elapsed, 1000)
}

/**
 * Dia local VIVO. Devuelve `[day, recheck]`:
 *  - `day` se recalcula solo al cruzar la medianoche local (timer reprogramado tras cada disparo);
 *  - `recheck()` fuerza la revalidacion — la pantalla lo llama al recuperar foco y al volver del
 *    background, que es cuando el timer pudo no haber corrido (proceso suspendido).
 *
 * La identidad del string se conserva si el dia no cambio, asi los `useCallback`/`useEffect` que
 * dependen de la fecha no se reencadenan sin motivo.
 */
export function useLocalDay(timeZone: string = NUTRITION_TZ): [string, () => void] {
  const [day, setDay] = useState(() => localDayIn(timeZone))

  const recheck = useCallback(() => {
    setDay((current) => {
      const next = localDayIn(timeZone)
      return next === current ? current : next
    })
  }, [timeZone])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return
        recheck()
        schedule()
      }, msUntilNextLocalDay(timeZone))
    }
    recheck()
    schedule()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [recheck, timeZone])

  return [day, recheck]
}
