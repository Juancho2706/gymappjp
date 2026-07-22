/**
 * Respaldo LOCAL de borradores del coach en Nutricion V2 (quick-edit + builder de 4 pasos) — RN.
 *
 * Problema que resuelve: si el coach mata la app / se queda sin bateria a mitad de una edicion
 * in-place (quick-edit) o de la construccion de un plan (wizard), el arbol editable vive solo en
 * memoria del reducer y se perdia. Este modulo persiste ese arbol en AsyncStorage para ofrecer
 * "Restaurar borrador" al volver.
 *
 * Port 1:1 del store web `apps/web/src/lib/nutrition-coach-draft-store.ts`. La UNICA divergencia es de
 * PLATAFORMA: localStorage web es SINCRONO; AsyncStorage RN es `Promise`-based, asi que las cuatro
 * funciones exponen las mismas firmas pero `async`. Misma degradacion silenciosa best-effort (try/catch)
 * que web en modo privado / cuota llena → "no hay borrador" sin romper la pantalla. El patron exacto
 * (envelope + AsyncStorage) ya vive en `nutrition-v2-cache.ts`.
 *
 * Gotcha PR #148 (vinculante): la key del borrador SIEMPRE incluye `clientId`. El precedente del
 * builder de entrenamiento tenia una key SIN `clientId` → riesgo de restaurar el borrador de OTRO
 * alumno. Aca la key nace con `clientId`.
 *
 * Store PURO (sin React): el wiring (cuando capturar / restaurar / limpiar) vive en `QuickEditMode`
 * (quick-edit) y en el builder (4B-13, que REUSA `builderDraftKey`). Por eso nace con AMBOS prefijos.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const QUICK_EDIT_PREFIX = 'eva:nutrition-qe-draft:'
const BUILDER_PREFIX = 'eva:nutrition-builder-draft:'

/** Vida maxima de un borrador (7 dias): el coach puede retomar al dia siguiente sin perderlo. */
export const NUTRITION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Tope de tamano serializado (mismo criterio que web y `nutrition-plan-local-cache.ts`). */
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
export async function readNutritionDraft<TPayload>(
  key: string,
  nowMs: number,
  maxAgeMs: number = NUTRITION_DRAFT_MAX_AGE_MS,
): Promise<NutritionDraftRecord<TPayload> | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
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
export async function writeNutritionDraft<TPayload>(
  key: string,
  payload: TPayload,
  nowMs: number,
): Promise<boolean> {
  try {
    const record: NutritionDraftRecord<TPayload> = { v: 1, savedAt: nowMs, payload }
    const raw = JSON.stringify(record)
    if (raw.length > MAX_SERIALIZED_CHARS) return false
    await AsyncStorage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

/** Borra un borrador (publish exitoso / descarte explicito / base obsoleta). Best-effort. */
export async function clearNutritionDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}

/**
 * Higiene global: barre TODOS los borradores de nutricion (ambos prefijos) vencidos o basura.
 * Correr al montar el modo edicion / el builder. Best-effort.
 */
export async function sweepStaleNutritionDrafts(
  nowMs: number,
  maxAgeMs: number = NUTRITION_DRAFT_MAX_AGE_MS,
): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const relevant = keys.filter(
      (key) => key.startsWith(QUICK_EDIT_PREFIX) || key.startsWith(BUILDER_PREFIX),
    )
    const stale: string[] = []
    for (const key of relevant) {
      if ((await readNutritionDraft(key, nowMs, maxAgeMs)) == null) stale.push(key)
    }
    await Promise.all(stale.map((key) => AsyncStorage.removeItem(key)))
  } catch {
    /* best-effort */
  }
}
