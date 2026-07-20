import { z } from 'zod'
import {
  NutritionMacroTargetsSchema,
  NutritionStudentPermissionsSchema,
  NutritionStrategySchema,
} from './contracts'
// `./catalog` es un módulo hoja (solo importa `zod`) → sin ciclo ESM al reusar
// `FoodMediaReadSchema` acá. Misma forma exacta que `FoodCatalogItem.media`, para que
// la fila del alumno resuelva la ilustración real con el mismo helper que el coach.
import { FoodMediaReadSchema } from './catalog'

export const NUTRITION_READ_MODEL_SCHEMA_VERSION = 1 as const

const IsoDateSchema = z.string().date()
const IsoDateTimeSchema = z.string().datetime({ offset: true })
const NullableUuidSchema = z.string().uuid().nullable()
const NullableNumberSchema = z.number().finite().nullable()

export const NutritionTotalsSchema = z.object({
  calories: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbsG: z.number().finite().nonnegative(),
  fatsG: z.number().finite().nonnegative(),
  fiberG: z.number().finite().nonnegative(),
  entryCount: z.number().int().nonnegative(),
})

export const NutritionFoodSnapshotSchema = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  calories: NullableNumberSchema,
  proteinG: NullableNumberSchema,
  carbsG: NullableNumberSchema,
  fatsG: NullableNumberSchema,
  fiberG: NullableNumberSchema,
  servingSize: NullableNumberSchema,
  servingUnit: z.string().nullable(),
})

export const NutritionIntakeReadItemSchema = z.object({
  id: z.string().uuid(),
  foodId: NullableUuidSchema,
  customName: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string(),
  mealSlot: z.string().nullable(),
  source: z.string().nullable(),
  captureMethod: z.string().nullable(),
  occurredAt: IsoDateTimeSchema,
  status: z.enum(['active', 'corrected', 'voided']),
  revision: z.number().int().positive(),
  correctsEntryId: NullableUuidSchema,
  prescriptionItemId: NullableUuidSchema,
  snapshot: NutritionFoodSnapshotSchema,
  totals: NutritionTotalsSchema.omit({ entryCount: true }),
  // Icono del alimento (aditivo). Van A NIVEL DE ITEM, NO dentro del `snapshot`
  // congelado (que se conserva byte-idéntico): se resuelven en LECTURA desde `food_id`
  // vía `food_media`/catálogo, así una corrección o un re-congelado no los toca. Con
  // `media` la fila del alumno pinta la ilustración real del producto (paridad total
  // con la card del coach); sin ella cae al icono de `category`, y sin ninguno al icono
  // derivado del nombre. `.nullable().optional()`: la migración que los puebla puede
  // desplegarse antes o después del web y una cache/RPC previo sin el campo sigue
  // parseando (mismo criterio de tolerancia que las porciones).
  media: FoodMediaReadSchema.nullable().optional(),
  category: z.string().nullable().optional(),
  // Porciones (SPEC R4, aditivo): pobladas SOLO en intakes sintéticos de marcar-porción
  // emitidos tras la migración de porciones. `.optional().nullable()`: caches y cuerpos
  // de RPC previos siguen parseando (criterio 8). La UI las usa para identificar el
  // último intake sintético de un grupo/franja (deshacer) sin heurísticas por nombre.
  exchangeGroupCode: z.string().nullable().optional(),
  exchangePortions: z.number().finite().positive().nullable().optional(),
})

export const NutritionPrescriptionItemReadSchema = z.object({
  id: z.string().uuid(),
  foodId: NullableUuidSchema,
  recipeId: NullableUuidSchema,
  name: z.string().nullable(),
  brand: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string(),
  minimumQuantity: NullableNumberSchema,
  maximumQuantity: NullableNumberSchema,
  optional: z.boolean(),
  substitutionGroupId: NullableUuidSchema,
  notes: z.string().nullable(),
  macros: z.object({
    calories: NullableNumberSchema,
    proteinG: NullableNumberSchema,
    carbsG: NullableNumberSchema,
    fatsG: NullableNumberSchema,
    fiberG: NullableNumberSchema,
  }),
  // Icono del alimento (aditivo) — mismo contrato/razón que en el item de intake:
  // resueltos en lectura desde `food_id`, no congelados. `.nullable().optional()` para
  // que el deploy web salga antes o después de la migración SQL sin romper el parse.
  media: FoodMediaReadSchema.nullable().optional(),
  category: z.string().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Porciones (intercambios) V2 — capa OPCIONAL del read-model (SPEC R2/R3/R5).
// Todos los campos son .optional(): un plan sin porciones deja el read-model
// byte-idéntico (criterio Q1) y una cache anterior (RN) sigue parseando (criterio 8).
// ---------------------------------------------------------------------------

/** Macros de referencia POR PORCIÓN, congelados en el snapshot del target. */
export const NutritionExchangeRefSchema = z.object({
  calories: z.number().finite(),
  proteinG: z.number().finite(),
  carbsG: z.number().finite(),
  fatsG: z.number().finite(),
})

/**
 * Parte de un grupo compuesto (LEG = 1P + 1C) ENRIQUECIDA con los `ref_*` congelados
 * del grupo base (SPEC R2/A2). El read-model reconstruye el diccionario contra estos
 * valores congelados, de modo que editar el `ref_*` de P o C tras publicar NO mueve
 * los macros del plan con LEG — sin tocar el engine.
 */
export const NutritionExchangeComposedPartSchema = z.object({
  code: z.string(),
  portions: z.number().finite(),
  ref: NutritionExchangeRefSchema,
})

/**
 * Entrada del diccionario de grupos reconstruido desde snapshots. Forma ESPEJO de
 * `ExchangeGroup` de `@eva/nutrition-engine` (test de contrato de forma en ambos
 * bordes — A4) para que `expandComposedGroups`/`findByCode` resuelvan contra valores
 * congelados SIN modificar el motor (18 tests intactos). `id` es `string` (no uuid):
 * los grupos BASE sintetizados desde `composed_of` llevan un id determinista.
 */
export const NutritionExchangeGroupReadSchema = z.object({
  id: z.string(),
  slug: z.string(),
  code: z.string(),
  name: z.string(),
  coachId: z.string().nullable(),
  teamId: z.string().nullable(),
  isSystem: z.boolean(),
  refCalories: z.number().finite(),
  refProteinG: z.number().finite(),
  refCarbsG: z.number().finite(),
  refFatsG: z.number().finite(),
  color: z.string().nullable(),
  sortOrder: z.number().finite(),
  composedOf: z.array(NutritionExchangeComposedPartSchema).nullable(),
  macrosConfirmed: z.boolean(),
})

/**
 * Target de porciones de una franja en el read-model. Trae el snapshot congelado
 * (`snapshot_*` de la tabla) + la cobertura DESGLOSADA (SPEC R5, hallazgo F2-front):
 * `marcadas` (Σ porciones de intakes sintéticos activos) y `derivadas` (Σ
 * gramos/`exchange_portion_grams` de alimentos reales activos) POR SEPARADO, más la
 * suma `coverage`. Los tres son `.optional()`: la UI pinta segmentos marcados-a-mano
 * vs derivados-de-alimento, y una cache vieja sin cobertura sigue válida.
 */
export const NutritionSlotExchangeTargetReadSchema = z.object({
  id: z.string().uuid(),
  // z.guid(), NO z.uuid(): los 9 grupos system de exchange_groups tienen ids
  // deterministas no-RFC del seed V1 (0000e8c0-...-0001, nibble de version 0) y
  // z.uuid() de Zod 4 los rechaza — rompia el parse del Today de TODO plan con
  // porciones (incidente prod 2026-07-18; gotcha conocido del repo: seeds -> guid).
  exchangeGroupId: z.guid(),
  groupCode: z.string(),
  groupName: z.string(),
  color: z.string().nullable(),
  portions: z.number().finite().positive(),
  notes: z.string().nullable(),
  orderIndex: z.number().int().nonnegative(),
  ref: NutritionExchangeRefSchema,
  composedOf: z.array(NutritionExchangeComposedPartSchema).nullable(),
  macrosConfirmed: z.boolean(),
  marcadas: z.number().finite().nonnegative().optional(),
  derivadas: z.number().finite().nonnegative().optional(),
  coverage: z.number().finite().nonnegative().optional(),
})

/**
 * Alimento de equivalencia por grupo (SPEC UX-b / hallazgo F3): la lista "1 porción
 * equivale a" viaja DENTRO del read-model del Today (security-definer) — el sheet
 * nunca consulta `exchange_groups` ni `foods` desde el cliente. Solo trae foods del
 * catálogo con `exchange_group_id` + `exchange_portion_grams` poblados (pipeline R8);
 * catálogo sin clasificar ⇒ lista vacía y el sheet muestra su estado vacío.
 */
export const NutritionExchangeFoodReadSchema = z.object({
  foodId: z.string().uuid(),
  // z.guid() por los ids no-RFC del seed de exchange_groups (ver arriba).
  exchangeGroupId: z.guid(),
  groupCode: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  /** Etiqueta casera de la porción (`foods.exchange_portion_label`), p.ej. "1 taza". */
  portionLabel: z.string().nullable(),
  /** Gramos de UNA porción del grupo (`foods.exchange_portion_grams`). */
  portionGrams: z.number().finite().positive().nullable(),
})

/**
 * Cobertura del DÍA por grupo (SPEC R5 `cobertura_dia`): suma todas las franjas MÁS
 * los intakes sin franja asignada (que aportan al resumen del día, nunca a un chip de
 * franja). `prescribed` = Σ portions de los targets del día; puede ser 0 si el grupo
 * solo aparece por cobertura derivada de un alimento no prescrito.
 */
export const NutritionDayCoverageReadSchema = z.object({
  groupCode: z.string(),
  groupName: z.string(),
  color: z.string().nullable(),
  prescribed: z.number().finite().nonnegative(),
  marcadas: z.number().finite().nonnegative(),
  derivadas: z.number().finite().nonnegative(),
  coverage: z.number().finite().nonnegative(),
})

export const NutritionMealSlotReadSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  mode: z.enum(['anchor', 'flexible']),
  required: z.boolean(),
  instructions: z.string().nullable(),
  targets: NutritionMacroTargetsSchema.partial(),
  prescriptionItems: z.array(NutritionPrescriptionItemReadSchema),
  intakeItems: z.array(NutritionIntakeReadItemSchema),
  // Capa OPCIONAL de porciones (SPEC R2). Ausente ⇒ franja sin porciones.
  exchangeTargets: z.array(NutritionSlotExchangeTargetReadSchema).optional(),
})

export const NutritionPlanSummaryReadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  strategy: NutritionStrategySchema,
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: z.enum(['published', 'superseded']),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.nullable(),
})

export const NutritionTodayReadModelSchema = z.object({
  schemaVersion: z.literal(NUTRITION_READ_MODEL_SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  localDate: IsoDateSchema,
  timezone: z.string(),
  snapshotId: NullableUuidSchema,
  plan: NutritionPlanSummaryReadSchema.nullable(),
  targets: NutritionMacroTargetsSchema,
  consumed: NutritionTotalsSchema,
  remaining: NutritionMacroTargetsSchema,
  permissions: NutritionStudentPermissionsSchema,
  mealSlots: z.array(NutritionMealSlotReadSchema),
  unassignedIntake: z.array(NutritionIntakeReadItemSchema),
  // Diccionario de grupos reconstruido desde snapshots (SPEC R3/A2). OPCIONAL: solo
  // presente si el plan tiene porciones. Alimenta el sheet de equivalencias y la
  // expansión de compuestos SIN pegarle a `exchange_groups` (hallazgo F3).
  exchangeGroups: z.array(NutritionExchangeGroupReadSchema).optional(),
  // Porciones (aditivo, opcional): cobertura del día por grupo (fila "Porciones de
  // hoy" — SPEC R5 `cobertura_dia`) + alimentos de equivalencia por grupo (sheet —
  // hallazgo F3). Solo presentes si el plan tiene targets de porciones.
  dayCoverage: z.array(NutritionDayCoverageReadSchema).optional(),
  exchangeFoods: z.array(NutritionExchangeFoodReadSchema).optional(),
  syncToken: z.string(),
})

export const NutritionPlanReadModelSchema = z.object({
  schemaVersion: z.literal(NUTRITION_READ_MODEL_SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  asOfDate: IsoDateSchema,
  timezone: z.string(),
  plan: NutritionPlanSummaryReadSchema.nullable(),
  visibleNotes: z.string().nullable(),
  protocolNotes: z.string().nullable(),
  permissions: NutritionStudentPermissionsSchema,
  dayVariants: z.array(z.object({
    id: z.string().uuid(),
    key: z.string(),
    label: z.string(),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    isDefault: z.boolean(),
    targets: NutritionMacroTargetsSchema,
    mealSlots: z.array(NutritionMealSlotReadSchema.omit({ intakeItems: true })),
  })),
  // Diccionario de grupos reconstruido desde snapshots (SPEC R3/A2). OPCIONAL: mismo
  // borde de forma `ExchangeGroup[]` que Today (A4). En la ficha del coach alimenta la
  // fila "Porciones" read-only sin cálculo nuevo.
  exchangeGroups: z.array(NutritionExchangeGroupReadSchema).optional(),
  syncToken: z.string(),
})

export const NutritionHistoryDaySchema = z.object({
  localDate: IsoDateSchema,
  snapshotId: NullableUuidSchema,
  planVersionId: NullableUuidSchema,
  strategy: NutritionStrategySchema.nullable(),
  targets: NutritionMacroTargetsSchema,
  consumed: NutritionTotalsSchema,
  activeEntryCount: z.number().int().nonnegative(),
  correctionCount: z.number().int().nonnegative(),
  legacyCompletionCount: z.number().int().nonnegative(),
  legacyDisclosure: z.enum(['legacy_completion_without_food_detail']).nullable(),
  // Datos del sistema anterior (aditivos). OPCIONALES: respuestas cacheadas del RPC previo
  // (sobre todo la cache de RN) no traen estos campos y deben seguir parseando.
  legacyEntryCount: z.number().int().nonnegative().optional(),
  legacyConsumed: z
    .object({
      calories: z.number().finite().nonnegative(),
      proteinG: z.number().finite().nonnegative(),
      carbsG: z.number().finite().nonnegative(),
      fatsG: z.number().finite().nonnegative(),
    })
    .nullable()
    .optional(),
  legacyMeals: z.array(z.string()).nullable().optional(),
  lastRecordedAt: IsoDateTimeSchema.nullable(),
})

export const NutritionHistoryPageReadModelSchema = z.object({
  schemaVersion: z.literal(NUTRITION_READ_MODEL_SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  items: z.array(NutritionHistoryDaySchema),
  nextCursor: IsoDateSchema.nullable(),
  hasMore: z.boolean(),
})

export const NutritionCoachHubItemSchema = z.object({
  clientId: z.string().uuid(),
  clientName: z.string(),
  planId: NullableUuidSchema,
  versionId: NullableUuidSchema,
  versionNumber: z.number().int().positive().nullable(),
  planName: z.string().nullable(),
  strategy: NutritionStrategySchema.nullable(),
  planStatus: z.string().nullable(),
  effectiveFrom: IsoDateSchema.nullable(),
  lastIntakeAt: IsoDateTimeSchema.nullable(),
  activeDays7d: z.number().int().nonnegative(),
  intakeEntries7d: z.number().int().nonnegative(),
  pendingDrafts: z.number().int().nonnegative(),
  attentionReason: z.enum(['no_plan', 'draft_pending', 'no_recent_intake', 'none']),
  updatedAt: IsoDateTimeSchema,
})

export const NutritionCoachHubPageReadModelSchema = z.object({
  schemaVersion: z.literal(NUTRITION_READ_MODEL_SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  items: z.array(NutritionCoachHubItemSchema),
  nextCursor: z.object({ updatedAt: IsoDateTimeSchema, clientId: z.string().uuid() }).nullable(),
  hasMore: z.boolean(),
})

export const NutritionClientDetailReadModelSchema = z.object({
  schemaVersion: z.literal(NUTRITION_READ_MODEL_SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  client: z.object({ id: z.string().uuid(), fullName: z.string() }),
  today: NutritionTodayReadModelSchema,
  plan: NutritionPlanReadModelSchema,
  recentDays: z.array(NutritionHistoryDaySchema),
  privateNote: z.object({ note: z.string(), updatedAt: IsoDateTimeSchema }).nullable(),
})

/**
 * Active-workspace scope carried by every professional (coach/nutritionist) read.
 * Mirrors the server contract of `nutrition_v2_client_matches_workspace`
 * (migration 20260714211000): a standalone coach pool, a `teams` pool or an
 * `organizations` pool. The cross-field invariant is enforced here so the boundary
 * (web gateway + mobile API) fails closed instead of ever reading "sin scope".
 */
export const NutritionV2CoachScopeTypeSchema = z.enum(['standalone', 'team', 'organization'])

export const NutritionV2CoachScopeSchema = z
  .object({
    scopeType: NutritionV2CoachScopeTypeSchema,
    teamId: NullableUuidSchema,
    orgId: NullableUuidSchema,
  })
  .superRefine((value, ctx) => {
    if (value.scopeType === 'standalone' && (value.teamId !== null || value.orgId !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'standalone scope must not carry teamId or orgId' })
    }
    if (value.scopeType === 'team' && (value.teamId === null || value.orgId !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'team scope requires teamId and no orgId' })
    }
    if (value.scopeType === 'organization' && (value.orgId === null || value.teamId !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'organization scope requires orgId and no teamId' })
    }
  })

export type NutritionExchangeRef = z.infer<typeof NutritionExchangeRefSchema>
export type NutritionExchangeComposedPart = z.infer<typeof NutritionExchangeComposedPartSchema>
export type NutritionExchangeGroupRead = z.infer<typeof NutritionExchangeGroupReadSchema>
export type NutritionSlotExchangeTargetRead = z.infer<typeof NutritionSlotExchangeTargetReadSchema>
export type NutritionExchangeFoodRead = z.infer<typeof NutritionExchangeFoodReadSchema>
export type NutritionDayCoverageRead = z.infer<typeof NutritionDayCoverageReadSchema>
export type NutritionTotals = z.infer<typeof NutritionTotalsSchema>
export type NutritionIntakeReadItem = z.infer<typeof NutritionIntakeReadItemSchema>
export type NutritionMealSlotRead = z.infer<typeof NutritionMealSlotReadSchema>
export type NutritionTodayReadModel = z.infer<typeof NutritionTodayReadModelSchema>
export type NutritionPlanReadModel = z.infer<typeof NutritionPlanReadModelSchema>
export type NutritionHistoryDay = z.infer<typeof NutritionHistoryDaySchema>
export type NutritionHistoryPageReadModel = z.infer<typeof NutritionHistoryPageReadModelSchema>
export type NutritionCoachHubItem = z.infer<typeof NutritionCoachHubItemSchema>
export type NutritionCoachHubPageReadModel = z.infer<typeof NutritionCoachHubPageReadModelSchema>
export type NutritionClientDetailReadModel = z.infer<typeof NutritionClientDetailReadModelSchema>
export type NutritionV2CoachScopeType = z.infer<typeof NutritionV2CoachScopeTypeSchema>
export type NutritionV2CoachScope = z.infer<typeof NutritionV2CoachScopeSchema>

export function parseNutritionReadModel<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input)
}

// ---------------------------------------------------------------------------
// Porciones (intercambios) — reconstrucción del diccionario y cobertura (SPEC R3/R5).
// Puro: sin IO, sin acceso a `exchange_groups` vivo. Reutilizable por el builder del
// read-model (server), el sheet de equivalencias y los tests de paridad del engine.
// ---------------------------------------------------------------------------

/** Los 9 grupos system de V1 (SPEC R3). Se usan para marcar `isSystem` al reconstruir. */
export const SYSTEM_EXCHANGE_CODES = new Set([
  'C',
  'P',
  'F',
  'V',
  'LAC',
  'ARL',
  'SP',
  'G',
  'LEG',
])

/** Prefijo de id determinista para grupos BASE sintetizados desde `composed_of`. */
const SNAPSHOT_BASE_ID_PREFIX = 'snapshot-base:'

/**
 * Reconstruye el diccionario `ExchangeGroup[]` (forma del engine) desde los snapshots
 * congelados de los targets de una versión (SPEC R2/R3/A2). Incluye:
 *
 *  1. un grupo por cada target prescrito (con su `groupName` y `ref_*` congelados);
 *  2. los grupos BASE embebidos en `composedOf` (LEG ⇒ P + C) que NO fueron
 *     prescritos directo, sintetizados desde el `ref` congelado de cada parte — con
 *     un id determinista `snapshot-base:{code}` — para que `findByCode`/
 *     `expandComposedGroups` del engine resuelvan LEG contra los valores de P y C
 *     vigentes AL PUBLICAR, no el catálogo vivo.
 *
 * Nunca lee `exchange_groups` en runtime: todo sale del snapshot. El resultado es
 * asignable a `ExchangeGroup[]` del engine (contrato de forma en ambos bordes — A4).
 */
export function reconstructExchangeGroups(
  targets: ReadonlyArray<
    Pick<
      NutritionSlotExchangeTargetRead,
      'exchangeGroupId' | 'groupCode' | 'groupName' | 'color' | 'ref' | 'composedOf' | 'macrosConfirmed'
    >
  >,
): NutritionExchangeGroupRead[] {
  const byId = new Map<string, NutritionExchangeGroupRead>()
  const byCode = new Map<string, NutritionExchangeGroupRead>()
  let order = 0

  const put = (group: NutritionExchangeGroupRead): void => {
    if (byId.has(group.id)) return
    byId.set(group.id, group)
    if (!byCode.has(group.code)) byCode.set(group.code, group)
  }

  // 1) Grupos directos de los targets (traen nombre y ref completos).
  for (const target of targets) {
    if (byId.has(target.exchangeGroupId)) continue
    put({
      id: target.exchangeGroupId,
      slug: target.groupCode.toLowerCase(),
      code: target.groupCode,
      name: target.groupName,
      coachId: null,
      teamId: null,
      isSystem: SYSTEM_EXCHANGE_CODES.has(target.groupCode),
      refCalories: target.ref.calories,
      refProteinG: target.ref.proteinG,
      refCarbsG: target.ref.carbsG,
      refFatsG: target.ref.fatsG,
      color: target.color,
      sortOrder: order++,
      composedOf: target.composedOf,
      macrosConfirmed: target.macrosConfirmed,
    })
  }

  // 2) Grupos BASE embebidos en `composed_of` que no fueron prescritos directo.
  for (const target of targets) {
    for (const part of target.composedOf ?? []) {
      if (byCode.has(part.code)) continue
      put({
        id: `${SNAPSHOT_BASE_ID_PREFIX}${part.code}`,
        slug: part.code.toLowerCase(),
        code: part.code,
        name: part.code,
        coachId: null,
        teamId: null,
        isSystem: true,
        refCalories: part.ref.calories,
        refProteinG: part.ref.proteinG,
        refCarbsG: part.ref.carbsG,
        refFatsG: part.ref.fatsG,
        color: null,
        sortOrder: order++,
        composedOf: null,
        macrosConfirmed: true,
      })
    }
  }

  return [...byId.values()]
}

/** Intake (real o sintético) para el cálculo de cobertura de porciones (SPEC R5). */
export interface PortionCoverageIntake {
  /** Solo las cadenas ACTIVAS suman cobertura (el void neutraliza — SPEC R4/B3). */
  status: NutritionIntakeReadItem['status']
  /** Código de franja (`meal_slot_code`). null ⇒ solo aporta al resumen del día. */
  mealSlotCode: string | null
  // --- Intake SINTÉTICO (marcar-porción): `marcadas`. ---
  /** Código congelado del grupo (`exchange_group_code`). */
  exchangeGroupCode?: string | null
  /** Porciones marcadas (`exchange_portions`), múltiplos de 0,5. */
  exchangePortions?: number | null
  // --- Intake REAL (alimento clasificado): `derivadas`. ---
  /** Código del grupo del food (catálogo VIGENTE al leer — SPEC R5/A3). */
  foodExchangeGroupCode?: string | null
  /** Cantidad convertida a gramos, o null si la unidad no es convertible. */
  quantityGrams?: number | null
  /** `foods.exchange_portion_grams` del food. */
  exchangePortionGrams?: number | null
}

/** Cobertura desglosada de un grupo (SPEC R5): marcadas + derivadas = coverage. */
export interface PortionCoverageCell {
  marcadas: number
  derivadas: number
  coverage: number
}

/** Clave estable `{slotCode}\u0000{groupCode}` del mapa de cobertura por franja. */
export function portionCoverageKey(slotCode: string, groupCode: string): string {
  return `${slotCode}\u0000${groupCode}`
}

function roundCoverage(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Cobertura de porciones por (franja, grupo) desde los intakes (SPEC R5). Suma SOLO
 * cadenas ACTIVAS (el void escribe `exchange_portions=null` Y aquí se descartan las
 * no-activas — doble cinturón, hallazgo B3):
 *
 *  - `marcadas(s,g)` = Σ `exchangePortions` de intakes sintéticos activos con
 *    `mealSlotCode=s` y `exchangeGroupCode=g`.
 *  - `derivadas(s,g)` = Σ `quantityGrams / exchangePortionGrams` de intakes reales
 *    activos con `mealSlotCode=s` cuyo food tiene grupo `g`; unidades no convertibles
 *    a gramos o foods sin `exchange_portion_grams` NO aportan cobertura.
 *  - `coverage(s,g)` = `marcadas + derivadas`.
 *
 * Los targets de porciones NUNCA entran aquí (viven del lado TARGET) — no hay doble
 * conteo estructural (SPEC R5/criterio 6). Intakes con `mealSlotCode=null` se omiten
 * (solo aportan al resumen del día, nunca a un chip de franja).
 */
export function computePortionCoverage(
  intakes: ReadonlyArray<PortionCoverageIntake>,
): Map<string, PortionCoverageCell> {
  const cells = new Map<string, PortionCoverageCell>()
  const cellFor = (slotCode: string, groupCode: string): PortionCoverageCell => {
    const key = portionCoverageKey(slotCode, groupCode)
    let cell = cells.get(key)
    if (!cell) {
      cell = { marcadas: 0, derivadas: 0, coverage: 0 }
      cells.set(key, cell)
    }
    return cell
  }

  for (const intake of intakes) {
    if (intake.status !== 'active') continue
    if (intake.mealSlotCode == null) continue

    // Sintético (marcar-porción) ⇒ marcadas.
    if (
      intake.exchangeGroupCode != null &&
      intake.exchangePortions != null &&
      intake.exchangePortions > 0
    ) {
      const cell = cellFor(intake.mealSlotCode, intake.exchangeGroupCode)
      cell.marcadas = roundCoverage(cell.marcadas + intake.exchangePortions)
      cell.coverage = roundCoverage(cell.marcadas + cell.derivadas)
      continue
    }

    // Real (alimento clasificado) ⇒ derivadas.
    if (
      intake.foodExchangeGroupCode != null &&
      intake.quantityGrams != null &&
      intake.quantityGrams > 0 &&
      intake.exchangePortionGrams != null &&
      intake.exchangePortionGrams > 0
    ) {
      const cell = cellFor(intake.mealSlotCode, intake.foodExchangeGroupCode)
      cell.derivadas = roundCoverage(cell.derivadas + intake.quantityGrams / intake.exchangePortionGrams)
      cell.coverage = roundCoverage(cell.marcadas + cell.derivadas)
    }
  }

  return cells
}

/**
 * Presentación de un día que trae datos del sistema anterior de nutrición
 * (registros y comidas del sistema clásico). Deriva, desde los campos aditivos
 * del read-model, qué mostrarle al alumno y al coach en la lista de historial.
 *
 * Fuente única de las frases visibles para garantizar paridad exacta web/RN.
 * Las cifras de macros salen de `legacyConsumed`; los nombres de comidas de
 * `legacyMeals`. Los campos aditivos pueden venir ausentes (cache antigua) → se
 * tratan como 0 / null sin romper el render.
 */
export function describeLegacyHistoryDay(
  day: Pick<
    NutritionHistoryDay,
    | 'activeEntryCount'
    | 'legacyDisclosure'
    | 'legacyCompletionCount'
    | 'legacyEntryCount'
    | 'legacyConsumed'
    | 'legacyMeals'
  >,
): {
  isLegacy: boolean
  legacyOnly: boolean
  consumed: { calories: number; proteinG: number; carbsG: number; fatsG: number } | null
  hasMacros: boolean
  completionCount: number
  completionsLabel: string
  meals: string[]
  mealsLabel: string | null
  secondaryLabel: string | null
} {
  const isLegacy = day.legacyDisclosure !== null
  const consumed = day.legacyConsumed ?? null
  const hasMacros = consumed != null && consumed.calories > 0
  const completionCount = day.legacyCompletionCount ?? 0
  const meals = (day.legacyMeals ?? []).filter((name) => name != null && name.trim().length > 0)
  const mealsLabel = meals.length > 0 ? meals.join(' · ') : null
  const completionsLabel = `${completionCount} comida${completionCount === 1 ? '' : 's'} completada${
    completionCount === 1 ? '' : 's'
  }`
  const legacyOnly = isLegacy && day.activeEntryCount === 0
  const secondaryLabel = hasMacros
    ? `Sistema anterior · ${Math.round(consumed!.calories)} kcal`
    : completionCount > 0
      ? `Sistema anterior · ${completionsLabel}`
      : null

  return {
    isLegacy,
    legacyOnly,
    consumed,
    hasMacros,
    completionCount,
    completionsLabel,
    meals,
    mealsLabel,
    secondaryLabel,
  }
}
