'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteDemoStudent, getDemoClientId } from '@/services/onboarding/demo-student.service'

/**
 * Borra el alumno de EJEMPLO del coach y todo lo que se sembró con él
 * (docs/specs/coach-onboarding-v2/SPEC.md §4, TASKS F3.7 — «borrable de un toque»).
 *
 * Autorización SERVER-SIDE, la UI no manda:
 *  1. sesión real (`getUser`),
 *  2. `getDemoClientId` con el cliente del COACH (RLS) — devuelve id solo si la fila es suya
 *     Y tiene `is_demo = true`. Un `clientId` del body no participa en la decisión: no se
 *     acepta ninguno, justamente para que nadie pueda pasar el id de un alumno real.
 *
 * El borrado corre con `service_role` porque el contenido sembrado (programa, pauta V2,
 * screening, perfil cardio) lo escribió ese mismo rol; el cliente de servicio se crea DESPUÉS
 * de los dos chequeos y jamás sale de este módulo.
 *
 * Al terminar revalida el directorio y redirige ahí: la ficha del alumno recién borrado ya no
 * existe, quedarse en ella sería un 404.
 */
export async function deleteDemoStudentAction(): Promise<{ ok: false; error: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Inicia sesión de nuevo.' }

    const demoClientId = await getDemoClientId(supabase, user.id)
    if (!demoClientId) {
        return { ok: false, error: 'No tienes un alumno de ejemplo.' }
    }

    const result = await deleteDemoStudent(createServiceRoleClient(), { coachId: user.id })
    if (!result.ok) {
        return {
            ok: false,
            error:
                result.reason === 'not_implemented'
                    ? 'El borrado del ejemplo todavía no está disponible.'
                    : 'No se pudo borrar el alumno de ejemplo.',
        }
    }

    revalidatePath('/coach/clients')
    revalidatePath('/coach/dashboard')
    redirect('/coach/clients')
}
