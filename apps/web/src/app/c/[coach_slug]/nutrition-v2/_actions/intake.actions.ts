'use server'

import { z } from 'zod'
import {
  FoodCatalogSearchReadModelSchema,
  NUTRITION_V2_PERMISSION_DENIED_CODE,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeVoidSchema,
  SubstitutionIntakeRequestSchema,
  SubstitutionOptionsReadModelSchema,
  buildNutritionIdempotencyKey,
  buildNutritionPortionIntakeKey,
  isNutritionV2PermissionDenied,
  type NutritionIntakeMutation,
  type SubstitutionOptionsItem,
} from '@eva/nutrition-v2'
import {
  evaluateCorrectPermission,
  evaluateRecordPermission,
  resolveStudentIntakePermissions,
  type StudentIntakePermissionDenial,
} from '@/services/nutrition-v2-student-permissions.service'
import {
  planSubstitutionIntake,
  type SubstitutionRpcClient,
} from '@/services/nutrition-v2/substitution-intake.service'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch, rateLimitNutritionIntake } from '@/lib/rate-limit'
import { COACH_ACCOUNT_PAUSED_CODE, STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForCoach } from '@/lib/student-access.server'
import {
  getCurrentStudentNutritionScope,
  getCurrentStudentNutritionSession,
} from '@/services/auth/current-student-nutrition.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'

/**
 * Registro de consumo del alumno para nutrición.
 *
 * Reglas duras respetadas:
 * - Toda escritura pasa por un RPC idempotente (record_/correct_/void_/ensure_),
 *   nunca por PATCH directo. La clave de idempotencia la genera el cliente y se
 *   propaga tal cual (reintento del MISMO gesto = no-op en el servidor).
 * - Fail-closed: cada acción re-verifica la sesión y que el workspace no sea Enterprise.
 * - El alumno solo puede escribir su propia fila: clientId debe ser auth.uid().
 * - Zod v4 valida toda entrada antes de tocar la base.
 */

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

/**
 * Estas mutaciones NO llaman `revalidatePath` — decision QA T2.7 F4, hallazgo H11 (2026-08-14).
 *
 * Una server action que revalida obliga al App Router a una NAVEGACION interna al aplicar la
 * respuesta (`server-action-reducer.js`: seed del flight + `navigateToKnownRoute` con
 * `FreshnessPolicy.RefreshAll`). En Next 16.3.0 ese apply quedaba colgado de forma reproducible
 * tras "marcar un alimento" en el Hoy del alumno (el estado del router jamas commiteaba: sin
 * re-render del RSC, y toda navegacion posterior muerta hasta recargar — el bug "marco un check
 * y los tabs no responden"). Ademas re-renderiza la pagina entera del alumno EN CADA check, un
 * costo que nadie consume: la UI reconcilia con `fetchNutritionTodayAction` + un cache por
 * pestaña (`today-cache.ts`) desde que las mutaciones tampoco llaman `router.refresh()` (H9).
 *
 * Sin revalidacion, el reducer del action sale por la via corta (sin navegacion interna, sin
 * seed que aplicar) y la accion abandona la cola del router en milisegundos. El costo es un
 * router cache del cliente stale tras mutar, que ya cubre `today-cache.ts`; una recarga o una
 * sesion nueva siempre leen la verdad del servidor.
 *
 * (La derivacion de ruta por headers `x-client-base-path`/`x-coach-slug` que vivia aca murio
 * con la revalidacion; ver historia NUT-006 en git si un dia vuelve.)
 */

const RecordActionInputSchema = z.object({
  payload: NutritionIntakeMutationSchema,
})

const CorrectActionInputSchema = z.object({
  payload: NutritionIntakeCorrectionSchema,
})

// T2.4: el cliente manda la INTENCION (que item, que reemplazo, que intento), nunca el alimento
// ni los macros. El servidor resuelve el resto desde la fila autorizada.
const SubstituteActionInputSchema = z.object({
  payload: SubstitutionIntakeRequestSchema,
})

/**
 * T2.5: lectura del bloque GRUPO de un item. Va aparte del fetch de la pagina a proposito — la
 * pagina del grupo solo viaja para el item que el sheet abrio, porque calcularla para los ~21
 * items del dia costaria una llamada cara en el arranque de Hoy.
 */
const SubstitutionGroupPageInputSchema = z.object({
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  prescriptionItemId: z.string().uuid(),
  query: z.string().trim().max(80).nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
})

// "Retirar" TIENE RPC propio desde NUT-010 (opcion A): `void_nutrition_intake_v2` marca la fila
// como `voided` sin insertar nada. El payload es MINIMO ({clientId, entryId, reason}) — ver el
// comentario del schema en packages/nutrition-v2/contracts.ts.
const VoidActionInputSchema = z.object({
  payload: NutritionIntakeVoidSchema,
})

// Bulk-mark de franja ("Comí toda esta comida"): un solo auth/rate-limit + N RPC server-side.
// Cap 24 = techo holgado de items por comida. Cada payload trae su propia idempotency key.
const BatchRecordInputSchema = z.object({
  payloads: z.array(NutritionIntakeMutationSchema).min(1).max(24),
})
const BatchVoidInputSchema = z.object({
  payloads: z.array(NutritionIntakeVoidSchema).min(1).max(24),
})

const CloseDayActionInputSchema = z.object({
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  timezone: z.string().trim().min(1).max(80).default('America/Santiago'),
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
/**
 * Resultado de una sustitucion: ademas del id, lo que la UI necesita para el copy honesto —
 * si termino siendo un registro nuevo o una correccion del vigente, la cantidad efectiva, y si
 * la cantidad que pidio el alumno se descarto porque el plan no la permitia.
 */
type SubstitutionSuccess = {
  ok: true
  id: string
  mode: 'record' | 'correct'
  quantity: number
  unit: string
  quantityOverridden: boolean
}
/** Resultado del bulk: ids creados/anulados + cuántos fallaron (estado parcial permitido). */
type BatchMutationResult = { ok: true; ids: string[]; failed: number } | ActionFailure

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
  const { user, hasClientRow } = await getCurrentStudentNutritionSession()
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

  const scope = await getCurrentStudentNutritionScope(user.id)
  if (scope.orgId) {
    return fail('WORKSPACE_NOT_ALLOWED', 'Esta experiencia aún no está disponible para Enterprise.')
  }

  const domainEnabled = await resolveNutritionDomainEnabled({
      coachId: scope.coachId ?? '',
      clientId: user.id,
      clientTeamId: scope.teamId,
      clientOrgId: scope.orgId,
    })
  if (!domainEnabled) {
    return fail('NUTRITION_DOMAIN_DISABLED', 'Tu coach no tiene activada la sección de nutrición por ahora.')
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
  // NUT-009 fase 2: el guard de permisos del plan dentro del RPC tambien viaja con 42501, pero NO
  // es un scope denegado. Codigo propio (no `SCOPE_DENIED`, ya sobrecargado) para que la UI diga la
  // verdad y para que la cola offline lo trate como TERMINAL en vez de reintentar 8 veces.
  if (isNutritionV2PermissionDenied(error.message)) {
    return fail(
      NUTRITION_V2_PERMISSION_DENIED_CODE,
      'Tu coach no permite este cambio en el plan de hoy.',
    )
  }
  if (code === '42501') {
    return fail('SCOPE_DENIED', 'No tienes permiso para modificar este registro.')
  }
  if (code === '22023') {
    return fail('INVALID_INTAKE', 'Los datos del registro no son válidos.')
  }
  return fail('WRITE_FAILED', 'No se pudo guardar tu registro. Intenta nuevamente.')
}

/**
 * Argumentos comunes de record_/correct_nutrition_intake_v2 (mismo contrato que el gateway móvil).
 *
 * `macrosBasis` (NUT-001) viaja DENTRO de `p_snapshot`, no como parámetro propio: el cuerpo nuevo
 * del RPC la extrae (`p_snapshot ->> 'macrosBasis'`) y el cuerpo viejo — el que corre en prod hasta
 * que se aplique la migración — simplemente ignora la llave extra. Así el web se puede desplegar
 * antes que el SQL sin romper nada, mismo transporte que ya usan `exchangeGroupCode/Portions`.
 */
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

/** Traduce una denegación del plan al shape de error de las actions. */
function denied(denial: StudentIntakePermissionDenial): ActionFailure {
  return fail(NUTRITION_V2_PERMISSION_DENIED_CODE, denial.error)
}

/**
 * Registra un alimento consumido (prescrito "lo comí" o alimento libre del catálogo).
 * input.payload.idempotencyKey viene del cliente y es la clave estable del gesto.
 *
 * NUT-009: antes de escribir se resuelven los permisos del día y se aplica `canRegisterFreely`
 * (registro libre) y `canMoveMealSlot` (mover un item del plan de franja). La barrera REAL sigue
 * siendo el RPC (`nutrition_v2_permission_denied`, 42501); esto es defensa en profundidad + un
 * error tipado con copy humano sin gastar la escritura.
 */
export async function recordIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = RecordActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de consumo inválidos.', zodFields(parsed.error))
  }
  const payload = parsed.data.payload

  const auth = await authorizeStudentWrite(payload.clientId)
  if (!auth.ok) return auth

  const permissions = await resolveStudentIntakePermissions(auth.supabase, {
    clientId: payload.clientId,
    localDate: payload.localDate,
    prescriptionItemId: payload.prescriptionItemId,
  })
  const denial = evaluateRecordPermission(permissions, payload)
  if (denial) return denied(denial)

  const result = await runMutation(auth.supabase, 'record_nutrition_intake_v2', commonRpcArgs(payload))
  return result
}

/**
 * Registrar un reemplazo AUTORIZADO por el coach (T2.4).
 *
 * Deliberadamente NO reusa `recordIntakeAction`: el contrato del cliente es distinto (manda la
 * intencion, no el payload) y la decision registro-vs-correccion la toma el servidor. Tampoco
 * evalua `canRegisterFreely`: sustituir por algo que el coach autorizo no es registro libre, y el
 * guard de la RPC ya deja pasar ese camino (`prescription_item_id` presente ⇒ la regla no aplica).
 *
 * La autorizacion real la impone SQL (`nutrition_v2_assert_substitution_authorized`); esta capa
 * resuelve el payload y devuelve un error con copy humano antes de intentar la escritura.
 */
export async function recordSubstitutionIntakeAction(
  input: unknown,
): Promise<SubstitutionSuccess | ActionFailure> {
  const parsed = SubstituteActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de sustitución inválidos.', zodFields(parsed.error))
  }
  const payload = parsed.data.payload

  const auth = await authorizeStudentWrite(payload.clientId)
  if (!auth.ok) return auth

  // Cast acotado: `RpcClient` es la forma MINIMA que usa el resto de este archivo, pero el cliente
  // real de `createClient()` es un supabase-js completo. El servicio necesita `.from` para ver las
  // entries RETIRADAS, que el read model del Today no devuelve.
  const plan = await planSubstitutionIntake(
    auth.supabase as unknown as SubstitutionRpcClient,
    payload,
  )
  if (!plan.ok) return fail(plan.code, plan.error)

  const result = await runMutation(auth.supabase, plan.rpcName, plan.args)
  if (!result.ok) return result
  return {
    ok: true,
    id: result.id,
    mode: plan.mode,
    quantity: plan.quantity,
    unit: plan.equivalence.unit,
    quantityOverridden: plan.quantityOverridden,
  }
}

/**
 * Pagina del bloque GRUPO para UN item (T2.5). La usa el sheet al abrirse, al buscar y al pedir
 * "ver mas". Es solo lectura y reusa el mismo scope que el resto: `authorizeStudentWrite` verifica
 * que el alumno sea quien dice ser, y la RPC vuelve a chequear con `nutrition_v2_can_read_client`.
 */
export async function loadSubstitutionGroupPageAction(
  input: unknown,
): Promise<
  | { ok: true; item: SubstitutionOptionsItem | null }
  | ActionFailure
> {
  const parsed = SubstitutionGroupPageInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos inválidos.', zodFields(parsed.error))
  }
  const { clientId, localDate, prescriptionItemId, query, limit } = parsed.data

  const auth = await authorizeStudentWrite(clientId)
  if (!auth.ok) return auth

  const result = await auth.supabase.rpc('get_nutrition_substitution_options_v2', {
    p_client_id: clientId,
    p_local_date: localDate,
    p_prescription_item_id: prescriptionItemId,
    p_group_query: query,
    p_group_limit: limit,
  })
  if (result.error) {
    return fail('SUBSTITUTION_OPTIONS_UNAVAILABLE', 'No pudimos leer tus equivalentes.')
  }
  const options = SubstitutionOptionsReadModelSchema.safeParse(result.data)
  if (!options.success) {
    return fail('SUBSTITUTION_OPTIONS_INVALID', 'No pudimos leer tus equivalentes.')
  }
  return {
    ok: true,
    item:
      options.data.items.find((entry) => entry.prescriptionItemId === prescriptionItemId) ?? null,
  }
}

/**
 * Corrige un registro existente (típicamente la cantidad): marca el original como
 * corrected y crea el reemplazo activo, conservando la cadena de corrección.
 *
 * NUT-009: sobre un registro ligado a un item PRESCRITO se exige `canAdjustPrescribedQuantity` y,
 * con tope `quantityAdjustmentPercent`, que la desviación contra lo prescrito no lo supere.
 */
export async function correctIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = CorrectActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de corrección inválidos.', zodFields(parsed.error))
  }
  const payload = parsed.data.payload

  const auth = await authorizeStudentWrite(payload.clientId)
  if (!auth.ok) return auth

  const permissions = await resolveStudentIntakePermissions(auth.supabase, {
    clientId: payload.clientId,
    localDate: payload.localDate,
    prescriptionItemId: payload.prescriptionItemId,
  })
  const denial = evaluateCorrectPermission(permissions, payload)
  if (denial) return denied(denial)

  const result = await runMutation(auth.supabase, 'correct_nutrition_intake_v2', {
    p_corrects_entry_id: payload.correctsEntryId,
    p_correction_reason: payload.correctionReason,
    ...commonRpcArgs(payload),
  })
  return result
}

/**
 * Retira un registro con motivo (NUT-010, opción A: estado TERMINAL).
 *
 * `void_nutrition_intake_v2` marca la fila como `voided` y NO inserta nada. Como todos los read
 * models filtran `entry_status = 'active'`, el registro retirado desaparece de "Consumido hoy", de
 * `consumedPrescriptionItemIds` (la fila del plan vuelve a mostrar "Lo comí"), de la cobertura de
 * porciones marcadas Y derivadas, y del `entryCount` que ve el coach — todo sin tocar una línea de
 * SQL de lectura. La trazabilidad la conserva la auditoría (`intake.voided` con el motivo), no una
 * entry fantasma.
 *
 * Es idempotente por ESTADO: retirar dos veces devuelve el mismo id (`already_voided`).
 */
export async function voidIntakeAction(input: unknown): Promise<MutationSuccess | ActionFailure> {
  const parsed = VoidActionInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de retiro inválidos.', zodFields(parsed.error))
  }
  const payload = parsed.data.payload

  const auth = await authorizeStudentWrite(payload.clientId)
  if (!auth.ok) return auth

  const result = await runMutation(auth.supabase, 'void_nutrition_intake_v2', {
    p_client_id: payload.clientId,
    p_entry_id: payload.entryId,
    p_reason: payload.reason,
    p_idempotency_key: payload.idempotencyKey,
  })
  return result
}

/**
 * Bulk-mark: registra en bloque los items prescritos de una franja ("Comí toda esta comida").
 * UN solo authorizeStudentWrite (1 cargo de rate-limit) y luego N RPC idempotentes server-side.
 * Estado parcial permitido (self-report): devuelve los ids creados + cuántos fallaron. Si NINGUNO
 * entró, propaga el error tipado real (rate-limit / scope / pausa del coach).
 */
export async function recordSlotIntakeBatchAction(input: unknown): Promise<BatchMutationResult> {
  const parsed = BatchRecordInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Datos de registro inválidos.', zodFields(parsed.error))
  const { payloads } = parsed.data

  const clientId = payloads[0].clientId
  if (payloads.some((p) => p.clientId !== clientId)) {
    return fail('CLIENT_SCOPE_MISMATCH', 'El registro no pertenece a tu cuenta.')
  }
  const auth = await authorizeStudentWrite(clientId)
  if (!auth.ok) return auth

  // Un solo viaje de permisos para toda la tanda. El bulk legítimo son items PRESCRITOS (no los
  // toca `canRegisterFreely`), pero el schema del batch acepta cualquier mutación: sin este guard,
  // el bulk sería la puerta trasera para registrar 24 alimentos libres con un plan restringido.
  const permissions = await resolveStudentIntakePermissions(auth.supabase, {
    clientId,
    localDate: payloads[0].localDate,
  })

  const ids: string[] = []
  let failed = 0
  let firstError: ActionFailure | null = null
  for (const payload of payloads) {
    const denial = evaluateRecordPermission(permissions, payload)
    if (denial) {
      failed += 1
      if (!firstError) firstError = denied(denial)
      continue
    }
    const res = await runMutation(auth.supabase, 'record_nutrition_intake_v2', commonRpcArgs(payload))
    if (res.ok) ids.push(res.id)
    else {
      failed += 1
      if (!firstError) firstError = res
    }
  }
  if (ids.length === 0) {
    return firstError ?? fail('BATCH_FAILED', 'No se pudo registrar la comida. Intenta nuevamente.')
  }
  return { ok: true, ids, failed }
}

/**
 * Deshacer un bulk-mark: retira en bloque los registros creados vía `void_nutrition_intake_v2`.
 * La idempotencia ya vive en el RPC (retirar dos veces devuelve el mismo id), así que aquí ya no
 * hace falta el parche por substring de mensaje que existía con el camino de corrección.
 */
export async function voidSlotIntakeBatchAction(input: unknown): Promise<BatchMutationResult> {
  const parsed = BatchVoidInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Datos de retiro inválidos.', zodFields(parsed.error))
  const { payloads } = parsed.data

  const clientId = payloads[0].clientId
  if (payloads.some((p) => p.clientId !== clientId)) {
    return fail('CLIENT_SCOPE_MISMATCH', 'El registro no pertenece a tu cuenta.')
  }
  const auth = await authorizeStudentWrite(clientId)
  if (!auth.ok) return auth

  const ids: string[] = []
  let failed = 0
  let firstError: ActionFailure | null = null
  for (const payload of payloads) {
    const res = await runMutation(auth.supabase, 'void_nutrition_intake_v2', {
      p_client_id: payload.clientId,
      p_entry_id: payload.entryId,
      p_reason: payload.reason,
      p_idempotency_key: payload.idempotencyKey,
    })
    if (res.ok) {
      ids.push(res.id)
      continue
    }
    failed += 1
    if (!firstError) firstError = res
  }
  if (ids.length === 0) {
    return firstError ?? fail('BATCH_FAILED', 'No se pudo deshacer. Intenta nuevamente.')
  }
  return { ok: true, ids, failed }
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
// - PERMISOS (NUT-009): marcar/deshacer porción queda EXENTO del guard de
//   `canRegisterFreely` A PROPÓSITO. La libertad de elegir DENTRO del grupo la otorga el
//   propio target de intercambios, independiente de `canRegisterFreely`/`canSubstitute`
//   (que siguen gobernando el registro libre y los swaps de items fijos) —
//   `docs/archive/specs/nutrition-portions/SPEC.md:118-124` (regla R1) y `PLAN.md:201-205`.
//   NO agregar aquí una llamada a `resolveStudentIntakePermissions`: no es deuda, es diseño.
//   El RPC tampoco lo bloquea: el guard de registro libre solo dispara con
//   `source = 'offplan'`, y el sintético manda `source = 'prescription'`.
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
 *
 * PENDIENTE (NUT-010, fase 2): este camino sigue en `correct_` y por lo tanto deja una entry
 * correctora activa (fantasma con 0 kcal en "Consumido hoy"). Migrarlo a
 * `void_nutrition_intake_v2` exige rehacer la reconciliación optimista de `usePortionMarks`
 * (que hoy empareja por el id de la correctora), así que se difirió a propósito fuera de esta ola.
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
