import { z } from 'zod'
import { COACH_VOID_REASON } from '@eva/nutrition-v2'
import { fail, type ActionFailure, type DbError, type NutritionV2Db } from '@/app/coach/nutrition-v2/_actions/plan-persistence'

/**
 * El coach RETIRA y CORRIGE registros del día de su alumno (W4.1 del tren «Cantidades honestas»,
 * SPEC §7.1) — UNA sola implementación para la server action web y la ruta móvil.
 *
 * Por qué acá y no en cada superficie: es el mismo patrón de `_lib/coach-food.ts` y
 * `_lib/assign-plan.ts` — lógica de servidor reutilizable (NO `'use server'`, NO un endpoint), con
 * el gate puesto por cada llamador (`authorizeCoach` en la action web, `gateNutritionV2Api` en
 * `POST /api/mobile/nutrition-v2/coach/intake`).
 *
 * Reglas duras que respeta:
 *  - El cuerpo de la petición SOLO trae `{ clientId, entryId, quantity? }`. Todo lo demás —
 *    alimento, unidad, franja, snapshot congelado, versión, ítem prescrito — se RE-LEE de la fila
 *    server-side: el coach no puede dictar macros ni reasignar un registro a otro alumno.
 *  - La escritura pasa por los RPC auditados (`void_nutrition_intake_v2` /
 *    `correct_nutrition_intake_v2`) con el cliente RLS del propio coach, JAMÁS `service_role` y
 *    jamás un UPDATE directo (regla dura: cero `UPDATE` de `nutrition_intake_entries`).
 *  - La autorización REAL la ponen esos RPC: los dos exigen
 *    `private.nutrition_v2_can_read_client(v_entry.client_id)` y el gate de cuenta pausada solo
 *    corre cuando `auth.uid() = p_client_id` (o sea, cuando retira/corrige el propio alumno), así
 *    que el coach que administra al alumno está autorizado por construcción. El guard de permisos
 *    del plan (`canAdjustPrescribedQuantity`, NUT-009) tampoco lo alcanza: `private.
 *    nutrition_v2_assert_intake_permission` devuelve temprano si `auth.uid() <> p_client_id`.
 */

/** Operaciones del panel. El nombre entra en la clave de idempotencia, así que es estable. */
export type CoachIntakeOp = 'void' | 'correct'

export type CoachIntakeResult = { ok: true; id: string } | ActionFailure

export const VoidIntakeAsCoachInputSchema = z.object({
  clientId: z.string().uuid(),
  entryId: z.string().uuid(),
})

export const CorrectIntakeQuantityAsCoachInputSchema = z.object({
  clientId: z.string().uuid(),
  entryId: z.string().uuid(),
  // Mismo dominio que el campo del builder: positiva, finita y con un techo que evita que un typo
  // («20000») entre a la base. El RPC vuelve a validarla.
  quantity: z.coerce.number().finite().positive().max(9999),
})

export type VoidIntakeAsCoachInput = z.infer<typeof VoidIntakeAsCoachInputSchema>
export type CorrectIntakeQuantityAsCoachInput = z.infer<typeof CorrectIntakeQuantityAsCoachInputSchema>

/**
 * Motivo fijo de la corrección de cantidad (el RPC exige ≥ 3 caracteres y lo guarda en
 * `correction_reason` + auditoría). Su par del retiro es `COACH_VOID_REASON`, que vive en el
 * paquete porque la UI también lo nombra.
 */
export const COACH_CORRECT_REASON = 'Cantidad corregida por el coach'

/**
 * Clave de idempotencia del gesto: `coach-<op>-<entryId>-<uuid>`. El uuid es por INTENTO a
 * propósito — reintentar tras un fallo de red debe poder volver a escribir; el short-circuit por
 * estado del RPC (`already_voided`) y el de `client_id + idempotency_key` cubren el doble tap.
 */
export function coachIntakeIdempotencyKey(op: CoachIntakeOp, entryId: string): string {
  return `coach-${op}-${entryId}-${crypto.randomUUID()}`
}

/** Traduce el error del RPC al par código/copy que las dos superficies ya saben ramificar. */
export function mapCoachIntakeError(error: DbError): ActionFailure {
  const code = error.code ?? 'DB_ERROR'
  const message = error.message ?? ''
  if (message.includes('nutrition_v2_original_entry_not_found') || code === 'P0002') {
    return fail('ENTRY_NOT_FOUND', 'Ese registro ya no está en el día del alumno.')
  }
  if (message.includes('nutrition_v2_only_active_entries')) {
    return fail('ENTRY_NOT_ACTIVE', 'Ese registro ya fue retirado o corregido. Recarga la ficha.')
  }
  if (message.includes('nutrition_v2_legacy_entry_requires_legacy_flow')) {
    return fail('LEGACY_ENTRY', 'Ese registro es anterior a Nutrición V2 y no se puede editar desde acá.')
  }
  if (code === '42501') {
    return fail('SCOPE_DENIED', 'No tienes permiso para editar los registros de este alumno.')
  }
  if (code === '22023') {
    return fail('INVALID_INTAKE', 'Los datos del registro no son válidos.')
  }
  return fail('WRITE_FAILED', 'No se pudo actualizar el registro. Intenta nuevamente.')
}

/**
 * Retira un registro (estado TERMINAL `voided`, NUT-010 opción A). Payload MÍNIMO: el servidor no
 * necesita snapshot ni cantidad, y los read models ya filtran `entry_status = 'active'`, así que
 * el registro desaparece del consumido, del `entryCount` y de la cobertura de porciones de una.
 * Idempotente por estado: retirar dos veces devuelve el mismo id.
 */
export async function voidIntakeAsCoachWithDb(
  db: NutritionV2Db,
  input: VoidIntakeAsCoachInput,
): Promise<CoachIntakeResult> {
  const { data, error } = await db.rpc('void_nutrition_intake_v2', {
    p_client_id: input.clientId,
    p_entry_id: input.entryId,
    p_reason: COACH_VOID_REASON,
    p_idempotency_key: coachIntakeIdempotencyKey('void', input.entryId),
  })
  if (error) return mapCoachIntakeError(error)
  return readWrittenId(data)
}

/** Fila del registro tal como la necesita la corrección (columnas V2 + snapshot congelado). */
interface IntakeEntryRow {
  id: string
  client_id: string
  log_date: string | null
  food_id: string | null
  custom_name: string | null
  quantity: number | string | null
  unit: string | null
  occurred_at: string | null
  timezone: string | null
  note: string | null
  entry_status: string | null
  meal_slot_v2: string | null
  intake_source_v2: string | null
  capture_method_v2: string | null
  snapshot_name: string | null
  snapshot_brand: string | null
  snapshot_calories: number | string | null
  snapshot_protein_g: number | string | null
  snapshot_carbs_g: number | string | null
  snapshot_fats_g: number | string | null
  snapshot_fiber_g: number | string | null
  snapshot_serving_size: number | string | null
  snapshot_serving_unit: string | null
  snapshot_macros_basis: string | null
}

// `plan_version_id` y `prescription_item_id` NO se leen: `correct_nutrition_intake_v2` los toma del
// ORIGINAL server-side (`v_original.*`) e ignora los parámetros homónimos. Pedirlos acá solo daría
// la ilusión de que el llamador los decide.
const INTAKE_ENTRY_SELECT =
  'id, client_id, log_date, food_id, custom_name, quantity, unit, occurred_at, timezone, note, ' +
  'entry_status, meal_slot_v2, intake_source_v2, capture_method_v2, snapshot_name, snapshot_brand, ' +
  'snapshot_calories, snapshot_protein_g, snapshot_carbs_g, snapshot_fats_g, snapshot_fiber_g, ' +
  'snapshot_serving_size, snapshot_serving_unit, snapshot_macros_basis'

const INTAKE_SOURCES = ['offplan', 'prescription', 'substitution', 'recipe', 'quickadd', 'recent', 'copy'] as const
const CAPTURE_METHODS = ['search', 'barcode', 'recent', 'favorite', 'recipe', 'prescription', 'manual', 'legacy'] as const

/** Mismo criterio que el Hoy del alumno (`nutrition-today.logic.ts`): valor válido o el neutro. */
function coerceSource(value: string | null | undefined): string {
  return (INTAKE_SOURCES as readonly string[]).includes(value ?? '') ? (value as string) : 'offplan'
}
function coerceCapture(value: string | null | undefined): string {
  return (CAPTURE_METHODS as readonly string[]).includes(value ?? '') ? (value as string) : 'manual'
}

/** `numeric` de PostgREST puede llegar como string; null se conserva null. */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Corrige la CANTIDAD de un registro: el original queda `corrected` y nace la correctora activa,
 * con el MISMO alimento, la misma unidad y el mismo snapshot congelado (incluida `macrosBasis`, sin
 * la cual la corrección reescalaría con la fórmula legada — NUT-001). Solo cambia `quantity`.
 *
 * La fila se re-lee con el cliente RLS del coach (política `nutrition_intake_coach_select` /
 * `nutrition_intake_team_all`) y acotada por `client_id`: un `entryId` de otro alumno no matchea y
 * sale como `ENTRY_NOT_FOUND`, sin enumerar nada.
 */
export async function correctIntakeQuantityAsCoachWithDb(
  db: NutritionV2Db,
  input: CorrectIntakeQuantityAsCoachInput,
): Promise<CoachIntakeResult> {
  const { data, error } = await db
    .from('nutrition_intake_entries')
    .select<IntakeEntryRow>(INTAKE_ENTRY_SELECT)
    .eq('id', input.entryId)
    .eq('client_id', input.clientId)
    .maybeSingle()

  if (error) return mapCoachIntakeError(error)
  const entry = data
  if (!entry) return fail('ENTRY_NOT_FOUND', 'Ese registro ya no está en el día del alumno.')
  if (entry.entry_status !== 'active') {
    return fail('ENTRY_NOT_ACTIVE', 'Ese registro ya fue retirado o corregido. Recarga la ficha.')
  }
  // Una entry LEGADA (V1, sin `occurred_at` ni snapshot) no puede corregirse: el propio RPC la
  // rechaza con `nutrition_v2_legacy_entry_requires_legacy_flow`. Se corta antes, con copy claro.
  if (!entry.occurred_at || !entry.log_date || !entry.snapshot_name || !entry.unit) {
    return fail('LEGACY_ENTRY', 'Ese registro es anterior a Nutrición V2 y no se puede editar desde acá.')
  }

  const macrosBasis = entry.snapshot_macros_basis
  const result = await db.rpc('correct_nutrition_intake_v2', {
    p_corrects_entry_id: entry.id,
    p_correction_reason: COACH_CORRECT_REASON,
    p_client_id: entry.client_id,
    p_local_date: entry.log_date,
    p_occurred_at: entry.occurred_at,
    p_timezone: entry.timezone ?? 'America/Santiago',
    p_food_id: entry.food_id,
    p_custom_name: entry.custom_name,
    p_quantity: input.quantity,
    p_unit: entry.unit,
    p_meal_slot: entry.meal_slot_v2,
    p_source: coerceSource(entry.intake_source_v2),
    p_capture_method: coerceCapture(entry.capture_method_v2),
    // Ignorados por el RPC (hereda los del original); se mandan null para no fingir autoridad.
    p_plan_version_id: null,
    p_prescription_item_id: null,
    p_idempotency_key: coachIntakeIdempotencyKey('correct', entry.id),
    p_note: entry.note,
    p_snapshot: {
      name: entry.snapshot_name,
      brand: entry.snapshot_brand,
      calories: num(entry.snapshot_calories),
      proteinG: num(entry.snapshot_protein_g),
      carbsG: num(entry.snapshot_carbs_g),
      fatsG: num(entry.snapshot_fats_g),
      fiberG: num(entry.snapshot_fiber_g),
      servingSize: num(entry.snapshot_serving_size),
      servingUnit: entry.snapshot_serving_unit,
      ...(macrosBasis === 'per_100' || macrosBasis === 'per_serving' ? { macrosBasis } : {}),
    },
  })
  if (result.error) return mapCoachIntakeError(result.error)
  return readWrittenId(result.data)
}

/** Los dos RPC devuelven el uuid de la fila resultante; cualquier otra cosa es una respuesta rota. */
function readWrittenId(data: unknown): CoachIntakeResult {
  const id = z.string().uuid().safeParse(data)
  if (!id.success) return fail('INVALID_RESPONSE', 'La base devolvió una respuesta inesperada.')
  return { ok: true, id: id.data }
}
