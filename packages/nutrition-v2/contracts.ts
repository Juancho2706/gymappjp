import { z } from 'zod'
import { normalizeIntakeUnit } from './intake-units'

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

/** Base declarada de los macros congelados en un registro (NUT-001). */
export const NutritionMacrosBasisSchema = z.enum(['per_100', 'per_serving'])

/**
 * Unidad de una ESCRITURA NUEVA de intake (NUT-017). Acepta los sinonimos historicos
 * ('unidad', 'gr', 'porcion', …) para no romper superficies aun no migradas, pero rechaza
 * cualquier cosa fuera del vocabulario del factor: sin esto, el `z.string().max(32)` anterior
 * dejaba pasar "100 unidad" y persistia `100 x macros` (x100 silencioso, sin tope server-side).
 *
 * NO transforma: el tipo de salida sigue siendo `string` para no romper los constructores
 * literales de payload de web/RN. La normalizacion a codigo canonico la hace la UI con
 * `normalizeIntakeUnit`.
 */
export const NutritionIntakeUnitSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine((value) => normalizeIntakeUnit(value) !== null, {
    message: 'Unidad no soportada. Usa gramos (g), mililitros (ml), unidad o porción.',
  })

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

/**
 * Reemplazo autorizado por el coach para un item prescrito (F-02). Alimento del catálogo
 * (foodId), receta (recipeId, forward-compat) o nombre libre (customName). `quantity`/`unit`
 * null = "misma porción que el prescrito". Los `snapshot_*` se congelan server-side al persistir
 * el draft (macros congeladas, decisión CEO), NO viven en este contrato de entrada. Solo aplica a
 * structured/hybrid (flexible no tiene items) — el gate es natural + de UI.
 */
export const NutritionItemSubstitutionSchema = z
  .object({
    id: z.string().uuid().optional(),
    foodId: z.string().uuid().nullable().default(null),
    recipeId: z.string().uuid().nullable().default(null),
    customName: z.string().trim().min(1).max(180).nullable().default(null),
    quantity: z.number().positive().nullable().default(null),
    unit: z.string().trim().min(1).max(32).nullable().default(null),
    orderIndex: z.number().int().nonnegative().default(0),
  })
  .superRefine((value, ctx) => {
    if (!value.foodId && !value.recipeId && !value.customName) {
      ctx.addIssue({
        code: 'custom',
        path: ['foodId'],
        message: 'Cada reemplazo necesita un alimento o un nombre.',
      })
    }
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
    // Reemplazos autorizados por el coach (F-02). Capa OPCIONAL (espeja exchangeTargets): un item
    // sin reemplazos queda idéntico a hoy (ausente). Máx 8 por item (límite legado V1). Downstream
    // resuelve con `?? []`.
    substitutions: z.array(NutritionItemSubstitutionSchema).max(8).optional(),
    notes: z.string().trim().max(1000).nullable().default(null),
    orderIndex: z.number().int().nonnegative().default(0),
    /**
     * Medida casera del item (W2 «Cantidades honestas»). Se CONGELA desde el alimento al publicar,
     * igual que los macros: el drift del catalogo no mueve un plan ya escrito. `unit` sigue
     * permisiva a proposito — `casera` es valida SOLO en el borrador y `buildItemInsertRow` la
     * traduce a g/ml antes del insert; el CHECK `unit <> 'casera'` de la tabla es el cierre real.
     * El rango [1, 1000] espeja los CHECK de `foods`, `coach_food_overrides` y del propio item.
     */
    householdLabel: z.string().trim().max(40).nullable().default(null),
    householdGrams: z.number().positive().max(1000).nullable().default(null),
    /**
     * LINAJE del item (W3.1 «Cantidades honestas», SPEC §6.1): id del item de una version
     * ANTERIOR del MISMO plan del que este es copia sin cambios. Lo emite el editor
     * (`projectItem`) y `buildItemInsertRow` lo baja a `source_item_id`; la lectura resuelve con
     * el los registros de hoy al item vigente, asi que republicar sin tocar un item no borra su
     * «Registrado».
     *
     * Opcional con default `null` para que un cliente viejo (build RN anterior a W3, respaldo
     * local pre-deploy) siga publicando igual. El servidor lo REVALIDA (mismo plan, ≠ id) y lo
     * baja a NULL sin fallar: el linaje es una ayuda, no un requisito.
     */
    sourceItemId: z.string().uuid().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    // El par es INDIVISIBLE (mismo CHECK que la tabla): media medida casera no rotula nada y
    // dejaria un item que dice «huevo» sin saber cuanto pesa.
    if ((value.householdLabel === null) !== (value.householdGrams === null)) {
      ctx.addIssue({
        code: 'custom',
        path: [value.householdLabel === null ? 'householdLabel' : 'householdGrams'],
        message: 'La medida casera necesita etiqueta y gramos juntos.',
      })
    }
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
  // z.guid(), NO z.uuid(): los grupos system del seed V1 llevan ids deterministas
  // no-RFC (0000e8c0-...) que z.uuid() de Zod 4 rechaza — bloqueaba publicar
  // porciones desde el builder y el parse del read-model (incidente 2026-07-18).
  exchangeGroupId: z.guid(),
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
    unit: NutritionIntakeUnitSchema,
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
      // Base declarada de los macros (NUT-001, transporte doble con p_snapshot_macros_basis).
      // `.optional()` SIN default: un payload que no la declara conserva la formula LEGADA en el
      // servidor (`snapshot_macros_basis` queda NULL). Un re-parse (route mobile / cola offline)
      // nunca debe inventarla ni stripearla — ausente queda ausente.
      macrosBasis: NutritionMacrosBasisSchema.optional(),
      // Porciones (SPEC R4, transporte B1): viajan DENTRO del snapshot hasta el RPC,
      // que las extrae a columnas. `.optional()` (sin default): un re-parse del
      // mutation (route mobile / cola offline) NUNCA debe stripearlas ni inventarlas
      // — ausentes quedan ausentes y un intake normal no gana llaves nuevas.
      exchangeGroupCode: z.string().trim().min(1).max(32).optional(),
      exchangePortions: z
        .number()
        .positive()
        .max(99)
        .refine((v) => v * 2 === Math.floor(v * 2), 'exchangePortions debe ir en pasos de 0,5')
        .optional(),
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

/**
 * Correccion / retiro de un registro EXISTENTE.
 *
 * `unit` vuelve a ser permisiva a proposito (whitelist SOLO en escrituras nuevas, riesgo (b) de
 * la verificacion G1): una correccion copia la unidad de la fila original, y hay filas historicas
 * con unidades libres. Validarla aqui dejaria al alumno sin poder editar ni RETIRAR esos
 * registros — un fix que crea un lockout peor que el bug que cierra.
 *
 * `safeExtend` (no `extend`): Zod 4 prohibe SOBRESCRIBIR llaves con `.extend()` sobre un schema
 * con refinements ("Cannot overwrite keys on object schemas containing refinements"). El
 * superRefine de la base (alimento o nombre obligatorio) se conserva igual.
 */
export const NutritionIntakeCorrectionSchema = NutritionIntakeMutationSchema.safeExtend({
  unit: z.string().trim().min(1).max(32),
  correctsEntryId: z.string().uuid(),
  correctionReason: z.string().trim().min(3).max(1000),
})

/**
 * "Retirar" un registro (NUT-010, opcion A: estado TERMINAL `voided`).
 *
 * Antes el retiro se modelaba como una CORRECCION de contribucion cero: el original quedaba
 * `corrected` y nacia un reemplazo ACTIVO con macros en 0 que heredaba `prescription_item_id`.
 * Ese reemplazo seguia contando como "consumido" para el bulk-mark, mantenia la cobertura de
 * porciones DERIVADA, inflaba `entryCount` y ademas era el mismo retirable — una cadena de
 * fantasmas sin estado terminal. Ahora hay un RPC dedicado (`void_nutrition_intake_v2`) que
 * marca la fila `voided` SIN insertar nada: los read models ya filtran `entry_status = 'active'`,
 * asi que desaparece de consumido, de las derivadas y del conteo de una sola vez.
 *
 * Por eso el payload es MINIMO: el servidor no necesita el snapshot ni la cantidad para retirar.
 * `idempotencyKey` es opcional (solo alimenta la auditoria); el retiro es idempotente por estado
 * (`already_voided` devuelve el mismo id).
 */
export const NutritionIntakeVoidSchema = z.object({
  clientId: z.string().uuid(),
  entryId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: z.string().trim().min(8).max(200).nullable().default(null),
})

/**
 * Mensaje canonico que levanta el guard de permisos del alumno dentro de
 * `record_/correct_/void_nutrition_intake_v2` (errcode 42501). El sufijo `:<regla>` identifica
 * cual permiso nego la escritura. Se compara por PREFIJO para no acoplarse al sufijo.
 *
 * NO se mapea a `SCOPE_DENIED`: ese codigo ya esta sobrecargado con `coach_account_paused` y con
 * el scope real (fila de otro alumno). Un permiso del plan denegado NO es un fallo de scope y NO
 * es reintentable: la cola offline debe descartarlo, no gastar 8 intentos.
 */
export const NUTRITION_V2_PERMISSION_DENIED = 'nutrition_v2_permission_denied'

/** Reglas del plan que pueden negar una escritura del alumno (sufijo del mensaje del RPC). */
export const NUTRITION_V2_PERMISSION_RULES = [
  'free_registration',
  'quantity_adjustment',
  'quantity_adjustment_range',
  'meal_slot_move',
] as const

export type NutritionV2PermissionRule = (typeof NUTRITION_V2_PERMISSION_RULES)[number]

/** Codigo tipado que devuelven las server actions y la API movil cuando el plan niega el gesto. */
export const NUTRITION_V2_PERMISSION_DENIED_CODE = 'PLAN_PERMISSION_DENIED'

/** True si el error del RPC es un permiso del plan denegado (no un scope ni una pausa del coach). */
export function isNutritionV2PermissionDenied(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.includes(NUTRITION_V2_PERMISSION_DENIED)
}

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
export type NutritionItemSubstitution = z.infer<typeof NutritionItemSubstitutionSchema>
export type NutritionStrategy = z.infer<typeof NutritionStrategySchema>
export type NutritionPlanStatus = z.infer<typeof NutritionPlanStatusSchema>
export type NutritionEntryStatus = z.infer<typeof NutritionEntryStatusSchema>
export type NutritionMacroTargets = z.infer<typeof NutritionMacroTargetsSchema>
export type NutritionStudentPermissions = z.infer<typeof NutritionStudentPermissionsSchema>
export type NutritionPlanDraft = z.infer<typeof NutritionPlanDraftSchema>
export type NutritionIntakeMutation = z.infer<typeof NutritionIntakeMutationSchema>
export type NutritionIntakeCorrection = z.infer<typeof NutritionIntakeCorrectionSchema>
export type NutritionIntakeVoid = z.infer<typeof NutritionIntakeVoidSchema>
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
