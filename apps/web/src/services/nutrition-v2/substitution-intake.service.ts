import {
  NutritionTodayReadModelSchema,
  SubstitutionOptionsReadModelSchema,
  computeSubstitutionEquivalence,
  substituteFromOption,
  substitutionIntakeIdempotencyKey,
  type SubstitutionEquivalence,
  type SubstitutionIntakeRequest,
} from '@eva/nutrition-v2'
import { resolveStudentIntakePermissions } from '@/services/nutrition-v2-student-permissions.service'

/**
 * Resolucion server-side del gesto "sustituir por un reemplazo autorizado" (T2.4).
 *
 * Existe como servicio y no dentro de la server action porque la asimetria entre la web y el
 * gateway movil fue justamente lo que dejo los permisos del alumno sin efecto en NUT-009. Las dos
 * superficies llaman a ESTE modulo; ninguna arma el payload por su cuenta.
 *
 * Regla dura: el cliente manda `{ prescriptionItemId, substitutionId, attempt, quantity? }` y nada
 * mas. El alimento, sus macros, la franja y la version del plan los resuelve el servidor desde la
 * fila autorizada. Si el cliente pudiera elegir el alimento, la validacion no significaria nada
 * (y el guard SQL de `record_nutrition_intake_v2` lo rechazaria igual, con un error feo).
 */

export type SubstitutionRpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  /**
   * Lectura acotada de las entries del dia (RLS del propio alumno). Hace falta porque el read
   * model del Today NO devuelve las retiradas, y sin verlas la clave de idempotencia se repite
   * despues de un "deshacer" (ver `resolveAttempt`).
   */
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => Promise<{
            data: Array<{ idempotency_key: string | null; entry_status: string }> | null
            error: { message: string; code?: string } | null
          }>
        }
      }
    }
  }
}

export type SubstitutionIntakeFailure = { ok: false; code: string; error: string }

export type SubstitutionIntakePlan = {
  ok: true
  /** `correct` cuando ya hay un registro activo de ese item hoy (decision de producto D3). */
  mode: 'record' | 'correct'
  rpcName: 'record_nutrition_intake_v2' | 'correct_nutrition_intake_v2'
  args: Record<string, unknown>
  equivalence: SubstitutionEquivalence
  /** Cantidad efectiva (la del alumno si se honro, si no la calculada). */
  quantity: number
  /** `true` cuando el alumno mando una cantidad y el plan no permitia usarla. */
  quantityOverridden: boolean
}

/** Razon automatica de la correccion: el alumno no tiene que justificar un cambio autorizado. */
export const SUBSTITUTION_CORRECTION_REASON = 'Sustitui el alimento por un reemplazo autorizado'

function fail(code: string, error: string): SubstitutionIntakeFailure {
  return { ok: false, code, error }
}

/**
 * Decide si la cantidad que mando el alumno se puede usar. El tope en % se mide contra la
 * cantidad EQUIVALENTE, no contra la prescrita: comparar 130 g de leche con "1 un" de yogurt no
 * significa nada (es el mismo error que bloqueaba la correccion antes del fix de F2).
 */
function resolveQuantity(
  requested: number | null,
  computed: number,
  permissions: { canAdjustPrescribedQuantity: boolean; quantityAdjustmentPercent: number | null },
): { quantity: number; overridden: boolean } {
  if (requested === null || !Number.isFinite(requested) || requested <= 0) {
    return { quantity: computed, overridden: false }
  }
  // Pedir EXACTAMENTE la cantidad calculada no es "ajustar": es confirmar. Sin esto, el diálogo de
  // los casos degradados —que siempre manda un número, aunque el alumno no lo toque— avisaba "tu
  // coach fijó la cantidad" cuando el alumno se limitó a apretar Registrar (QA 2026-08-09).
  if (requested === computed) {
    return { quantity: computed, overridden: false }
  }
  if (!permissions.canAdjustPrescribedQuantity) {
    return { quantity: computed, overridden: true }
  }
  const percent = permissions.quantityAdjustmentPercent
  if (percent !== null && computed > 0) {
    const delta = Math.abs(requested - computed) / computed
    if (delta > percent / 100 + 1e-9) return { quantity: computed, overridden: true }
  }
  return { quantity: requested, overridden: false }
}

/** Tope de reintentos al esquivar claves quemadas. Un item con 12 retiros en un dia no existe. */
const MAX_ATTEMPT_PROBE = 12

/**
 * Resuelve el `attempt` REAL de la clave de idempotencia.
 *
 * El cliente manda un hint derivado del read model del Today, y eso es lo que hace idempotente al
 * reintento de la cola offline: el mismo gesto reenviado produce la misma clave. Pero el Today
 * **no devuelve las entries retiradas** (verificado en LIVE), asi que despues de un "deshacer" el
 * hint vuelve a 0 y la clave se repite. Como el short-circuit de `record_nutrition_intake_v2` no
 * mira `entry_status`, el servidor devolvia el id de la entry RETIRADA sin escribir nada y el item
 * quedaba inconsumible el resto del dia (QA 2026-08-10).
 *
 * Regla: partir del hint y saltar SOLO las claves cuya entry esta `voided`. Una clave cuya entry
 * sigue activa o corregida se conserva — ahi el short-circuit es lo correcto, es un reintento.
 */
async function resolveAttempt(
  supabase: SubstitutionRpcClient,
  request: SubstitutionIntakeRequest,
): Promise<number> {
  const { data, error } = await supabase
    .from('nutrition_intake_entries')
    .select('idempotency_key, entry_status')
    .eq('client_id', request.clientId)
    .eq('log_date', request.localDate)
    .eq('prescription_item_id', request.prescriptionItemId)

  if (error || !data) return request.attempt

  const voidedKeys = new Set(
    data
      .filter((row) => row.entry_status === 'voided' && row.idempotency_key !== null)
      .map((row) => row.idempotency_key as string),
  )
  if (voidedKeys.size === 0) return request.attempt

  let attempt = request.attempt
  for (let probe = 0; probe < MAX_ATTEMPT_PROBE; probe += 1) {
    const key = substitutionIntakeIdempotencyKey({
      localDate: request.localDate,
      prescriptionItemId: request.prescriptionItemId,
      substitutionId: request.substitutionId,
      attempt,
    })
    if (!voidedKeys.has(key)) return attempt
    attempt += 1
  }
  return attempt
}

export async function planSubstitutionIntake(
  supabase: SubstitutionRpcClient,
  request: SubstitutionIntakeRequest,
): Promise<SubstitutionIntakePlan | SubstitutionIntakeFailure> {
  // 1) Opciones autorizadas del dia, con los macros VIGENTES del sustituto (override del coach
  //    incluido). La version que devuelve es la del snapshot del dia, o sea la que el alumno esta
  //    viendo — no la ultima publicada.
  const optionsResult = await supabase.rpc('get_nutrition_substitution_options_v2', {
    p_client_id: request.clientId,
    p_local_date: request.localDate,
  })
  if (optionsResult.error) {
    return fail('SUBSTITUTION_OPTIONS_UNAVAILABLE', 'No pudimos leer tus reemplazos autorizados.')
  }
  const options = SubstitutionOptionsReadModelSchema.safeParse(optionsResult.data)
  if (!options.success) {
    return fail('SUBSTITUTION_OPTIONS_INVALID', 'No pudimos leer tus reemplazos autorizados.')
  }

  const itemEntry = options.data.items.find(
    (entry) => entry.prescriptionItemId === request.prescriptionItemId,
  )
  const option = itemEntry?.options.find((row) => row.substitutionId === request.substitutionId)
  if (!itemEntry || !option) {
    // Cubre las dos formas del mismo problema: el item no tiene reemplazos hoy, o el reemplazo
    // que el cliente cacheo ya no esta autorizado (el coach republico el plan).
    return fail(
      'SUBSTITUTION_NOT_AUTHORIZED',
      'Ese reemplazo ya no esta disponible. Actualiza la pantalla e intenta de nuevo.',
    )
  }

  // 2) Cantidad y macros: una sola formula, la misma que pinta la UI.
  const equivalence = computeSubstitutionEquivalence({
    item: {
      quantity: itemEntry.item.quantity,
      unit: itemEntry.item.unit,
      calories: itemEntry.item.calories,
    },
    substitute: substituteFromOption(option),
  })

  const { permissions } = await resolveStudentIntakePermissions(supabase, {
    clientId: request.clientId,
    localDate: request.localDate,
    prescriptionItemId: request.prescriptionItemId,
  })
  const resolved = resolveQuantity(request.quantity, equivalence.quantity, permissions)

  // 3) Registro nuevo o correccion del vigente (D3). Se relee del servidor en vez de confiar en
  //    lo que el cliente tenia en pantalla: entre el render y el tap pudo entrar otro registro.
  const todayResult = await supabase.rpc('get_nutrition_today_v2', {
    p_client_id: request.clientId,
    p_local_date: request.localDate,
    p_timezone: request.timezone,
  })
  if (todayResult.error) {
    return fail('SUBSTITUTION_TODAY_UNAVAILABLE', 'No pudimos leer tu dia. Intenta de nuevo.')
  }
  const today = NutritionTodayReadModelSchema.safeParse(todayResult.data)
  if (!today.success) {
    return fail('SUBSTITUTION_TODAY_INVALID', 'No pudimos leer tu dia. Intenta de nuevo.')
  }

  const activeEntry = [
    ...today.data.mealSlots.flatMap((slot) => slot.intakeItems),
    ...today.data.unassignedIntake,
  ].find(
    (entry) =>
      entry.prescriptionItemId === request.prescriptionItemId && entry.status === 'active',
  )

  const idempotencyKey = substitutionIntakeIdempotencyKey({
    localDate: request.localDate,
    prescriptionItemId: request.prescriptionItemId,
    substitutionId: request.substitutionId,
    attempt: await resolveAttempt(supabase, request),
  })

  const common: Record<string, unknown> = {
    p_client_id: request.clientId,
    p_local_date: request.localDate,
    p_occurred_at: request.occurredAt,
    p_timezone: request.timezone,
    p_food_id: option.foodId,
    p_custom_name: option.foodId ? null : (option.customName ?? equivalence.snapshot.name),
    p_quantity: resolved.quantity,
    p_unit: equivalence.unit,
    p_meal_slot: itemEntry.mealSlotCode,
    // La etiqueta que el guard SQL de F2 hace verificable.
    p_source: 'substitution',
    // El gesto nace de la fila prescrita, no de una busqueda.
    p_capture_method: 'prescription',
    p_plan_version_id: options.data.versionId,
    p_prescription_item_id: request.prescriptionItemId,
    p_idempotency_key: idempotencyKey,
    p_note: null,
    p_snapshot: equivalence.snapshot,
  }

  if (activeEntry) {
    return {
      ok: true,
      mode: 'correct',
      rpcName: 'correct_nutrition_intake_v2',
      args: {
        p_corrects_entry_id: activeEntry.id,
        p_correction_reason: SUBSTITUTION_CORRECTION_REASON,
        ...common,
      },
      equivalence,
      quantity: resolved.quantity,
      quantityOverridden: resolved.overridden,
    }
  }

  return {
    ok: true,
    mode: 'record',
    rpcName: 'record_nutrition_intake_v2',
    // `record_` acepta la base de macros como parametro propio ademas de dentro del snapshot
    // (transporte doble de NUT-001); `correct_` no la tiene en su firma y la lee del snapshot.
    args: { ...common, p_snapshot_macros_basis: equivalence.snapshot.macrosBasis ?? null },
    equivalence,
    quantity: resolved.quantity,
    quantityOverridden: resolved.overridden,
  }
}
