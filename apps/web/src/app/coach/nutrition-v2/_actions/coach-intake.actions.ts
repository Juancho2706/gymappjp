'use server'

import { revalidatePath } from 'next/cache'
import { authorizeCoach, fail, zodFields } from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import {
  CorrectIntakeQuantityAsCoachInputSchema,
  VoidIntakeAsCoachInputSchema,
  correctIntakeQuantityAsCoachWithDb,
  voidIntakeAsCoachWithDb,
  type CoachIntakeResult,
} from '@/app/coach/nutrition-v2/_lib/coach-intake'

/**
 * Server actions del panel «Registros de hoy» de la ficha (W4.1, SPEC §7.1).
 *
 * Gate fail-closed igual que las vecinas (`coach-private-note.actions`, `nutrition-archive.actions`):
 * `authorizeCoach` re-verifica sesión, rate limit de escritura y workspace con scope V2 activo. El
 * scope SOBRE EL ALUMNO no se decide acá — lo imponen los RPC auditados con
 * `private.nutrition_v2_can_read_client` y la RLS del cliente de la sesión (jamás `service_role`).
 * La lógica compartida con la ruta móvil vive en `_lib/coach-intake.ts`.
 *
 * `revalidatePath` de la ficha (a diferencia del Hoy del alumno, H11): acá la mutación es puntual y
 * el coach necesita ver el día recalculado — `consumed`, `entryCount` y el chip «N× la meta» salen
 * del read model del server component, no de estado cliente.
 */

function revalidateClientDetail(clientId: string): void {
  revalidatePath(`/coach/nutrition-v2/${clientId}`)
}

/** Retira un registro del día del alumno (estado terminal `voided`, sin insertar nada). */
export async function voidIntakeAsCoach(input: unknown): Promise<CoachIntakeResult> {
  const parsed = VoidIntakeAsCoachInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Datos de retiro inválidos.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(parsed.data.clientId)
  if (!auth.ok) return auth

  const result = await voidIntakeAsCoachWithDb(auth.db, parsed.data)
  if (result.ok) revalidateClientDetail(parsed.data.clientId)
  return result
}

/** Corrige la CANTIDAD de un registro (mismo alimento, misma unidad, snapshot congelado intacto). */
export async function correctIntakeQuantityAsCoach(input: unknown): Promise<CoachIntakeResult> {
  const parsed = CorrectIntakeQuantityAsCoachInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'La cantidad no es válida.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(parsed.data.clientId)
  if (!auth.ok) return auth

  const result = await correctIntakeQuantityAsCoachWithDb(auth.db, parsed.data)
  if (result.ok) revalidateClientDetail(parsed.data.clientId)
  return result
}
