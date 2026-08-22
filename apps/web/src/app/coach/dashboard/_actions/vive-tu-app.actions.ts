'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { studentAppOrigin } from '@/lib/coach/invite-code'

/**
 * «Vive tu app» — paso 2 de la guía v2 (SPEC coach-onboarding-v2 §5).
 *
 * Abre la app del ALUMNO con la marca del coach, entrando como su alumno de ejemplo. Es el único
 * momento en que un coach Free ve su white-label funcionando de verdad: el «wow» que justifica
 * Free = 1 alumno con marca.
 *
 * Cómo: `auth.admin.generateLink({ type: 'magiclink' })` para el correo del demo y, con su
 * `hashed_token`, un link a la ruta propia `/vive-tu-app?t=…&c=<slug|código>` que verifica el token
 * y cae en `/c/<c>/dashboard`. NO se usa el `action_link` de GoTrue: ese exige la URL en la
 * allowlist de Auth y deja los tokens en el hash, que el árbol del alumno (SSR + cookies) no lee.
 *
 * ⚠️ La sesión de Supabase vive en cookies compartidas por todo el host (`lib/supabase/server.ts`):
 * verificar el link en ESTE navegador lo deja logueado como el alumno demo y el coach tiene que
 * volver a entrar a su panel. Por eso la UI ofrece primero el QR (el celular no tiene la sesión del
 * panel) y avisa antes de abrirlo acá.
 *
 * Seguridad: el email del demo y el `coach_id` salen de la base con el cliente admin DESPUÉS de
 * verificar la sesión del coach; el body no aporta identidad. El token NUNCA se loguea.
 */

export type ViveTuAppResult =
    | { ok: true; url: string; demoName: string }
    | { ok: false; reason: 'no_autenticado' | 'sin_demo' | 'sin_marca' | 'error'; detail?: string }

export async function openViveTuAppAction(): Promise<ViveTuAppResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, reason: 'no_autenticado' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, slug, invite_code')
        .eq('id', user.id)
        .maybeSingle()

    const identifier = getCoachPublicIdentifier(coach)
    if (!identifier) return { ok: false, reason: 'sin_marca' }

    const admin = createServiceRoleClient()

    // El alumno de ejemplo se identifica por `is_demo` (columna que solo `service_role` escribe,
    // trigger `clients_guard_is_demo`) y SIEMPRE acotado al coach de la sesión.
    const { data: demo } = await admin
        .from('clients')
        .select('id, email, full_name')
        .eq('coach_id', user.id)
        .eq('is_demo', true)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()

    if (!demo?.email) return { ok: false, reason: 'sin_demo' }

    const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: demo.email,
    })

    // Nunca imprimir `link` completo: `properties` lleva el token de acceso.
    if (error) {
        console.error('[vive-tu-app] generateLink falló:', error.message)
        return { ok: false, reason: 'error', detail: 'No pudimos abrir tu app. Intenta de nuevo.' }
    }

    const hashedToken = link?.properties?.hashed_token
    if (!hashedToken) {
        return { ok: false, reason: 'error', detail: 'No pudimos abrir tu app. Intenta de nuevo.' }
    }

    const url = `${studentAppOrigin()}/vive-tu-app?t=${encodeURIComponent(hashedToken)}&c=${encodeURIComponent(identifier)}`

    // Señal del paso 2 de la guía: la lee `getCoachOnboardingV2Data` para tildarlo.
    const { error: eventError } = await admin.from('coach_onboarding_events').insert({
        coach_id: user.id,
        step_key: 'vive_tu_app',
        event_type: 'vive_tu_app_opened',
        metadata: { surface: 'web' },
    })
    if (eventError) {
        // El evento es medición: que falle no puede impedirle al coach ver su app.
        console.error('[vive-tu-app] evento no registrado:', eventError.message)
    }

    revalidatePath('/coach/dashboard')
    return { ok: true, url, demoName: demo.full_name }
}
