import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Ejercicios del catálogo público (los que NO pertenecen a un coach). Lo consumen la landing (`/`)
 * y `/hecho-con-eva`: el mismo número tiene que aparecer en las dos o el dato deja de ser un dato.
 *
 * Fail-open a 129: si Supabase no responde, la página se sirve igual con el último valor conocido
 * en vez de caerse — es una landing pública, no un panel.
 */
export const FALLBACK_EXERCISE_COUNT = 129

export async function getPublicExerciseCount(): Promise<number> {
    try {
        const supabase = createServiceRoleClient()
        const { count } = await supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .is('coach_id', null)
        return count ?? FALLBACK_EXERCISE_COUNT
    } catch {
        return FALLBACK_EXERCISE_COUNT
    }
}
