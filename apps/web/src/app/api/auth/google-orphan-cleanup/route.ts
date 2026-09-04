import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteGoogleOrphanAuthUser } from '@/lib/auth/google-orphan-cleanup'

/**
 * Puerta WEB de la limpieza del huérfano de Google (`lib/auth/google-orphan-cleanup.ts`).
 *
 * La llama `resolvePostGoogleAuthUrl` (cliente) cuando un login con Google termina sin fila
 * `coaches`: el navegador no tiene `service_role`, así que solo avisa; el servidor decide si el
 * usuario de la sesión es un huérfano demostrable y lo borra. Molde de `api/auth/google-link`: la
 * AUTORIZACIÓN es la sesión (cookie), sin parámetros, solo puede actuar sobre SU PROPIO usuario, y la
 * respuesta no cuenta si hubo borrado.
 */
export async function POST() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await deleteGoogleOrphanAuthUser({
        admin: createServiceRoleClient(),
        userId: user.id,
        context: 'post_google_auth',
    })

    return NextResponse.json({ ok: true })
}
