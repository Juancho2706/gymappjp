import { NextRequest, NextResponse } from 'next/server'
import {
    applyMobileClientScope,
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../_mutation-auth'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildClientArchivedEmail, buildClientUnarchivedEmail } from '@/lib/email/transactional-templates'
import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    const a = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in a) return a.error
    if (!(await mobileContextOwnsClient(a, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }
    const { data: coachProfile, error: coachLookupError } = await a.admin
        .from('coaches')
        .select('id')
        .eq('id', clientId)
        .maybeSingle()
    if (coachLookupError) {
        return NextResponse.json({ error: 'No se pudo verificar la identidad del alumno.', code: 'COACH_LOOKUP_FAILED' }, { status: 500 })
    }
    if (coachProfile) {
        const { error } = await applyMobileClientScope(a.admin.from('clients').delete().eq('id', clientId), a)
        if (error) return NextResponse.json({ error: error.message, code: 'DELETE_FAILED' }, { status: 500 })
    } else {
        // GoTrue elimina en cascada la identidad de alumno. No borrar primero la fila:
        // si GoTrue falla, debemos conservar un estado reintentable y reportar el error.
        const { error } = await a.admin.auth.admin.deleteUser(clientId)
        if (error) return NextResponse.json({ error: error.message, code: 'AUTH_DELETE_FAILED' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    const a = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in a) return a.error
    if (!(await mobileContextOwnsClient(a, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }
    const patch: { is_active?: boolean; is_archived?: boolean } = {}
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
    if (typeof body.is_archived === 'boolean') patch.is_archived = body.is_archived
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar.', code: 'NO_FIELDS' }, { status: 400 })
    if (patch.is_archived === false && a.scope.type === 'standalone') {
        const [{ data: coach }, { count, error: countError }] = await Promise.all([
            a.admin.from('coaches').select('subscription_tier, max_clients').eq('id', a.userId).maybeSingle(),
            applyMobileClientScope(
                a.admin.from('clients').select('id', { count: 'exact', head: true }).eq('is_archived', false),
                a,
            ),
        ])
        if (countError) return NextResponse.json({ error: 'No pudimos validar el límite de alumnos de tu plan.', code: 'CLIENT_LIMIT_CHECK_FAILED' }, { status: 500 })
        const tier = (coach?.subscription_tier ?? 'free') as SubscriptionTier
        const maxClients = coach?.max_clients ?? getTierMaxClients(tier)
        if ((count ?? 0) >= maxClients) {
            return NextResponse.json({ error: `Tu plan permite ${maxClients} alumnos activos. Archiva otro alumno o actualiza tu plan.`, code: 'UPGRADE_REQUIRED' }, { status: 402 })
        }
    }
    const { error } = await applyMobileClientScope(a.admin.from('clients').update(patch).eq('id', clientId), a)
    if (error) return NextResponse.json({ error: error.message, code: 'UPDATE_FAILED' }, { status: 500 })
    if (typeof patch.is_archived === 'boolean') {
        const [{ data: client }, { data: coach }, authUser] = await Promise.all([
            applyMobileClientScope(a.admin.from('clients').select('full_name, email').eq('id', clientId), a).maybeSingle(),
            a.admin.from('coaches').select('full_name, brand_name, slug, invite_code, subscription_tier, primary_color, logo_url').eq('id', a.userId).maybeSingle(),
            a.admin.auth.admin.getUserById(a.userId),
        ])
        let team: { name: string; slug: string } | null = null
        if (a.scope.type === 'team') {
            const { data } = await a.admin.from('teams').select('name, slug').eq('id', a.scope.teamId).maybeSingle()
            team = data
        }
        if (client?.email && coach) {
            const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
            const publicPath = team ? `/t/${team.slug}` : `/c/${getCoachPublicIdentifier(coach)}`
            const brandName = team?.name ?? coach.brand_name ?? coach.full_name ?? 'EVA'
            const emailBrand = resolveStudentEmailBranding({
                isStandalone: a.scope.type === 'standalone',
                tier: coach.subscription_tier,
                logoUrl: coach.logo_url,
                primaryColor: coach.primary_color,
            })
            const email = patch.is_archived
                ? buildClientArchivedEmail({
                    clientName: client.full_name,
                    coachBrandName: brandName,
                    coachName: coach.full_name ?? 'Tu entrenador',
                    coachEmail: authUser.data.user?.email ?? null,
                    coachPublicUrl: `${appUrl}${publicPath}`,
                    logoUrl: emailBrand.logoUrl,
                    primaryColor: emailBrand.primaryColor,
                })
                : buildClientUnarchivedEmail({
                    clientName: client.full_name,
                    coachBrandName: brandName,
                    coachName: coach.full_name ?? 'Tu entrenador',
                    loginUrl: `${appUrl}${publicPath}/login`,
                    logoUrl: emailBrand.logoUrl,
                    primaryColor: emailBrand.primaryColor,
                })
            sendTransactionalEmail({ to: client.email, subject: email.subject, html: email.html }).catch(() => null)
        }
    }
    return NextResponse.json({ ok: true })
}
