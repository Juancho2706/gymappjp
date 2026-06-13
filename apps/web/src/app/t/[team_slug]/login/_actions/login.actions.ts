'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { ClientLoginSchema } from '@eva/schemas'
import { z } from 'zod'

// Espeja ClientLoginSchema (/c) — mismas reglas de email+password; el pool usa team_slug
// en vez de coach_slug, asi que se reusa la base y se cambia ese unico campo.
const TeamClientLoginSchema = ClientLoginSchema.omit({ coach_slug: true }).extend({
    team_slug: z.string().trim().min(1),
})

export type TeamLoginState = {
    error?: string
    success?: boolean
    redirectUrl?: string
}

/**
 * Login del alumno de pool — team-scoped (un link `/t/[team_slug]/login` para todos los alumnos
 * del pool). Tras autenticar, verifica que el usuario sea miembro activo de ESTE team
 * (fuente: client_memberships scope='team'; fallback: clients.team_id) y lo manda al area del team.
 * El proxy /t mantiene la URL en /t/[team]/* y reescribe a la app del alumno (/c) con branding del pool.
 * Zero-regresion: ruta nueva. Standalone/enterprise siguen con /c y /e respectivamente.
 * No setea workspace (el proxy resuelve por RPC) -> no toca el union WorkspaceType.
 */
export async function teamClientLoginAction(
    _prev: TeamLoginState,
    formData: FormData
): Promise<TeamLoginState> {
    const parsed = TeamClientLoginSchema.safeParse({
        email: formData.get('email') ?? '',
        password: formData.get('password') ?? '',
        team_slug: formData.get('team_slug') ?? '',
    })
    if (!parsed.success) {
        return { error: 'Completa tu email y contraseña.' }
    }

    const { email, password, team_slug: teamSlug } = parsed.data

    const supabase = await createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
        return { error: 'Email o contraseña incorrectos.' }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return { error: 'Error al obtener sesión.' }
    }

    const admin = createServiceRoleClient()

    const { data: team } = await admin
        .from('teams')
        .select('id, name, slug')
        .eq('slug', teamSlug)
        .is('deleted_at', null)
        .maybeSingle()

    if (!team) {
        await supabase.auth.signOut()
        return { error: 'Equipo no encontrado.' }
    }

    // Fuente de verdad: membership activa scope='team' en ESTE team (identity-split).
    const { data: membership } = await admin
        .from('client_memberships')
        .select('client_id')
        .eq('account_id', user.id)
        .eq('team_id', team.id)
        .eq('scope', 'team')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    let clientId: string | null = membership?.client_id ?? null

    if (!clientId) {
        // Fallback (compat): derivar del registro clients por team_id.
        const { data: client } = await admin
            .from('clients')
            .select('id, team_id')
            .eq('id', user.id)
            .maybeSingle()
        if (!client || client.team_id !== team.id) {
            await supabase.auth.signOut()
            return { error: 'No tienes acceso a este equipo.' }
        }
        clientId = client.id
    }

    // Guard de estado de cuenta (pausa/suspensión en clients).
    const { data: clientState } = await admin
        .from('clients')
        .select('is_active, is_archived')
        .eq('id', clientId)
        .maybeSingle()
    if (clientState?.is_active === false || clientState?.is_archived === true) {
        await supabase.auth.signOut()
        return { error: 'Tu cuenta está pausada. Contacta a tu equipo.' }
    }

    return { success: true, redirectUrl: `/t/${teamSlug}/dashboard` }
}
