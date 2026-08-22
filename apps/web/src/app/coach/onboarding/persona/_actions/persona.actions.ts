'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PersonaSchema, type Persona } from '@eva/schemas'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { applyCoachPersona } from '@/services/coach/persona.service'

/**
 * Server action de la pantalla «¿A qué te dedicas?» (SPEC coach-onboarding-v2 §1).
 *
 * Lo que hace, en orden, y por qué ese orden:
 *  1. Valida el body con `PersonaSchema` (espejo del CHECK de `coaches.persona`).
 *  2. Resuelve el coach de la SESIÓN (nunca del input) y rechaza a los managed (org/team): su
 *     panel lo define el tenant, no ellos.
 *  3. Delega TODA la escritura en `applyCoachPersona` (services/coach/persona.service): persona,
 *     las 5 filas de `coach_feature_prefs`, telemetría `persona_selected`, alumno de ejemplo y
 *     PostHog. Ese núcleo es el MISMO que consume `/api/mobile/coach/persona` (W5 F5.1): la app y
 *     la web no pueden divergir en lo que pasa cuando alguien contesta la pregunta.
 *  4. `revalidatePath` del layout (el nav se achica) y `redirect('/coach/guia?bienvenida=1')`.
 */

/**
 * Destino del primer ingreso: «Tus primeros pasos», NO el dashboard (decisión del owner 22-08 —
 * el panel del día 1 se ve lleno y la guía se mudó a su pantalla propia). `bienvenida=1` pinta
 * ahí la banda de bienvenida de dos líneas, en vez del modal que había antes.
 */
const GUIA_AFTER_PERSONA = '/coach/guia?bienvenida=1'

export type PersonaActionResult = { ok: true } | { ok: false; error: string }

/**
 * `?welcome=free&eid=` del alta Free por Google: el espejo browser de Meta/PostHog que antes se
 * disparaba en el dashboard. El gate de persona lo trae hasta acá y la action lo reenvía a la
 * guía. Solo se acepta la forma exacta (`welcome=free` + id opaco corto): nada más viaja.
 */
const registrationMirrorSchema = z.object({
    welcome: z.literal('free'),
    eid: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
    /** `ph=srv` (embudo W7): el server ya emitió `coach_registered`; el tracker browser se apaga al verlo. */
    ph: z.literal('srv').optional(),
})

const personaInputSchema = z.object({
    persona: PersonaSchema,
    /** Segunda pregunta inline. Ausente ⇒ «No» (el default de la pantalla). */
    alsoOther: z.boolean().optional(),
    registration: registrationMirrorSchema.optional(),
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

    // Todo lo que se escribe (persona, las 5 filas de dominio, telemetría, demo y PostHog) vive en
    // el núcleo compartido con la app: `applyCoachPersona`. Acá queda solo lo que es de la WEB.
    const applied = await applyCoachPersona({
        supabase,
        admin: createServiceRoleClient(),
        coachId,
        persona,
        alsoOther: parsed.data.alsoOther === true,
        surface: 'web',
    })
    if (!applied.ok) return applied

    // El nav del layout /coach lee las prefs por dominio: sin esto el menú viejo sobrevive en el
    // cache del router hasta la siguiente navegación dura.
    revalidatePath('/coach/dashboard', 'layout')

    return { ok: true }
}

/**
 * Guarda la persona del coach y lo manda a su guía de inicio. En éxito NO retorna (redirige);
 * el `PersonaActionResult` solo viaja al cliente cuando algo falló y hay que reintentar.
 */
export async function setCoachPersonaAction(input: SetCoachPersonaInput): Promise<PersonaActionResult> {
    const result = await persistPersona(input)
    if (!result.ok) return result
    const mirror = registrationMirrorSchema.safeParse(input.registration)
    redirect(
        mirror.success
            ? `${GUIA_AFTER_PERSONA}&welcome=free&eid=${encodeURIComponent(mirror.data.eid)}${mirror.data.ph ? '&ph=srv' : ''}`
            : GUIA_AFTER_PERSONA
    )
}
