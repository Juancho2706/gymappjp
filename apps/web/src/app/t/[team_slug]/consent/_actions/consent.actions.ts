'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type TeamConsentState = {
    error?: string
}

const CONSENT_TEXT_VERSION = 'v1'

// Propositos del consentimiento de pool (Ley 21.719). Espejo del CHECK de client_consents.purpose.
const POOL_CONSENT_PURPOSES = ['pool_multidisciplinary_access', 'health_data_processing'] as const

// Validacion del input del grant (Zod en cliente y servidor — regla del proyecto).
const grantConsentSchema = z.object({
    teamSlug: z.string().trim().min(1, 'Equipo no encontrado.'),
    accepted: z.literal(true, { message: 'Debes aceptar para continuar.' }),
    purposes: z.array(z.enum(POOL_CONSENT_PURPOSES)).min(1),
})

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
    const accepted = formData.get('accept') === 'on' || formData.get('accept') === 'true'

    const parsed = grantConsentSchema.safeParse({
        teamSlug: String(formData.get('team_slug') ?? ''),
        accepted,
        purposes: [...POOL_CONSENT_PURPOSES],
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }
    const { teamSlug } = parsed.data

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
        .in('purpose', [...POOL_CONSENT_PURPOSES])

    const already = new Set((existing ?? []).map(r => r.purpose))
    const purposes = POOL_CONSENT_PURPOSES.filter(p => !already.has(p))

    if (purposes.length > 0) {
        const nowIso = new Date().toISOString()
        // Evidencia Ley 21.719: IP + User-Agent del titular al otorgar (insert vía service-role).
        const hdrs = await headers()
        const ipAddress =
            hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null
        const userAgent = hdrs.get('user-agent') || null
        const { error: insertError } = await admin.from('client_consents').insert(
            purposes.map(purpose => ({
                client_id: clientId!,
                account_id: accountId,
                team_id: team.id,
                purpose,
                granted_at: nowIso,
                consent_text_version: CONSENT_TEXT_VERSION,
                granted_via: 'team_onboarding',
                ip_address: ipAddress,
                user_agent: userAgent,
            }))
        )
        if (insertError) return { error: 'No se pudo registrar el consentimiento. Intenta de nuevo.' }
    }

    // Redirect server-side (evita el race del client push + el doble-submit). El proxy /t,
    // con has_pool_consent=true, deja pasar a la app del alumno con marca del team.
    redirect(`/t/${teamSlug}/dashboard`)
}

export type RevokeConsentState = {
    error?: string
}

// Validacion del input de la revocacion (solo el slug del team — la identidad sale de auth.uid()).
const revokeConsentSchema = z.object({
    teamSlug: z.string().trim().min(1, 'Equipo no encontrado.'),
})

/**
 * Revoca el consentimiento de acceso multidisciplinario del pool (Ley 21.719) — derecho del
 * alumno a retirar su autorizacion cuando quiera. Verifica que auth.uid() ES el cliente de ESTE
 * team y marca revoked_at = now() en client_consents para AMBOS propositos
 * (pool_multidisciplinary_access + health_data_processing) que sigan activos. Forward-only: el
 * trigger trg_client_consents_guard ignora filas ya revocadas (por eso solo tocamos revoked_at IS
 * NULL). Usa el cliente user-scoped (policy client_consents_self_revoke); si falla, cae a
 * service-role tras la verificacion de identidad. Al revocar, has_pool_consent pasa a false y el
 * proxy /t devuelve al alumno a la pantalla de consentimiento.
 */
export async function revokeTeamConsentAction(
    _prev: RevokeConsentState,
    formData: FormData
): Promise<RevokeConsentState> {
    const parsed = revokeConsentSchema.safeParse({
        teamSlug: String(formData.get('team_slug') ?? ''),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }
    const { teamSlug } = parsed.data

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

    // Verifica pertenencia (membership scope='team' o fallback clients.team_id). Misma logica
    // que el grant — la identidad NUNCA sale del body, siempre de auth.uid().
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

    const nowIso = new Date().toISOString()

    // Cliente user-scoped: aplica la policy client_consents_self_revoke (clients.id = auth.uid()).
    const { error: selfRevokeError } = await supabase
        .from('client_consents')
        .update({ revoked_at: nowIso })
        .eq('client_id', clientId)
        .eq('team_id', team.id)
        .is('revoked_at', null)
        .in('purpose', [...POOL_CONSENT_PURPOSES])

    // Fallback a service-role solo si la policy user-scoped falla (account_id-linked sin
    // clients.id = auth.uid()). La identidad ya quedo verificada arriba.
    if (selfRevokeError) {
        const { error: adminRevokeError } = await admin
            .from('client_consents')
            .update({ revoked_at: nowIso })
            .eq('client_id', clientId)
            .eq('team_id', team.id)
            .is('revoked_at', null)
            .in('purpose', [...POOL_CONSENT_PURPOSES])
        if (adminRevokeError) return { error: 'No se pudo revocar el consentimiento. Intenta de nuevo.' }
    }

    // has_pool_consent ahora es false: el proxy /t devuelve al alumno a /consent.
    redirect(`/t/${teamSlug}/dashboard`)
}
