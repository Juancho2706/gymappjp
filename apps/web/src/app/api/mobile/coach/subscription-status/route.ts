import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import {
    getAddonCycleAmountClp,
    getCompositeAmountClp,
    toBillableAddons,
} from '@/services/billing/addons.service'
import { resolveActiveDiscountDetail } from '@/services/billing/discount.service'
import { countActiveStandaloneClients } from '@/services/billing/capacity.service'
import { CHANGE_CARD_ENABLED, getTierPriceClp, type BillingCycle, type SubscriptionTier } from '@/lib/constants'

/**
 * Bridge móvil READ-ONLY del estado de suscripción rico (E7-03). Espejo bearer de
 * `/api/payments/subscription-status` (cookie-auth, web-only): la app RN habla HTTP directo y NO
 * tiene la sesión de cookie que aquel usa. Reusa los MISMOS services de billing (cero duplicación
 * de precios — la UI nunca calcula montos), con dos diferencias forzadas por el bridge:
 *   1. auth por Bearer (verifyMobileBearer, GET read-only con fallback getUser) + service-role.
 *   2. el cupón se resuelve con `resolveActiveDiscountDetail(admin, coachId)` (coachId explícito),
 *      NO con la RPC `resolve_active_discount` (que usa `auth.uid()` interno → null con service-role).
 *
 * TODAS las acciones de cobro (upgrade/cancel/cambiar tarjeta/add-ons) siguen siendo WEB-ONLY: este
 * endpoint solo expone el DISPLAY; la app abre el navegador externo a las URLs reales de la web.
 *
 * Coach "managed" (org/team): sin billing self-service → `{ managed: true, managedBy }`, sin exponer
 * montos (defensa en profundidad; el cliente igual decide por `useWorkspace().isManaged`).
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function normalizeCycle(raw: string | null): BillingCycle {
    if (raw === 'monthly' || raw === 'quarterly' || raw === 'annual') return raw
    return 'monthly'
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    // GET read-only: verificación LOCAL del JWT (jose) con fallback a getUser ante JWKS caído.
    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    const userId = auth.userId
    const admin = createServiceRoleClient()

    const { data: coach, error } = await admin
        .from('coaches')
        .select(
            'id, subscription_tier, subscription_status, max_clients, billing_cycle, current_period_end, subscription_provider, card_last4, card_brand'
        )
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message, code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }
    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    // Coach gestionado por org (enterprise) o team (pool): su plan/módulos los fija el contrato — sin
    // billing self-service. No exponemos montos; el cliente muestra el candado (managedBy).
    const status = coach.subscription_status ?? ''
    if (status === 'org_managed' || status === 'team_managed') {
        return NextResponse.json({
            managed: true,
            managedBy: status === 'team_managed' ? 'team' : 'org',
            subscriptionStatus: status,
        })
    }

    const { data: events } = await admin
        .from('subscription_events')
        .select('id, provider_status, provider, created_at, provider_checkout_id, payload')
        .eq('coach_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

    // Add-ons vivos del coach + billing compuesto — EL ÚNICO origen de montos de la UI (nunca calcula
    // precios). Tolerante a fallos: si la lectura de add-ons falla, el resto de la respuesta sigue viva.
    const tier = coach.subscription_tier as SubscriptionTier
    const cycle = normalizeCycle(coach.billing_cycle)
    let addons: Awaited<ReturnType<typeof listLive>> = []
    try {
        addons = await listLive(admin, userId)
    } catch {
        addons = []
    }
    const billable = toBillableAddons(addons)
    const baseClp = getTierPriceClp(tier, cycle)
    const addonsClp = billable.reduce(
        (sum, a) => sum + getAddonCycleAmountClp(a.priceClpMensual, cycle),
        0
    )

    // Cupón vivo por coachId explícito (service-role): la RPC de la web usa auth.uid() → aquí sería
    // null. El precio MOSTRADO == el COBRADO (SERNAC). Tolerante a fallos: si falla, sin descuento.
    let couponSpec = null
    let couponCode: string | null = null
    try {
        const detail = await resolveActiveDiscountDetail(admin, userId)
        couponSpec = detail?.spec ?? null
        couponCode = detail?.couponCode ?? null
    } catch {
        couponSpec = null
    }
    const composite = getCompositeAmountClp(tier, cycle, billable, couponSpec)
    const totalClp = composite.totalClp

    // Alumnos activos standalone (mismo filtro canónico que el cap gate). Tolerante a fallos.
    let activeClientCount = 0
    try {
        activeClientCount = await countActiveStandaloneClients(admin, userId)
    } catch {
        activeClientCount = 0
    }

    return NextResponse.json({
        managed: false,
        coach: {
            id: coach.id,
            subscriptionTier: coach.subscription_tier,
            subscriptionStatus: coach.subscription_status,
            maxClients: coach.max_clients,
            billingCycle: cycle,
            currentPeriodEnd: coach.current_period_end,
            subscriptionProvider: coach.subscription_provider,
            cardLast4: coach.card_last4,
            cardBrand: coach.card_brand,
        },
        // Vista mínima para el display (mismo subconjunto que consume la UI web: estado + fuente + fechas).
        addons: addons.map((a) => ({
            moduleKey: a.moduleKey,
            status: a.status,
            source: a.source,
            firstChargedAt: a.firstChargedAt,
            expiresAt: a.expiresAt,
        })),
        events: (events ?? []).map((e) => ({
            id: e.id,
            providerStatus: e.provider_status,
            provider: e.provider,
            createdAt: e.created_at,
            providerCheckoutId: e.provider_checkout_id,
            amountClp: extractAmountClpFromEventPayload(e.payload),
        })),
        billing: {
            baseClp,
            addonsClp,
            totalClp,
            baseBeforeDiscountClp: composite.baseBeforeDiscountClp,
            discountClp: composite.discountClp,
        },
        activeCoupon: couponSpec
            ? { code: couponCode, discountClp: composite.discountClp }
            : null,
        activeClientCount,
        changeCardEnabled:
            CHANGE_CARD_ENABLED && (process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '').trim().length > 0,
    })
}

/**
 * Extrae el monto CLP del payload del evento de suscripción (jsonb heterogéneo de MP). Espejo del
 * helper de `SubscriptionContent` — lo hacemos server-side para que la app no parsee jsonb crudo.
 */
function extractAmountClpFromEventPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const candidates = [
        root.transaction_amount,
        (root.auto_recurring as Record<string, unknown> | undefined)?.transaction_amount,
        (root.data as Record<string, unknown> | undefined)?.transaction_amount,
    ]
    for (const c of candidates) {
        const n = typeof c === 'number' ? c : typeof c === 'string' ? Number.parseFloat(c) : Number.NaN
        if (!Number.isNaN(n) && n > 0) return Math.round(n)
    }
    return null
}
