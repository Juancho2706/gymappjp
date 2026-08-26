'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitViveTuApp } from '@/lib/rate-limit'
import { deviceFromUserAgent } from '@/lib/user-agent'
import { createViveTuAppLink } from '@/services/onboarding/vive-tu-app.service'

/**
 * «Vive tu app» — paso 2 de la guía v2 (SPEC coach-onboarding-v2 §5), entrada WEB.
 *
 * El núcleo (magic link del alumno de ejemplo + evento del funnel) vive en
 * `services/onboarding/vive-tu-app.service.ts` desde W5: la app móvil abre exactamente el mismo
 * link por `POST /api/mobile/coach/vive-tu-app` y no puede haber dos versiones de esta decisión.
 * Acá queda lo que es de la WEB: la sesión por cookies, el cliente admin, el `device` del
 * `user-agent`, el techo de emisión y el `revalidatePath`.
 *
 * ⚠️ La sesión de Supabase vive en cookies compartidas por todo el host (`lib/supabase/server.ts`):
 * verificar el link en ESTE navegador deja al coach logueado como el alumno demo. Desde
 * `docs/specs/vive-tu-app-directo` eso dejó de ser un problema que haya que esquivar con un QR: en
 * móvil se entra directo y el árbol del alumno trae el banner «Volver a mi panel», que devuelve la
 * sesión del coach en un toque (W2). En escritorio la hoja abre otra pestaña y el panel sigue vivo.
 * En RN el problema nunca existió: la sesión de la app es nativa.
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

    // Cada toque emite un magic link real de GoTrue. En móvil «atrás + volver a tocar» es el gesto
    // barato de todos, así que el techo va acá y no en la UI.
    const rl = await rateLimitViveTuApp(user.id)
    if (!rl.ok) {
        return {
            ok: false,
            reason: 'error',
            detail: 'Abriste tu app varias veces seguidas. Espera un momento y vuelve a intentarlo.',
        }
    }

    // `device` es MEDICIÓN, no autorización (el user-agent lo escribe el cliente): sin él no se
    // puede leer la métrica del paso 2, que es `entered / opened` con `device = mobile`.
    const device = deviceFromUserAgent((await headers()).get('user-agent'))

    const admin = createServiceRoleClient()
    // La ficha del coach se lee con la sesión (RLS como techo); el demo, el link y el evento
    // necesitan `service_role`.
    const result = await createViveTuAppLink(supabase, admin, { coachId: user.id, surface: 'web', device })

    if (!result.ok) return result

    // La guía vive en `/coach/guia` desde el 22-08; el dashboard solo tiene la píldora.
    revalidatePath('/coach/guia')
    return result
}
