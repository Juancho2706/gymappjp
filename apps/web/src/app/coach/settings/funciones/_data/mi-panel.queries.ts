import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { readCoachPersona, type CoachPersonaSnapshot } from '@/services/coach/persona.service'
import { getDemoClientId } from '@/services/onboarding/demo-student.service'

/**
 * Datos propios de «Opciones › Mi panel» (onboarding v2, TASKS F2.6) que NO trae
 * `getFuncionesContext`: la persona del coach y si tiene alumno de ejemplo sembrado.
 *
 * Los dominios y su master switch salen de `getFuncionesContext` (mismo loader que el editor de
 * secciones) — acá no se duplica esa lectura.
 */
export interface MiPanelContext extends CoachPersonaSnapshot {
    coachId: string | null
    /** Id del alumno de ejemplo del coach, o `null` si no hay (o si W3 aún no siembra). */
    demoClientId: string | null
}

export const getMiPanelContext = cache(async (): Promise<MiPanelContext> => {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub ?? null
    if (!coachId) {
        return { coachId: null, persona: null, alsoOther: false, personaSetAt: null, demoClientId: null }
    }

    // Las dos lecturas son del propio coach y van con su sesión (RLS = techo).
    const [persona, demoClientId] = await Promise.all([
        readCoachPersona(supabase, coachId),
        getDemoClientId(supabase, coachId),
    ])

    return { coachId, ...persona, demoClientId }
})
