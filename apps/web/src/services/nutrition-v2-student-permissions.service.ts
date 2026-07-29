import type { NutritionStudentPermissions } from '@eva/nutrition-v2'

/**
 * Permisos del alumno aplicados a la ESCRITURA de consumo (NUT-009, fase 1).
 *
 * Contexto del hallazgo: el coach configura `canRegisterFreely`, `canAdjustPrescribedQuantity`
 * (+ tope `quantityAdjustmentPercent`) y `canMoveMealSlot` al publicar el plan, pero hasta ahora
 * esos permisos eran 100% DECORATIVOS: solo alimentaban chips de texto en la card de reglas. Ni la
 * server action, ni la API movil, ni la RPC los consultaban. Un plan "Solo alimentos prescritos"
 * mostraba igual el boton "Registrar alimento" y el registro entraba sin ninguna objecion. No es un
 * exploit (el scope sigue siendo self), es una promesa de producto rota para TODOS los alumnos.
 *
 * Este modulo es la capa compartida por la server action web y el gateway movil, para que las dos
 * superficies apliquen exactamente la MISMA regla (la asimetria entre ellas es como nacio el bug).
 * NO es la barrera de autorizacion: la barrera real vive en el RPC SECURITY DEFINER
 * (`nutrition_v2_permission_denied`, errcode 42501, migracion 20260728130000). Esta capa existe
 * para devolver un error TIPADO y con copy humano antes de gastar el viaje a la base.
 *
 * Reglas duras que respeta:
 * - El merge de defaults es BYTE-IDENTICO al del read model
 *   (`private.nutrition_v2_default_permissions() || coalesce(snapshot.student_permissions,'{}')`,
 *   20260720120000:174-175). Sin ese merge, los miles de dias historicos cuyo snapshot guarda
 *   `{}` pasarian a tener TODO en false y bloquearian escrituras que hoy funcionan.
 * - `markPortionIntakeAction` queda EXENTO por diseno (SPEC R1). Ver el comentario en
 *   `intake.actions.ts`; no agregar aqui una regla que lo cubra.
 */

/**
 * Espejo EXACTO de `private.nutrition_v2_default_permissions()`
 * (`supabase/migrations/20260714210000_nutrition_v2_today_plan_read_models.sql:4-18`).
 * Si cambia el SQL, cambia esto (y al reves): el merge tiene que dar el mismo objeto.
 */
export const NUTRITION_V2_DEFAULT_PERMISSIONS: NutritionStudentPermissions = {
  canRegisterFreely: true,
  canAdjustPrescribedQuantity: true,
  quantityAdjustmentPercent: null,
  canSubstitute: false,
  canMoveMealSlot: false,
  canSkipOptionalItems: true,
}

/** Cliente minimo: solo se necesita `rpc` (el mismo que ya usan las actions y el gateway). */
export type NutritionPermissionsRpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

/** Datos del item prescrito que gobierna el tope de cantidad y la franja "oficial". */
export type PrescribedItemContext = {
  quantity: number | null
  unit: string | null
  mealSlot: string | null
}

export type StudentIntakePermissionContext = {
  permissions: NutritionStudentPermissions
  prescribed: PrescribedItemContext | null
  /**
   * `true` cuando los permisos son los DEFAULTS por no haberse podido resolver (RPC aun no
   * desplegada, error transitorio). Se registra para poder distinguir en logs un "permitido
   * porque el plan lo permite" de un "permitido porque no supimos leer el plan".
   */
  degraded: boolean
}

export type StudentIntakePermissionDenial = {
  code: 'FREE_REGISTRATION_DISABLED' | 'QUANTITY_ADJUSTMENT_DISABLED' | 'QUANTITY_OUT_OF_RANGE' | 'MEAL_SLOT_MOVE_DISABLED'
  error: string
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 100) return null
  return value
}

/**
 * Merge de defaults + snapshot, con la MISMA semantica que el `||` de jsonb: las llaves presentes
 * en el snapshot ganan, las ausentes conservan el default. Un valor con tipo inesperado (null,
 * string) cae al default en vez de romper: en escritura preferimos el comportamiento historico
 * antes que dejar al alumno sin poder registrar por un dato sucio.
 */
export function mergeStudentPermissions(raw: unknown): NutritionStudentPermissions {
  const snapshot = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const pick = (key: keyof NutritionStudentPermissions) =>
    Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key as string] : undefined
  return {
    canRegisterFreely: asBoolean(pick('canRegisterFreely'), NUTRITION_V2_DEFAULT_PERMISSIONS.canRegisterFreely),
    canAdjustPrescribedQuantity: asBoolean(
      pick('canAdjustPrescribedQuantity'),
      NUTRITION_V2_DEFAULT_PERMISSIONS.canAdjustPrescribedQuantity,
    ),
    quantityAdjustmentPercent: asPercent(pick('quantityAdjustmentPercent')),
    canSubstitute: asBoolean(pick('canSubstitute'), NUTRITION_V2_DEFAULT_PERMISSIONS.canSubstitute),
    canMoveMealSlot: asBoolean(pick('canMoveMealSlot'), NUTRITION_V2_DEFAULT_PERMISSIONS.canMoveMealSlot),
    canSkipOptionalItems: asBoolean(
      pick('canSkipOptionalItems'),
      NUTRITION_V2_DEFAULT_PERMISSIONS.canSkipOptionalItems,
    ),
  }
}

function parsePrescribed(raw: unknown): PrescribedItemContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
  const unit = typeof row.unit === 'string' ? row.unit : null
  const mealSlot = typeof row.mealSlot === 'string' ? row.mealSlot : null
  if (quantity === null && unit === null && mealSlot === null) return null
  return { quantity, unit, mealSlot }
}

/**
 * Lee los permisos vigentes del dia (y, si se pide, el item prescrito de referencia) via
 * `public.get_nutrition_student_permissions_v2`. La RPC hace el merge de defaults SERVER-SIDE con
 * la misma expresion que el read model, y cae al plan vigente cuando el dia todavia no tiene
 * snapshot congelado.
 *
 * DEGRADACION DELIBERADA: si la RPC no existe (ventana de despliegue: el web sube antes que el
 * SQL) o falla, se devuelven los DEFAULTS (`degraded: true`) en vez de bloquear. Bloquear aqui
 * dejaria a todos los alumnos sin registrar por un problema de infraestructura, y esta capa no es
 * la barrera: el guard autoritativo esta DENTRO del RPC de escritura, que falla cerrado.
 */
export async function resolveStudentIntakePermissions(
  client: NutritionPermissionsRpcClient,
  input: { clientId: string; localDate: string; prescriptionItemId?: string | null },
): Promise<StudentIntakePermissionContext> {
  const { data, error } = await client.rpc('get_nutrition_student_permissions_v2', {
    p_client_id: input.clientId,
    p_local_date: input.localDate,
    p_prescription_item_id: input.prescriptionItemId ?? null,
  })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return { permissions: { ...NUTRITION_V2_DEFAULT_PERMISSIONS }, prescribed: null, degraded: true }
  }
  const payload = data as Record<string, unknown>
  return {
    permissions: mergeStudentPermissions(payload.permissions),
    prescribed: parsePrescribed(payload.prescribed),
    degraded: false,
  }
}

// ── Evaluadores puros (sin red, testeables sueltos) ──────────────────────────

/**
 * Registro NUEVO. Solo el registro LIBRE (fuera del plan) esta gobernado por `canRegisterFreely`:
 * un intake con `prescriptionItemId` es "Lo comi" del propio plan, y el sintetico de porciones
 * viaja con `source = 'prescription'` (exento por SPEC R1
 * `docs/archive/specs/nutrition-portions/SPEC.md:118-124`).
 */
export function evaluateRecordPermission(
  context: StudentIntakePermissionContext,
  payload: { source: string; prescriptionItemId: string | null; mealSlot: string | null },
): StudentIntakePermissionDenial | null {
  if (payload.prescriptionItemId === null && payload.source === 'offplan') {
    if (!context.permissions.canRegisterFreely) {
      return {
        code: 'FREE_REGISTRATION_DISABLED',
        error: 'Tu coach dejó el plan en solo alimentos prescritos: no puedes registrar alimentos libres.',
      }
    }
    return null
  }
  return evaluateMealSlotMove(context, payload)
}

/** Mover un item PRESCRITO a otra franja exige `canMoveMealSlot`. */
function evaluateMealSlotMove(
  context: StudentIntakePermissionContext,
  payload: { prescriptionItemId: string | null; mealSlot: string | null },
): StudentIntakePermissionDenial | null {
  if (payload.prescriptionItemId === null) return null
  const prescribedSlot = context.prescribed?.mealSlot ?? null
  // Sin franja prescrita conocida —o sin franja declarada en el payload— no hay con que comparar:
  // no se inventa una restriccion. Mismo criterio que el guard SQL (`p_meal_slot is not null`).
  if (prescribedSlot === null || payload.mealSlot === null) return null
  if (payload.mealSlot === prescribedSlot) return null
  if (context.permissions.canMoveMealSlot) return null
  return {
    code: 'MEAL_SLOT_MOVE_DISABLED',
    error: 'Tu coach no permite mover alimentos del plan a otra comida.',
  }
}

/**
 * Correccion de un registro existente. `canAdjustPrescribedQuantity` gobierna SOLO los registros
 * ligados a un item prescrito (es literalmente "ajustar la cantidad PRESCRITA"); un alimento libre
 * ya registrado se puede corregir siempre, y el retiro ya no pasa por aca (RPC `void_` dedicada).
 * Con tope `quantityAdjustmentPercent`, la desviacion contra la cantidad PRESCRITA no puede
 * superarlo (ni hacia arriba ni hacia abajo).
 */
export function evaluateCorrectPermission(
  context: StudentIntakePermissionContext,
  payload: { prescriptionItemId: string | null; quantity: number; mealSlot: string | null },
): StudentIntakePermissionDenial | null {
  if (payload.prescriptionItemId === null) return null

  if (!context.permissions.canAdjustPrescribedQuantity) {
    return {
      code: 'QUANTITY_ADJUSTMENT_DISABLED',
      error: 'Tu coach no permite cambiar la cantidad de los alimentos del plan.',
    }
  }

  const percent = context.permissions.quantityAdjustmentPercent
  const prescribedQuantity = context.prescribed?.quantity ?? null
  if (percent !== null && prescribedQuantity !== null && prescribedQuantity > 0) {
    const deviation = Math.abs(payload.quantity - prescribedQuantity) / prescribedQuantity
    // Tolerancia de coma flotante: 105 g sobre 100 g con tope 5% debe PASAR.
    if (deviation > percent / 100 + 1e-9) {
      return {
        code: 'QUANTITY_OUT_OF_RANGE',
        error: `Tu coach permite ajustar la cantidad hasta ±${percent}% de lo prescrito.`,
      }
    }
  }

  return evaluateMealSlotMove(context, payload)
}
