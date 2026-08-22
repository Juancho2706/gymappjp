'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteDemoStudent } from '@/services/onboarding/demo-student.service'

/**
 * Alumno de ejemplo — acciones del dashboard (SPEC coach-onboarding-v2 §4).
 *
 * El borrado corre SIEMPRE con el cliente admin: `clients.is_demo` la escribe solo `service_role`
 * (trigger `clients_guard_is_demo`) y el servicio borra todo el inventario sembrado. La identidad
 * viene de la sesión, nunca del body: el servicio recibe el `coachId` autenticado y acota el
 * borrado a SUS filas.
 *
 * W3 (`F3.1`) implementa `deleteDemoStudent`; hasta entonces el stub responde
 * `{ ok: false, reason: 'not_implemented' }` y la UI lo muestra como «todavía no disponible» en
 * lugar de mentir con un éxito.
 */

export type DeleteDemoStudentResult =
    | { ok: true; deleted: boolean }
    | { ok: false; error: string }

export async function deleteDemoStudentAction(): Promise<DeleteDemoStudentResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No autenticado' }

    const admin = createServiceRoleClient()
    const result = await deleteDemoStudent(admin, { coachId: user.id })

    if (!result.ok) {
        if (result.reason === 'not_implemented') {
            return { ok: false, error: 'El borrado del ejemplo todavía no está disponible.' }
        }
        return { ok: false, error: 'No se pudo borrar el alumno de ejemplo.' }
    }

    // Señal de medición del funnel (`demo_deleted`): si falla, el borrado igual valió.
    const { error: eventError } = await admin.from('coach_onboarding_events').insert({
        coach_id: user.id,
        step_key: 'vive_tu_app',
        event_type: 'demo_deleted',
        metadata: { surface: 'web' },
    })
    if (eventError) {
        console.error('[demo-student] evento demo_deleted no registrado:', eventError.message)
    }

    revalidatePath('/coach/dashboard')
    revalidatePath('/coach/clients')
    return { ok: true, deleted: result.deleted }
}
