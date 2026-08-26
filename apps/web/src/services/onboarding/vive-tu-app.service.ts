import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { studentAppOrigin } from '@/lib/coach/invite-code'
import { recordOnboardingEvent } from '@/services/coach/persona.service'

/**
 * «Vive tu app» — NÚCLEO compartido web ↔ app (SPEC coach-onboarding-v2 §5, paso 2 de la guía).
 *
 * El coach entra a la app de su ALUMNO, con su marca, como su alumno de ejemplo. Es el único
 * momento en que un Free ve el white-label funcionando: el «wow» que justifica Free = 1 alumno
 * con marca. Hasta W5 esto vivía entero dentro de la server action del dashboard; la app móvil
 * necesita exactamente lo mismo, así que el núcleo bajó acá y hay UN solo lugar donde se decide
 * qué link se emite y qué evento se registra.
 *
 * Cómo: `auth.admin.generateLink({ type: 'magiclink' })` para el correo del demo y, con su
 * `hashed_token`, un link a la ruta propia `/vive-tu-app?t=…&c=<slug|código>` que verifica el
 * token y cae en `/c/<c>/dashboard`. NO se usa el `action_link` de GoTrue: ese exige la URL en la
 * allowlist de Auth y deja los tokens en el hash, que el árbol del alumno (SSR + cookies) no lee.
 *
 * Seguridad:
 *  - `coachId` SIEMPRE viene de la sesión ya verificada por el llamador; el body no aporta identidad.
 *  - El alumno de ejemplo se identifica por `is_demo` (columna que solo `service_role` escribe,
 *    trigger `clients_guard_is_demo`) y SIEMPRE acotado al coach.
 *  - El token NUNCA se loguea ni viaja en un mensaje de error.
 *
 * Dos clientes a propósito:
 *  - `db` lee la ficha del coach. En la web es el cliente de la SESIÓN (RLS como techo); en la API
 *    móvil, donde el bearer ya se verificó y no hay cookie, es el admin acotado por `coachId`.
 *  - `admin` (`service_role`) hace lo que RLS no permite: leer el demo, emitir el magic link y
 *    escribir el evento.
 */

type DB = SupabaseClient<Database>

/** Superficie desde la que se abrió: alimenta el funnel (`metadata.surface`). */
export type ViveTuAppSurface = 'web' | 'rn'

/**
 * Dispositivo desde el que se PIDIÓ el link. Lo resuelve el llamador (la web por `user-agent`, la
 * app siempre `mobile`), nunca este núcleo: acá no hay request.
 */
export type ViveTuAppDevice = 'mobile' | 'desktop'

/**
 * Pantalla de RN que abrió el link. Viaja en la URL (`&from=`) porque quien la necesita es el
 * BANNER de vuelta del árbol del alumno: desde el builder no se puede ofrecer un deep link (el
 * stack tiene un borrador en pantalla y volver por `eva://` lo resetearía), así que ahí el banner
 * dice «vuelve con el botón atrás». Default `guia`.
 */
export type ViveTuAppFrom = 'guia' | 'builder'

export type ViveTuAppLinkResult =
    | { ok: true; url: string; demoName: string }
    | { ok: false; reason: 'sin_demo' | 'sin_marca' | 'error'; detail?: string }

export interface ViveTuAppInput {
    /** Coach YA autenticado por el llamador. */
    coachId: string
    surface: ViveTuAppSurface
    /**
     * OPCIONAL a propósito: el llamador que todavía no lo sabe (o que no tiene request a mano)
     * sigue compilando, y el evento guarda `device: null` en vez de mentir. El endpoint móvil
     * pasa `mobile` siempre; la web lo saca del `user-agent`.
     */
    device?: ViveTuAppDevice
    /** Solo tiene efecto con `surface: 'rn'`: es la pantalla de la app que abrió el navegador. */
    from?: ViveTuAppFrom
}

/** `step_key` del paso 2 de la guía. Es lo que lee `getCoachOnboardingV2Data` para auto-tildarlo. */
export const VIVE_TU_APP_STEP_KEY = 'vive_tu_app'

export async function createViveTuAppLink(
    db: DB,
    admin: DB,
    input: ViveTuAppInput,
): Promise<ViveTuAppLinkResult> {
    const { coachId, surface, device, from } = input

    const { data: coach } = await db
        .from('coaches')
        .select('id, slug, invite_code, persona')
        .eq('id', coachId)
        .maybeSingle()

    const identifier = getCoachPublicIdentifier(coach)
    if (!identifier) return { ok: false, reason: 'sin_marca' }

    const { data: demo } = await admin
        .from('clients')
        .select('id, email, full_name')
        .eq('coach_id', coachId)
        .eq('is_demo', true)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()

    if (!demo?.email) return { ok: false, reason: 'sin_demo' }

    const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: demo.email,
    })

    // Nunca imprimir `link` completo: `properties` lleva el acceso de un solo uso.
    if (error) {
        console.error('[vive-tu-app] generateLink falló:', error.message)
        return { ok: false, reason: 'error', detail: 'No pudimos abrir tu app. Intenta de nuevo.' }
    }

    const hashedToken = link?.properties?.hashed_token
    if (!hashedToken) {
        return { ok: false, reason: 'error', detail: 'No pudimos abrir tu app. Intenta de nuevo.' }
    }

    // `src=rn&from=…` solo desde la app: son las dos señales con las que `/vive-tu-app` decide el
    // modo del banner de vuelta (`rn` gana sobre `return`) y si ofrece deep link o el botón atrás.
    // Van en la QUERY y no en el path a propósito: `isStoreSafeUrl` (allowlist de tiendas) mira el
    // path, así que el link sigue siendo el mismo destino permitido de siempre.
    const rnParams = surface === 'rn' ? `&src=rn&from=${from ?? 'guia'}` : ''
    const url = `${studentAppOrigin()}/vive-tu-app?t=${encodeURIComponent(hashedToken)}&c=${encodeURIComponent(identifier)}${rnParams}`

    // Señal del paso 2. Es medición: que falle no puede impedirle al coach ver su app, por eso
    // `recordOnboardingEvent` traga el error (solo lo advierte en el log).
    //
    // La `persona` viaja en el metadata desde W8.1.3: «entré como Matías» no es «entré como Pedro»,
    // y el paso 2 se archiva por especialidad. La señal viva se acota por `persona_set_at`
    // (`resolveViveTuAppOpened`), así que esto es para la MEDICIÓN — poder leer el funnel por rama
    // sin cruzar contra el estado actual del coach, que cambia.
    //
    // `device` (spec «Vive tu app» directo, V1.14): este evento significa «PIDIÓ el link», y el
    // agujero que motivó la spec es justamente que en móvil pedirlo y entrar no es lo mismo. Sin
    // este campo, `entered / opened` no se puede leer por dispositivo y la métrica del rediseño no
    // existe. El evento NO se mueve de lugar: los 65 runtimes que ya lo emiten siguen valiendo.
    await recordOnboardingEvent(admin, {
        coachId,
        stepKey: VIVE_TU_APP_STEP_KEY,
        eventType: 'vive_tu_app_opened',
        metadata: { surface, persona: coach?.persona ?? null, device: device ?? null },
    })

    return { ok: true, url, demoName: demo.full_name }
}
