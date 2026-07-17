/**
 * Mapeo PURO V1 -> V2 (sin I/O). Convierte el arbol de un plan de nutricion V1
 * (nutrition_plans -> nutrition_meals -> food_items -> foods) en filas INSERT-READY
 * para el dominio V2 (nutrition_plans_v2, nutrition_plan_versions_v2,
 * nutrition_day_variants_v2, nutrition_meal_slots_v2, nutrition_prescription_items_v2).
 *
 * Reglas cerradas: specs/nutrition-v2-conversion/SPEC.md.
 * Nombres de columna EXACTOS: supabase/migrations/20260714190000_nutrition_v2_domain.sql.
 *
 * Aritmetica de snapshot de macros: ESPEJO VERBATIM de
 *   - packages/nutrition-engine/macros.ts:120-135  (calculateFoodItemMacros)
 *   - apps/web/.../builder/_lib/draft-builder.ts:231-247 (computeItemMacros)
 *   - apps/web/.../_actions/plan-persistence.ts:365-375 (re-derivacion del servidor)
 * Mismo factor (g|ml -> qty/100; unidad contable -> qty*serving_size/100) y mismo
 * redondeo a 1 decimal (Math.round(x*10)/10) que produce el snapshot del servidor hoy.
 * Se inlinea (no se importa) para mantener este modulo autocontenido y sin dependencias.
 */

// ---------------------------------------------------------------------------
// Tipos de entrada (arbol V1) — shape leido de v1-domain.md + database.types.ts
// ---------------------------------------------------------------------------

export type V1FoodRow = {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  /** Fibra por serving (nullable en `foods`). Se escala igual que los otros macros. */
  fiber_g?: number | null
  serving_size: number
  serving_unit: string | null
}

export type V1FoodItemRow = {
  id: string
  food_id: string
  quantity: number
  unit: string | null
  swap_options: unknown
  food: V1FoodRow | null
}

export type V1MealRow = {
  id: string
  name: string
  description: string | null
  order_index: number
  /** V1: 1=Lun..7=Dom, NULL=todos los dias. */
  day_of_week: number | null
  items: V1FoodItemRow[]
}

export type V1PlanRow = {
  id: string
  client_id: string
  coach_id: string
  org_id?: string | null
  team_id?: string | null
  name: string
  plan_mode: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  instructions: string | null
  updated_at: string
  // Targets secundarios (migracion 20260714154000_nutrition_plan_guidance_targets.sql)
  hydration_target_ml?: number | null
  steps_target?: number | null
  sleep_target_hours?: number | null
  fasting_target_hours?: number | null
  supplement_guidance?: string[] | null
  protocol_notes?: string | null
}

export type V1PlanTree = { plan: V1PlanRow; meals: V1MealRow[] }

// ---------------------------------------------------------------------------
// Contrato de salida (fijo — ambos lados lo implementan igual)
// ---------------------------------------------------------------------------

export type ConversionSkip = {
  ok: false
  reason:
    | 'exchanges_manual'
    | 'duplicate_active'
    | 'v2_plan_exists'
    | 'no_meals'
    | 'missing_food'
    // Datos V1 atipicos que violarian los CHECK de V2 al insertar: se reportan como
    // manual_required en vez de reventar --apply (los limites son los de la migracion
    // 20260714190000_nutrition_v2_domain.sql).
    | 'invalid_plan_name'
    | 'invalid_meal_name'
  detail?: string
}

type MacroTotals = { calories: number; proteinG: number; carbsG: number; fatsG: number }

export type ConversionFidelity = {
  v1Totals: MacroTotals
  v2Totals: MacroTotals
  mealCount: number
  slotCount: number
  itemCount: number
  textOnlySlots: number
  swapsAsNotes: number
  /** Items V1 con quantity <= 0 (violan CHECK quantity>0): saltados, nunca inventados. */
  zeroQuantityItemsSkipped: number
  noAcarreado: string[]
}

export type ConversionBundle = {
  ok: true
  planRow: Record<string, unknown> | null
  versionRow: Record<string, unknown>
  variantRows: Record<string, unknown>[]
  slotRows: Record<string, unknown>[]
  itemRows: Record<string, unknown>[]
  idempotencyKey: string
  fidelity: ConversionFidelity
}

export type ConversionOpts = {
  newId: () => string
  /** Presente en re-sync: reutiliza el plan V2 existente; planRow queda null. */
  existingV2PlanId?: string
  versionNumber: number
  /** Fecha local Santiago del dia de la corrida (la usa el driver al llamar al RPC). */
  effectiveFromLocalDate: string
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

const ZERO: MacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }

// Limites de los CHECK de V2 (migracion 20260714190000_nutrition_v2_domain.sql).
const PLAN_NAME_MAX = 180 // nutrition_plans_v2.name: char_length(btrim(name)) between 1 and 180
const SLOT_NAME_MAX = 120 // nutrition_meal_slots_v2.name: between 1 and 120
const UNIT_MAX = 32 // nutrition_prescription_items_v2.unit: char_length(btrim(unit)) between 1 and 32

/**
 * Unidad del item que satisface el CHECK de V2 (btrim length 1..32). V1 default 'g';
 * vacio/whitespace -> 'g'; se cap a 32. La MISMA unidad saneada alimenta el calculo de
 * macros (para que 'g '/'  ml' se detecten como directos y no como unidad contable).
 */
function sanitizeUnit(unit: string | null): string {
  const trimmed = (unit ?? '').trim()
  return trimmed === '' ? 'g' : trimmed.slice(0, UNIT_MAX)
}

/** char_length(btrim(value)) — mismo criterio que los CHECK de longitud de V2. */
function trimmedLength(value: string | null | undefined): number {
  return (value ?? '').trim().length
}

/**
 * Factor de escala g|ml -> qty/100; unidad contable -> qty*serving_size/100. Mismo
 * calculo que calculateFoodItemMacros/computeItemMacros; compartido por macros y fibra.
 */
function macroFactor(food: V1FoodRow, quantity: number, unit: string | null): number {
  const unitLower = (unit ?? 'g').toLowerCase()
  const isDirect = unitLower === 'g' || unitLower === 'ml'
  return isDirect ? quantity / 100 : (quantity * food.serving_size) / 100
}

/**
 * Macros de snapshot de un item. ESPEJO VERBATIM de calculateFoodItemMacros +
 * el guard de computeItemMacros. Devuelve exactamente lo que el servidor escribe
 * en nutrition_prescription_items_v2.snapshot_* hoy.
 */
function snapshotItemMacros(food: V1FoodRow, quantity: number, unit: string | null): MacroTotals {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ...ZERO }
  const factor = macroFactor(food, quantity, unit)
  return {
    calories: round1(food.calories * factor),
    proteinG: round1(food.protein_g * factor),
    carbsG: round1(food.carbs_g * factor),
    fatsG: round1(food.fats_g * factor),
  }
}

/**
 * snapshot_fiber_g con la MISMA aritmetica que computeItemMacros del builder
 * (draft-builder.ts:246): fibra null -> 0 (el builder escribe 0, no null, para un item
 * con macros presentes). Un alimento V1 con fibra la conserva en el snapshot convertido.
 */
function snapshotFiber(food: V1FoodRow, quantity: number, unit: string | null): number {
  if (food.fiber_g == null) return 0
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  return round1(food.fiber_g * macroFactor(food, quantity, unit))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function addTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    calories: round1(a.calories + b.calories),
    proteinG: round1(a.proteinG + b.proteinG),
    carbsG: round1(a.carbsG + b.carbsG),
    fatsG: round1(a.fatsG + b.fatsG),
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
  7: 'Domingo',
}

/** V1 1=Lun..7=Dom -> Postgres extract(dow) 0=Dom..6=Sab. */
function v1DowToV2(v1Dow: number): number {
  return v1Dow % 7
}

/** Nombres de las alternativas del swap_options V1, en orden, sin vacios. */
function swapOptionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const names: string[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const name = (entry as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim() !== '') names.push(name.trim())
  }
  return names
}

function sortByOrderIndex(meals: V1MealRow[]): V1MealRow[] {
  // Array.prototype.sort es estable (V8): empates preservan orden de insercion.
  return meals.slice().sort((a, b) => a.order_index - b.order_index)
}

// Vista logica intermedia: una variante con sus comidas ya resueltas.
type VariantPlan = {
  key: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  meals: V1MealRow[]
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

export function mapV1PlanToV2Conversion(
  tree: V1PlanTree,
  opts: ConversionOpts,
): ConversionBundle | ConversionSkip {
  const { plan, meals } = tree

  // --- Skips tipados (orden determinista) ---
  if (plan.plan_mode !== 'grams') {
    return { ok: false, reason: 'exchanges_manual', detail: `plan_mode=${plan.plan_mode}` }
  }
  if (meals.length === 0) {
    return { ok: false, reason: 'no_meals' }
  }
  // Nombre del plan V1 fuera del CHECK de V2 (btrim length 1..180) -> manual.
  const planNameLen = trimmedLength(plan.name)
  if (planNameLen < 1 || planNameLen > PLAN_NAME_MAX) {
    return { ok: false, reason: 'invalid_plan_name', detail: `len=${planNameLen}` }
  }
  for (const meal of meals) {
    // Nombre de comida fuera del CHECK del slot V2 (btrim length 1..120) -> manual.
    const mealNameLen = trimmedLength(meal.name)
    if (mealNameLen < 1 || mealNameLen > SLOT_NAME_MAX) {
      return { ok: false, reason: 'invalid_meal_name', detail: `meal=${meal.id} len=${mealNameLen}` }
    }
    for (const item of meal.items) {
      if (!item.food) {
        return { ok: false, reason: 'missing_food', detail: `food_item=${item.id} food_id=${item.food_id}` }
      }
    }
  }

  const newId = opts.newId
  const planId = opts.existingV2PlanId ?? newId()
  const versionId = newId()

  // --- planRow (null en re-sync) ---
  const planRow: Record<string, unknown> | null = opts.existingV2PlanId
    ? null
    : {
        id: planId,
        client_id: plan.client_id,
        coach_id: plan.coach_id,
        org_id: plan.org_id ?? null,
        team_id: plan.team_id ?? null,
        name: plan.name,
        strategy: 'structured',
        lifecycle_status: 'active',
        created_by: plan.coach_id,
        updated_by: plan.coach_id,
      }

  // --- versionRow (status 'draft', SIN campos de publish: el RPC los pone) ---
  const visibleNotes = plan.instructions && plan.instructions.trim() !== '' ? plan.instructions : null
  const protocolNotes = plan.protocol_notes && plan.protocol_notes.trim() !== '' ? plan.protocol_notes : null
  const versionRow: Record<string, unknown> = {
    id: versionId,
    plan_id: planId,
    version_number: opts.versionNumber,
    status: 'draft',
    strategy: 'structured',
    timezone: 'America/Santiago',
    // Permisos estrictos de 'structured' — espejo de defaultPermissionsFor('structured')
    // + el objeto que persiste assembleDraft (draft-builder.ts:493-500).
    student_permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visible_notes: visibleNotes,
    private_notes: null,
    protocol_notes: protocolNotes,
    created_by: plan.coach_id,
    updated_by: plan.coach_id,
  }

  // --- Targets: verbatim del plan V1 (NULL preservado) sobre CADA variante ---
  const variantTargets = {
    target_calories: plan.daily_calories,
    target_protein_g: plan.protein_g,
    target_carbs_g: plan.carbs_g,
    target_fats_g: plan.fats_g,
    target_fiber_g: null,
    target_sodium_mg: null,
    target_water_ml: plan.hydration_target_ml ?? null,
  }

  // --- Fan-out de comidas a variantes ---
  const nullMeals = sortByOrderIndex(meals.filter((m) => m.day_of_week == null))
  const dayBuckets = new Map<number, V1MealRow[]>()
  for (const meal of meals) {
    if (meal.day_of_week == null) continue
    const bucket = dayBuckets.get(meal.day_of_week) ?? []
    bucket.push(meal)
    dayBuckets.set(meal.day_of_week, bucket)
  }
  const daysWithMeals = Array.from(dayBuckets.keys()).sort((a, b) => a - b)

  const variantPlans: VariantPlan[] = []
  if (daysWithMeals.length === 0) {
    // Todas las comidas son NULL -> unica variante default con todas las comidas.
    variantPlans.push({
      key: 'default',
      label: 'Todos los dias',
      dayOfWeek: null,
      isDefault: true,
      meals: nullMeals,
    })
  } else {
    // Variante default = solo comidas NULL.
    variantPlans.push({
      key: 'default',
      label: 'Todos los dias',
      dayOfWeek: null,
      isDefault: true,
      meals: nullMeals,
    })
    // Una variante por dia con comidas especificas = comidas NULL + las del dia.
    for (const v1Day of daysWithMeals) {
      const dayMeals = dayBuckets.get(v1Day) ?? []
      variantPlans.push({
        key: `dow-${v1DowToV2(v1Day)}`,
        label: DAY_LABELS[v1Day] ?? `Dia ${v1Day}`,
        dayOfWeek: v1DowToV2(v1Day),
        isDefault: false,
        meals: sortByOrderIndex([...nullMeals, ...dayMeals]),
      })
    }
  }

  // --- Materializar variantes -> slots -> items ---
  const variantRows: Record<string, unknown>[] = []
  const slotRows: Record<string, unknown>[] = []
  const itemRows: Record<string, unknown>[] = []

  // Dedup por fuente (un item/comida NULL se repite en varias variantes; se cuenta 1 vez).
  const seenMeals = new Set<string>()
  const textOnlyMeals = new Set<string>()
  const seenItemMacros = new Map<string, MacroTotals>()
  const swapItemIds = new Set<string>()
  const zeroQtyItemIds = new Set<string>()

  variantPlans.forEach((variant, variantIndex) => {
    const variantId = newId()
    variantRows.push({
      id: variantId,
      version_id: versionId,
      variant_key: variant.key,
      label: variant.label,
      day_of_week: variant.dayOfWeek,
      is_default: variant.isDefault,
      ...variantTargets,
      order_index: variantIndex,
    })

    variant.meals.forEach((meal, slotIndex) => {
      const slotId = newId()
      const description = meal.description && meal.description.trim() !== '' ? meal.description.trim() : null
      slotRows.push({
        id: slotId,
        version_id: versionId,
        day_variant_id: variantId,
        slot_code: `${slugify(meal.name) || 'comida'}-${slotIndex + 1}`,
        name: meal.name,
        start_time: null,
        end_time: null,
        slot_mode: 'anchor',
        is_required: false,
        target_calories: null,
        target_protein_g: null,
        target_carbs_g: null,
        target_fats_g: null,
        instructions: description,
        order_index: meal.order_index,
      })

      if (meal.items.length === 0) {
        seenMeals.add(meal.id)
        textOnlyMeals.add(meal.id)
        return
      }
      seenMeals.add(meal.id)

      meal.items.forEach((item, itemIndex) => {
        const food = item.food as V1FoodRow
        // Item con quantity <= 0 viola CHECK quantity>0 en V2: saltarlo y reportarlo
        // (nunca inventar una cantidad). No genera fila; se cuenta por fuente.
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          zeroQtyItemIds.add(item.id)
          return
        }
        const unit = sanitizeUnit(item.unit)
        const macros = snapshotItemMacros(food, item.quantity, unit)
        if (!seenItemMacros.has(item.id)) seenItemMacros.set(item.id, macros)

        // swap_options -> notas del item (nunca se descartan en silencio).
        const swaps = swapOptionNames(item.swap_options)
        let notes: string | null = null
        if (swaps.length > 0) {
          notes = `Alternativas: ${swaps.join(', ')}`
          swapItemIds.add(item.id)
        }

        itemRows.push({
          id: newId(),
          version_id: versionId,
          meal_slot_id: slotId,
          food_id: item.food_id,
          recipe_id: null,
          custom_name: null,
          quantity: item.quantity,
          unit,
          minimum_quantity: null,
          maximum_quantity: null,
          is_optional: false,
          substitution_group_id: null,
          notes,
          order_index: itemIndex,
          snapshot_name: food.name,
          snapshot_brand: null,
          snapshot_calories: macros.calories,
          snapshot_protein_g: macros.proteinG,
          snapshot_carbs_g: macros.carbsG,
          snapshot_fats_g: macros.fatsG,
          snapshot_fiber_g: snapshotFiber(food, item.quantity, unit),
        })
      })
    })
  })

  // --- Fidelidad (contada por fuente: sin doble conteo del fan-out) ---
  // OJO (no es un read-back de la DB): v1Totals suma los items de la FUENTE (cada meal
  // una vez) y v2Totals suma seenItemMacros (los mismos items, deduplicados del fan-out).
  // Ambos derivan de snapshotItemMacros, asi que coinciden por construccion salvo un bug
  // en la materializacion/dedup (que este cross-check SI detectaria: un item que no
  // llego a seenItemMacros baja v2Totals). NO verifica lo que quedo escrito en V2 (eso lo
  // cubren los CHECK de la migracion al insertar y el test de paridad numerica de vitest,
  // conversion.test.ts, con macros calculados a mano). La verdadera igualdad V1==snapshot
  // esta garantizada porque snapshotItemMacros es el espejo verbatim del server.
  let v1Totals: MacroTotals = { ...ZERO }
  for (const meal of meals) {
    for (const item of meal.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue
      v1Totals = addTotals(
        v1Totals,
        snapshotItemMacros(item.food as V1FoodRow, item.quantity, sanitizeUnit(item.unit)),
      )
    }
  }
  let v2Totals: MacroTotals = { ...ZERO }
  for (const macros of Array.from(seenItemMacros.values())) {
    v2Totals = addTotals(v2Totals, macros)
  }

  const noAcarreado: string[] = []
  if (plan.steps_target != null) noAcarreado.push('steps_target')
  if (plan.sleep_target_hours != null) noAcarreado.push('sleep_target_hours')
  if (plan.fasting_target_hours != null) noAcarreado.push('fasting_target_hours')
  if (Array.isArray(plan.supplement_guidance) && plan.supplement_guidance.length > 0) {
    noAcarreado.push('supplement_guidance')
  }

  const idempotencyKey = `v1conv:${plan.id}:${Math.floor(Date.parse(plan.updated_at) / 1000)}`

  return {
    ok: true,
    planRow,
    versionRow,
    variantRows,
    slotRows,
    itemRows,
    idempotencyKey,
    fidelity: {
      v1Totals,
      v2Totals,
      mealCount: meals.length,
      slotCount: seenMeals.size,
      itemCount: seenItemMacros.size,
      textOnlySlots: textOnlyMeals.size,
      swapsAsNotes: swapItemIds.size,
      zeroQuantityItemsSkipped: zeroQtyItemIds.size,
      noAcarreado,
    },
  }
}
