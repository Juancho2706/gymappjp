import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Persona } from '@eva/schemas'

/**
 * Datos de la pantalla «¿A qué te dedicas?». Request-scoped (`React.cache`): la página la llama
 * una vez y no hay más consumidores.
 *
 * Una sola lectura de `coaches` con la sesión del usuario (RLS = techo). No usa `getCoach()`
 * porque ese selector no trae `persona` y acá no hace falta nada más: branding, cupo y workspace
 * no pintan en esta pantalla.
 */
export interface PersonaScreenContext {
    coachId: string | null
    /** `null` = el usuario tiene sesión pero todavía no tiene fila en `coaches` (alta por OAuth). */
    hasCoachRow: boolean
    persona: Persona | null
    /** Coach administrado por org/team: su panel lo define el tenant, no se le pregunta nada. */
    managed: boolean
}

export const getPersonaScreenContext = cache(async (): Promise<PersonaScreenContext> => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (el proxy ya validó la sesión antes de llegar acá).
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub ?? null
    if (!coachId) return { coachId: null, hasCoachRow: false, persona: null, managed: false }

    const { data } = await supabase
        .from('coaches')
        .select('persona, subscription_status')
        .eq('id', coachId)
        .maybeSingle()

    if (!data) return { coachId, hasCoachRow: false, persona: null, managed: false }

    return {
        coachId,
        hasCoachRow: true,
        persona: (data.persona as Persona | null) ?? null,
        managed:
            data.subscription_status === 'org_managed' || data.subscription_status === 'team_managed',
    }
})
