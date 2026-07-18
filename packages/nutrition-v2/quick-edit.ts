import type {
  NutritionMacroTargets,
  NutritionPlanDraft,
  NutritionStudentPermissions,
} from './contracts'
import type { NutritionPlanReadModel } from './read-models'

/**
 * Quick-edit (edicion fluida del plan V2) — logica PURA compartida web/RN.
 *
 * Sin Next.js / Supabase / React / conversion.ts: solo tipos e hidratacion. Dos piezas:
 *
 *  - `readModelToDraft`: hidrata el draft canonico (NutritionPlanDraft) desde el read model
 *    del plan vigente que la ficha del coach YA tiene en mano (cero lectura nueva, cero
 *    migracion de lectura). El coach edita ese draft in-place y lo republica por el MISMO
 *    pipeline del builder (persistAndPublishDraft -> publish_nutrition_plan_v2). Las
 *    `privateNotes` NO viajan en el read model (feature Pro): salen `null` aqui y el server
 *    las pisa con carry-over desde la version base (ver quickEditPublishAction).
 *
 *  - `countDraftChanges`: cuenta las operaciones de edicion (cantidad/unidad cambiada, item
 *    agregado/quitado/swapeado, franja tocada/agregada/quitada, metas tocadas) para el
 *    contador de la barra "N cambios sin publicar". Heuristica de UX: 0 sii los drafts son
 *    equivalentes, >0 ante cualquier edicion. No es una auditoria; es feedback al coach.
 */

// ── Alias de shape del read model (evita reimportar Zod; los tipos ya salen del read model) ──
type ReadDayVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadMealSlot = ReadDayVariant['mealSlots'][number]
type ReadPrescriptionItem = ReadMealSlot['prescriptionItems'][number]

type DraftDayVariant = NutritionPlanDraft['dayVariants'][number]
type DraftMealSlot = DraftDayVariant['mealSlots'][number]
type DraftPrescriptionItem = DraftMealSlot['items'][number]

type ReadExchangeTarget = NonNullable<ReadMealSlot['exchangeTargets']>[number]
type DraftExchangeTarget = NonNullable<DraftMealSlot['exchangeTargets']>[number]

function itemFromRead(item: ReadPrescriptionItem, orderIndex: number): DraftPrescriptionItem {
  const hasCatalogSource = Boolean(item.foodId) || Boolean(item.recipeId)
  return {
    // El id de la fila viaja para dar identidad estable al diff/UI. `persistAndPublishDraft`
    // lo IGNORA (inserta una fila nueva por version), asi que es inocuo para la escritura.
    ...(item.id ? { id: item.id } : {}),
    foodId: item.foodId,
    recipeId: item.recipeId,
    // Alimento de catalogo/receta -> el server re-deriva nombre y macros desde `foods`; el
    // nombre libre solo se conserva para items custom (sin foodId ni recipeId).
    customName: hasCatalogSource ? null : item.name,
    quantity: item.quantity,
    unit: item.unit,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    orderIndex,
  }
}

/**
 * Target de porciones del read model (snapshot congelado) -> target del draft de entrada.
 * Solo viajan los campos del contrato (`NutritionExchangeTargetSchema`): el server vuelve
 * a congelar `snapshot_*` al persistir (T0.3); los campos snapshot del read model
 * (groupCode/ref/composedOf...) NO pertenecen al draft.
 */
function exchangeTargetFromRead(target: ReadExchangeTarget, orderIndex: number): DraftExchangeTarget {
  return {
    ...(target.id ? { id: target.id } : {}),
    exchangeGroupId: target.exchangeGroupId,
    portions: target.portions,
    notes: target.notes,
    orderIndex,
  }
}

function slotFromRead(slot: ReadMealSlot, orderIndex: number): DraftMealSlot {
  const exchangeTargets = slot.exchangeTargets ?? []
  return {
    ...(slot.id ? { id: slot.id } : {}),
    code: slot.code,
    name: slot.name,
    startTime: slot.startTime,
    endTime: slot.endTime,
    mode: slot.mode,
    required: slot.required,
    targets: slot.targets,
    instructions: slot.instructions,
    orderIndex,
    items: slot.prescriptionItems.map(itemFromRead),
    // Capa opcional de porciones: un plan sin porciones hidrata un draft IDENTICO al de
    // antes (sin la clave), preservando el criterio Q1 y los publishes byte-compatibles.
    ...(exchangeTargets.length > 0
      ? { exchangeTargets: exchangeTargets.map(exchangeTargetFromRead) }
      : {}),
  }
}

function variantFromRead(variant: ReadDayVariant, orderIndex: number): DraftDayVariant {
  return {
    ...(variant.id ? { id: variant.id } : {}),
    key: variant.key,
    label: variant.label,
    dayOfWeek: variant.dayOfWeek,
    default: variant.isDefault,
    targets: variant.targets,
    orderIndex,
    mealSlots: variant.mealSlots.map(slotFromRead),
  }
}

/**
 * Hidrata el draft canonico desde el read model del plan vigente.
 *
 * Devuelve `null` si el alumno no tiene plan vigente (`planModel.plan == null`): el modo
 * edicion no aplica (la ficha muestra el CTA de crear plan con el wizard).
 *
 * NOTA de contrato: el read model NO transporta el `clientId` (vive en el nivel superior
 * `NutritionClientDetailReadModel.client.id`), asi que se pasa aparte. `privateNotes` sale
 * `null` a proposito — el server hace carry-over desde la version base antes de publicar.
 */
export function readModelToDraft(
  planModel: NutritionPlanReadModel,
  clientId: string,
): NutritionPlanDraft | null {
  const plan = planModel.plan
  if (!plan) return null

  return {
    planId: plan.id,
    clientId,
    name: plan.name,
    strategy: plan.strategy,
    // El server calcula el effectiveFrom real (max(hoy, base.effectiveFrom)); este campo del
    // draft no lo usa `persistAndPublishDraft` (recibe effectiveFrom como argumento aparte).
    effectiveFrom: null,
    timezone: planModel.timezone,
    permissions: planModel.permissions,
    visibleNotes: planModel.visibleNotes,
    privateNotes: null,
    protocolNotes: planModel.protocolNotes,
    dayVariants: planModel.dayVariants.map(variantFromRead),
  }
}

// ── Contador de cambios (diff estructural para la barra "N cambios sin publicar") ─────────────

function normalizeTargets(targets: Partial<NutritionMacroTargets>): string {
  const keys: Array<keyof NutritionMacroTargets> = [
    'calories',
    'proteinG',
    'carbsG',
    'fatsG',
    'fiberG',
    'sodiumMg',
    'waterMl',
  ]
  return keys.map((key) => `${key}=${targets[key] ?? ''}`).join('|')
}

function targetsDiffer(a: Partial<NutritionMacroTargets>, b: Partial<NutritionMacroTargets>): boolean {
  return normalizeTargets(a) !== normalizeTargets(b)
}

function permissionsDiffer(
  a: NutritionStudentPermissions,
  b: NutritionStudentPermissions,
): boolean {
  const keys: Array<keyof NutritionStudentPermissions> = [
    'canRegisterFreely',
    'canAdjustPrescribedQuantity',
    'quantityAdjustmentPercent',
    'canSubstitute',
    'canMoveMealSlot',
    'canSkipOptionalItems',
  ]
  return keys.some((key) => a[key] !== b[key])
}

function itemChanged(a: DraftPrescriptionItem, b: DraftPrescriptionItem): boolean {
  return (
    a.foodId !== b.foodId ||
    a.recipeId !== b.recipeId ||
    (a.customName ?? null) !== (b.customName ?? null) ||
    a.quantity !== b.quantity ||
    a.unit !== b.unit ||
    a.optional !== b.optional ||
    (a.notes ?? null) !== (b.notes ?? null) ||
    (a.minimumQuantity ?? null) !== (b.minimumQuantity ?? null) ||
    (a.maximumQuantity ?? null) !== (b.maximumQuantity ?? null) ||
    (a.substitutionGroupId ?? null) !== (b.substitutionGroupId ?? null)
  )
}

function slotHeaderChanged(a: DraftMealSlot, b: DraftMealSlot): boolean {
  return (
    a.name !== b.name ||
    (a.startTime ?? null) !== (b.startTime ?? null) ||
    (a.endTime ?? null) !== (b.endTime ?? null) ||
    a.mode !== b.mode ||
    a.required !== b.required ||
    (a.instructions ?? null) !== (b.instructions ?? null) ||
    targetsDiffer(a.targets, b.targets)
  )
}

/**
 * Empareja los elementos de dos listas por `id` cuando ambos lo tienen; los que no matchean
 * son altas (en `current`) o bajas (en `baseline`). Los elementos sin `id` en `current` son
 * altas (una fila recien agregada por la UI todavia no tiene id). Devuelve pares emparejados
 * y los conteos de altas/bajas.
 */
function matchById<T extends { id?: string }>(
  baseline: T[],
  current: T[],
): { pairs: Array<[T, T]>; added: number; removed: number } {
  const baselineById = new Map<string, T>()
  for (const el of baseline) {
    if (el.id) baselineById.set(el.id, el)
  }
  const matchedBaselineIds = new Set<string>()
  const pairs: Array<[T, T]> = []
  let added = 0
  for (const el of current) {
    const base = el.id ? baselineById.get(el.id) : undefined
    if (base) {
      pairs.push([base, el])
      matchedBaselineIds.add(el.id as string)
    } else {
      added += 1
    }
  }
  let removed = 0
  for (const el of baseline) {
    if (!el.id || !matchedBaselineIds.has(el.id)) removed += 1
  }
  return { pairs, added, removed }
}

function exchangeTargetChanged(a: DraftExchangeTarget, b: DraftExchangeTarget): boolean {
  return a.portions !== b.portions || (a.notes ?? null) !== (b.notes ?? null)
}

/**
 * Cuenta cambios de porciones de una franja emparejando por `exchangeGroupId` (unico por
 * franja — CHECK `unique(meal_slot_id, exchange_group_id)` de la tabla): agregado = 1,
 * quitado = 1, porciones o notas distintas = 1. El orden NO cuenta (igual que items).
 */
function countExchangeTargetChanges(
  baseline: DraftExchangeTarget[],
  current: DraftExchangeTarget[],
): number {
  const baselineByGroup = new Map(baseline.map((target) => [target.exchangeGroupId, target]))
  const seen = new Set<string>()
  let count = 0
  for (const target of current) {
    const base = baselineByGroup.get(target.exchangeGroupId)
    if (!base) {
      count += 1
      continue
    }
    seen.add(target.exchangeGroupId)
    if (exchangeTargetChanged(base, target)) count += 1
  }
  for (const target of baseline) {
    if (!seen.has(target.exchangeGroupId)) count += 1
  }
  return count
}

function countSlotChanges(baseline: DraftMealSlot, current: DraftMealSlot): number {
  let count = slotHeaderChanged(baseline, current) ? 1 : 0
  const { pairs, added, removed } = matchById(baseline.items, current.items)
  count += added + removed
  for (const [base, cur] of pairs) {
    if (itemChanged(base, cur)) count += 1
  }
  count += countExchangeTargetChanges(baseline.exchangeTargets ?? [], current.exchangeTargets ?? [])
  return count
}

function countVariantChanges(baseline: DraftDayVariant, current: DraftDayVariant): number {
  let count = targetsDiffer(baseline.targets, current.targets) ? 1 : 0
  const { pairs, added, removed } = matchById(baseline.mealSlots, current.mealSlots)
  count += added + removed
  for (const [base, cur] of pairs) {
    count += countSlotChanges(base, cur)
  }
  return count
}

/**
 * Cuenta las operaciones de edicion entre el baseline hidratado y el draft actual, para el
 * contador de la barra "N cambios sin publicar". Suma: metas de variante tocadas, franjas
 * agregadas/quitadas/tocadas, items agregados/quitados/cambiados (un swap cuenta como 1),
 * cambios de nombre/estrategia del plan, permisos y notas visibles/protocolo.
 *
 * Emparejamiento por `id` (variantes/franjas/items del read model lo traen); los elementos
 * nuevos de la UI (sin id) cuentan como altas. Heuristica: 0 sii equivalentes, >0 ante
 * cualquier cambio. El orden NO se compara (reordenar es F2).
 */
export function countDraftChanges(
  baseline: NutritionPlanDraft,
  current: NutritionPlanDraft,
): number {
  let count = 0
  if (baseline.name !== current.name) count += 1
  if (baseline.strategy !== current.strategy) count += 1
  if ((baseline.visibleNotes ?? null) !== (current.visibleNotes ?? null)) count += 1
  if ((baseline.protocolNotes ?? null) !== (current.protocolNotes ?? null)) count += 1
  if (permissionsDiffer(baseline.permissions, current.permissions)) count += 1

  const { pairs, added, removed } = matchById(baseline.dayVariants, current.dayVariants)
  count += added + removed
  for (const [base, cur] of pairs) {
    count += countVariantChanges(base, cur)
  }
  return count
}

// ── Codigos de error tipados del quick-edit (compartidos web/RN) ──────────────────────────────

export const QUICK_EDIT_ERROR_CODES = [
  'STALE_BASE',
  'EFFECTIVE_DATE',
  'UPGRADE_REQUIRED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'VALIDATION',
  'UNKNOWN',
] as const

export type QuickEditErrorCode = (typeof QUICK_EDIT_ERROR_CODES)[number]
