/**
 * Lógica PURA de "Asignar plan a otros alumnos" + "Archivar plan vigente" (RN coach).
 *
 * ESPEJO 1:1 de la web `apps/web/src/app/coach/nutrition-v2/_lib/assign-plan.ts` y
 * `_lib/archive-plan.ts`. Igual que su gemelo web, este módulo NO importa react-native / expo /
 * supabase: solo el contrato del draft (@eva/nutrition-v2) + zod, así queda testeable de punta a
 * punta. La consolidación de esta lógica en `@eva/nutrition-v2` (para que web y RN consuman UNA
 * sola fuente) está DIFERIDA como deuda por el owner (no tocar `packages/*` en esta unidad); este
 * espejo con test 1:1 es la alternativa sancionada (misma pauta que 4B-16). Cualquier cambio de
 * mensajes/constantes debe replicarse en ambos lados hasta consolidar.
 *
 * Piezas de asignación:
 *  - `canAssignSourcePlan`: elegibilidad del CTA (plan publicado vigente + estructura).
 *  - `validateAssignTargets`: valida la selección (no vacía, sin duplicados, sin la fuente, tope).
 *  - `assignmentKeyForClient`: clave de idempotencia ESTABLE por (operación, alumno destino).
 *  - `buildDraftForTarget`: construye el draft equivalente para un alumno destino.
 *  - `aggregateAssignResults`: agrega el reporte parcial por alumno.
 *  - `planReadModelToAssignSource`: adaptador del read-model del detalle a la estructura fuente.
 *
 * Piezas de archivado:
 *  - `ArchivePlanInputSchema`: contrato de entrada (uuid) antes de tocar la red.
 *  - `classifyArchiveWrite`: clasifica el resultado del UPDATE RLS-scoped (pura, sin DB).
 *
 * Qué se COPIA de la fuente al destino: nombre, estrategia, zona horaria, permisos, metas,
 * variantes/franjas/items (la prescripción completa) y las notas visibles (parte que ve el
 * alumno). Qué NO se copia: notas privadas y protocolo (texto clínico ligado al alumno FUENTE) y
 * los `substitutionGroupId` (ids opacos por-versión). El gate Pro se re-evalúa sobre el draft
 * resultante (estrategia híbrida / múltiples variantes).
 */

import { z } from 'zod'
import {
  buildNutritionIdempotencyKey,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionPlanReadModel,
  type NutritionStrategy,
  type NutritionStudentPermissions,
} from '@eva/nutrition-v2'

// ---------------------------------------------------------------------------
// A. Asignar plan a otros alumnos (espejo de _lib/assign-plan.ts)
// ---------------------------------------------------------------------------

/** Tope defensivo de alumnos destino por operación (evita fan-outs enormes). */
export const MAX_ASSIGN_TARGETS = 30

/**
 * ¿El alumno FUENTE puede prestar su plan a otros? Solo si tiene una versión PUBLICADA VIGENTE
 * (la que resuelve en vivo `detail.plan.plan`) y estructura que copiar. Un plan `superseded` o
 * sin variantes no es copiable. Espeja la señal que gobierna el empty-state de la ficha. Puro: la
 * ficha lo usa para mostrar/ocultar el CTA; el servidor mantiene su propia barrera (RLS).
 */
export interface AssignEligibilityInput {
  /** Estado del plan activo/publicado en vivo: `detail.plan.plan?.status ?? null`. */
  vigentePlanStatus: 'published' | 'superseded' | null
  /** ¿El read model del plan trae cabecera (`detail.plan.plan !== null`)? */
  hasPlanStructure: boolean
  /** Cantidad de variantes prescritas en el plan (`detail.plan.dayVariants.length`). */
  variantCount: number
}

export function canAssignSourcePlan(input: AssignEligibilityInput): boolean {
  return (
    input.vigentePlanStatus === 'published' &&
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
 * Valida la selección de alumnos destino contra el alumno fuente. Rechaza selección vacía,
 * duplicados, la inclusión de la fuente y el exceso del tope. Devuelve la lista tal cual cuando
 * es válida.
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
 * Clave de idempotencia ESTABLE por (operación, alumno destino). Reusa el generador canónico
 * (kind='publish'); el `clientId` del destino la vuelve distinta por alumno y el `operationId`
 * (estable durante la sesión del diálogo) la mantiene estable entre reintentos: reintentar la
 * misma operación re-usa la clave y `publish_nutrition_plan_v2` devuelve la versión existente.
 * `deviceId='rn-assign'` la distingue del origen web (`web-assign`).
 */
export function assignmentKeyForClient(input: {
  operationId: string
  targetClientId: string
}): string {
  return buildNutritionIdempotencyKey({
    clientId: input.targetClientId,
    deviceId: 'rn-assign',
    operationId: input.operationId,
    kind: 'publish',
  })
}

// -- Construcción del draft destino desde la estructura del plan FUENTE (read model) --

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

/**
 * Adaptador PURO del read-model del detalle (`detail.plan`, NutritionPlanReadModel) a la
 * estructura fuente que consume `buildDraftForTarget`. RN ya tiene el `detail` en pantalla, así
 * que no re-consulta nada: mapea la cabecera + variantes/franjas/items 1:1. El equivalente web
 * hace lo mismo dentro del server action (`getNutritionClientDetailV2ForWeb` -> `.plan`).
 */
export function planReadModelToAssignSource(plan: NutritionPlanReadModel): AssignSourcePlan {
  return {
    plan: plan.plan ? { name: plan.plan.name, strategy: plan.plan.strategy } : null,
    timezone: plan.timezone,
    visibleNotes: plan.visibleNotes,
    permissions: plan.permissions,
    dayVariants: plan.dayVariants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      dayOfWeek: variant.dayOfWeek,
      isDefault: variant.isDefault,
      targets: variant.targets,
      mealSlots: variant.mealSlots.map((slot) => ({
        code: slot.code,
        name: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        mode: slot.mode,
        required: slot.required,
        instructions: slot.instructions,
        targets: slot.targets,
        prescriptionItems: slot.prescriptionItems.map((item) => ({
          foodId: item.foodId,
          recipeId: item.recipeId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          minimumQuantity: item.minimumQuantity,
          maximumQuantity: item.maximumQuantity,
          optional: item.optional,
          notes: item.notes,
        })),
      })),
    })),
  }
}

export type BuildDraftForTargetResult =
  | { ok: true; draft: NutritionPlanDraft }
  | { ok: false; code: 'NO_SOURCE_PLAN'; error: string }

/**
 * Construye el draft equivalente para un alumno destino desde la estructura del plan fuente.
 * `planId` presente => se anexa una nueva versión al plan del destino; ausente => plan nuevo.
 * `effectiveFrom` fija la vigencia. Conserva franjas/items y metas; nulifica notas privadas/
 * protocolo y grupos de sustitución (ver cabecera del módulo).
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

// ---------------------------------------------------------------------------
// B. Archivar plan vigente (espejo de _lib/archive-plan.ts)
// ---------------------------------------------------------------------------

// El dominio V2 NUNCA borra: "eliminar" un plan = archivarlo (nutrition_plans_v2.lifecycle_status
// 'active' -> 'archived' + archived_at). El historial de consumo/adherencia se conserva; el
// alumno solo deja de ver el plan vigente.

export const ArchivePlanInputSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
})
export type ArchivePlanInput = z.infer<typeof ArchivePlanInputSchema>

export type ArchivePlanFailureCode = 'PLAN_NOT_FOUND' | 'SCOPE_DENIED' | 'WRITE_FAILED'

export type ArchiveWriteOutcome =
  | { code: 'OK' }
  | { code: ArchivePlanFailureCode; error: string }

/**
 * Clasifica el resultado del UPDATE de archivado (pura, testeable sin DB). El UPDATE corre
 * RLS-scoped con `.select('id')` y un WHERE que exige `lifecycle_status = 'active'`:
 * - error 42501 (WITH CHECK / column grants / trigger de identidad) -> SCOPE_DENIED.
 * - cualquier otro error de DB -> WRITE_FAILED.
 * - 0 filas afectadas (RLS no ve la fila, o el plan ya no está 'active': inexistente, ya
 *   archivado, o no pertenece al alumno) -> PLAN_NOT_FOUND.
 * - >=1 fila -> OK.
 */
export function classifyArchiveWrite(input: {
  errorCode: string | null | undefined
  rowsAffected: number
}): ArchiveWriteOutcome {
  const { errorCode, rowsAffected } = input
  if (errorCode) {
    if (errorCode === '42501') {
      return { code: 'SCOPE_DENIED', error: 'No tienes permiso para archivar el plan de este alumno.' }
    }
    return { code: 'WRITE_FAILED', error: 'No se pudo archivar el plan. Intenta nuevamente.' }
  }
  if (rowsAffected <= 0) {
    return { code: 'PLAN_NOT_FOUND', error: 'No se encontro un plan vigente para archivar.' }
  }
  return { code: 'OK' }
}
