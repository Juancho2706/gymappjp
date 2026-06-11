import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getStudentMovementView } from '@/services/assessment/movement-assessment.service'

/**
 * Vista del alumno (read-only, solo finales). El service verifica el modulo con el
 * contexto del PROPIO alumno (pool => su team; standalone => su coach) usando un
 * cliente service-role SOLO para leer enabled_modules (RLS no deja al alumno leer
 * teams/coaches); los datos del screening van con el cliente del alumno (RLS techo:
 * self-select de finales).
 */
export const getStudentMovement = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, view: null }
    try {
        const view = await getStudentMovementView(supabase, createServiceRoleClient(), user.id)
        return { user, view }
    } catch {
        return { user, view: null }
    }
})
