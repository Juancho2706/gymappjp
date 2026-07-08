/**
 * Cronómetro de sesión ANCLADO Y PERSISTIDO (BUG 1 — informe forense 2026-07-07).
 *
 * Causa raíz: el ejecutor anclaba el cronómetro con `const start = Date.now()` dentro de un
 * `useEffect([])` solo-en-memoria. Botón atrás+volver, reload, o kill de la PWA REMONTAN el
 * componente → `start` volvía a `Date.now()` y la duración se reseteaba a 0 (screenshot real:
 * "0:40" para 22 series). `handleFinish` congelaba ese valor reseteado en el resumen.
 *
 * Fix: el ancla (epoch ms del inicio real de la sesión) se guarda en localStorage por
 * (plan, día calendario Santiago) y se rehidrata al montar, así el tiempo sobrevive remontajes.
 * Este módulo es PURO (sin React/Next) y testeado; el ejecutor sólo lo orquesta.
 *
 * Todas las lecturas/escrituras son best-effort (try/catch): en modo privado / SSR / cuota llena
 * `localStorage` puede lanzar; el cronómetro degrada a "solo-en-memoria" (comportamiento previo al
 * fix) en vez de romper la pantalla.
 */

const PREFIX = 'eva:workout-session-start:'

/** Clave de localStorage del ancla de sesión para un plan y día calendario (ISO `YYYY-MM-DD`). */
export function sessionClockKey(planId: string, dayIso: string): string {
    return `${PREFIX}${planId}:${dayIso}`
}

/**
 * Lee el ancla persistida (epoch ms). `null` si no existe, si es basura, o si es FUTURA.
 *
 * Decisión (documentada): un ancla > `nowMs` (reloj adelantado al persistir, o corrupción) se
 * DESCARTA devolviendo `null` para forzar un re-anclaje a `Date.now()`. Devolver el valor futuro
 * dejaría el cronómetro clavado en 0:00 hasta que el reloj real lo alcance (el consumidor clampa
 * con `elapsedSecondsSince`, pero eso sería peor UX: un cronómetro congelado en cero).
 */
export function readSessionStart(
    planId: string,
    dayIso: string,
    nowMs: number = Date.now(),
): number | null {
    try {
        const raw = localStorage.getItem(sessionClockKey(planId, dayIso))
        if (raw == null) return null
        const n = Number(raw)
        // Sólo un entero > 0 es un ancla válida (epoch ms). NaN / "" / 0 / negativo / decimal → re-anclar.
        if (!Number.isInteger(n) || n <= 0) return null
        // Ancla futura → descartar y re-anclar (ver decisión en el docstring).
        if (n > nowMs) return null
        return n
    } catch {
        return null
    }
}

/** Persiste el ancla (epoch ms). Best-effort → devuelve si se pudo escribir. */
export function persistSessionStart(planId: string, dayIso: string, startMs: number): boolean {
    try {
        localStorage.setItem(sessionClockKey(planId, dayIso), String(startMs))
        return true
    } catch {
        return false
    }
}

/** Borra el ancla del plan/día (al finalizar → una 2ª sesión del mismo día arranca de cero). */
export function clearSessionStart(planId: string, dayIso: string): void {
    try {
        localStorage.removeItem(sessionClockKey(planId, dayIso))
    } catch {
        /* best-effort */
    }
}

/**
 * Higiene: borra todas las anclas de sesión de OTROS días (sesiones abandonadas que nunca se
 * finalizaron → nunca se limpiaron). Conserva sólo las de `dayIso`. Las claves son
 * `eva:workout-session-start:${planId}:${dayIso}`; ni el UUID del plan ni el ISO del día contienen
 * `:` ni el sufijo del día, así que el match por sufijo es inequívoco.
 */
export function sweepOtherDaySessionStarts(dayIso: string): void {
    try {
        const suffix = `:${dayIso}`
        const stale: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key == null || !key.startsWith(PREFIX)) continue
            if (!key.endsWith(suffix)) stale.push(key)
        }
        for (const key of stale) localStorage.removeItem(key)
    } catch {
        /* best-effort */
    }
}

/**
 * Segundos transcurridos desde el ancla, clampados a 0. El `Math.max(0, …)` protege contra un reloj
 * que RETROCEDE (ajuste NTP / cambio manual de hora) dando un elapsed negativo.
 */
export function elapsedSecondsSince(startMs: number, nowMs: number): number {
    return Math.max(0, Math.floor((nowMs - startMs) / 1000))
}
