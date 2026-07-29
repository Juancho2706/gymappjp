/**
 * Estado PURO de la capa de porciones del quick-edit RN (T1.4) — espejo movil de la
 * porcion de porciones del quick-edit web (`_quick-edit/quick-edit-state.ts`, T1.2).
 * Sin react-native: tipos + hidratacion desde el read model + reducer + contador +
 * inyeccion en el draft canonico + filas de insert con snapshot congelado.
 *
 * CONSOLIDADO (follow-up PR #129/#131): los tipos compartidos con la persistencia
 * (`QuickEditPortionGroup`/`QuickEditPortionTarget`/`QuickEditPortionsState`) y las
 * piezas del publish (`injectExchangeTargetsIntoDraft`, `buildPortionTargetInsertRows`)
 * viven ahora en `lib/nutrition-v2-quick-edit.ts` (junto a `buildQuickEditPublishDraft`, que
 * acepta el estado de porciones como parametro opcional) y se RE-EXPORTAN aqui para
 * conservar la superficie publica del modulo. Aqui queda lo propio de la UI: estado
 * editable, hidratacion desde el read model, reducer y contador — capa ADITIVA que se
 * cuelga del `QuickEditState` por `slot.key` sin tocar sus tipos ni su reducer.
 *
 * Decisiones espejadas del web (SPEC R1/R2 + brief T1.2):
 *  - Capa opcional: plan sin targets => estado vacio => CERO UI y draft byte-identico.
 *  - Altas limitadas a grupos YA presentes en el plan (los snapshots congelados del
 *    read model son el unico catalogo; grupos nuevos al plan se agregan en el builder).
 *  - `portions` es NUMBER (no texto): el stepper RN es de botones — JAMAS teclado
 *    numerico (hallazgo M4) — asi que el valor siempre es un multiplo valido de 0,5
 *    por construccion (clamp 0,5..99) y no existe estado invalido que validar.
 */

import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import type {
  QuickEditPortionGroup,
  QuickEditPortionTarget,
  QuickEditPortionsState,
  QuickEditState,
} from '../../../lib/nutrition-v2-quick-edit'

// ---------------------------------------------------------------------------
// Re-exports de las piezas consolidadas en la lib (superficie publica estable)
// ---------------------------------------------------------------------------

export {
  buildPortionTargetInsertRows,
  injectExchangeTargetsIntoDraft,
} from '../../../lib/nutrition-v2-quick-edit'
export type {
  DraftExchangeTarget,
  PortionComposedPart,
  PortionGroupRef,
  PortionTargetInsertRow,
  QuickEditPortionGroup,
  QuickEditPortionTarget,
  QuickEditPortionsState,
} from '../../../lib/nutrition-v2-quick-edit'

// ---------------------------------------------------------------------------
// Tipos locales de la hidratacion
// ---------------------------------------------------------------------------

type ReadSlot = NutritionPlanReadModel['dayVariants'][number]['mealSlots'][number]
type ReadExchangeTarget = NonNullable<ReadSlot['exchangeTargets']>[number]

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
  | { type: 'RESTORE_PORTIONS'; state: QuickEditPortionsState }

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
    case 'RESTORE_PORTIONS':
      // Rehidrata la capa de porciones COMPLETA desde el respaldo local (par del RESTORE_DRAFT
      // del reducer principal): en RN las porciones viven en un reducer SEPARADO, asi que el
      // restore debe despachar a los DOS. Guarda defensiva contra payload corrupto: requiere un
      // `bySlot` objeto; si no, conserva el estado actual (mejor no restaurar que romper).
      return action.state && typeof action.state.bySlot === 'object' && action.state.bySlot !== null
        ? { bySlot: action.state.bySlot }
        : state
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Copia de franja entre dias (CE-5): la capa de porciones sigue a la franja
// ---------------------------------------------------------------------------

/** ¿Dos listas de targets son equivalentes? (mismo grupo, porciones y notas, en el mismo orden). */
function sameTargets(a: QuickEditPortionTarget[] | undefined, b: QuickEditPortionTarget[]): boolean {
  if (a == null || a.length !== b.length) return false
  return a.every(
    (target, index) =>
      target.exchangeGroupId === b[index].exchangeGroupId &&
      target.portions === b[index].portions &&
      (target.notes ?? '') === (b[index].notes ?? ''),
  )
}

/**
 * Copia las porciones de UNA franja a las franjas destino de `COPY_SLOT_TO_VARIANTS` (los
 * devuelve `resolveQuickEditSlotCopyTargets`, el MISMO recorrido que usa el reducer principal:
 * el destino puede ser una franja EXISTENTE —merge por nombre— o la recien clonada).
 *
 * Semantica de REEMPLAZO total, espejo de lo que hace el reducer con los items: el destino
 * queda con exactamente las porciones del origen — si el origen no tiene ninguna, las del
 * destino se BORRAN (si no, quedarian porciones huerfanas de la franja pisada). Las `key` de
 * UI se re-prefijan con la franja destino (misma convencion que el alta de dias clonados) y
 * el `id` se suelta: en el dia destino son filas NUEVAS. Idempotente: aplicarla dos veces
 * devuelve el MISMO estado (misma referencia).
 */
export function copyPortionsToSlots(
  state: QuickEditPortionsState,
  params: { sourceSlotKey: string; targets: ReadonlyArray<{ slotKey: string }> },
): QuickEditPortionsState {
  const source = state.bySlot[params.sourceSlotKey] ?? []
  const bySlot = { ...state.bySlot }
  let changed = false
  for (const target of params.targets) {
    const slotKey = target.slotKey
    // El origen jamas se toca (cinturon: la UI ya lo excluye de los destinos).
    if (slotKey === params.sourceSlotKey) continue
    if (source.length === 0) {
      if (bySlot[slotKey] == null || bySlot[slotKey].length === 0) continue
      delete bySlot[slotKey]
      changed = true
      continue
    }
    const copied = source.map((entry) => ({ ...entry, key: slotKey + ':' + entry.key, id: null }))
    if (sameTargets(bySlot[slotKey], copied)) continue
    bySlot[slotKey] = copied
    changed = true
  }
  return changed ? { bySlot } : state
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

// La inyeccion en el draft canonico (`injectExchangeTargetsIntoDraft`) y las filas de
// insert con snapshot congelado (`buildPortionTargetInsertRows`) viven en
// `lib/nutrition-v2-quick-edit.ts` (re-exportadas arriba): son parte del pipeline de
// publish, no del estado de UI.
