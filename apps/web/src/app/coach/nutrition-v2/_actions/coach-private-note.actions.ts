'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  authorizeCoach,
  fail,
  zodFields,
  type ActionFailure,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import { createClient } from '@/lib/supabase/server'
import { NutritionNotesService } from '@/services/nutrition-notes.service'

// Server action "Guardar nota privada" de la ficha V2 del coach. Repone el camino de ESCRITURA
// de `nutrition_private_notes` dentro del arbol V2 (decision owner 2026-07-29 punto 4): la
// action original vive en el arbol V1 (`coach/clients/[clientId]/_actions/nutrition-notes.actions`)
// que se esta extirpando, y la ficha V2 no debe depender de el. CERO DDL: misma tabla, misma
// RLS, misma logica de upsert — la reglas de escritura siguen en `NutritionNotesService`.
//
// Gate fail-closed identico a las vecinas (`nutrition-archive.actions`): `authorizeCoach`
// re-verifica sesion, rate limit de escritura, rollout webCoach y scope del workspace. El
// UPDATE/INSERT corre con el cliente RLS de la sesion (JAMAS service role) y la policy
// `nutrition_private_notes_coach_all` (o la de team manager) es la barrera real. `coach_id`
// sale de la sesion, nunca del payload.

const PrivateNoteInputSchema = z.object({
  clientId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
})

export type SaveCoachPrivateNoteResult = { ok: true } | ActionFailure

export async function saveCoachPrivateNoteAction(
  input: unknown,
): Promise<SaveCoachPrivateNoteResult> {
  const parsed = PrivateNoteInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'La nota tiene datos invalidos.', zodFields(parsed.error))
  }
  const { clientId, body } = parsed.data

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return auth

  // El service necesita el cliente TIPADO (`SupabaseClient<Database>`); `auth.db` viaja como la
  // interfaz acotada `NutritionV2Db` (tablas V2 aun sin tipos generados). Ambos resuelven a la
  // misma sesion y cookies, asi que no hay segunda autenticacion, solo el handle tipado.
  const supabase = await createClient()
  try {
    await new NutritionNotesService(supabase).upsertPrivateNote(auth.userId, clientId, body)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    // 42501 / RLS: el alumno no esta en el pool del coach (o el workspace cambio en otra pestana).
    if (/42501|row-level security|permission denied/i.test(message)) {
      return fail('SCOPE_DENIED', 'No tienes permiso para escribir notas de este alumno.')
    }
    return fail('WRITE_FAILED', 'No se pudo guardar la nota. Intenta nuevamente.')
  }

  revalidatePath('/coach/nutrition-v2/' + clientId)
  return { ok: true }
}
