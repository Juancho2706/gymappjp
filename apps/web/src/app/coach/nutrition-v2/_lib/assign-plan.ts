/**
 * Logica PURA de "Asignar este plan a otros alumnos" (web coach). Sin React / Next / Supabase:
 * solo el contrato del draft (@eva/nutrition-v2). Testeable de punta a punta.
 *
 * Tres piezas:
 *  - `validateAssignTargets`: valida la seleccion (no vacia, sin duplicados, sin la fuente, tope).
 *  - `assignmentKeyForClient`: clave de idempotencia ESTABLE por (operacion, alumno destino).
 *  - `buildDraftForTarget`: construye el draft equivalente para un alumno destino desde la
 *    estructura del plan FUENTE (read model del detalle).
 *  - `aggregateAssignResults`: agrega el reporte parcial por alumno.
 *
 * Que se COPIA de la fuente al destino: nombre, estrategia, zona horaria, permisos, metas,
 * variantes/franjas/items (la prescripcion completa) y las notas visibles (parte del plan que
 * ve el alumno). Que NO se copia: notas privadas y protocolo (texto clinico ligado al alumno
 * FUENTE, no transferible) y los `substitutionGroupId` (ids opacos por-version; el builder web
 * no modela grupos de sustitucion, copiarlos dejaria referencias colgantes). El gate Pro se
 * re-evalua sobre el draft resultante, cuyas capacidades Pro transferibles son la estrategia
 * hibrida y las multiples variantes.
 */

import {
  buildNutritionIdempotencyKey,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionStrategy,
  type NutritionStudentPermissions,
} from '@eva/nutrition-v2'

/** Tope defensivo de alumnos destino por operacion (evita fan-outs enormes). */
export const MAX_ASSIGN_TARGETS = 30

/**
 * ¿El alumno FUENTE puede prestar su plan a otros? Solo si tiene una version PUBLICADA
 * VIGENTE (la que resuelve en vivo el read model del plan activo) y estructura que copiar. No
 * basta con que exista una cabecera de plan en el read model: un plan `superseded` (publicado en
 * el pasado pero sin vigencia hoy) o un plan sin variantes no es copiable — no tendria
 * sentido "asignar un plan que no existe". Espeja la senal que gobierna el empty-state de
 * la ficha (`detail.plan.plan`). Puro: la ficha lo usa para mostrar/ocultar el CTA y el
 * server action mantiene su propia barrera (RLS + re-fetch de la estructura del plan).
 */
export interface AssignEligibilityInput {
  /** Estado del plan activo/publicado en vivo: `detail.plan.plan?.status ?? null`. */
  vigentePlanStatus: "published" | "superseded" | null
  /** ¿El read model del plan trae cabecera (`detail.plan.plan !== null`)? */
  hasPlanStructure: boolean
  /** Cantidad de variantes prescritas en el plan (`detail.plan.dayVariants.length`). */
  variantCount: number
}

export function canAssignSourcePlan(input: AssignEligibilityInput): boolean {
  return (
    input.vigentePlanStatus === "published" &&
    input.hasPlanStructure &&
    input.variantCount > 0
  )
}

export type AssignValidationError =
  | 'NO_TARGETS'
  | 'DUPLICATE_TARGETS'
  | 'SOURCE_IN_TARGETS'
  | 'TOO_MANY_TARGETS'

export type ValidateAssignTargetsResult =
  | { ok: true; targets: string[] }
  | { ok: false; code: AssignValidationError; error: string }

const VALIDATION_MESSAGE: Record<AssignValidationError, string> = {
  NO_TARGETS: 'Selecciona al menos un alumno destino.',
  DUPLICATE_TARGETS: 'Hay alumnos repetidos en la seleccion.',
  SOURCE_IN_TARGETS: 'No puedes asignar el plan al mismo alumno de origen.',
  TOO_MANY_TARGETS: `Puedes asignar hasta ${MAX_ASSIGN_TARGETS} alumnos por vez.`,
}

/**
 * Valida la seleccion de alumnos destino contra el alumno fuente. Rechaza seleccion vacia,
 * duplicados, la inclusion de la fuente y el exceso del tope. Devuelve la lista tal cual
 * (ya sin duplicados por construccion) cuando es valida.
 */
export function validateAssignTargets(
  sourceClientId: string,
  targetClientIds: readonly string[],
): ValidateAssignTargetsResult {
  if (targetClientIds.length === 0) {
    return { ok: false, code: 'NO_TARGETS', error: VALIDATION_MESSAGE.NO_TARGETS }
  }
  const unique = new Set(targetClientIds)
  if (unique.size !== targetClientIds.length) {
    return { ok: false, code: 'DUPLICATE_TARGETS', error: VALIDATION_MESSAGE.DUPLICATE_TARGETS }
  }
  if (unique.has(sourceClientId)) {
    return { ok: false, code: 'SOURCE_IN_TARGETS', error: VALIDATION_MESSAGE.SOURCE_IN_TARGETS }
  }
  if (targetClientIds.length > MAX_ASSIGN_TARGETS) {
    return { ok: false, code: 'TOO_MANY_TARGETS', error: VALIDATION_MESSAGE.TOO_MANY_TARGETS }
  }
  return { ok: true, targets: [...targetClientIds] }
}

/**
 * Clave de idempotencia ESTABLE por (operacion, alumno destino). Reusa el generador canonico
 * (kind='publish'); el `clientId` del destino la vuelve distinta por alumno y el `operationId`
 * (estable durante la sesion del dialogo) la mantiene estable entre reintentos: reintentar la
 * misma operacion re-usa la clave y `publish_nutrition_plan_v2` devuelve la version existente.
 */
export function assignmentKeyForClient(input: {
  operationId: string
  targetClientId: string
}): string {
  return buildNutritionIdempotencyKey({
    clientId: input.targetClientId,
    deviceId: 'web-assign',
    operationId: input.operationId,
    kind: 'publish',
  })
}

// -- Construccion del draft destino desde la estructura del plan FUENTE (read model) --

export interface AssignSourceItem {
  foodId: string | null
  recipeId: string | null
  name: string | null
  quantity: number
  unit: string
  minimumQuantity: number | null
  maximumQuantity: number | null
  optional: boolean
  notes: string | null
}

export interface AssignSourceSlot {
  code: string
  name: string
  startTime: string | null
  endTime: string | null
  mode: 'anchor' | 'flexible'
  required: boolean
  instructions: string | null
  targets: Partial<NutritionMacroTargets>
  prescriptionItems: AssignSourceItem[]
}

export interface AssignSourceVariant {
  key: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  targets: NutritionMacroTargets
  mealSlots: AssignSourceSlot[]
}

/** Subconjunto estructural de NutritionPlanReadModel que necesita el copiado. */
export interface AssignSourcePlan {
  plan: { name: string; strategy: NutritionStrategy } | null
  timezone: string
  visibleNotes: string | null
  permissions: NutritionStudentPermissions
  dayVariants: AssignSourceVariant[]
}

export type BuildDraftForTargetResult =
  | { ok: true; draft: NutritionPlanDraft }
  | { ok: false; code: 'NO_SOURCE_PLAN'; error: string }

/**
 * Construye el draft equivalente para un alumno destino desde la estructura del plan fuente.
 * `planId` presente => se anexa una nueva version al plan del destino; ausente => plan nuevo.
 * `effectiveFrom` fija la vigencia. Conserva franjas/items y metas; nulifica notas privadas/
 * protocolo y grupos de sustitucion (ver cabecera del modulo).
 */
export function buildDraftForTarget(input: {
  source: AssignSourcePlan
  targetClientId: string
  effectiveFrom: string
  planId?: string | null
}): BuildDraftForTargetResult {
  const { source, targetClientId, effectiveFrom, planId } = input
  if (!source.plan || source.dayVariants.length === 0) {
    return { ok: false, code: 'NO_SOURCE_PLAN', error: 'El alumno de origen no tiene un plan V2 vigente para copiar.' }
  }

  const dayVariants: NutritionPlanDraft['dayVariants'] = source.dayVariants.map((variant, variantIndex) => ({
    key: variant.key,
    label: variant.label,
    dayOfWeek: variant.dayOfWeek,
    default: variant.isDefault,
    targets: variant.targets,
    orderIndex: variantIndex,
    mealSlots: variant.mealSlots.map((slot, slotIndex) => ({
      code: slot.code,
      name: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      mode: slot.mode,
      required: slot.required,
      targets: slot.targets,
      instructions: slot.instructions,
      orderIndex: slotIndex,
      items: slot.prescriptionItems.map((item, itemIndex) => {
        const hasRef = Boolean(item.foodId) || Boolean(item.recipeId)
        return {
          foodId: item.foodId,
          recipeId: item.recipeId,
          customName: hasRef ? null : item.name,
          quantity: item.quantity,
          unit: item.unit,
          minimumQuantity: item.minimumQuantity,
          maximumQuantity: item.maximumQuantity,
          optional: item.optional,
          substitutionGroupId: null,
          notes: item.notes,
          orderIndex: itemIndex,
        }
      }),
    })),
  }))

  const draft: NutritionPlanDraft = {
    ...(planId ? { planId } : {}),
    clientId: targetClientId,
    name: source.plan.name,
    strategy: source.plan.strategy,
    effectiveFrom,
    timezone: source.timezone,
    permissions: source.permissions,
    visibleNotes: source.visibleNotes,
    privateNotes: null,
    protocolNotes: null,
    dayVariants,
  }
  return { ok: true, draft }
}

// -- Reporte parcial por alumno --

export interface AssignClientResult {
  clientId: string
  ok: boolean
  error?: string
  versionId?: string
}

export interface AssignSummary {
  total: number
  succeeded: number
  failed: number
}

/** Agrega el reporte por alumno en un resumen (total / exitosos / fallidos). */
export function aggregateAssignResults(results: readonly AssignClientResult[]): AssignSummary {
  let succeeded = 0
  for (const r of results) {
    if (r.ok) succeeded += 1
  }
  return { total: results.length, succeeded, failed: results.length - succeeded }
}
