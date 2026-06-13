import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getStudentBodyCompositionView } from '@/services/bodycomp/body-composition.service'

/**
 * Vista del alumno (read-only, sus propias mediciones BIA + ISAK). El service verifica el modulo
 * con el contexto del PROPIO alumno (pool => su team; standalone => su coach) usando un cliente
 * service-role SOLO para leer enabled_modules (RLS no deja al alumno leer teams/coaches); los
 * datos de las mediciones van con el cliente del alumno (RLS techo: rama self-select de bcm_select).
 * Espejo de getStudentMovement.
 */
export const getStudentBodyComposition = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, view: null }
    try {
        const view = await getStudentBodyCompositionView(supabase, createServiceRoleClient(), user.id)
        return { user, view }
    } catch {
        return { user, view: null }
    }
})
