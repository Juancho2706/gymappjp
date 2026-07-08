/**
 * Autosave de BORRADORES de series (BUG 2 — "pongo atrás y tengo que registrar todo de nuevo").
 *
 * Causa raíz (forense 2026-07-07): los inputs kg/reps del `LogSetForm` son UNCONTROLLED
 * (defaultValue + refs) y rpe/rir/note viven en `useState`. El ÚNICO persist era `enqueueWorkoutLog`
 * dentro de `handleSubmit` (al tocar ✓). Todo lo TIPEADO SIN CONFIRMAR moría en cualquier desmontaje
 * del componente (botón atrás, reload, kill de la PWA) → la alumna reabría con la fila vacía y "tenía
 * que registrar todo de nuevo".
 *
 * Este módulo es el store PURO (sin React/Next) de esos borradores por (plan, bloque, serie). Guarda
 * los STRINGS CRUDOS tal como los tipeó la alumna (es-CL con coma en el path del teclado custom — NO
 * se normaliza acá; la normalización a punto vive en `handleSubmit` al confirmar). El wiring (cuándo
 * capturar / rehidratar / limpiar) vive en `LogSetForm` y `WorkoutExecutionClient`.
 *
 * Todas las lecturas/escrituras son best-effort (try/catch), como `session-clock.ts`: en modo privado
 * / SSR / cuota llena `localStorage` puede lanzar; el borrador degrada a "no hay borrador" (el
 * comportamiento previo al fix) en vez de romper la pantalla.
 */

const PREFIX = 'eva:workout-draft:'

/** Vida máxima de un borrador antes de considerarlo basura (24 h por default). */
export const DEFAULT_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Campos crudos de un borrador (strings tal como se tipearon; todos opcionales). */
export interface DraftFields {
    /** Peso crudo (es-CL con coma en el path keypad, o crudo del input number en desktop). */
    w?: string
    /** Reps crudas. */
    r?: string
    /** RPE como string (el estado numérico se serializa al capturar; se parsea al rehidratar). */
    rpe?: string
    /** RIR como string. */
    rir?: string
    /** Nota rápida. */
    note?: string
}

/** Entrada persistida = campos + marca de tiempo (para el barrido de borradores viejos). */
export type DraftEntry = DraftFields & { ts: number }

/** Clave de localStorage del mapa de borradores de un plan. */
export function draftStoreKey(planId: string): string {
    return `${PREFIX}${planId}`
}

/** Clave de una serie dentro del mapa: (block_id, set_number) — mismo motor que la cola y el upsert. */
function entryKey(blockId: string, setNumber: number): string {
    return `${blockId}:${setNumber}`
}

/** Lee el mapa completo de borradores del plan. `{}` ante ausencia / basura / excepción. */
function readMap(planId: string): Record<string, DraftEntry> {
    try {
        const raw = localStorage.getItem(draftStoreKey(planId))
        if (raw == null) return {}
        const parsed = JSON.parse(raw)
        // Sólo un objeto plano (no array, no null) es un mapa válido.
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return parsed as Record<string, DraftEntry>
    } catch {
        return {}
    }
}

/** Persiste el mapa (o borra la clave si quedó vacío). Best-effort → devuelve si se pudo escribir. */
function writeMap(planId: string, map: Record<string, DraftEntry>): boolean {
    try {
        if (Object.keys(map).length === 0) {
            localStorage.removeItem(draftStoreKey(planId))
            return true
        }
        localStorage.setItem(draftStoreKey(planId), JSON.stringify(map))
        return true
    } catch {
        return false
    }
}

/** Lee el borrador de una serie concreta. `null` si no existe o si el store no está disponible. */
export function readDraft(planId: string, blockId: string, setNumber: number): DraftEntry | null {
    const entry = readMap(planId)[entryKey(blockId, setNumber)]
    return entry != null && typeof entry === 'object' ? entry : null
}

/**
 * Guarda (MERGE por campo) el borrador de una serie + refresca su `ts`. Los campos NO incluidos en
 * `partial` se conservan (merge incremental: kg entra por un evento, la nota por otro). Best-effort.
 */
export function saveDraft(
    planId: string,
    blockId: string,
    setNumber: number,
    partial: DraftFields,
    nowMs: number = Date.now(),
): boolean {
    const map = readMap(planId)
    const key = entryKey(blockId, setNumber)
    const prev = map[key] ?? {}
    map[key] = { ...prev, ...partial, ts: nowMs }
    return writeMap(planId, map)
}

/** Borra el borrador de una serie (al confirmarla → la cola ya tiene la verdad). Best-effort. */
export function clearDraft(planId: string, blockId: string, setNumber: number): void {
    const map = readMap(planId)
    const key = entryKey(blockId, setNumber)
    if (!(key in map)) return
    delete map[key]
    writeMap(planId, map)
}

/** Borra TODOS los borradores del plan (al finalizar la sesión). Best-effort. */
export function clearAllDrafts(planId: string): void {
    try {
        localStorage.removeItem(draftStoreKey(planId))
    } catch {
        /* best-effort */
    }
}

/**
 * Higiene: borra los borradores del plan cuyo `ts` es más viejo que `maxAgeMs` (default 24 h) — restos
 * de sesiones abandonadas que nunca se confirmaron ni finalizaron. Corre al montar la ejecución.
 * Best-effort: cualquier fallo deja el mapa intacto sin propagar.
 */
export function sweepStaleDrafts(
    planId: string,
    nowMs: number,
    maxAgeMs: number = DEFAULT_DRAFT_MAX_AGE_MS,
): void {
    const map = readMap(planId)
    let changed = false
    for (const key of Object.keys(map)) {
        const ts = Number(map[key]?.ts)
        // ts inválido (basura) o vencido → se descarta.
        if (!Number.isFinite(ts) || nowMs - ts >= maxAgeMs) {
            delete map[key]
            changed = true
        }
    }
    if (changed) writeMap(planId, map)
}
