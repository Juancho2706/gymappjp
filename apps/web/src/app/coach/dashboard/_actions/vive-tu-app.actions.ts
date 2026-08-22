'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { createViveTuAppLink } from '@/services/onboarding/vive-tu-app.service'

/**
 * «Vive tu app» — paso 2 de la guía v2 (SPEC coach-onboarding-v2 §5), entrada WEB.
 *
 * El núcleo (magic link del alumno de ejemplo + evento del funnel) vive en
 * `services/onboarding/vive-tu-app.service.ts` desde W5: la app móvil abre exactamente el mismo
 * link por `POST /api/mobile/coach/vive-tu-app` y no puede haber dos versiones de esta decisión.
 * Acá queda lo que es de la WEB: la sesión por cookies, el cliente admin y el `revalidatePath`.
 *
 * ⚠️ La sesión de Supabase vive en cookies compartidas por todo el host (`lib/supabase/server.ts`):
 * verificar el link en ESTE navegador lo deja logueado como el alumno demo y el coach tiene que
 * volver a entrar a su panel. Por eso la UI ofrece primero el QR (el celular no tiene la sesión del
 * panel) y avisa antes de abrirlo acá. En RN el problema no existe: la sesión de la app es nativa.
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

    const admin = createServiceRoleClient()
    // La ficha del coach se lee con la sesión (RLS como techo); el demo, el link y el evento
    // necesitan `service_role`.
    const result = await createViveTuAppLink(supabase, admin, { coachId: user.id, surface: 'web' })

    if (!result.ok) return result

    revalidatePath('/coach/dashboard')
    return result
}
