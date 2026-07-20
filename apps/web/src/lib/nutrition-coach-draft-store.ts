/**
 * Respaldo LOCAL de borradores del coach en Nutricion V2 (quick-edit + builder de 4 pasos).
 *
 * Problema que resuelve: si el coach cierra la PWA / mata la pestana / se queda sin bateria a mitad
 * de una edicion (quick-edit) o de la construccion de un plan (wizard), todo el arbol editable vivia
 * solo en memoria de React y se perdia. Este modulo persiste ese arbol en localStorage para ofrecer
 * "Restaurar borrador" al volver.
 *
 * Precedentes en el repo que este modulo consolida:
 * - `WeeklyPlanBuilder.tsx` (builder de entrenamiento): autosave debounced + banner Restaurar —
 *   pero su key NO incluia clientId (riesgo de restaurar el borrador de OTRO alumno). Aca la key
 *   SIEMPRE incluye clientId.
 * - `workout-draft-store.ts` (alumno): best-effort try/catch + sweep por edad.
 * - `nutrition-plan-local-cache.ts`: payload versionado (`v: 1`) + tope de tamano antes de escribir.
 *
 * Store PURO (sin React/Next). El wiring (cuando capturar / restaurar / limpiar) vive en
 * `QuickEditProvider` y `PlanBuilderClient`. Todas las operaciones son best-effort: en modo privado /
 * SSR / cuota llena degradan a "no hay borrador" sin romper la pantalla.
 */

const QUICK_EDIT_PREFIX = 'eva:nutrition-qe-draft:'
const BUILDER_PREFIX = 'eva:nutrition-builder-draft:'

/** Vida maxima de un borrador (7 dias): el coach puede retomar al dia siguiente sin perderlo. */
export const NUTRITION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Tope de tamano serializado (mismo criterio que `nutrition-plan-local-cache.ts`). */
const MAX_SERIALIZED_CHARS = 450_000

/** Sobre versionado que envuelve cualquier payload persistido. */
export interface NutritionDraftRecord<TPayload> {
    v: 1
    savedAt: number
    payload: TPayload
}

/** Key del borrador de quick-edit — una sola sesion de quick-edit por alumno a la vez. */
export function quickEditDraftKey(clientId: string): string {
    return `${QUICK_EDIT_PREFIX}${clientId}`
}

/** Key del borrador del builder — distingue "plan nuevo" de "nueva version del plan X". */
export function builderDraftKey(clientId: string, planId: string | null): string {
    return `${BUILDER_PREFIX}${clientId}:${planId ?? 'new'}`
}

/**
 * Lee y valida el sobre de un borrador. `null` ante ausencia, basura, version desconocida o edad
 * vencida (el caller decide validaciones de contenido adicionales, p.ej. baseVersionId).
 */
export function readNutritionDraft<TPayload>(
    key: string,
    nowMs: number,
    maxAgeMs: number = NUTRITION_DRAFT_MAX_AGE_MS,
): NutritionDraftRecord<TPayload> | null {
    try {
        const raw = localStorage.getItem(key)
        if (raw == null) return null
        const parsed = JSON.parse(raw) as NutritionDraftRecord<TPayload> | null
        if (parsed == null || typeof parsed !== 'object' || parsed.v !== 1) return null
        const savedAt = Number(parsed.savedAt)
        if (!Number.isFinite(savedAt) || nowMs - savedAt >= maxAgeMs) return null
        if (parsed.payload == null || typeof parsed.payload !== 'object') return null
        return parsed
    } catch {
        return null
    }
}

/** Persiste un borrador (sobre `v:1` + timestamp). No escribe payloads gigantes. Best-effort. */
export function writeNutritionDraft<TPayload>(key: string, payload: TPayload, nowMs: number): boolean {
    try {
        const record: NutritionDraftRecord<TPayload> = { v: 1, savedAt: nowMs, payload }
        const raw = JSON.stringify(record)
        if (raw.length > MAX_SERIALIZED_CHARS) return false
        localStorage.setItem(key, raw)
        return true
    } catch {
        return false
    }
}

/** Borra un borrador (publish exitoso / descarte explicito / base obsoleta). Best-effort. */
export function clearNutritionDraft(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        /* best-effort */
    }
}

/**
 * Higiene global: barre TODOS los borradores de nutricion (ambos prefijos) vencidos o basura.
 * Correr al montar la ficha / el builder. Best-effort.
 */
export function sweepStaleNutritionDrafts(nowMs: number, maxAgeMs: number = NUTRITION_DRAFT_MAX_AGE_MS): void {
    try {
        const stale: string[] = []
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i)
            if (key == null) continue
            if (!key.startsWith(QUICK_EDIT_PREFIX) && !key.startsWith(BUILDER_PREFIX)) continue
            if (readNutritionDraft(key, nowMs, maxAgeMs) == null) stale.push(key)
        }
        for (const key of stale) localStorage.removeItem(key)
    } catch {
        /* best-effort */
    }
}
