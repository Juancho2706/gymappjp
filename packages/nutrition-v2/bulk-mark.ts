/**
 * Bulk-mark de franja ("Comí toda esta comida") — lógica PURA compartida web/RN.
 *
 * Deriva, para una franja del Today del alumno, qué items prescritos marca el control de
 * registro en bloque y en qué estado está. Regla dura (decisión CEO 2026-07-21): el bulk marca
 * SOLO items requeridos (no opcionales) aún no consumidos; los opcionales conservan su registro
 * individual. Sin React ni red: testeable con un fixture del read-model.
 */

import type { NutritionMealSlotRead, NutritionTodayReadModel } from './read-models'

export type PrescriptionItemRead = NutritionMealSlotRead['prescriptionItems'][number]

/**
 * - `all-open`: hay requeridos y ninguno consumido → CTA "Comí toda esta comida".
 * - `partial`: algunos requeridos consumidos, quedan `remaining` → CTA "Comer lo que falta (N)".
 * - `complete`: todos los requeridos consumidos → sin CTA, chip "Comida completa".
 * - `none-required`: la franja no tiene items requeridos (solo opcionales/porciones) → sin control.
 */
export type BulkMarkStatus = 'all-open' | 'partial' | 'complete' | 'none-required'

export interface BulkMarkSlotState {
  status: BulkMarkStatus
  /** Items requeridos NO consumidos — exactamente lo que registra el bulk. */
  eligible: PrescriptionItemRead[]
  /** Total de items requeridos (no opcionales) de la franja. */
  requiredTotal: number
  /** Requeridos ya consumidos (para el medidor de progreso). */
  requiredConsumed: number
  /** Requeridos que faltan (= eligible.length). */
  remaining: number
  /** kcal sumadas de los elegibles (feedback del control). */
  eligibleKcal: number
}

export const BULK_MARK_COMPLETE_LABEL = 'Comida completa'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Ids de items prescritos con un registro de consumo ACTIVO hoy (franjas + sin franja).
 *
 * Solo entran los ids que EXISTEN en el snapshot del día (unión de `mealSlots[].prescriptionItems`).
 * Republicar el plan el mismo día crea ids nuevos por item y deja los registros previos apuntando a
 * un item que ya no está (SPEC cantidades-honestas §1 Causa 2): esos huérfanos no describen ningún
 * item vigente, así que no pueden marcarlo como consumido ni apagar "Comí toda esta comida". La
 * franja quedaba "completa" sin que el alumno hubiera registrado nada de la versión nueva.
 */
export function consumedPrescriptionItemIds(today: NutritionTodayReadModel): Set<string> {
  const prescribedIds = new Set<string>()
  for (const slot of today.mealSlots) {
    for (const item of slot.prescriptionItems) prescribedIds.add(item.id)
  }
  const ids = new Set<string>()
  for (const slot of today.mealSlots) {
    for (const entry of slot.intakeItems) {
      if (entry.prescriptionItemId && prescribedIds.has(entry.prescriptionItemId)) ids.add(entry.prescriptionItemId)
    }
  }
  for (const entry of today.unassignedIntake) {
    if (entry.prescriptionItemId && prescribedIds.has(entry.prescriptionItemId)) ids.add(entry.prescriptionItemId)
  }
  return ids
}

/**
 * Estado del control bulk de una franja. `consumed` se puede pasar precomputado para no
 * recalcular el set al recorrer varias franjas.
 */
export function bulkMarkSlotState(
  today: NutritionTodayReadModel,
  slot: NutritionMealSlotRead,
  consumed: Set<string> = consumedPrescriptionItemIds(today),
): BulkMarkSlotState {
  const required = slot.prescriptionItems.filter((item) => !item.optional)
  const requiredTotal = required.length
  const eligible = required.filter((item) => !consumed.has(item.id))
  const requiredConsumed = requiredTotal - eligible.length
  const eligibleKcal = round1(eligible.reduce((sum, item) => sum + (item.macros.calories ?? 0), 0))

  let status: BulkMarkStatus
  if (requiredTotal === 0) status = 'none-required'
  else if (eligible.length === 0) status = 'complete'
  else if (requiredConsumed === 0) status = 'all-open'
  else status = 'partial'

  return { status, eligible, requiredTotal, requiredConsumed, remaining: eligible.length, eligibleKcal }
}

/** Copy del CTA según el estado; null cuando no se muestra botón (complete / none-required). */
export function bulkMarkCtaLabel(state: BulkMarkSlotState): string | null {
  if (state.status === 'all-open') return 'Comí toda esta comida'
  if (state.status === 'partial') return `Comer lo que falta (${state.remaining})`
  return null
}
