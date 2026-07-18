/**
 * Publicacion del quick-edit RN CON capa de porciones (T1.4) — espejo 1:1 de
 * `publishQuickEditRN` + `persistAndPublishQuickEdit` (lib/nutrition-v2-quick-edit.ts,
 * qe-design §2.3/§2.5) con UNA extension: tras insertar cada franja se insertan sus
 * filas de `nutrition_slot_exchange_targets_v2` con el snapshot congelado, ANTES del
 * RPC `publish_nutrition_plan_v2` (mismo pipeline canonico; cero RPC nuevo).
 *
 * Por que es un espejo y no un parche a la lib: `persistAndPublishQuickEdit` es privado
 * y `apps/mobile/lib/*` esta fuera del alcance de esta tarea (archivos disjuntos por
 * worker). Todo lo reutilizable se IMPORTA de las libs (draft, delta-gate, insert rows,
 * mapeo de errores); lo replicado queda anotado con su origen. Candidato a consolidarse
 * en la lib cuando ese archivo quede libre.
 *
 * Runtime-safe sin la migracion de porciones aplicada: un draft sin `exchangeTargets`
 * (plan sin porciones => estado vacio) NUNCA toca la tabla nueva — flujo byte-identico
 * al `publishQuickEditRN` actual.
 */

import { z } from 'zod'
import {
  NutritionPlanDraftSchema,
  type NutritionPlanDraft,
  type QuickEditErrorCode,
} from '@eva/nutrition-v2'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  mapWriteError,
  publishFail,
  requiredNutritionProFeature,
  type BuilderFood,
  type NutritionProFeature,
  type NutritionV2WriteClient,
  type PublishFailure,
  type PublishResult,
} from '../../../lib/nutrition-v2-builder'
import {
  quickEditEffectiveFrom,
  quickEditStateToDraft,
  type QuickEditBaseline,
  type QuickEditPublishResult,
  type QuickEditState,
} from '../../../lib/nutrition-v2-quick-edit'
import {
  buildPortionTargetInsertRows,
  injectExchangeTargetsIntoDraft,
  type QuickEditPortionGroup,
  type QuickEditPortionsState,
} from './portions-state'

/** Espejo local de mapPublishFailureCode (privado en lib/nutrition-v2-quick-edit — nota de origen). */
function mapPublishFailureCode(failure: PublishFailure): QuickEditErrorCode {
  switch (failure.code) {
    case 'STALE_BASE':
      return 'STALE_BASE'
    case 'EFFECTIVE_DATE':
      return 'EFFECTIVE_DATE'
    case 'SCOPE_DENIED':
      return 'FORBIDDEN'
    case 'UPGRADE_REQUIRED':
      return 'UPGRADE_REQUIRED'
    case 'INVALID_DRAFT':
    case 'INVALID_PAYLOAD':
    case 'NEEDS_SLOT':
    case 'NEEDS_VARIANT':
      return 'VALIDATION'
    default:
      return 'UNKNOWN'
  }
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

interface BaseVersionNotesRow {
  id: string
  plan_id: string
  visible_notes: string | null
  private_notes: string | null
  protocol_notes: string | null
}

interface PlanRow {
  id: string
  client_id: string
}

/** Espejo local de FoodRow/toBuilderFood privados de las libs (nota de origen). */
interface FoodRow {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  serving_size: number
  serving_unit: string | null
}

function toBuilderFood(row: FoodRow): BuilderFood {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatsG: row.fats_g,
    fiberG: row.fiber_g,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit ?? 'g',
    category: null,
    media: null,
  }
}

/**
 * Espejo de `publishQuickEditRN` (pasos identicos 1-4; ver doc alla) + porciones:
 *  2b. inyecta `exchangeTargets` en el draft (Zod del paquete valida multiplos de 0,5)
 *  5.  persiste TAMBIEN los targets con snapshot congelado antes del publish RPC.
 * El delta-gate Pro no cambia: las porciones no son feature Pro (SPEC: cero gate nuevo).
 */
export async function publishQuickEditWithPortions(input: {
  db: NutritionV2WriteClient
  userId: string
  clientId: string
  baseline: QuickEditBaseline
  state: QuickEditState
  portions: QuickEditPortionsState
  portionGroupsById: ReadonlyMap<string, QuickEditPortionGroup>
  idempotencyKey: string
  todayIso: string
  hasNutritionPro: boolean
}): Promise<QuickEditPublishResult> {
  const {
    db,
    userId,
    clientId,
    baseline,
    state,
    portions,
    portionGroupsById,
    idempotencyKey,
    todayIso,
    hasNutritionPro,
  } = input

  // 1. Version base: notas + pertenencia al plan (fail-closed).
  const baseRes = await db
    .from('nutrition_plan_versions_v2')
    .select('id, plan_id, visible_notes, private_notes, protocol_notes')
    .eq('id', baseline.baseVersionId)
    .maybeSingle()
  if (baseRes.error) {
    const mapped = mapWriteError(baseRes.error, 'version base')
    return { ok: false, code: mapPublishFailureCode(mapped), message: mapped.error }
  }
  const baseRow = baseRes.data as BaseVersionNotesRow | null
  if (!baseRow || baseRow.plan_id !== baseline.planId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'No se encontró la versión vigente de este plan. Recarga la ficha e intenta de nuevo.',
    }
  }

  // 2-3. Draft + porciones + carry-over de notas + validacion canonica.
  const effectiveFrom = quickEditEffectiveFrom(todayIso, baseline.effectiveFrom)
  const rawDraft = injectExchangeTargetsIntoDraft(
    quickEditStateToDraft({ state, baseline, clientId, effectiveFrom }),
    state,
    portions,
  )
  rawDraft.visibleNotes = baseRow.visible_notes
  rawDraft.privateNotes = baseRow.private_notes
  rawDraft.protocolNotes = baseRow.protocol_notes
  const parsed = NutritionPlanDraftSchema.safeParse(rawDraft)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'El plan tiene datos inválidos y no se pudo publicar. Revisa las cantidades y nombres.',
    }
  }
  const draft = parsed.data

  // 4. Delta-gate Pro (espejo exacto de la lib; las porciones no gatean nada).
  const newFeature = requiredNutritionProFeature(draft)
  if (newFeature && !hasNutritionPro) {
    const baseFeatures = new Set<NutritionProFeature>()
    if (baseline.strategy === 'hybrid') baseFeatures.add('hybrid_strategy')
    if (draft.dayVariants.length > 1) baseFeatures.add('multi_variant')
    if (hasContent(baseRow.private_notes)) baseFeatures.add('private_notes')
    if (hasContent(baseRow.protocol_notes)) baseFeatures.add('protocol_notes')
    if (!baseFeatures.has(newFeature)) {
      return {
        ok: false,
        code: 'UPGRADE_REQUIRED',
        feature: newFeature,
        message: `Activa Nutrición Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[newFeature]}.`,
      }
    }
  }

  // 5. Persistencia (variantes/franjas/items + targets congelados) + publish con CAS.
  const res = await persistAndPublishWithPortions({
    db,
    userId,
    draft,
    portionGroupsById,
    idempotencyKey,
    effectiveFrom,
    expectedCurrentVersionId: baseline.baseVersionId,
  })
  if (res.ok) return { ok: true, versionId: res.versionId }
  return { ok: false, code: mapPublishFailureCode(res), message: res.error }
}

/**
 * Espejo de `persistAndPublishQuickEdit` (privado en la lib — nota de origen) con la
 * insercion de targets de porciones por franja (snapshot congelado, SPEC R2/A1/B5)
 * ANTES del publish RPC. Mismo retry idempotente, mismo guard optimista
 * `p_expected_current_version_id` (Contrato 3).
 */
async function persistAndPublishWithPortions(input: {
  db: NutritionV2WriteClient
  userId: string
  draft: NutritionPlanDraft
  portionGroupsById: ReadonlyMap<string, QuickEditPortionGroup>
  idempotencyKey: string
  effectiveFrom: string
  expectedCurrentVersionId: string
}): Promise<PublishResult> {
  const { db, userId, draft, portionGroupsById, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = input

  if (!draft.planId) {
    return publishFail('PLAN_NOT_FOUND', 'El quick-edit requiere un plan vigente.')
  }

  // Retry idempotente: si la clave ya publico, devolvemos la version existente.
  const existing = await db
    .from('nutrition_plan_versions_v2')
    .select('id, plan_id')
    .eq('publish_idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing.error) return mapWriteError(existing.error, 'idempotencia')
  if (existing.data) {
    const row = existing.data as { id: string; plan_id: string }
    return { ok: true, versionId: row.id, planId: row.plan_id }
  }

  const planRes = await db
    .from('nutrition_plans_v2')
    .select('id, client_id')
    .eq('id', draft.planId)
    .maybeSingle()
  if (planRes.error) return mapWriteError(planRes.error, 'plan')
  const planRow = planRes.data as PlanRow | null
  if (!planRow || planRow.client_id !== draft.clientId) {
    return publishFail('PLAN_NOT_FOUND', 'El plan indicado no pertenece a este alumno.')
  }

  const maxRes = await db
    .from('nutrition_plan_versions_v2')
    .select('version_number')
    .eq('plan_id', planRow.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxRes.error) return mapWriteError(maxRes.error, 'version')
  const maxRow = maxRes.data as { version_number: number } | null
  const nextVersion = (maxRow?.version_number ?? 0) + 1

  const versionIns = await db
    .from('nutrition_plan_versions_v2')
    .insert({
      plan_id: planRow.id,
      version_number: nextVersion,
      status: 'draft',
      strategy: draft.strategy,
      timezone: draft.timezone,
      student_permissions: draft.permissions,
      visible_notes: draft.visibleNotes,
      private_notes: draft.privateNotes,
      protocol_notes: draft.protocolNotes,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()
  if (versionIns.error || !versionIns.data) {
    return mapWriteError(versionIns.error ?? { message: 'no version' }, 'version')
  }
  const versionId = versionIns.data.id

  // Foods para snapshots de items (mismo camino que la lib).
  const foodIds: string[] = []
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (item.foodId && !foodIds.includes(item.foodId)) foodIds.push(item.foodId)
      }
    }
  }
  const foodMap = new Map<string, BuilderFood>()
  for (const id of foodIds) {
    const foodRes = await db
      .from('foods')
      .select('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit')
      .eq('id', id)
      .maybeSingle()
    if (foodRes.error) return mapWriteError(foodRes.error, 'alimentos')
    if (foodRes.data) foodMap.set(id, toBuilderFood(foodRes.data as FoodRow))
  }

  for (const variant of draft.dayVariants) {
    const variantIns = await db
      .from('nutrition_day_variants_v2')
      .insert(buildVariantInsertRow(versionId, variant))
      .select('id')
      .single()
    if (variantIns.error || !variantIns.data) {
      return mapWriteError(variantIns.error ?? { message: 'no variant' }, 'dia')
    }
    const variantId = variantIns.data.id

    for (const slot of variant.mealSlots) {
      const slotIns = await db
        .from('nutrition_meal_slots_v2')
        .insert(buildSlotInsertRow(versionId, variantId, slot))
        .select('id')
        .single()
      if (slotIns.error || !slotIns.data) {
        return mapWriteError(slotIns.error ?? { message: 'no slot' }, 'franja')
      }
      const mealSlotId = slotIns.data.id

      if (slot.items.length > 0) {
        const itemRows = slot.items.map((item, index) =>
          buildItemInsertRow({
            versionId,
            mealSlotId,
            orderIndex: index,
            item,
            food: item.foodId ? foodMap.get(item.foodId) ?? null : null,
          }),
        )
        const itemsIns = await db.from('nutrition_prescription_items_v2').insert(itemRows)
        if (itemsIns.error) return mapWriteError(itemsIns.error, 'items')
      }

      // Targets de porciones de la franja, congelados desde el dict del plan (jamas
      // snapshot NULL — si un grupo no resuelve, se corta el publish en voz alta).
      const exchangeTargets = slot.exchangeTargets ?? []
      if (exchangeTargets.length > 0) {
        const targetRows = buildPortionTargetInsertRows({
          versionId,
          mealSlotId,
          targets: exchangeTargets,
          groupsById: portionGroupsById,
        })
        if (!targetRows) {
          return publishFail(
            'WRITE_FAILED',
            'No se pudo preparar un grupo de porciones. Recarga la ficha e intenta de nuevo.',
          )
        }
        const targetsIns = await db
          .from('nutrition_slot_exchange_targets_v2')
          .insert(targetRows as unknown as Record<string, unknown>[])
        if (targetsIns.error) return mapWriteError(targetsIns.error, 'porciones')
      }
    }
  }

  const publishRes = await db.rpc('publish_nutrition_plan_v2', {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_idempotency_key: idempotencyKey,
    p_expected_current_version_id: expectedCurrentVersionId,
  })
  if (publishRes.error) {
    if ((publishRes.error.message ?? '').includes('publish_stale_base')) {
      return publishFail('STALE_BASE', 'Este plan cambió en otra sesión.')
    }
    return mapWriteError(publishRes.error, 'publicación')
  }

  const publishedId = z.string().uuid().safeParse(publishRes.data)
  if (!publishedId.success) {
    return publishFail('INVALID_RESPONSE', 'La publicación devolvió una respuesta inesperada.')
  }
  return { ok: true, versionId: publishedId.data, planId: planRow.id }
}
