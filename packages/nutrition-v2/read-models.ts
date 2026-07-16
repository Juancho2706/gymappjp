import { z } from 'zod'
import {
  NutritionMacroTargetsSchema,
  NutritionStudentPermissionsSchema,
  NutritionStrategySchema,
} from './contracts'

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
