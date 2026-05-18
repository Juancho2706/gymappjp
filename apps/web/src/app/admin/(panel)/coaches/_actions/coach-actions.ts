'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { normalizePlatformEmail, assertPlatformEmailAvailable } from '@/lib/auth/platform-email'
import { getRecommendedTier, getTierMaxClients, TIER_CONFIG } from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildExistingCoachAnnouncementEmail,
    buildTrialExpiryWarningEmail,
    buildTrialExpiredEmail,
} from '@/lib/email/transactional-templates'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

function revalidateAdmin() {
    revalidatePath('/admin/coaches', 'page')
    revalidatePath('/admin/dashboard', 'page')
    revalidateTag('admin-dashboard', 'default')
}

// ── Create Coach ─────────────────────────────────────────────────

const CreateCoachSchema = z.object({
    full_name: z.string().min(2).max(100),
    email: z.string().email(),
    temp_password: z.string().min(8),
    brand_name: z.string().min(2).max(80),
    subscription_tier: z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale']),
    billing_cycle: z.enum(['monthly', 'quarterly', 'annual']),
    trial_days: z.coerce.number().int().min(0).max(3650),
})

export type CreateCoachResult =
    | { success: true; coachId: string; slug: string; email: string; tempPassword: string }
    | { error: string }

export async function createCoachAction(
    _prev: CreateCoachResult | null,
    formData: FormData
): Promise<CreateCoachResult> {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = CreateCoachSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const { full_name, email, temp_password, brand_name, subscription_tier, billing_cycle, trial_days } = parsed.data

    // Generate unique slug
    const baseSlug = brand_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existing } = await adminClient.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existing) break
        if (attempt === 7) return { error: 'No se pudo generar un slug único para esa marca. Prueba con otro nombre.' }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminClient, email)
    if (!availability.ok) return { error: availability.error }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: emailNorm,
        password: temp_password,
        email_confirm: true,
    })
    if (authError || !authData.user) {
        return { error: authError?.message ?? 'Error al crear el usuario' }
    }

    const periodEnd = trial_days > 0
        ? new Date(Date.now() + trial_days * 86_400_000).toISOString()
        : null
    const status = trial_days > 0 ? 'trialing' : 'active'

    const { error: coachError } = await adminClient.from('coaches').insert({
        id: authData.user.id,
        full_name,
        brand_name,
        slug,
        primary_color: '#10B981',
        subscription_status: status,
        subscription_tier,
        billing_cycle,
        payment_provider: 'admin',
        max_clients: getTierMaxClients(subscription_tier),
        current_period_end: periodEnd,
        trial_ends_at: periodEnd,
    })

    if (coachError) {
        await adminClient.auth.admin.deleteUser(authData.user.id)
        return { error: coachError.message }
    }

    await logAdminAction(adminClient, 'coach.create', 'coaches', authData.user.id, {
        tier: subscription_tier,
        trial_days,
        status,
        slug,
    })
    revalidateAdmin()

    return { success: true, coachId: authData.user.id, slug, email: emailNorm, tempPassword: temp_password }
}

const UpdateCoachSchema = z.object({
    coachId: z.string().uuid(),
    full_name: z.string().min(1).optional(),
    brand_name: z.string().min(1).optional(),
    subscription_tier: z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale']).optional(),
    subscription_status: z.enum(['active', 'trialing', 'canceled', 'pending_payment', 'expired', 'past_due', 'paused']).optional(),
    max_clients: z.coerce.number().int().min(1).max(500).optional(),
    billing_cycle: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    current_period_end: z.string().datetime().optional(),
    trial_ends_at: z.string().datetime().optional(),
    admin_notes: z.string().max(2000).optional(),
    payment_provider: z.enum(['beta', 'internal', 'admin', 'mercadopago', 'stripe']).optional(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function updateCoachAction(_prev: unknown, formData: FormData) {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = UpdateCoachSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const updateData: Record<string, unknown> = {}
    const fields = ['full_name', 'brand_name', 'subscription_tier', 'subscription_status', 'billing_cycle', 'current_period_end', 'trial_ends_at', 'admin_notes', 'payment_provider', 'primary_color'] as const
    for (const f of fields) {
        if (raw[f]) updateData[f] = raw[f] as string
    }
    if (raw.max_clients) updateData.max_clients = Number(raw.max_clients)

    const { error } = await adminClient.from('coaches').update(updateData).eq('id', parsed.data.coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.update', 'coaches', parsed.data.coachId, updateData)
    revalidateAdmin()
    return { success: true }
}

export async function deleteCoachAction(coachId: string) {
    const { adminClient } = await assertAdmin()

    // Delete in dependency order — CASCADE tables handled automatically,
    // but foods/nutrition_plans/saved_meals use NO ACTION and must be deleted first
    const deletions: Array<{ table: string; error: unknown }> = []
    for (const table of ['saved_meals', 'foods', 'nutrition_plans', 'clients'] as const) {
        const { error } = await adminClient.from(table).delete().eq('coach_id', coachId)
        if (error) deletions.push({ table, error })
    }
    if (deletions.length) console.error('[admin] deleteCoach: partial pre-delete failures', deletions)

    const { error: authError } = await adminClient.auth.admin.deleteUser(coachId)
    if (authError) console.error('[admin] failed to delete auth user:', authError)

    const { error: dbError } = await adminClient.from('coaches').delete().eq('id', coachId)
    if (dbError) return { error: dbError.message }

    await logAdminAction(adminClient, 'coach.delete', 'coaches', coachId, { clients_deleted: true })
    revalidateAdmin()
    return { success: true }
}

// Extend current_period_end by N days
export async function extendCoachPeriodAction(coachId: string, days: 7 | 14 | 30) {
    const { adminClient } = await assertAdmin()

    const { data: coach } = await adminClient.from('coaches').select('current_period_end').eq('id', coachId).single()
    const base = coach?.current_period_end && new Date(coach.current_period_end) > new Date()
        ? new Date(coach.current_period_end)
        : new Date()
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await adminClient.from('coaches').update({ current_period_end: newEnd }).eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.period_extend', 'coaches', coachId, { days, new_period_end: newEnd })
    revalidateAdmin()
    return { success: true }
}

// Set subscription_status = 'paused'
export async function suspendCoachAction(coachId: string, reason?: string) {
    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'paused' })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.suspend', 'coaches', coachId, { reason: reason ?? null })
    revalidateAdmin()
    return { success: true }
}

// Force expired — coach will see /reactivate on next visit.
// Also cancels the stored MP preapproval so "Ya pagué" can't bypass the block.
export async function expireCoachAction(coachId: string) {
    const { adminClient } = await assertAdmin()

    const { data: coach } = await adminClient
        .from('coaches')
        .select('subscription_mp_id')
        .eq('id', coachId)
        .maybeSingle()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'expired' })
        .eq('id', coachId)
    if (error) return { error: error.message }

    // Best-effort: cancel preapproval at provider so confirm-subscription can't reactivate with stale ID
    const mpId = coach?.subscription_mp_id?.trim()
    if (mpId) {
        try {
            const provider = getPaymentsProvider()
            await provider.cancelCheckoutAtProvider(mpId)
        } catch {
            // Non-fatal — DB is already expired, log and continue
            console.warn('[admin] expireCoach: could not cancel preapproval at provider', { coachId, mpId })
        }
    }

    await logAdminAction(adminClient, 'coach.force_expire', 'coaches', coachId, { mp_cancelled: !!mpId })
    revalidateAdmin()
    return { success: true }
}

// Reactivate + extend period
export async function reactivateCoachAdminAction(coachId: string, extendDays = 30) {
    const { adminClient } = await assertAdmin()

    const newEnd = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'active', current_period_end: newEnd })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.reactivate', 'coaches', coachId, { extend_days: extendDays })
    revalidateAdmin()
    return { success: true }
}

// Update current_period_end to a specific date
export async function updateCoachPeriodEndAction(coachId: string, newDate: string) {
    const parsed = z.string().datetime().safeParse(newDate)
    if (!parsed.success) return { error: 'Fecha inválida' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ current_period_end: newDate })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.period_end_update', 'coaches', coachId, { new_date: newDate })
    revalidateAdmin()
    return { success: true }
}

// Bulk status update
export async function bulkCoachStatusAction(coachIds: string[], status: string) {
    const statusSchema = z.enum(['active', 'trialing', 'canceled', 'pending_payment', 'expired', 'past_due', 'paused'])
    if (!statusSchema.safeParse(status).success) return { error: 'Status inválido' }
    if (!coachIds.length) return { error: 'Sin coaches seleccionados' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: status })
        .in('id', coachIds)
    if (error) return { error: error.message }

    for (const id of coachIds) {
        await logAdminAction(adminClient, 'coach.bulk_status', 'coaches', id, { status })
    }
    revalidateAdmin()
    return { success: true }
}

// Bulk tier update
export async function bulkCoachTierAction(coachIds: string[], tier: string, maxClients: number) {
    const tierSchema = z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale'])
    if (!tierSchema.safeParse(tier).success) return { error: 'Tier inválido' }
    if (!coachIds.length) return { error: 'Sin coaches seleccionados' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_tier: tier, max_clients: maxClients })
        .in('id', coachIds)
    if (error) return { error: error.message }

    for (const id of coachIds) {
        await logAdminAction(adminClient, 'coach.bulk_tier', 'coaches', id, { tier, max_clients: maxClients })
    }
    revalidateAdmin()
    return { success: true }
}

// Send announcement email to all active paid coaches about new features
// (annual billing, Growth tier, Free tier for referrals).
export async function sendAnnouncementEmailAction(): Promise<
    { success: true; sent: number; failed: number } | { error: string }
> {
    const { adminClient } = await assertAdmin()

    const { data: coaches, error } = await adminClient
        .from('coaches')
        .select('id, full_name, subscription_tier')
        .eq('subscription_status', 'active')
        .neq('subscription_tier', 'free')

    if (error) return { error: error.message }
    if (!coaches?.length) return { success: true, sent: 0, failed: 0 }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
    let sent = 0
    let failed = 0

    for (const coach of coaches) {
        // Fetch email from auth.users
        const { data: authUser } = await adminClient.auth.admin.getUserById(coach.id)
        const email = authUser?.user?.email
        if (!email) { failed++; continue }

        const { subject, html } = buildExistingCoachAnnouncementEmail({
            coachName: coach.full_name?.split(' ')[0] ?? 'Coach',
            currentTier: coach.subscription_tier ?? 'starter',
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })
        const result = await sendTransactionalEmail({ to: email, subject, html })
        if (result.ok) { sent++ } else { failed++ }
        // Small delay to respect Resend rate limits (2 req/s on free plan)
        await new Promise(r => setTimeout(r, 600))
    }

    await logAdminAction(adminClient, 'coach.announcement_email', 'coaches', 'bulk', { sent, failed })
    return { success: true, sent, failed }
}

// ── Individual Coach Email ────────────────────────────────────────

export async function sendIndividualCoachEmailAction(
    coachId: string,
    templateType: 'trial_warning' | 'trial_expired'
): Promise<{ success?: boolean; error?: string }> {
    const { adminClient } = await assertAdmin()

    const [coachRes, authUserRes] = await Promise.all([
        adminClient
            .from('coaches')
            .select('full_name, trial_ends_at, subscription_tier')
            .eq('id', coachId)
            .maybeSingle(),
        adminClient.auth.admin.getUserById(coachId),
    ])

    const coach = coachRes.data
    const email = authUserRes.data?.user?.email
    if (!coach || !email) return { error: 'Coach no encontrado o sin email.' }

    const { count: clientCount } = await adminClient
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_archived', false)

    const activeCount = clientCount ?? 0
    const recTier = getRecommendedTier(activeCount)
    const recConfig = TIER_CONFIG[recTier]
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
    const reactivateUrl = `${appUrl}/coach/reactivate?tier=${recTier}`
    const coachName = coach.full_name ?? 'Coach'
    const brandName = coachName

    let subject: string
    let html: string

    if (templateType === 'trial_warning') {
        const msLeft = coach.trial_ends_at ? new Date(coach.trial_ends_at).getTime() - Date.now() : 0
        const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
        ;({ subject, html } = buildTrialExpiryWarningEmail({
            coachName, brandName, daysLeft, activeClientCount: activeCount,
            recommendedTierLabel: recConfig.label, recommendedTierSlug: recTier,
            recommendedMaxClients: recConfig.maxClients, recommendedPriceClp: recConfig.monthlyPriceClp,
            reactivateUrl,
        }))
    } else {
        ;({ subject, html } = buildTrialExpiredEmail({
            coachName, brandName, activeClientCount: activeCount,
            recommendedTierLabel: recConfig.label, recommendedTierSlug: recTier,
            recommendedMaxClients: recConfig.maxClients, recommendedPriceClp: recConfig.monthlyPriceClp,
            reactivateUrl,
        }))
    }

    const result = await sendTransactionalEmail({ to: email, subject, html })
    if (!result.ok) return { error: result.error }

    await logAdminAction(adminClient, 'coach.manual_email_sent', 'coaches', coachId, { templateType, email })
    return { success: true }
}

// ── Subscription Event Timeline ───────────────────────────────────

export type SubscriptionEventRow = {
    id: string
    created_at: string
    provider: string | null
    provider_status: string | null
    provider_event_id: string | null
    provider_checkout_id: string | null
}

export async function getCoachSubscriptionEvents(coachId: string): Promise<SubscriptionEventRow[]> {
    const admin = createServiceRoleClient()
    const { data } = await admin
        .from('subscription_events')
        .select('id, created_at, provider, provider_status, provider_event_id, provider_checkout_id')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(10)
    return (data ?? []) as SubscriptionEventRow[]
}

export async function getCoachNotesAction(coachId: string): Promise<string> {
    await assertAdmin()
    const admin = createServiceRoleClient()
    const { data } = await admin
        .from('coaches')
        .select('admin_notes')
        .eq('id', coachId)
        .maybeSingle()
    return (data as any)?.admin_notes ?? ''
}

export async function saveCoachNotesAction(coachId: string, notes: string): Promise<void> {
    const { adminClient, user } = await assertAdmin()
    await adminClient.from('coaches').update({ admin_notes: notes }).eq('id', coachId)
    await logAdminAction(adminClient, user.email ?? 'admin', 'coach.update', 'coaches', coachId)
    revalidateAdmin()
}
