'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type TeamConsentState = {
    error?: string
}

const CONSENT_TEXT_VERSION = 'v1'

/**
 * Otorga el consentimiento de acceso multidisciplinario del pool (Ley 21.719).
 * El alumno NO puede self-INSERT en client_consents (RLS solo permite a coaches del team o
 * service-role), asi que el grant se hace server-side con service-role tras verificar que
 * el usuario autenticado ES el cliente de ESTE team. Inserta pool_multidisciplinary_access
 * + health_data_processing (mismo consentimiento de salud). Idempotente si ya existe activo.
 */
export async function grantTeamConsentAction(
    _prev: TeamConsentState,
    formData: FormData
): Promise<TeamConsentState> {
    const teamSlug = String(formData.get('team_slug') ?? '').trim()
    const accepted = formData.get('accept') === 'on' || formData.get('accept') === 'true'

    if (!teamSlug) return { error: 'Equipo no encontrado.' }
    if (!accepted) return { error: 'Debes aceptar para continuar.' }

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: 'Sesión expirada. Vuelve a ingresar.' }

    const admin = createServiceRoleClient()

    const { data: team } = await admin
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .is('deleted_at', null)
        .maybeSingle()
    if (!team) return { error: 'Equipo no encontrado.' }

    // Verifica pertenencia (membership scope='team' o fallback clients.team_id).
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
        const { data: client } = await admin
            .from('clients')
            .select('id, team_id')
            .eq('id', user.id)
            .maybeSingle()
        if (!client || client.team_id !== team.id) return { error: 'No tienes acceso a este equipo.' }
        clientId = client.id
    }

    // account_id (client_accounts) si existe; si no, null (el link duro es client_id).
    const { data: account } = await admin
        .from('client_accounts')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
    const accountId = account?.id ?? null

    // Evita duplicados activos.
    const { data: existing } = await admin
        .from('client_consents')
        .select('purpose')
        .eq('client_id', clientId)
        .eq('team_id', team.id)
        .is('revoked_at', null)
        .in('purpose', ['pool_multidisciplinary_access', 'health_data_processing'])

    const already = new Set((existing ?? []).map(r => r.purpose))
    const purposes = (['pool_multidisciplinary_access', 'health_data_processing'] as const).filter(p => !already.has(p))

    if (purposes.length > 0) {
        const nowIso = new Date().toISOString()
        const { error: insertError } = await admin.from('client_consents').insert(
            purposes.map(purpose => ({
                client_id: clientId!,
                account_id: accountId,
                team_id: team.id,
                purpose,
                granted_at: nowIso,
                consent_text_version: CONSENT_TEXT_VERSION,
                granted_via: 'team_onboarding',
            }))
        )
        if (insertError) return { error: 'No se pudo registrar el consentimiento. Intenta de nuevo.' }
    }

    // Redirect server-side (evita el race del client push + el doble-submit). El proxy /t,
    // con has_pool_consent=true, deja pasar a la app del alumno con marca del team.
    redirect(`/t/${teamSlug}/dashboard`)
}
