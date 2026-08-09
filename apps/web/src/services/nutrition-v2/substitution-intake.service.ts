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
    attempt: request.attempt,
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
