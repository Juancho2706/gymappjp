import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildClientWelcomeEmail } from '@/lib/email/transactional-templates'
import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import { createClientIdentity } from '@/infrastructure/db/client-membership.repository'

type Db = SupabaseClient<Database>

export type CreateClientData = {
    full_name: string
    email: string
    phone?: string | null
    subscription_start_date?: string | null
    temp_password: string
}

type CoachContext = {
    id: string
    slug: string
    full_name: string
    brand_name: string
    welcome_message: string | null
    /** White-label (W2): marca del coach para el email de bienvenida (solo standalone Pro+). */
    subscription_tier?: string | null
    primary_color?: string | null
    logo_url?: string | null
    /** If set, client is inserted with org_id instead of coach_id. */
    orgId?: string | null
    /** A.bis2: if set (and no orgId), client joins the team POOL (team_id + coach_id = creator). */
    teamId?: string | null
    /** Login path override (e.g. /t/[slug]/login for pool clients). Default /c/[slug]/login. */
    loginPath?: string | null
}

export type CreateClientResult =
    | { ok: true; clientId: string; loginUrl: string }
    | { ok: false; error: string; code?: 'duplicate_email' | 'db_error' | 'auth_error' }

/**
 * R3 (auditoria 2026-06-11) — clientes separados y honestos:
 * - `db`: cliente USER-scoped (sesion del coach / org admin). El INSERT en clients y el RPC de
 *   disponibilidad (SECURITY DEFINER + GRANT a authenticated) pasan RLS del usuario — igual que
 *   antes, cuando el "admin client" con cookies corria con la misma RLS sin que se notara.
 * - `authAdmin`: createServiceRoleClient() SOLO para GoTrue Admin API (createUser/deleteUser).
 */
export async function createClientInternal(
    db: Db,
    authAdmin: Db,
    coach: CoachContext,
    data: CreateClientData,
    options: { sendEmail?: boolean } = { sendEmail: true }
): Promise<CreateClientResult> {
    const emailSan = sanitizePlatformEmail(data.email)

    const availability = await assertPlatformEmailAvailable(db, data.email)
    if (!availability.ok) {
        return { ok: false, error: availability.error, code: 'duplicate_email' }
    }

    const { data: newAuthUser, error: authError } = await authAdmin.auth.admin.createUser({
        email: emailSan,
        password: data.temp_password,
        email_confirm: true,
    })

    if (authError) {
        if (isAuthDuplicateEmailMessage(authError.message)) {
            return { ok: false, error: 'Email ya registrado en la plataforma.', code: 'duplicate_email' }
        }
        console.error('createClientInternal auth error:', authError)
        return { ok: false, error: `Error al crear usuario: ${authError.message}`, code: 'auth_error' }
    }

    // Enterprise: org_id set → client goes to org pool (coach_id = null).
    // Team: team_id set → client goes to the TEAM pool (coach_id = creator; reads are collaborative).
    const clientInsert = coach.orgId
        ? {
            id: newAuthUser.user.id,
            org_id: coach.orgId,
            coach_id: null,
            full_name: data.full_name,
            email: emailSan,
            phone: data.phone ?? null,
            subscription_start_date: data.subscription_start_date ?? null,
            force_password_change: true,
        }
        : {
            id: newAuthUser.user.id,
            coach_id: coach.id,
            team_id: coach.teamId ?? null,
            full_name: data.full_name,
            email: emailSan,
            phone: data.phone ?? null,
            subscription_start_date: data.subscription_start_date ?? null,
            force_password_change: true,
        }

    const { error: dbError } = await db.from('clients').insert(clientInsert)

    if (dbError) {
        await authAdmin.auth.admin.deleteUser(newAuthUser.user.id)
        console.error('createClientInternal db error:', dbError)
        if (dbError.code === '23505') {
            return { ok: false, error: 'Email ya registrado en la plataforma.', code: 'duplicate_email' }
        }
        return { ok: false, error: 'Error al guardar alumno en base de datos.', code: 'db_error' }
    }

    // F1: materialize identity (account + membership) — non-fatal, reads fall back to clients row.
    const identity = await createClientIdentity({
        accountId: newAuthUser.user.id,
        clientId: newAuthUser.user.id,
        coachId: coach.orgId ? null : coach.id,
        orgId: coach.orgId ?? null,
        teamId: coach.orgId ? null : coach.teamId ?? null,
    })
    if (!identity.ok) console.error('createClientIdentity (non-fatal, internal):', identity.error)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    const loginPath = coach.loginPath ?? `/c/${coach.slug}/login`
    const loginUrl = appUrl
        ? `${appUrl}${loginPath}`
        : `https://app.tu-dominio.com${loginPath}`

    if (options.sendEmail !== false) {
        // White-label (W2): en imports por team/org la marca es del pool (brand_name ya viene con
        // el nombre del team) → NO usar logo/color del coach. Solo standalone Pro+ brandea el header.
        const emailBrand = resolveStudentEmailBranding({
            isStandalone: !coach.orgId && !coach.teamId,
            tier: coach.subscription_tier,
            logoUrl: coach.logo_url,
            primaryColor: coach.primary_color,
        })
        const welcomeEmail = buildClientWelcomeEmail({
            brandName: coach.brand_name,
            coachName: coach.full_name,
            clientName: data.full_name,
            loginUrl,
            tempPassword: data.temp_password,
            welcomeMessage: coach.welcome_message,
            logoUrl: emailBrand.logoUrl,
            primaryColor: emailBrand.primaryColor,
        })
        sendTransactionalEmail({
            to: emailSan,
            subject: welcomeEmail.subject,
            html: welcomeEmail.html,
        }).catch((e) => console.error('Welcome email error:', e))
    }

    return { ok: true, clientId: newAuthUser.user.id, loginUrl }
}
