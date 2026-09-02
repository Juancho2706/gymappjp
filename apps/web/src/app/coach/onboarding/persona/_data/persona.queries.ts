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
    /**
     * ¿Probó alguna vez su casilla? (B9) La señal es `coaches.email_verified_at`, NUNCA
     * `auth.users.email_confirmed_at` — bajo D1 = A esa última nace seteada para todos.
     * Sin fila legible se responde `true`: el aviso se calla en vez de mostrarse a ciegas.
     */
    emailVerified: boolean
}

export const getPersonaScreenContext = cache(async (): Promise<PersonaScreenContext> => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (el proxy ya validó la sesión antes de llegar acá).
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub ?? null
    if (!coachId)
        return { coachId: null, hasCoachRow: false, persona: null, managed: false, emailVerified: true }

    // `email_verified_at` viaja en la MISMA lectura (B9): la pantalla de persona tapa el panel
    // entero, así que el aviso de «verifica tu correo» tiene que poder pintarse acá — y no vale
    // pagarlo con una query extra en el primer ingreso.
    const { data } = await supabase
        .from('coaches')
        .select('persona, subscription_status, email_verified_at')
        .eq('id', coachId)
        .maybeSingle()

    if (!data)
        return { coachId, hasCoachRow: false, persona: null, managed: false, emailVerified: true }

    return {
        coachId,
        hasCoachRow: true,
        persona: (data.persona as Persona | null) ?? null,
        managed:
            data.subscription_status === 'org_managed' || data.subscription_status === 'team_managed',
        emailVerified: Boolean(data.email_verified_at),
    }
})
