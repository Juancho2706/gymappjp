import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getCoachDashboardDataV2WithClient } from '@/app/coach/dashboard/_data/dashboard.queries'
import type { SubscriptionTier } from '@/lib/constants'
import { isValidInviteCode } from '@/lib/coach/invite-code'
import type { Json } from '@/lib/database.types'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function normalizeSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
    const v = String(raw ?? 'starter').toLowerCase()
    if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
    return 'starter'
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData.user

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const { data: coach, error: coachError } = await admin
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients, onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    if (coachError) {
        return NextResponse.json({ error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }

    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const dashboard = await getCoachDashboardDataV2WithClient(user.id, admin)
    const onboardingGuide =
        coach.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}
    const inviteCode = coach.invite_code?.trim() ?? ''
    const shouldConfirmPublicCode =
        isValidInviteCode(inviteCode) &&
        onboardingGuide.invite_code_confirmed !== true

    return NextResponse.json({
        coach: {
            id: coach.id,
            fullName: coach.full_name,
            brandName: coach.brand_name,
            slug: coach.slug,
            primaryColor: coach.primary_color,
            subscriptionStatus: coach.subscription_status,
            subscriptionTier: normalizeSubscriptionTier(coach.subscription_tier),
            currentPeriodEnd: coach.current_period_end,
            trialEndsAt: coach.trial_ends_at,
            maxClients: coach.max_clients,
            hasCoachLogo: Boolean(coach.logo_url?.trim()),
        },
        publicCode: {
            inviteCode,
            shouldConfirm: shouldConfirmPublicCode,
        },
        onboardingGuide,
        dashboard,
    })
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const parsed = await request.json().catch(() => null)
    if (
        parsed?.action !== 'confirm_public_code' &&
        parsed?.action !== 'persist_onboarding_guide' &&
        parsed?.action !== 'onboarding_event'
    ) {
        return NextResponse.json({ error: 'Accion invalida.', code: 'INVALID_ACTION' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData.user

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    const existing =
        coach?.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}

    if (parsed.action === 'onboarding_event') {
        const stepKey = String(parsed.stepKey ?? '')
        const eventType = String(parsed.eventType ?? '')
        const validStep =
            stepKey === 'profile_branding' ||
            stepKey === 'first_client' ||
            stepKey === 'first_plan' ||
            stepKey === 'first_checkin'
        const validEvent =
            eventType === 'step_completed' ||
            eventType === 'step_reopened' ||
            eventType === 'aha_moment' ||
            eventType === 'guide_engagement'

        if (!validStep || !validEvent) {
            return NextResponse.json({ error: 'Evento invalido.', code: 'INVALID_EVENT' }, { status: 400 })
        }

        const metadata =
            parsed.metadata != null &&
            typeof parsed.metadata === 'object' &&
            !Array.isArray(parsed.metadata)
                ? (parsed.metadata as Record<string, string | number | boolean>)
                : null

        const { error } = await admin.from('coach_onboarding_events').insert({
            coach_id: user.id,
            step_key: stepKey,
            event_type: eventType,
            metadata: metadata as Json | null,
        })

        if (error) {
            return NextResponse.json({ error: error.message, code: 'EVENT_INSERT_FAILED' }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
    }

    if (parsed.action === 'persist_onboarding_guide') {
        const incoming =
            parsed.guide != null &&
            typeof parsed.guide === 'object' &&
            !Array.isArray(parsed.guide)
                ? (parsed.guide as Record<string, unknown>)
                : {}

        const { error } = await admin
            .from('coaches')
            .update({
                onboarding_guide: {
                    ...existing,
                    ...incoming,
                } as Json,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) {
            return NextResponse.json({ error: error.message, code: 'PERSIST_FAILED' }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
    }

    const { error } = await admin
        .from('coaches')
        .update({
            onboarding_guide: {
                ...existing,
                invite_code_confirmed: true,
                invite_code_confirmed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        return NextResponse.json({ error: error.message, code: 'CONFIRM_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
