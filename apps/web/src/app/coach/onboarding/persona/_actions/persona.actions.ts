'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PERSONA_COPY, PersonaSchema, type Persona } from '@eva/schemas'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { seedDemoStudent } from '@/services/onboarding/demo-student.service'
import {
    recordOnboardingEvent,
    saveCoachPersona,
    writePersonaDomainPrefs,
} from '@/services/coach/persona.service'

/**
 * Server action de la pantalla «¿A qué te dedicas?» (SPEC coach-onboarding-v2 §1).
 *
 * Lo que hace, en orden, y por qué ese orden:
 *  1. Valida el body con `PersonaSchema` (espejo del CHECK de `coaches.persona`).
 *  2. Resuelve el coach de la SESIÓN (nunca del input) y rechaza a los managed (org/team): su
 *     panel lo define el tenant, no ellos.
 *  3. Escribe `coaches.persona*` con el cliente del USUARIO (hay column-grant + RLS).
 *  4. Siembra las 5 filas de `coach_feature_prefs` con la matriz de la persona — es lo que hace
 *     que el panel se achique de verdad. Si esto falla NO se aborta: la persona ya quedó y el
 *     menú completo es un estado seguro (fail-open).
 *  5. Telemetría `persona_selected` (tabla + PostHog) y alumno de ejemplo, ambos best-effort.
 *  6. `redirect('/coach/dashboard?bienvenida=1')`.
 *
 * El sembrador vive en `services/onboarding/demo-student.service` (W3 lo implementa). Hasta
 * entonces devuelve `{ ok: false, reason: 'not_implemented' }` y acá se tolera en silencio: el
 * onboarding tiene que funcionar igual sin demo.
 */

/** Destino del primer ingreso: el dashboard día 1. El `bienvenida=1` lo consume W2-B. */
const DASHBOARD_AFTER_PERSONA = '/coach/dashboard?bienvenida=1'

export type PersonaActionResult = { ok: true } | { ok: false; error: string }

const personaInputSchema = z.object({
    persona: PersonaSchema,
    /** Segunda pregunta inline. Ausente ⇒ «No» (el default de la pantalla). */
    alsoOther: z.boolean().optional(),
})

export type SetCoachPersonaInput = z.input<typeof personaInputSchema>

/**
 * Persiste todo y devuelve el resultado. Separada de la action porque `redirect()` lanza
 * `NEXT_REDIRECT`: tiene que ejecutarse FUERA de cualquier try/catch para que Next lo maneje.
 */
async function persistPersona(input: SetCoachPersonaInput): Promise<PersonaActionResult> {
    const parsed = personaInputSchema.safeParse(input)
    if (!parsed.success) {
        return { ok: false, error: 'Elige una de las opciones para continuar.' }
    }

    const persona: Persona = parsed.data.persona
    // La segunda pregunta no existe para `other` (deja el panel completo): se normaliza a false
    // para no guardar ruido en una columna que segmenta correos y funnel.
    const alsoOther = PERSONA_COPY[persona].secondQuestion == null ? false : parsed.data.alsoOther === true

    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub
    if (!coachId) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar y lo retomamos.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_status')
        .eq('id', coachId)
        .maybeSingle()
    if (!coach) return { ok: false, error: 'No encontramos tu cuenta de coach.' }
    if (coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') {
        return { ok: false, error: 'Tu panel lo administra tu organización o tu equipo.' }
    }

    const saved = await saveCoachPersona(supabase, coachId, persona, alsoOther)
    if (!saved.ok) {
        console.error('[persona] no se pudo guardar la persona', saved.error)
        return { ok: false, error: 'No pudimos guardar tu elección. Inténtalo de nuevo.' }
    }

    // El panel se achica acá. Un error NO aborta: la persona ya quedó guardada y el peor caso es
    // ver el menú completo (que es el estado de hoy), nunca perder el acceso.
    const prefs = await writePersonaDomainPrefs(supabase, coachId, persona, alsoOther)
    if (!prefs.ok) {
        console.error('[persona] no se pudieron sembrar las preferencias por dominio', prefs.error)
    }

    const admin = createServiceRoleClient()

    await recordOnboardingEvent(admin, {
        coachId,
        eventType: 'persona_selected',
        metadata: { persona, alsoOther, surface: 'web' },
    })

    // Alumno de ejemplo (W3). `not_implemented` mientras el sembrador sea el stub.
    const seed = await seedDemoStudent(admin, { coachId, persona })
    if (seed.ok) {
        await recordOnboardingEvent(admin, {
            coachId,
            eventType: 'demo_seeded',
            metadata: { persona, demoClientId: seed.demoClientId, alreadyExisted: seed.alreadyExisted },
        })
    } else if (seed.reason !== 'not_implemented' && seed.reason !== 'persona_sin_demo') {
        console.error('[persona] el alumno de ejemplo no se pudo sembrar', seed.reason, seed.detail)
    }

    await capturePostHogServerEvent({
        event: 'persona_selected',
        distinctId: coachId,
        properties: { persona, also_other: alsoOther, surface: 'web' },
    })

    // El nav del layout /coach lee las prefs por dominio: sin esto el menú viejo sobrevive en el
    // cache del router hasta la siguiente navegación dura.
    revalidatePath('/coach/dashboard', 'layout')

    return { ok: true }
}

/**
 * Guarda la persona del coach y lo manda al dashboard día 1. En éxito NO retorna (redirige);
 * el `PersonaActionResult` solo viaja al cliente cuando algo falló y hay que reintentar.
 */
export async function setCoachPersonaAction(input: SetCoachPersonaInput): Promise<PersonaActionResult> {
    const result = await persistPersona(input)
    if (!result.ok) return result
    redirect(DASHBOARD_AFTER_PERSONA)
}
