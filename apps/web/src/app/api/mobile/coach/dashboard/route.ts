import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getCoachDashboardDataV2WithClient } from '@/app/coach/dashboard/_data/dashboard.queries'
import type { SubscriptionTier } from '@/lib/constants'
import { isValidInviteCode, needsPublicCodeConfirmation } from '@/lib/coach/invite-code'
import type { Json } from '@/lib/database.types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolveMobileCoachDataScope } from '@/app/api/mobile/coach/clients/_mutation-auth'
import { ONBOARDING_STEP_KEYS } from '@eva/onboarding'
import { loadOnboardingV2ApiData } from '@/services/onboarding/onboarding-v2.queries'
import { parseOnboardingGuide } from '@/app/coach/dashboard/_lib/onboarding-guide-state'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/**
 * Pasos y tipos aceptados por `action: 'onboarding_event'`. ESPEJO de `/api/coach/onboarding-events`
 * (la ruta web, que valida con zod) y, por lo tanto, del CHECK de `coach_onboarding_events`
 * (migración 20260822002122). Antes acá vivían los 4 valores del checklist v1: cualquier evento de
 * la guía v2 emitido desde la app moría en 400 y RN quedaba fuera de la medición.
 */
const MOBILE_EVENT_STEP_KEYS: readonly string[] = [
    ...ONBOARDING_STEP_KEYS,
    'first_plan',
    'first_checkin',
    'persona',
]

const MOBILE_EVENT_TYPES: readonly string[] = [
    'step_completed',
    'step_reopened',
    'aha_moment',
    'guide_engagement',
    'persona_selected',
    'demo_seeded',
    'demo_deleted',
    'vive_tu_app_opened',
    'invite_link_copied',
    'invite_whatsapp_opened',
    'onboarding_dismissed',
    'first_module_opened',
]

function normalizeSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
    const v = String(raw ?? 'free').toLowerCase()
    // LEGACY (plan 04): es PARSE del valor crudo de DB, no venta. Reconoce los 6 valores del CHECK
    // (incluye growth/scale grandfathered + placeholders team/org_managed). NO bajar a sale tiers.
    if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
    return 'free'
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    // GET read-only: verificación LOCAL del JWT (jose) con fallback a getUser ante JWKS caído.
    // Los POST/mutaciones de abajo NO se migran (revocation-sensitive) -> siguen con getUser.
    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    const userId = auth.userId
    const admin = createServiceRoleClient()

    const { data: coach, error: coachError } = await admin
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients, onboarding_guide, persona, persona_also_other, theme_preset_key, created_at')
        .eq('id', userId)
        .maybeSingle()

    if (coachError) {
        return NextResponse.json({ error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }

    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const dataScope = await resolveMobileCoachDataScope(admin, userId, request.nextUrl.searchParams)
    if (!dataScope) {
        return NextResponse.json({ error: 'Workspace no autorizado para dashboard coach.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    const preferredWorkspace = await resolvePreferredWorkspace(admin, userId)
    const orgId = dataScope.type === 'enterprise' ? dataScope.orgId : null
    const teamId = dataScope.type === 'team' ? dataScope.teamId : null

    // El bloque `onboardingV2` (persona + gate + demo + señales de la guía) sale en PARALELO con
    // el dashboard: la app lo consume en la misma vuelta y no puede costarle un round-trip extra
    // al panel. Las señales son las MISMAS que pinta la guía web (servicio compartido).
    const [dashboard, onboardingV2Data] = await Promise.all([
        getCoachDashboardDataV2WithClient(userId, admin, { orgId, teamId }),
        loadOnboardingV2ApiData(
            admin,
            userId,
            {
                persona: coach.persona ?? null,
                personaAlsoOther: coach.persona_also_other === true,
                coachCreatedAt: coach.created_at ?? null,
                subscriptionStatus: coach.subscription_status ?? null,
                workspaceType: preferredWorkspace?.type ?? null,
            },
            {
                logo_url: coach.logo_url ?? null,
                theme_preset_key: coach.theme_preset_key ?? null,
                primary_color: coach.primary_color ?? null,
            },
        ),
    ])
    const onboardingGuide =
        coach.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}
    const guide = parseOnboardingGuide(coach.onboarding_guide)
    const inviteCode = coach.invite_code?.trim() ?? ''
    // Solo a quien pudo repartir el link viejo `/c/<slug>` (coach anterior al corte de códigos
    // públicos): el coach nuevo nace con código y no confirma nada (QA del owner 22-08: el modal
    // «Tu link de alumnos cambió» le salía a todo coach recién creado).
    const shouldConfirmPublicCode = needsPublicCodeConfirmation({
        inviteCode,
        generated: false,
        inviteCodeConfirmed: onboardingGuide.invite_code_confirmed === true,
        createdAt: coach.created_at,
    })

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
        workspace: {
            type: preferredWorkspace?.type ?? (dataScope.type === 'enterprise' ? 'enterprise_coach' : dataScope.type === 'team' ? 'coach_team' : 'coach_standalone'),
            orgId,
            teamId,
        },
        publicCode: {
            inviteCode,
            shouldConfirm: dataScope.type === 'standalone' && shouldConfirmPublicCode,
        },
        onboardingGuide,
        /**
         * CONTRATO FIJO del onboarding v2 para RN (W5). `guide` es el subconjunto de
         * `coaches.onboarding_guide` que la app necesita, parseado con el MISMO parser que la web
         * (`parseOnboardingGuide`); el jsonb crudo sigue viajando en `onboardingGuide` para lo
         * demás (`emitted`, `ahaMomentSent`, `invite_code_confirmed`, inventario del demo).
         */
        onboardingV2: {
            ...onboardingV2Data,
            guide: {
                completed: guide.completed,
                dismissed: guide.dismissed,
                hidden: guide.hidden,
                guideSeenAt: guide.guideSeenAt,
            },
        },
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

    const workspace = await resolvePreferredWorkspace(admin, user.id)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return NextResponse.json({ error: 'Workspace no autorizado para dashboard coach.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    if (workspace.type === 'enterprise_coach') {
        return NextResponse.json({ error: 'Accion administrada por la empresa.', code: 'WORKSPACE_ACTION_NOT_ALLOWED' }, { status: 403 })
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
        const validStep = MOBILE_EVENT_STEP_KEYS.includes(stepKey)
        const validEvent = MOBILE_EVENT_TYPES.includes(eventType)

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
