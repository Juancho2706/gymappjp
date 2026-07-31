import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Consentimiento de pool (Ley 21.719) para la app RN — espejo del gate del proxy web.
 *
 * La web fuerza el consentimiento multidisciplinario del alumno de pool en el proxy
 * (`proxy.ts:681` para /t y `proxy.ts:1041-1051` para /c vía `get_team_alumno_context`).
 * La app RN no pasa por el proxy, así que este endpoint expone el MISMO contrato:
 *
 * - GET    → estado: ¿es alumno de pool? ¿ya consintió? (+ slug/nombre del team para la UI)
 * - POST   → otorga (espejo de `grantTeamConsentAction`): inserta ambos propósitos con
 *            evidencia IP/User-Agent, idempotente si ya existen activos.
 * - DELETE → revoca (espejo de `revokeTeamConsentAction`): marca revoked_at en los
 *            propósitos activos.
 *
 * La identidad sale ÚNICAMENTE del bearer; `teamSlug` del body solo selecciona/verifica el
 * team al que el alumno ya pertenece (jamás autoriza por sí mismo). El alumno no puede
 * self-INSERT en client_consents por RLS (solo coaches del team o service-role), por eso el
 * grant corre server-side con service-role tras verificar la pertenencia — igual que la web.
 */

type DB = SupabaseClient<Database>

const CONSENT_TEXT_VERSION = 'v1'
// Espejo del CHECK de client_consents.purpose (consent.actions.ts:16).
const POOL_CONSENT_PURPOSES = ['pool_multidisciplinary_access', 'health_data_processing'] as const

const grantSchema = z.object({
    teamSlug: z.string().trim().min(1),
    accepted: z.literal(true),
})
const revokeSchema = z.object({
    teamSlug: z.string().trim().min(1),
})

function bearerToken(request: NextRequest): string | null {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function errorResponse(status: number, code: string, error: string) {
    return NextResponse.json({ ok: false, code, error }, { status })
}

type PoolContext = {
    clientId: string
    team: { id: string; slug: string; name: string | null }
    granted: boolean
}

/**
 * Deriva el contexto de pool del usuario autenticado: membership `scope='team'` activa
 * (fuente actual) con fallback legacy `clients.id = auth.uid()` + `clients.team_id` —
 * misma cascada que `grantTeamConsentAction`. Devuelve `null` si el usuario no es alumno
 * de pool (standalone/enterprise: el consentimiento no aplica).
 * `granted` = AMBOS propósitos activos (es el estado que deja el grant web; un estado
 * parcial cuenta como no-consentido y el POST inserta solo lo que falte).
 */
async function resolvePoolContext(admin: DB, userId: string): Promise<PoolContext | null> {
    const { data: memberships, error: membershipError } = await admin
        .from('client_memberships')
        .select('client_id, team_id')
        .eq('account_id', userId)
        .eq('scope', 'team')
        .eq('status', 'active')
        .is('deleted_at', null)
    if (membershipError) throw new Error('memberships_unavailable')

    let clientId: string | null = null
    let teamId: string | null = null

    if (memberships && memberships.length > 0) {
        // Si hubiera más de una membresía de pool, preferir la que coincide con
        // clients.team_id (la "principal"); si no, la primera activa.
        let picked = memberships[0]
        if (memberships.length > 1) {
            const { data: client } = await admin
                .from('clients')
                .select('team_id')
                .eq('id', userId)
                .maybeSingle()
            picked = memberships.find(m => m.team_id === client?.team_id) ?? memberships[0]
        }
        clientId = picked.client_id
        teamId = picked.team_id
    } else {
        const { data: client, error: clientError } = await admin
            .from('clients')
            .select('id, team_id')
            .eq('id', userId)
            .maybeSingle()
        if (clientError) throw new Error('client_unavailable')
        if (!client?.team_id) return null
        clientId = client.id
        teamId = client.team_id
    }

    if (!clientId || !teamId) return null

    const { data: team, error: teamError } = await admin
        .from('teams')
        .select('id, slug, name')
        .eq('id', teamId)
        .is('deleted_at', null)
        .maybeSingle()
    if (teamError) throw new Error('team_unavailable')
    if (!team) return null

    const { data: consents, error: consentsError } = await admin
        .from('client_consents')
        .select('purpose')
        .eq('client_id', clientId)
        .eq('team_id', team.id)
        .is('revoked_at', null)
        .in('purpose', [...POOL_CONSENT_PURPOSES])
    if (consentsError) throw new Error('consents_unavailable')

    const active = new Set((consents ?? []).map(r => r.purpose))
    const granted = POOL_CONSENT_PURPOSES.every(p => active.has(p))

    return { clientId, team: { id: team.id, slug: team.slug, name: team.name }, granted }
}

async function authenticate(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return { error: errorResponse(401, 'MISSING_TOKEN', 'Unauthorized') } as const
    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
        return { error: errorResponse(401, 'INVALID_TOKEN', 'Unauthorized') } as const
    }
    return { admin, userId: userData.user.id } as const
}

export async function GET(request: NextRequest) {
    const auth = await authenticate(request)
    if ('error' in auth) return auth.error
    try {
        const ctx = await resolvePoolContext(auth.admin, auth.userId)
        if (!ctx) return NextResponse.json({ ok: true, pool: false })
        return NextResponse.json({
            ok: true,
            pool: true,
            granted: ctx.granted,
            teamSlug: ctx.team.slug,
            teamName: ctx.team.name ?? '',
        })
    } catch {
        return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo consultar el consentimiento.')
    }
}

export async function POST(request: NextRequest) {
    const auth = await authenticate(request)
    if ('error' in auth) return auth.error

    const parsed = grantSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos.')

    try {
        const ctx = await resolvePoolContext(auth.admin, auth.userId)
        if (!ctx) return errorResponse(403, 'NOT_POOL_MEMBER', 'No tienes acceso a este equipo.')
        if (ctx.team.slug !== parsed.data.teamSlug) {
            return errorResponse(403, 'TEAM_MISMATCH', 'No tienes acceso a este equipo.')
        }

        // Idempotente: inserta solo los propósitos que falten (espejo consent.actions.ts:92-125).
        const { data: existing, error: existingError } = await auth.admin
            .from('client_consents')
            .select('purpose')
            .eq('client_id', ctx.clientId)
            .eq('team_id', ctx.team.id)
            .is('revoked_at', null)
            .in('purpose', [...POOL_CONSENT_PURPOSES])
        if (existingError) return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo registrar el consentimiento.')

        const already = new Set((existing ?? []).map(r => r.purpose))
        const purposes = POOL_CONSENT_PURPOSES.filter(p => !already.has(p))

        if (purposes.length > 0) {
            // account_id (client_accounts) si existe; el link duro es client_id.
            const { data: account } = await auth.admin
                .from('client_accounts')
                .select('id')
                .eq('id', auth.userId)
                .maybeSingle()

            const nowIso = new Date().toISOString()
            // Evidencia Ley 21.719: IP + User-Agent del titular al otorgar.
            const ipAddress =
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                request.headers.get('x-real-ip') ||
                null
            const userAgent = request.headers.get('user-agent') || null

            const { error: insertError } = await auth.admin.from('client_consents').insert(
                purposes.map(purpose => ({
                    client_id: ctx.clientId,
                    account_id: account?.id ?? null,
                    team_id: ctx.team.id,
                    purpose,
                    granted_at: nowIso,
                    consent_text_version: CONSENT_TEXT_VERSION,
                    granted_via: 'team_onboarding',
                    ip_address: ipAddress,
                    user_agent: userAgent,
                }))
            )
            if (insertError) {
                return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo registrar el consentimiento.')
            }
        }

        return NextResponse.json({ ok: true, granted: true })
    } catch {
        return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo registrar el consentimiento.')
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await authenticate(request)
    if ('error' in auth) return auth.error

    const parsed = revokeSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos.')

    try {
        const ctx = await resolvePoolContext(auth.admin, auth.userId)
        if (!ctx) return errorResponse(403, 'NOT_POOL_MEMBER', 'No tienes acceso a este equipo.')
        if (ctx.team.slug !== parsed.data.teamSlug) {
            return errorResponse(403, 'TEAM_MISMATCH', 'No tienes acceso a este equipo.')
        }

        // Revocación con service-role TRAS verificar identidad/pertenencia — mismo resultado
        // que la vía user-scoped de la web (policy client_consents_self_revoke); aquí no hay
        // cliente user-scoped porque la identidad viene del bearer. Forward-only: solo filas
        // con revoked_at IS NULL (el trigger trg_client_consents_guard ignora las ya revocadas).
        const { error: revokeError } = await auth.admin
            .from('client_consents')
            .update({ revoked_at: new Date().toISOString() })
            .eq('client_id', ctx.clientId)
            .eq('team_id', ctx.team.id)
            .is('revoked_at', null)
            .in('purpose', [...POOL_CONSENT_PURPOSES])
        if (revokeError) {
            return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo revocar el consentimiento.')
        }

        return NextResponse.json({ ok: true, granted: false })
    } catch {
        return errorResponse(503, 'CONSENT_UNAVAILABLE', 'No se pudo revocar el consentimiento.')
    }
}
