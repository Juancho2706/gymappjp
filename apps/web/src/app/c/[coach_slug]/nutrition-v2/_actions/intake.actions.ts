'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FoodCatalogSearchReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  type NutritionIntakeMutation,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch, rateLimitNutritionIntake } from '@/lib/rate-limit'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'

/**
 * Registro de consumo del alumno para el canary Nutrición V2.
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

  const supabase = (await createClient()) as unknown as RpcClient
  return { ok: true, supabase, userId: user.id }
}

function mapRpcError(error: { message: string; code?: string }): ActionFailure {
  // 42501 = scope denegado por el DEFINER; 22023 = validación de dominio del RPC.
  const code = error.code ?? 'RPC_ERROR'
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
