/**
 * Estado PURO de la capa de porciones del quick-edit RN (T1.4) — espejo movil de la
 * porcion de porciones del quick-edit web (`_quick-edit/quick-edit-state.ts`, T1.2).
 * Sin react-native: tipos + hidratacion desde el read model + reducer + contador +
 * inyeccion en el draft canonico + filas de insert con snapshot congelado.
 *
 * Por que vive ACA y no en `lib/nutrition-v2-quick-edit.ts`: el estado principal del
 * quick-edit RN es propiedad de esa lib (fuera del alcance de esta tarea — regla de
 * reparticion de archivos disjuntos). Esta capa es ADITIVA y paralela: se cuelga del
 * `QuickEditState` por `slot.key` sin tocar sus tipos ni su reducer. Candidato a
 * consolidarse en la lib cuando ese archivo quede libre.
 *
 * Decisiones espejadas del web (SPEC R1/R2 + brief T1.2):
 *  - Capa opcional: plan sin targets => estado vacio => CERO UI y draft byte-identico.
 *  - Altas limitadas a grupos YA presentes en el plan (los snapshots congelados del
 *    read model son el unico catalogo; grupos nuevos al plan se agregan en el builder).
 *  - `portions` es NUMBER (no texto): el stepper RN es de botones — JAMAS teclado
 *    numerico (hallazgo M4) — asi que el valor siempre es un multiplo valido de 0,5
 *    por construccion (clamp 0,5..99) y no existe estado invalido que validar.
 */

import type { NutritionPlanDraft, NutritionPlanReadModel } from '@eva/nutrition-v2'
import type { QuickEditState } from '../../../lib/nutrition-v2-quick-edit'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ReadSlot = NutritionPlanReadModel['dayVariants'][number]['mealSlots'][number]
type ReadExchangeTarget = NonNullable<ReadSlot['exchangeTargets']>[number]

type DraftSlot = NutritionPlanDraft['dayVariants'][number]['mealSlots'][number]
export type DraftExchangeTarget = NonNullable<DraftSlot['exchangeTargets']>[number]

export interface PortionGroupRef {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

/** Parte base ENRIQUECIDA del `composed_of` (SPEC R2/A2), tal cual viaja en el read model. */
export interface PortionComposedPart {
  code: string
  portions: number
  ref: PortionGroupRef
}

/**
 * Grupo elegible para el picker de altas. F1: derivado de los targets que el plan YA
 * tiene (snapshots congelados del read model) — nunca el catalogo vivo (hallazgo F3).
 * `ref`/`composedOf` se conservan para re-congelar el snapshot al publicar.
 */
export interface QuickEditPortionGroup {
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  ref: PortionGroupRef
  composedOf: PortionComposedPart[] | null
  macrosConfirmed: boolean
  /** Posicion estable en el dict del plan → fallback deterministico de color. */
  sortOrder: number
}

/** Target editable de una franja (espejo movil de `QePortionTarget` web). */
export interface QuickEditPortionTarget {
  key: string
  /** Id de la fila en la version base; null = alta de esta edicion. */
  id: string | null
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  macrosConfirmed: boolean
  /** Multiplo de 0,5 en [0,5..99] SIEMPRE (stepper de botones; sin estado invalido). */
  portions: number
  /** '' = sin nota (TextInput). Se normaliza a null al proyectar. */
  notes: string
}

/**
 * Targets por `slot.key` del QuickEditState de la lib. Sin entrada (o []) = franja sin
 * porciones. Los slots eliminados del estado principal conservan su entrada aca (asi el
 * RESTORE_SLOT del undo recupera tambien sus porciones); al publicar y al contar solo se
 * miran los slots VIVOS del estado principal.
 */
export interface QuickEditPortionsState {
  bySlot: Record<string, QuickEditPortionTarget[]>
}

export const EMPTY_PORTIONS_STATE: QuickEditPortionsState = { bySlot: {} }

// ---------------------------------------------------------------------------
// Paso 0,5 (SPEC R2: CHECK multiplos de 0,5, minimo 0,5, maximo 99)
// ---------------------------------------------------------------------------

export const PORTION_STEP = 0.5
export const PORTION_MIN = 0.5
export const PORTION_MAX = 99

/** ±0,5 con snap a medios; nunca baja de 0,5 (la baja del grupo es eliminar) ni sube de 99. */
export function stepPortions(current: number, direction: 1 | -1): number {
  const base = Number.isFinite(current) && current > 0 ? current : 0
  const next = Math.round((base + direction * PORTION_STEP) * 2) / 2
  if (next < PORTION_MIN) return current
  return Math.min(next, PORTION_MAX)
}

/** Display es-CL con coma decimal: 1.5 → "1,5" (espejo del formato de la tabla UX-d). */
export function formatPortionsEsCl(portions: number): string {
  return String(Math.round(portions * 2) / 2).replace('.', ',')
}

// ---------------------------------------------------------------------------
// Hidratacion desde el read model
// ---------------------------------------------------------------------------

function hydrateTarget(target: ReadExchangeTarget): QuickEditPortionTarget {
  return {
    key: target.id,
    id: target.id,
    exchangeGroupId: target.exchangeGroupId,
    groupCode: target.groupCode,
    groupName: target.groupName,
    color: target.color,
    macrosConfirmed: target.macrosConfirmed,
    portions: target.portions,
    notes: target.notes ?? '',
  }
}

/**
 * Hidrata el estado de porciones + el dict de grupos elegibles caminando el read model
 * EN PARALELO con el `QuickEditState` ya hidratado por la lib: ambos derivan de
 * `planModel.dayVariants` en el mismo orden 1:1, asi que variante i / franja j del
 * estado corresponde exactamente a la franja j del read model (los `slot.key` los
 * genera la lib; aca solo se leen).
 */
export function hydrateQuickEditPortions(
  planModel: NutritionPlanReadModel,
  editState: QuickEditState,
): { initial: QuickEditPortionsState; groups: QuickEditPortionGroup[] } {
  const bySlot: Record<string, QuickEditPortionTarget[]> = {}
  const groupsById = new Map<string, Omit<QuickEditPortionGroup, 'sortOrder'>>()

  planModel.dayVariants.forEach((variant, variantIndex) => {
    const stateVariant = editState.variants[variantIndex]
    if (!stateVariant) return
    variant.mealSlots.forEach((slot, slotIndex) => {
      const stateSlot = stateVariant.slots[slotIndex]
      if (!stateSlot) return
      const targets = slot.exchangeTargets ?? []
      if (targets.length > 0) {
        bySlot[stateSlot.key] = targets.map(hydrateTarget)
      }
      for (const target of targets) {
        if (groupsById.has(target.exchangeGroupId)) continue
        groupsById.set(target.exchangeGroupId, {
          exchangeGroupId: target.exchangeGroupId,
          groupCode: target.groupCode,
          groupName: target.groupName,
          color: target.color,
          ref: target.ref,
          composedOf: target.composedOf,
          macrosConfirmed: target.macrosConfirmed,
        })
      }
    })
  })

  const groups = [...groupsById.values()]
    .sort((a, b) => a.groupCode.localeCompare(b.groupCode))
    .map((group, index) => ({ ...group, sortOrder: index }))

  return { initial: { bySlot }, groups }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type QuickEditPortionsAction =
  | { type: 'STEP_PORTIONS'; slotKey: string; targetKey: string; direction: 1 | -1 }
  | { type: 'SET_NOTES'; slotKey: string; targetKey: string; value: string }
  | { type: 'REMOVE_TARGET'; slotKey: string; targetKey: string }
  | { type: 'RESTORE_TARGET'; slotKey: string; index: number; target: QuickEditPortionTarget }
  | { type: 'ADD_TARGET'; slotKey: string; key: string; group: QuickEditPortionGroup }

/** Alta desde el picker: arranca en 1 porcion (ajustable con el stepper) — espejo web. */
export function createPortionTarget(key: string, group: QuickEditPortionGroup): QuickEditPortionTarget {
  return {
    key,
    id: null,
    exchangeGroupId: group.exchangeGroupId,
    groupCode: group.groupCode,
    groupName: group.groupName,
    color: group.color,
    macrosConfirmed: group.macrosConfirmed,
    portions: 1,
    notes: '',
  }
}

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const bounded = Math.max(0, Math.min(list.length, index))
  return [...list.slice(0, bounded), value, ...list.slice(bounded)]
}

function mapSlotTargets(
  state: QuickEditPortionsState,
  slotKey: string,
  fn: (targets: QuickEditPortionTarget[]) => QuickEditPortionTarget[],
): QuickEditPortionsState {
  return { bySlot: { ...state.bySlot, [slotKey]: fn(state.bySlot[slotKey] ?? []) } }
}

export function portionsReducer(
  state: QuickEditPortionsState,
  action: QuickEditPortionsAction,
): QuickEditPortionsState {
  switch (action.type) {
    case 'STEP_PORTIONS':
      return mapSlotTargets(state, action.slotKey, (targets) =>
        targets.map((target) =>
          target.key === action.targetKey
            ? { ...target, portions: stepPortions(target.portions, action.direction) }
            : target,
        ),
      )
    case 'SET_NOTES':
      return mapSlotTargets(state, action.slotKey, (targets) =>
        targets.map((target) =>
          target.key === action.targetKey ? { ...target, notes: action.value } : target,
        ),
      )
    case 'REMOVE_TARGET':
      return mapSlotTargets(state, action.slotKey, (targets) =>
        targets.filter((target) => target.key !== action.targetKey),
      )
    case 'RESTORE_TARGET':
      return mapSlotTargets(state, action.slotKey, (targets) =>
        insertAt(targets, action.index, action.target),
      )
    case 'ADD_TARGET':
      return mapSlotTargets(state, action.slotKey, (targets) =>
        // Guard de unicidad (CHECK unique(meal_slot_id, exchange_group_id)): el picker
        // deshabilita los usados; esto es cinturon (espejo del reducer web).
        targets.some((target) => target.exchangeGroupId === action.group.exchangeGroupId)
          ? targets
          : [...targets, createPortionTarget(action.key, action.group)],
      )
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Contador de cambios (se SUMA al de la lib para la barra "N cambios sin publicar")
// ---------------------------------------------------------------------------

function notesNorm(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function targetChanged(a: QuickEditPortionTarget, b: QuickEditPortionTarget): boolean {
  return a.portions !== b.portions || notesNorm(a.notes) !== notesNorm(b.notes)
}

/**
 * Empareja por `exchangeGroupId` dentro de cada franja VIVA (espejo del
 * `countExchangeTargetChanges` del paquete): alta = 1, baja = 1, portions/notes
 * distinto = 1. Franjas eliminadas del estado principal NO cuentan aca (la baja de la
 * franja ya cuenta 1 en el contador de la lib y arrastra sus targets).
 */
export function countPortionsChanges(
  baseline: QuickEditPortionsState,
  current: QuickEditPortionsState,
  liveSlotKeys: ReadonlySet<string>,
): number {
  let count = 0
  for (const slotKey of liveSlotKeys) {
    const base = baseline.bySlot[slotKey] ?? []
    const cur = current.bySlot[slotKey] ?? []
    const baseByGroup = new Map(base.map((target) => [target.exchangeGroupId, target]))
    const seen = new Set<string>()
    for (const target of cur) {
      const baseTarget = baseByGroup.get(target.exchangeGroupId)
      seen.add(target.exchangeGroupId)
      if (!baseTarget) count += 1
      else if (targetChanged(baseTarget, target)) count += 1
    }
    for (const groupId of baseByGroup.keys()) {
      if (!seen.has(groupId)) count += 1
    }
  }
  return count
}

/** ¿Hay algun target en alguna franja viva? (para atajar trabajo en publish/UI). */
export function hasAnyPortionTargets(
  state: QuickEditPortionsState,
  liveSlotKeys: ReadonlySet<string>,
): boolean {
  for (const slotKey of liveSlotKeys) {
    if ((state.bySlot[slotKey] ?? []).length > 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Inyeccion en el draft canonico
// ---------------------------------------------------------------------------

/**
 * Cuelga `exchangeTargets` en los slots del draft que `quickEditStateToDraft` (lib)
 * ensamblo, caminando draft y estado EN PARALELO (la lib mapea variantes/franjas por
 * indice en el mismo orden). Franja sin targets => slot IDENTICO al de antes (sin la
 * clave): un plan sin porciones publica un draft byte-identico al actual.
 */
export function injectExchangeTargetsIntoDraft(
  draft: NutritionPlanDraft,
  editState: QuickEditState,
  portions: QuickEditPortionsState,
): NutritionPlanDraft {
  return {
    ...draft,
    dayVariants: draft.dayVariants.map((variant, variantIndex) => {
      const stateVariant = editState.variants[variantIndex]
      if (!stateVariant) return variant
      return {
        ...variant,
        mealSlots: variant.mealSlots.map((slot, slotIndex) => {
          const stateSlot = stateVariant.slots[slotIndex]
          if (!stateSlot) return slot
          const targets = portions.bySlot[stateSlot.key] ?? []
          if (targets.length === 0) return slot
          return {
            ...slot,
            exchangeTargets: targets.map(
              (target, orderIndex): DraftExchangeTarget => ({
                ...(target.id ? { id: target.id } : {}),
                exchangeGroupId: target.exchangeGroupId,
                portions: target.portions,
                notes: notesNorm(target.notes),
                orderIndex,
              }),
            ),
          }
        }),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Filas de insert con snapshot congelado (freeze en la persistencia — SPEC R2/A1)
// ---------------------------------------------------------------------------

/**
 * Fila de `nutrition_slot_exchange_targets_v2` (espejo del `ExchangeTargetInsertRow`
 * del draft-builder web). En RN el cliente ES el escritor (PostgREST directo, igual que
 * items/slots del quick-edit): el snapshot se RE-CONGELA por valor desde el snapshot del
 * read model (que a su vez fue congelado server-side al persistirse la version base) —
 * nunca desde el catalogo vivo. `snapshot_composed_of` ya viene ENRIQUECIDO (A2).
 */
export type PortionTargetInsertRow = {
  version_id: string
  meal_slot_id: string
  exchange_group_id: string
  portions: number
  notes: string | null
  order_index: number
  snapshot_group_code: string
  snapshot_group_name: string
  snapshot_ref_calories: number
  snapshot_ref_protein_g: number
  snapshot_ref_carbs_g: number
  snapshot_ref_fats_g: number
  snapshot_composed_of: PortionComposedPart[] | null
  snapshot_macros_confirmed: boolean
}

/**
 * Emite las filas de una franja resolviendo cada grupo contra el dict congelado del
 * plan. Devuelve `null` si algun grupo no es resolvible (jamas una fila con
 * `snapshot_*` NULL — SPEC R2/B5): el caller corta el publish con error explicito.
 * En F1 esto no deberia ocurrir (las altas salen del mismo dict), es cinturon.
 */
export function buildPortionTargetInsertRows(input: {
  versionId: string
  mealSlotId: string
  targets: readonly DraftExchangeTarget[]
  groupsById: ReadonlyMap<string, QuickEditPortionGroup>
}): PortionTargetInsertRow[] | null {
  const { versionId, mealSlotId, targets, groupsById } = input
  const rows: PortionTargetInsertRow[] = []
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]
    const group = groupsById.get(target.exchangeGroupId)
    if (!group) return null
    rows.push({
      version_id: versionId,
      meal_slot_id: mealSlotId,
      exchange_group_id: group.exchangeGroupId,
      portions: target.portions,
      notes: target.notes ?? null,
      order_index: index,
      snapshot_group_code: group.groupCode,
      snapshot_group_name: group.groupName,
      snapshot_ref_calories: group.ref.calories,
      snapshot_ref_protein_g: group.ref.proteinG,
      snapshot_ref_carbs_g: group.ref.carbsG,
      snapshot_ref_fats_g: group.ref.fatsG,
      snapshot_composed_of:
        group.composedOf === null
          ? null
          : group.composedOf.map((part) => ({
              code: part.code,
              portions: part.portions,
              ref: { ...part.ref },
            })),
      snapshot_macros_confirmed: group.macrosConfirmed,
    })
  }
  return rows
}
