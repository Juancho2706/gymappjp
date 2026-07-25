/**
 * Gate de la ceremonia del "Despegue" (Ejecutor V3) — utilidades a NIVEL MÓDULO compartidas por el
 * provider del overlay (`WorkoutLaunchProvider`), el ejecutor (`WorkoutExecutionClient`) y los dos
 * sync de cola offline del layout `/c` (`OfflineWorkoutQueueSync` / `OfflineNutritionQueueSync`).
 *
 * Root cause que resuelve (auditoría "el Despegue a veces no espera el tap"): un `router.refresh()` no
 * gateado que cae dentro de la ceremonia degrada, en red lenta, a NAVEGACIÓN DURA del browser → el
 * provider del layout se remonta → el overlay muere sin tap. Los sync de cola disparaban ese refresh sin
 * conciencia alguna de la ceremonia. Aquí exponemos:
 *
 *  - Una marca en el DOM (`data-exec-ceremony` en <html>) que el provider pone mientras el overlay está
 *    vivo y quita al terminar. Los sync consultan `waitForCeremonyEnd()` para DIFERIR sólo su refresh
 *    (nunca el flush de datos) hasta que la ceremonia termine.
 *  - La marca de handoff `eva:exec-v3-morph` con TTL: en vez de un `'1'` eterno de consumo único, se
 *    escribe un timestamp; el consumidor sólo la acepta si es fresca (< 10 s) para que una marca rancia
 *    de una ceremonia muerta no salte fases en la próxima entrada. Se acepta el `'1'` legado para no
 *    romper una sesión abierta durante el deploy.
 */

const CEREMONY_ATTR = 'data-exec-ceremony'
const MORPH_KEY = 'eva:exec-v3-morph'
/** Frescura de la marca de morph: más allá de esto la ceremonia se considera abandonada. */
const MORPH_TTL_MS = 10_000

/** Reloj a nivel módulo (evita el lint de react-compiler que prohíbe `Date.now()` en handlers). */
function nowMs(): number {
    return Date.now()
}

// ---- Marca de ceremonia en el DOM ----

/** Marca <html data-exec-ceremony="1"> mientras el overlay del Despegue esté vivo. */
export function markCeremonyDom(): void {
    try { document.documentElement.setAttribute(CEREMONY_ATTR, '1') } catch { /* SSR */ }
}

/** Quita la marca de ceremonia del DOM (al despedir el overlay o abortar). */
export function clearCeremonyDom(): void {
    try { document.documentElement.removeAttribute(CEREMONY_ATTR) } catch { /* SSR */ }
}

/** ¿Hay una ceremonia del Despegue activa ahora mismo? */
export function isCeremonyActive(): boolean {
    try { return document.documentElement.hasAttribute(CEREMONY_ATTR) } catch { return false }
}

/**
 * Resuelve cuando la ceremonia termina (se quita `data-exec-ceremony` vía MutationObserver) o al llegar
 * a `maxMs` (válvula para no colgar el flush si el overlay nunca limpia la marca). Si no hay ceremonia
 * activa, resuelve de inmediato. Sólo debe envolver el `router.refresh()`, NUNCA el flush de datos.
 */
export function waitForCeremonyEnd(maxMs: number): Promise<void> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined' || !isCeremonyActive()) {
            resolve()
            return
        }
        let settled = false
        let timer = 0
        const observer = new MutationObserver(() => {
            if (!isCeremonyActive()) finish()
        })
        function finish() {
            if (settled) return
            settled = true
            try { observer.disconnect() } catch { /* noop */ }
            if (timer) window.clearTimeout(timer)
            resolve()
        }
        try {
            observer.observe(document.documentElement, { attributes: true, attributeFilter: [CEREMONY_ATTR] })
        } catch {
            finish()
            return
        }
        timer = window.setTimeout(finish, maxMs)
    })
}

// ---- Marca de morph con TTL ----

/** Escribe la marca de handoff del morph con timestamp (fase 'start' del ejecutor la consume). */
export function markMorphFlag(): void {
    try { sessionStorage.setItem(MORPH_KEY, JSON.stringify({ t: nowMs() })) } catch { /* private mode */ }
}

/** Borra la marca de morph si sigue presente (usar al ABORTAR la ceremonia: no dejar marca rancia). */
export function clearMorphFlag(): void {
    try { sessionStorage.removeItem(MORPH_KEY) } catch { /* private mode */ }
}

/**
 * Consumo único de la marca de morph: la parsea, la BORRA, y devuelve true sólo si es fresca (< TTL).
 * Acepta el valor legado `'1'` como válido (sesión abierta durante el deploy). Devuelve false si la
 * marca no existe, es inválida, o está rancia (ceremonia abandonada) → el ejecutor no salta fases.
 */
export function readAndConsumeMorphFlag(): boolean {
    try {
        const raw = sessionStorage.getItem(MORPH_KEY)
        if (!raw) return false
        sessionStorage.removeItem(MORPH_KEY)
        if (raw === '1') return true // marca legada pre-TTL (deploy en caliente)
        const parsed = JSON.parse(raw) as { t?: unknown }
        if (typeof parsed?.t !== 'number') return false
        return nowMs() - parsed.t < MORPH_TTL_MS
    } catch {
        return false
    }
}
