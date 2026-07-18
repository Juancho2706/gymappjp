'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FoodCatalogSearchReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  buildNutritionIdempotencyKey,
  buildNutritionPortionIntakeKey,
  type NutritionIntakeMutation,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch, rateLimitNutritionIntake } from '@/lib/rate-limit'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { COACH_ACCOUNT_PAUSED_CODE, STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForCoach } from '@/lib/student-access.server'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'

/**
 * Registro de consumo del alumno para nutrición.
 *
 * Reglas duras respetadas:
 * - Toda escritura pasa por un RPC idempotente (record_/correct_/void_/ensure_),
 *   nunca por PATCH directo. La clave de idempotencia la genera el cliente y se
 *   propaga tal cual (reintento del MISMO gesto = no-op en el servidor).
 * - Fail-closed: cada acción re-verifica el gate de rollout con el MISMO servicio
 *   que las pages (isNutritionV2Enabled, surface webStudent). Sin gate -> error.
 * - El alumno solo puede escribir su propia fila: clientId debe ser auth.uid().
 * - Zod v4 valida toda entrada antes de tocar la base.
 */

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

const RevalidatePathSchema = z.string().trim().startsWith('/c/').max(200)

const RecordActionInputSchema = z.object({
  payload: NutritionIntakeMutationSchema,
  revalidatePath: RevalidatePathSchema,
})

const CorrectActionInputSchema = z.object({
  payload: NutritionIntakeCorrectionSchema,
  revalidatePath: RevalidatePathSchema,
})

// "Retirar" no tiene RPC propio: es una correccion de contribucion CERO, asi que
// su entrada es el mismo contrato de correccion (macros en 0, construido por
// buildVoidPayload) -> paridad 1:1 con RN (buildVoidIntakeCorrection).
const VoidActionInputSchema = z.object({
  payload: NutritionIntakeCorrectionSchema,
  revalidatePath: RevalidatePathSchema,
})

const CloseDayActionInputSchema = z.object({
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  timezone: z.string().trim().min(1).max(80).default('America/Santiago'),
  revalidatePath: RevalidatePathSchema,
})

const SearchActionInputSchema = z.object({
  clientId: z.string().uuid(),
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: z
    .object({
      score: z.number().finite(),
      name: z.string(),
      id: z.string().uuid(),
    })
    .nullable()
    .default(null),
})

type ActionFailure = { ok: false; code: string; error: string; fields?: Array<{ path: string; message: string }> }
type MutationSuccess = { ok: true; id: string }

function fail(code: string, error: string, fields?: ActionFailure['fields']): ActionFailure {
  return { ok: false, code, error, ...(fields ? { fields } : {}) }
}

function zodFields(error: z.ZodError): ActionFailure['fields'] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

/**
 * Auth + gate compartidos. Devuelve el cliente Supabase autenticado del alumno
 * (RLS + RPC SECURITY DEFINER re-validan el scope contra auth.uid() de nuevo).
 */
async function authorizeStudentWrite(
  clientId: string,
  limiter: 'intake' | 'catalog-search' = 'intake',
): Promise<{ ok: true; supabase: RpcClient; userId: string } | ActionFailure> {
  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user || !hasClientRow) {
    return fail('UNAUTHENTICATED', 'Debes iniciar sesión para registrar tu consumo.')
  }
  if (user.id !== clientId) {
    return fail('CLIENT_SCOPE_MISMATCH', 'El registro no pertenece a tu cuenta.')
  }

  // Limite por alumno autenticado, antes de tocar la base (no hay IP en una server action).
  const limited =
    limiter === 'catalog-search'
      ? await rateLimitNutritionCatalogSearch(user.id)
      : await rateLimitNutritionIntake(user.id)
  if (!limited.ok) {
    return fail('RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.')
  }

  const scope = await getClientScope(user.id)
  const enabled = await isNutritionV2Enabled({
    surface: 'webStudent',
    userId: user.id,
    clientId: user.id,
    coachId: scope.coachId,
    teamId: scope.teamId,
    orgId: scope.orgId,
  })
  if (!enabled) {
    return fail('ROLLOUT_DISABLED', 'La nueva experiencia de nutrición no está habilitada para tu cuenta.')
  }

  const supabaseReal = await createClient()

  // Gate de suscripcion del coach: post-gracia (readonly) el alumno NO escribe intake. La busqueda de
  // catalogo (limiter 'catalog-search') es SOLO LECTURA → no se gatea (el alumno readonly igual navega).
  // Defense-in-depth: la RPC SECURITY DEFINER / RLS es la barrera real; aqui devolvemos error tipado.
  if (limiter !== 'catalog-search') {
    const access = await resolveStudentAccessForCoach(supabaseReal, scope.coachId)
    if (access.state === 'readonly') {
      return fail(COACH_ACCOUNT_PAUSED_CODE, STUDENT_ACCESS_COPY.pausedWriteError)
    }
  }

  const supabase = supabaseReal as unknown as RpcClient
  return { ok: true, supabase, userId: user.id }
}

function mapRpcError(error: { message: string; code?: string }): ActionFailure {
  // 42501 = scope denegado por el DEFINER; 22023 = validación de dominio del RPC.
  const code = error.code ?? 'RPC_ERROR'
  // Gate de suscripcion del coach en la RPC (SECURITY DEFINER, migracion 20260718120000): 'coach_account_paused'
  // tambien viaja con errcode 42501, pero es solo-lectura por coach en pausa, NO un scope denegado. Se
  // distingue por el mensaje para devolver el codigo tipado + copy honesto (defensa: la RPC gatea aunque
  // el guard de la action haya fail-open).
  if (error.message?.includes('coach_account_paused')) {
    return fail(COACH_ACCOUNT_PAUSED_CODE, STUDENT_ACCESS_COPY.pausedWriteError)
  }
  if (code === '42501') {
    return fail('SCOPE_DENIED', 'No tienes permiso para modificar este registro.')
  }
  if (code === '22023') {
    return fail('INVALID_INTAKE', 'Los datos del registro no son válidos.')
  }
  return fail('WRITE_FAILED', 'No se pudo guardar tu registro. Intenta nuevamente.')
}

/** Argumentos comunes de record_/correct_nutrition_intake_v2 (mismo contrato que el gateway móvil). */
function commonRpcArgs(payload: NutritionIntakeMutation): Record<string, unknown> {
  return {
    p_client_id: payload.clientId,
    p_local_date: payload.localDate,
    p_occurred_at: payload.occurredAt,
    p_timezone: payload.timezone,
    p_food_id: payload.foodId,
    p_custom_name: payload.customName,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_meal_slot: payload.mealSlot,
    p_source: payload.source,
    p_capture_method: payload.captureMethod,
    p_plan_version_id: payload.planVersionId,
    p_prescription_item_id: payload.prescriptionItemId,
    p_idempotency_key: payload.idempotencyKey,
    p_note: payload.note,
    p_snapshot: payload.snapshot,
  }
}

async function runMutation(
  supabase: RpcClient,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<MutationSuccess | ActionFailure> {
  const { data, error } = await supabase.rpc(rpcName, args)
  if (error) return mapRpcError(error)
  const id = z.string().uuid().safeParse(data)
  if (!id.success) {
    return fail('INVALID_RESPONSE', 'La base devolvió una respuesta inesperada.')
  }
  return { ok: true, id: id.data }
}

/**
 * Registra un alimento consumido (prescrito "lo comí" o alimento libre del catálogo).
 * input.payload.idempotencyKey viene del cliente y es la clave estable del gesto.
 */
export async function recordIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = RecordActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de consumo inválidos.', zodFields(parsed.error))
  }

  const auth = await authorizeStudentWrite(parsed.data.payload.clientId)
  if (!auth.ok) return auth

  const result = await runMutation(auth.supabase, 'record_nutrition_intake_v2', commonRpcArgs(parsed.data.payload))
  if (result.ok) revalidatePath(parsed.data.revalidatePath)
  return result
}

/**
 * Corrige un registro existente (típicamente la cantidad): marca el original como
 * corrected y crea el reemplazo activo, conservando la cadena de corrección.
 */
export async function correctIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = CorrectActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de corrección inválidos.', zodFields(parsed.error))
  }

  const auth = await authorizeStudentWrite(parsed.data.payload.clientId)
  if (!auth.ok) return auth

  const result = await runMutation(auth.supabase, 'correct_nutrition_intake_v2', {
    p_corrects_entry_id: parsed.data.payload.correctsEntryId,
    p_correction_reason: parsed.data.payload.correctionReason,
    ...commonRpcArgs(parsed.data.payload),
  })
  if (result.ok) revalidatePath(parsed.data.revalidatePath)
  return result
}

/**
 * Retira un registro con motivo. No existe un RPC de void dedicado: "retirar" es una
 * CORRECCION de contribución CERO (macros en 0), idéntico a RN (buildVoidIntakeCorrection).
 * Marca el original como corrected (fuera de totales) y crea un reemplazo activo sin aporte,
 * conservando la cadena de auditoría. El payload lo arma buildVoidPayload y trae su propia
 * idempotency key estable (prefijo 'void'); se ejecuta vía correct_nutrition_intake_v2 con la
 * MISMA semántica que la web usa para editar (corrects_entry_id + reason + args comunes).
 */
export async function voidIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = VoidActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de retiro inválidos.', zodFields(parsed.error))
  }

  const auth = await authorizeStudentWrite(parsed.data.payload.clientId)
  if (!auth.ok) return auth

  const result = await runMutation(auth.supabase, 'correct_nutrition_intake_v2', {
    p_corrects_entry_id: parsed.data.payload.correctsEntryId,
    p_correction_reason: parsed.data.payload.correctionReason,
    ...commonRpcArgs(parsed.data.payload),
  })
  if (result.ok) revalidatePath(parsed.data.revalidatePath)
  return result
}

/**
 * Cierra el día: asegura (congela) el snapshot inmutable del día. Idempotente -
 * si el snapshot ya existe (el read model de Hoy lo crea al leer) devuelve el mismo id.
 */
export async function closeDayAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = CloseDayActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos del cierre de día inválidos.', zodFields(parsed.error))
  }

  const auth = await authorizeStudentWrite(parsed.data.clientId)
  if (!auth.ok) return auth

  const result = await runMutation(auth.supabase, 'ensure_nutrition_day_snapshot_v2', {
    p_client_id: parsed.data.clientId,
    p_local_date: parsed.data.localDate,
    p_timezone: parsed.data.timezone,
  })
  if (result.ok) revalidatePath(parsed.data.revalidatePath)
  return result
}

/**
 * Búsqueda en el catálogo local (Chile) via search_food_catalog_v2. Solo lectura;
 * respeta el gate y devuelve el read model validado con Zod.
 */
export async function searchFoodCatalogAction(
  input: unknown,
): Promise<{ ok: true; result: z.infer<typeof FoodCatalogSearchReadModelSchema> } | ActionFailure> {
  const parsed = SearchActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Búsqueda inválida.', zodFields(parsed.error))
  }

  const auth = await authorizeStudentWrite(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  const { data, error } = await auth.supabase.rpc('search_food_catalog_v2', {
    p_query: parsed.data.query,
    p_country_code: parsed.data.countryCode.toUpperCase(),
    p_cursor_score: parsed.data.cursor?.score ?? null,
    p_cursor_name: parsed.data.cursor?.name ?? null,
    p_cursor_id: parsed.data.cursor?.id ?? null,
    p_page_size: 25,
  })
  if (error) return mapRpcError(error)

  const result = FoodCatalogSearchReadModelSchema.safeParse(data)
  if (!result.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catálogo devolvió un formato inesperado.')
  }
  return { ok: true, result: result.data }
}

// ── Marcar / deshacer porción (SPEC R4 + criterio 4) ─────────────────────────
//
// El marcar-porción es un intake SINTÉTICO: un tap del alumno registra las
// ref-macros congeladas del grupo (× porciones marcadas) por el MISMO RPC canónico
// (`record_nutrition_intake_v2`). El deshacer anula por el MISMO camino void
// (`correct_nutrition_intake_v2`), NUNCA delete. Precisiones obligatorias:
// - Idempotency key SIEMPRE por el helper canónico `buildNutritionPortionIntakeKey`
//   (ordinal + attempt), de modo que re-marcar tras deshacer nunca colisiona con el
//   intake anulado (hallazgos M2/B2).
// - Transporte B1: `exchangeGroupCode`/`exchangePortions` viajan DENTRO de
//   `p_snapshot` (el cuerpo nuevo del RPC los extrae a columnas; el viejo los ignora).
//   Por eso NO se re-valida el snapshot con `NutritionIntakeMutationSchema` (que
//   descartaría esas 2 llaves extra); la entrada real se valida con su propio schema.
// - Modelo de confianza S2: self-report; sin validación server extra en F1. La
//   cobertura es AUTO-DECLARADA (self-scope). No se revalida ref contra el snapshot
//   vigente del target (hardening F2).
// - No se llama `revalidatePath` aquí: no está en el contrato de entrada y la UI del
//   alumno mantiene un delta optimista de `marcadas` reconciliado por idempotency key
//   contra el próximo read-model (SPEC UX-c, hallazgo F1-front).

export type MarkPortionInput = {
  clientId: string
  localDate: string
  timezone?: string
  slotCode: string
  groupCode: string
  groupName: string
  portions: 0.5 | 1
  ordinal: number
  attempt: number
  deviceId: string
  ref: { calories: number; proteinG: number; carbsG: number; fatsG: number }
}

export type UndoPortionInput = { clientId: string; entryId: string }

type PortionMarkSuccess = { ok: true; data: { entryId: string } }
type PortionUndoSuccess = { ok: true; data: { correctionEntryId: string } }

const PortionRefSchema = z.object({
  calories: z.number().finite(),
  proteinG: z.number().finite(),
  carbsG: z.number().finite(),
  fatsG: z.number().finite(),
})

const MarkPortionInputSchema = z.object({
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  timezone: z.string().trim().min(1).max(80).default('America/Santiago'),
  slotCode: z.string().trim().min(1).max(64),
  groupCode: z.string().trim().min(1).max(64),
  groupName: z.string().trim().min(1).max(180),
  portions: z.union([z.literal(0.5), z.literal(1)]),
  ordinal: z.number().int().nonnegative(),
  attempt: z.number().int().min(1),
  deviceId: z.string().trim().min(1).max(200),
  ref: PortionRefSchema,
})

const UndoPortionInputSchema = z.object({
  clientId: z.string().uuid(),
  entryId: z.string().uuid(),
})

/**
 * Marca una porción cumplida (tap del alumno). Registra un intake sintético con
 * `source='prescription'`, `custom_name` = nombre del grupo, `meal_slot` = franja,
 * macros del snapshot = ref del grupo POR PORCIÓN (SIN multiplicar), y
 * `exchangeGroupCode`/`exchangePortions` transportados dentro de `p_snapshot`.
 * El escalado a porciones lo hace el SERVIDOR: `private.nutrition_v2_entry_factor`
 * (migración 20260714210000) para unidad no-g/ml devuelve `quantity` tal cual, y los
 * totales del read-model son `snapshot_macros × factor`. Con `p_quantity = portions`
 * y `p_unit = 'porción'` el total queda `ref × portions` EXACTO (0,5 aporta ref×0,5).
 * Multiplicar el snapshot aquí duplicaría la escala (ref × portions²). Paridad 1:1 con
 * RN (apps/mobile/lib/nutrition-v2-portions.ts, canon T2.3).
 * La idempotency key la emite el helper canónico con (ordinal, attempt).
 */
export async function markPortionIntakeAction(
  input: MarkPortionInput,
): Promise<PortionMarkSuccess | ActionFailure> {
  const parsed = MarkPortionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de la porción inválidos.', zodFields(parsed.error))
  }
  const data = parsed.data

  const auth = await authorizeStudentWrite(data.clientId)
  if (!auth.ok) return auth

  const key = buildNutritionPortionIntakeKey({
    clientId: data.clientId,
    deviceId: data.deviceId,
    localDate: data.localDate,
    slotCode: data.slotCode,
    groupCode: data.groupCode,
    ordinal: data.ordinal,
    attempt: data.attempt,
  })

  const portions = data.portions
  const snapshot = {
    name: data.groupName,
    brand: null,
    // Macros = ref del grupo POR PORCIÓN, SIN multiplicar. El servidor escala por
    // `p_quantity` vía `private.nutrition_v2_entry_factor` (totales = snapshot × factor,
    // factor = quantity para unidad 'porción'). Multiplicar aquí duplicaría la escala.
    calories: data.ref.calories,
    proteinG: data.ref.proteinG,
    carbsG: data.ref.carbsG,
    fatsG: data.ref.fatsG,
    fiberG: null,
    servingSize: null,
    servingUnit: null,
    // Transporte B1: el cuerpo nuevo del RPC extrae estas 2 llaves a columnas; el
    // cuerpo viejo (prod sin la migración) simplemente las ignora.
    exchangeGroupCode: data.groupCode,
    exchangePortions: portions,
  }

  const { data: rpcData, error } = await auth.supabase.rpc('record_nutrition_intake_v2', {
    p_client_id: data.clientId,
    p_local_date: data.localDate,
    p_occurred_at: new Date().toISOString(),
    p_timezone: data.timezone,
    p_food_id: null,
    p_custom_name: data.groupName,
    p_quantity: portions,
    p_unit: 'porción',
    p_meal_slot: data.slotCode,
    p_source: 'prescription',
    p_capture_method: 'prescription',
    p_plan_version_id: null,
    p_prescription_item_id: null,
    p_idempotency_key: key,
    p_note: null,
    p_snapshot: snapshot,
  })
  if (error) return mapRpcError(error)

  const entryId = z.string().uuid().safeParse(rpcData)
  if (!entryId.success) {
    return fail('INVALID_RESPONSE', 'La base devolvió una respuesta inesperada.')
  }
  return { ok: true, data: { entryId: entryId.data } }
}

/**
 * Deshace una porción marcada. Anula por el MISMO camino void que `voidIntakeAction`:
 * una CORRECCIÓN de contribución CERO vía `correct_nutrition_intake_v2` (nunca delete).
 * El RPC además fuerza `exchange_portions = null` en la correctora (belt B3), así que
 * el contador de porciones Y los macros revierten. La correctora no aporta cobertura
 * ni macros; su fecha/franja son inmateriales (se usa la fecha actual).
 */
export async function undoPortionIntakeAction(
  input: UndoPortionInput,
): Promise<PortionUndoSuccess | ActionFailure> {
  const parsed = UndoPortionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos para deshacer la porción inválidos.', zodFields(parsed.error))
  }
  const data = parsed.data

  const auth = await authorizeStudentWrite(data.clientId)
  if (!auth.ok) return auth

  // Key estable por entry anulada: re-deshacer la misma entry es idempotente (y el RPC
  // corta con 'only_active_entries_can_correct' si ya fue corregida).
  const key = buildNutritionIdempotencyKey({
    kind: 'correction',
    clientId: data.clientId,
    deviceId: 'portion-undo',
    operationId: `void-${data.entryId}`,
  })
  const nowIso = new Date().toISOString()

  const { data: rpcData, error } = await auth.supabase.rpc('correct_nutrition_intake_v2', {
    p_corrects_entry_id: data.entryId,
    p_correction_reason: 'Porción deshecha',
    p_client_id: data.clientId,
    p_local_date: nowIso.slice(0, 10),
    p_occurred_at: nowIso,
    p_timezone: 'America/Santiago',
    p_food_id: null,
    p_custom_name: 'Porción deshecha',
    p_quantity: 1,
    p_unit: 'porción',
    p_meal_slot: null,
    p_source: 'manual',
    p_capture_method: 'manual',
    p_plan_version_id: null,
    p_prescription_item_id: null,
    p_idempotency_key: key,
    p_note: null,
    p_snapshot: {
      name: 'Porción deshecha',
      brand: null,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatsG: 0,
      fiberG: 0,
      servingSize: null,
      servingUnit: null,
    },
  })
  if (error) return mapRpcError(error)

  const correctionEntryId = z.string().uuid().safeParse(rpcData)
  if (!correctionEntryId.success) {
    return fail('INVALID_RESPONSE', 'La base devolvió una respuesta inesperada.')
  }
  return { ok: true, data: { correctionEntryId: correctionEntryId.data } }
}
