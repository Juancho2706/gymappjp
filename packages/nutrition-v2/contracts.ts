import { z } from 'zod'

export const NutritionStrategySchema = z.enum(['structured', 'flexible', 'hybrid'])
export const NutritionPlanStatusSchema = z.enum(['draft', 'published', 'superseded', 'archived'])
export const NutritionEntryStatusSchema = z.enum(['active', 'corrected', 'voided'])
export const NutritionActorRoleSchema = z.enum(['student', 'coach', 'org_admin', 'team_member', 'system'])
export const NutritionCaptureMethodSchema = z.enum([
  'search',
  'barcode',
  'recent',
  'favorite',
  'recipe',
  'prescription',
  'manual',
  'legacy',
])
export const NutritionIntakeSourceSchema = z.enum([
  'offplan',
  'prescription',
  'substitution',
  'recipe',
  'manual',
  'legacy',
])

export const NutritionMacroTargetsSchema = z.object({
  calories: z.number().nonnegative().nullable().default(null),
  proteinG: z.number().nonnegative().nullable().default(null),
  carbsG: z.number().nonnegative().nullable().default(null),
  fatsG: z.number().nonnegative().nullable().default(null),
  fiberG: z.number().nonnegative().nullable().default(null),
  sodiumMg: z.number().nonnegative().nullable().default(null),
  waterMl: z.number().nonnegative().nullable().default(null),
})

export const NutritionStudentPermissionsSchema = z.object({
  canRegisterFreely: z.boolean().default(true),
  canAdjustPrescribedQuantity: z.boolean().default(true),
  quantityAdjustmentPercent: z.number().min(0).max(100).nullable().default(null),
  canSubstitute: z.boolean().default(false),
  canMoveMealSlot: z.boolean().default(false),
  canSkipOptionalItems: z.boolean().default(true),
})

export const NutritionPrescriptionItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    foodId: z.string().uuid().nullable().default(null),
    recipeId: z.string().uuid().nullable().default(null),
    customName: z.string().trim().min(1).max(180).nullable().default(null),
    quantity: z.number().positive(),
    unit: z.string().trim().min(1).max(32),
    minimumQuantity: z.number().nonnegative().nullable().default(null),
    maximumQuantity: z.number().positive().nullable().default(null),
    optional: z.boolean().default(false),
    substitutionGroupId: z.string().uuid().nullable().default(null),
    notes: z.string().trim().max(1000).nullable().default(null),
    orderIndex: z.number().int().nonnegative().default(0),
  })
  .superRefine((value, ctx) => {
    if (!value.foodId && !value.recipeId && !value.customName) {
      ctx.addIssue({
        code: 'custom',
        path: ['foodId'],
        message: 'Debes seleccionar un alimento, una receta o indicar un nombre.',
      })
    }
    if (
      value.minimumQuantity !== null &&
      value.maximumQuantity !== null &&
      value.minimumQuantity > value.maximumQuantity
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maximumQuantity'],
        message: 'El máximo no puede ser menor que el mínimo.',
      })
    }
  })

/**
 * Target de porciones (intercambios) prescrito en una franja. Es una CAPA OPCIONAL
 * sobre `structured`/`hybrid` (SPEC R1): la sola presencia de targets vuelve "por
 * porciones" a la franja, sin tocar la enum `strategy`. Media porción vía múltiplos
 * de 0,5 (SPEC R2); mínimo 0,5, máximo 99. Espeja el CHECK de la tabla
 * `nutrition_slot_exchange_targets_v2` (`portions > 0 and portions <= 99 and
 * (portions*2) = floor(portions*2)`). Los `snapshot_*` se congelan server-side al
 * persistir el draft (T0.3), NO viven en este contrato de entrada.
 */
export const NutritionExchangeTargetSchema = z.object({
  id: z.string().uuid().optional(),
  exchangeGroupId: z.string().uuid(),
  portions: z
    .number()
    .positive()
    .max(99)
    .refine((n) => Number.isInteger(n * 2), {
      message: 'Las porciones deben ir en múltiplos de 0,5.',
    }),
  notes: z.string().trim().max(1000).nullable().default(null),
  orderIndex: z.number().int().nonnegative().default(0),
})

export const NutritionMealSlotSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  mode: z.enum(['anchor', 'flexible']).default('anchor'),
  required: z.boolean().default(false),
  targets: NutritionMacroTargetsSchema.partial().default({}),
  instructions: z.string().trim().max(2000).nullable().default(null),
  orderIndex: z.number().int().nonnegative().default(0),
  items: z.array(NutritionPrescriptionItemSchema).default([]),
  // Capa OPCIONAL de porciones: un draft sin porciones queda idéntico a hoy;
  // `flexible` no lleva porciones en F1 (SPEC R1).
  //
  // NOTA (código gana sobre SPEC): TASKS pedía `default([])`, pero eso vuelve el
  // campo REQUERIDO en el tipo de salida y rompería los múltiples constructores
  // literales existentes del tipo de la franja (draft-builder.ts=T0.3,
  // quick-edit.ts=T1.2, assign-plan.ts, quick-edit-state.ts) — archivos de OTRAS
  // tareas/olas que no puedo tocar. Se usa `.optional()`: contrato de consumo
  // idéntico (ausente = sin porciones; downstream resuelve con `?? []`).
  exchangeTargets: z.array(NutritionExchangeTargetSchema).optional(),
})

export const NutritionDayVariantSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  dayOfWeek: z.number().int().min(0).max(6).nullable().default(null),
  default: z.boolean().default(false),
  targets: NutritionMacroTargetsSchema,
  orderIndex: z.number().int().nonnegative().default(0),
  mealSlots: z.array(NutritionMealSlotSchema).default([]),
})

export const NutritionPlanDraftSchema = z.object({
  planId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  strategy: NutritionStrategySchema,
  effectiveFrom: z.string().date().nullable().default(null),
  timezone: z.string().trim().min(1).max(80).default('America/Santiago'),
  permissions: NutritionStudentPermissionsSchema,
  visibleNotes: z.string().trim().max(8000).nullable().default(null),
  privateNotes: z.string().trim().max(8000).nullable().default(null),
  protocolNotes: z.string().trim().max(8000).nullable().default(null),
  dayVariants: z.array(NutritionDayVariantSchema).min(1),
})

export const NutritionIntakeMutationSchema = z
  .object({
    clientId: z.string().uuid(),
    localDate: z.string().date(),
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(80),
    foodId: z.string().uuid().nullable().default(null),
    customName: z.string().trim().min(1).max(180).nullable().default(null),
    quantity: z.number().positive(),
    unit: z.string().trim().min(1).max(32),
    mealSlot: z.string().trim().max(64).nullable().default(null),
    source: NutritionIntakeSourceSchema,
    captureMethod: NutritionCaptureMethodSchema,
    daySnapshotId: z.string().uuid().nullable().default(null),
    planVersionId: z.string().uuid().nullable().default(null),
    prescriptionItemId: z.string().uuid().nullable().default(null),
    idempotencyKey: z.string().trim().min(8).max(200),
    note: z.string().trim().max(2000).nullable().default(null),
    snapshot: z.object({
      name: z.string().trim().min(1).max(180),
      brand: z.string().trim().max(180).nullable().default(null),
      calories: z.number().nonnegative().nullable().default(null),
      proteinG: z.number().nonnegative().nullable().default(null),
      carbsG: z.number().nonnegative().nullable().default(null),
      fatsG: z.number().nonnegative().nullable().default(null),
      fiberG: z.number().nonnegative().nullable().default(null),
      servingSize: z.number().positive().nullable().default(null),
      servingUnit: z.string().trim().max(32).nullable().default(null),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.foodId && !value.customName) {
      ctx.addIssue({
        code: 'custom',
        path: ['foodId'],
        message: 'Debes seleccionar un alimento o indicar un nombre.',
      })
    }
  })

export const NutritionIntakeCorrectionSchema = NutritionIntakeMutationSchema.extend({
  correctsEntryId: z.string().uuid(),
  correctionReason: z.string().trim().min(3).max(1000),
})

export const NutritionDaySnapshotSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  timezone: z.string(),
  planId: z.string().uuid().nullable(),
  versionId: z.string().uuid().nullable(),
  dayVariantId: z.string().uuid().nullable(),
  strategy: NutritionStrategySchema.nullable(),
  targets: NutritionMacroTargetsSchema,
  prescriptionSnapshot: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true }),
})

export const NutritionLegacyHistoryItemSchema = z.object({
  source: z.literal('legacy'),
  legacyMealLogId: z.string().uuid(),
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  mealId: z.string().uuid().nullable(),
  mealName: z.string().nullable(),
  completed: z.boolean(),
  consumedQuantity: z.number().nullable(),
  satisfactionScore: z.number().int().min(1).max(5).nullable(),
  recordedAt: z.string().datetime({ offset: true }),
  disclosure: z.literal('legacy_completion_without_food_detail'),
})

export type NutritionExchangeTarget = z.infer<typeof NutritionExchangeTargetSchema>
export type NutritionStrategy = z.infer<typeof NutritionStrategySchema>
export type NutritionPlanStatus = z.infer<typeof NutritionPlanStatusSchema>
export type NutritionEntryStatus = z.infer<typeof NutritionEntryStatusSchema>
export type NutritionMacroTargets = z.infer<typeof NutritionMacroTargetsSchema>
export type NutritionStudentPermissions = z.infer<typeof NutritionStudentPermissionsSchema>
export type NutritionPlanDraft = z.infer<typeof NutritionPlanDraftSchema>
export type NutritionIntakeMutation = z.infer<typeof NutritionIntakeMutationSchema>
export type NutritionIntakeCorrection = z.infer<typeof NutritionIntakeCorrectionSchema>
export type NutritionDaySnapshot = z.infer<typeof NutritionDaySnapshotSchema>
export type NutritionLegacyHistoryItem = z.infer<typeof NutritionLegacyHistoryItemSchema>

export function buildNutritionIdempotencyKey(input: {
  clientId: string
  deviceId: string
  operationId: string
  kind: 'intake' | 'correction' | 'publish' | 'snapshot'
}): string {
  const normalized = [input.kind, input.clientId, input.deviceId, input.operationId]
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'))
    .join(':')
  if (normalized.length < 8 || normalized.length > 200) {
    throw new Error('Invalid nutrition idempotency key length')
  }
  return normalized
}

/**
 * `operationId` canónico del marcar-porción (SPEC R4/B2/M1). Forma exacta:
 * `{fecha}-{slotCode}-{groupCode}-{ordinal}-a{attempt}`.
 *
 * - `ordinal`: índice (0-based) de la porción DENTRO de (fecha, franja, grupo);
 *   la 1ª porción marcada de C en el almuerzo del día es el ordinal 0, la 2ª el 1…
 * - `attempt`: contador local por `(fecha, franja, grupo, ordinal)` que se
 *   INCREMENTA en cada deshacer de ese ordinal (incluso si el deshacer solo canceló
 *   una entrada aún encolada). Así re-marcar tras deshacer produce una key NUEVA —
 *   nunca colisiona con el intake anulado — mientras el replay offline de la MISMA
 *   marca (mismo attempt) conserva su key (dedup extremo-a-extremo).
 *
 * `buildNutritionIdempotencyKey` ya sanitiza `[^a-z0-9_-]` y lowercasea, de modo que
 * la fecha `2026-07-18` y los códigos se normalizan sin colisionar.
 */
export function nutritionPortionOperationId(input: {
  localDate: string
  slotCode: string
  groupCode: string
  ordinal: number
  attempt: number
}): string {
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0) {
    throw new Error('nutritionPortionOperationId: ordinal debe ser entero >= 0')
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new Error('nutritionPortionOperationId: attempt debe ser entero >= 1')
  }
  return `${input.localDate}-${input.slotCode}-${input.groupCode}-${input.ordinal}-a${input.attempt}`
}

/**
 * Idempotency key canónica del intake sintético de una porción marcada. Emite SIEMPRE
 * por `buildNutritionIdempotencyKey` (helper canónico — hallazgo M2) con el
 * `operationId` de porción. `kind` es 'intake' porque el void del marcar-porción usa
 * el mismo camino de corrección que cualquier intake (SPEC R4).
 */
export function buildNutritionPortionIntakeKey(input: {
  clientId: string
  deviceId: string
  localDate: string
  slotCode: string
  groupCode: string
  ordinal: number
  attempt: number
}): string {
  return buildNutritionIdempotencyKey({
    kind: 'intake',
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: nutritionPortionOperationId({
      localDate: input.localDate,
      slotCode: input.slotCode,
      groupCode: input.groupCode,
      ordinal: input.ordinal,
      attempt: input.attempt,
    }),
  })
}
