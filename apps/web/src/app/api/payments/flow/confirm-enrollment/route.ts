import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { TablesInsert } from '@/lib/database.types'
import {
    ADDON_MONTHLY_PRICE_CLP,
    BILLING_CYCLE_CONFIG,
    FLOW_ENABLED,
    getTierCapabilities,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    SELF_SERVICE_ADDONS_ENABLED,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { FlowProvider } from '@/lib/payments/providers/flow'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { getCompositeAmountClp, toBillableAddons } from '@/services/billing/addons.service'
import {
    resolveActiveDiscountSpec,
    resolveActiveDiscountDetail,
    isChargeableNetClp,
} from '@/services/billing/discount.service'
import {
    buildAcceptedRulesPayload,
    buildAddonBreakdown,
    insertBillingSnapshot,
    materializeAddonsFromPreapproval,
    tierBaseClp,
} from '@/services/billing/addon-webhook.service'
import { claimFlowEnrollment, clearFlowEnrollment } from '@/services/billing/plan-change-lock'
import { decrementCouponCycleForCharge } from '@/services/billing/coupons.service'
import type { BillableAddon } from '@/domain/billing/types'

/**
 * FASE 2 del alta recurrente por Flow (plan pagos-multigateway-flow, Ola 4 · W3).
 *
 * La Fase 1 (create-preference con gateway 'flow') enrola la tarjeta del coach en Webpay y persiste
 * `coaches.provider_customer_id`. El coach vuelve del enrolamiento a la pagina flow-processing, que
 * POST-ea a ESTE endpoint cada 4s hasta que la suscripcion queda creada. Aca:
 *   1. verificamos que la tarjeta YA quedo enrolada (customer/get),
 *   2. calculamos el monto COMPUESTO server-side (getCompositeAmountClp = UNICA fuente de plata),
 *   3. creamos la suscripcion en Flow (plans/create + subscription/create — Flow cobra la 1ra invoice
 *      al toque),
 *   4. persistimos el estado de plata (subscription_provider_external_id + active) ANTES de los hooks,
 *   5. corremos los hooks tragables (materializar add-ons, primer billing_snapshot, evento).
 *
 * El cliente NUNCA manda tier/cycle/montos: los escribio create-preference al iniciar el checkout y se
 * releen de `coaches`. Los add-ons vienen del query (elegidos en el signup) y se RE-VALIDAN aca.
 */
const schema = z.object({
    // Add-ons opcionales elegidos en el signup. Solo MODULE_KEYS; del body JAMAS se acepta monto.
    addons: z.array(z.enum(MODULE_KEYS)).optional(),
})

export async function POST(request: Request) {
    const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Billing disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        // Gate del flag de lanzamiento de Flow (server-side = gate de DINERO): con Flow OFF ningun
        // cobro Flow ocurre aunque la UI llame a este endpoint.
        if (!FLOW_ENABLED) {
            return NextResponse.json(
                { code: 'FEATURE_DISABLED', error: 'El pago con Flow no esta habilitado.' },
                { status: 403 }
            )
        }

        let body: unknown = {}
        try {
            body = await request.json()
        } catch {
            // Body vacio es aceptable (el signup pudo no elegir add-ons).
        }
        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select(
                'id, subscription_tier, billing_cycle, subscription_status, current_period_end, provider_customer_id, subscription_provider_external_id, subscription_mp_id'
            )
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }

        // IDEMPOTENCIA (reintentos del poll / doble tab): si la sub ya se creo, NO crear otra.
        // money-safety: dos subs Flow del mismo coach = DOBLE COBRO (Flow cobra al crear la sub).
        // El status devuelto es el REAL del coach (escéptico Ola 4): una sub ya creada cuya 1ra
        // invoice DECLINO quedo persistida como 'pending_payment' — responder 'active' hardcodeado
        // hacia que la pagina redirigiera al dashboard como activo a un coach sin cobro confirmado.
        if (coach.subscription_provider_external_id) {
            return NextResponse.json({
                ok: true,
                status: coach.subscription_status ?? 'active',
                alreadyCreated: true,
            })
        }

        // Sin customer enrolado no hay Fase 1 en curso: el coach no paso por create-preference (Flow).
        if (!coach.provider_customer_id) {
            return NextResponse.json({ error: 'No hay enrolamiento en curso.' }, { status: 400 })
        }

        // ── F6 (H3b): freno TERMINAL del huerfano persist-failed ──────────────────────────────────────
        // Si existe un evento 'orphan_persist_failed' de este coach, hubo una sub creada en Flow (ya cobro)
        // cuyo persist fallo. Reintentar aca crearia una 2ª sub cobrada. Se resuelve manual/reconcile → 500.
        const { data: orphanRow } = await admin
            .from('subscription_events')
            .select('id')
            .eq('coach_id', user.id)
            .eq('provider_status', 'orphan_persist_failed')
            .limit(1)
            .maybeSingle()
        if (orphanRow) {
            return NextResponse.json(
                { code: 'ORPHAN_NEEDS_RECONCILE', error: 'Tu pago requiere revision manual. Contacta soporte.' },
                { status: 500 }
            )
        }

        // ── F5 (H3a): guard de sub MP VIVA ────────────────────────────────────────────────────────────
        // Una URL stale de flow-processing (o un provider_customer_id residual) NO debe poder crear una sub
        // Flow ENCIMA de una sub MP viva (doble recurrencia). El flujo legitimo pasa: free→paid no tiene
        // mp_id; reactivacion (canceled/expired) no esta active.
        if (
            coach.subscription_status === 'active' &&
            typeof coach.subscription_mp_id === 'string' &&
            coach.subscription_mp_id.trim() !== '' &&
            coach.current_period_end != null &&
            new Date(coach.current_period_end).getTime() > Date.now()
        ) {
            return NextResponse.json(
                { code: 'ACTIVE_MP_SUBSCRIPTION', error: 'Ya tenes una suscripcion activa.' },
                { status: 409 }
            )
        }

        // ── F2 (C1): fuente de verdad del tier/cycle/addons = el INTENT durable de la Fase 1 ────────────
        // create-preference (Fase 1, Flow) escribio un intent con el tier/cycle/addons de ESTE checkout.
        // La rama free NO persiste tier/cycle en coaches (proteccion de abandono) → sin intent releeriamos
        // 'free' y el composite seria 0. Con intent presente, los addons del body se IGNORAN (el intent es
        // la fuente server-side). Sin intent (flujo viejo / back-compat) caemos al coach row, pero JAMAS
        // creamos una sub con base 'free'.
        const { data: intentRow } = await admin
            .from('subscription_events')
            .select('payload')
            .eq('provider_event_id', `flow_checkout_intent:${user.id}`)
            .maybeSingle()
        const intentPayload = (intentRow?.payload ?? null) as
            | { tier?: unknown; cycle?: unknown; addons?: unknown }
            | null

        let tier: SubscriptionTier
        let cycle: BillingCycle
        let requestedAddonsSource: string[]
        if (intentPayload) {
            tier = intentPayload.tier as SubscriptionTier
            cycle = intentPayload.cycle as BillingCycle
            requestedAddonsSource = Array.isArray(intentPayload.addons)
                ? (intentPayload.addons as string[])
                : []
            // Validaciones DURAS del intent: nunca base free; ciclo permitido para el tier. Si no cumple,
            // el intent esta corrupto/inconsistente → 409 (no crear).
            if (tier !== 'starter' && tier !== 'pro' && tier !== 'elite') {
                return NextResponse.json(
                    { code: 'INVALID_CHECKOUT_INTENT', error: 'El checkout no es valido.' },
                    { status: 409 }
                )
            }
            if (!isBillingCycleAllowedForTier(tier, cycle)) {
                return NextResponse.json(
                    { code: 'INVALID_CHECKOUT_INTENT', error: 'El checkout no es valido.' },
                    { status: 409 }
                )
            }
        } else {
            // Fallback back-compat: tier/cycle del coach row. GUARD: jamas crear una sub con base free.
            tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
            cycle = (coach.billing_cycle ?? 'monthly') as BillingCycle
            requestedAddonsSource = parsed.data.addons ?? []
            if (tier === 'free') {
                return NextResponse.json(
                    { code: 'INVALID_CHECKOUT_INTENT', error: 'El checkout no es valido.' },
                    { status: 409 }
                )
            }
        }

        // F9 (M2): gate de add-ons en Fase 2. Con SELF_SERVICE_ADDONS_ENABLED OFF, los add-ons (del intent
        // o del body) se materializan como [] — espejo del fail-closed de create-preference. NO 403: el alta
        // del plan base sigue.
        const requestedAddons = SELF_SERVICE_ADDONS_ENABLED
            ? [...new Set(requestedAddonsSource.filter((k): k is ModuleKey => MODULE_KEYS.includes(k as ModuleKey)))]
            : []
        // Coherencia D8: nutrition_exchanges solo si el tier admite nutricion; si no cumple, se FILTRA en
        // silencio — un add-on incoherente NO debe matar el alta (a diferencia de create-preference, que
        // corta con 400 en el paso interactivo).
        const addonsValidados = requestedAddons.filter(
            (k) => !(k === 'nutrition_exchanges' && !getTierCapabilities(tier).canUseNutrition)
        )

        // getPaymentsProvider('flow') devuelve el puerto; casteamos a FlowProvider para los metodos del
        // flujo de DOS FASES (getCustomerEnrollmentStatus / createSubscriptionForEnrolledCustomer) que
        // NO viven en el puerto PaymentsProvider (MP es de una sola fase).
        const flow = getPaymentsProvider('flow')
        const flowProvider = flow as FlowProvider

        // Fase 2a — ¿la tarjeta ya quedo enrolada? La tarjeta puede tardar unos segundos en reflejarse
        // tras el redirect; si aun no, respondemos { enrolled:false } y la pagina sigue poll-eando.
        let enrollment: { enrolled: boolean }
        try {
            enrollment = await flowProvider.getCustomerEnrollmentStatus(coach.provider_customer_id)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Flow customer status failed'
            return NextResponse.json({ error: message }, { status: 502 })
        }
        if (!enrollment.enrolled) {
            return NextResponse.json({ ok: true, enrolled: false })
        }

        // Cupon vivo re-resuelto server-side (mismo chokepoint que create-preference). null = sin cupon.
        const discountSpec = await resolveActiveDiscountSpec(admin, user.id)

        // Monto COMPUESTO: base del tier + Σ add-ons facturables (filas vivas UNIDAS a los add-ons del
        // signup, que aun no tienen fila — las materializa el hook de abajo al confirmar). El cliente
        // jamas manda montos.
        const liveAddons = await listLive(admin, user.id)
        const billableByKey = new Map<ModuleKey, BillableAddon>(
            toBillableAddons(liveAddons).map((a) => [a.moduleKey, a])
        )
        for (const key of addonsValidados) {
            if (!billableByKey.has(key)) {
                billableByKey.set(key, { moduleKey: key, priceClpMensual: ADDON_MONTHLY_PRICE_CLP })
            }
        }
        const billableAddons = [...billableByKey.values()]

        const composite = getCompositeAmountClp(tier, cycle, billableAddons, discountSpec)
        const amountClp = composite.totalClp
        if (!isChargeableNetClp(amountClp)) {
            return NextResponse.json(
                {
                    code: 'NET_NOT_CHARGEABLE',
                    error: 'Un descuento del 100% no se cobra por este medio; se gestiona como cortesia interna.',
                },
                { status: 400 }
            )
        }

        // webhookUrl DEL PLAN: donde Flow notifica los cobros RECURRENTES de este plan (money-critical).
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const flowWebhookToken = process.env.FLOW_WEBHOOK_TOKEN
        const webhookUrl = flowWebhookToken
            ? `${appUrl}/api/payments/flow/webhook?token=${encodeURIComponent(flowWebhookToken)}`
            : `${appUrl}/api/payments/flow/webhook`

        // ── Claim ATOMICO de la ventana de creacion (TOCTOU, panel/juez Ola 4) ──────────────────────
        // Dos POSTs simultaneos (doble tab / polls solapados de la pagina cada 4s) pasarian AMBOS el
        // check de idempotencia de arriba (external_id aun null) y crearian DOS subs en Flow — que
        // cobra al crear → DOBLE COBRO. Solo el que gana el UNIQUE crea; el perdedor responde
        // `creating:true` (la pagina sigue poll-eando y el proximo ciclo ve alreadyCreated).
        if (!(await claimFlowEnrollment(admin, user.id))) {
            return NextResponse.json({ ok: true, enrolled: true, creating: true })
        }

        // ── F3 (H1): TOCTOU residual del claim ────────────────────────────────────────────────────────
        // El guard de idempotencia de arriba se leyo ANTES del claim. Entre esa lectura y ganar el claim,
        // otro POST pudo crear-persistir-liberar la sub (secuencia legitima del poll). Releemos el
        // external_id FRESCO (service-role); si ya esta seteado, otra request completo la creacion →
        // liberar el claim y responder alreadyCreated. Sin esta re-verificacion crearia una 2ª sub (doble cobro).
        const { data: freshCoach } = await admin
            .from('coaches')
            .select('subscription_provider_external_id, subscription_status')
            .eq('id', user.id)
            .maybeSingle()
        if (freshCoach?.subscription_provider_external_id) {
            await clearFlowEnrollment(admin, user.id).catch(() => {})
            // status REAL (no 'active' hardcodeado): la sub creada por la otra request pudo quedar
            // 'pending_payment' (1ra invoice declinada) — la pagina no debe redirigir como activo.
            return NextResponse.json({
                ok: true,
                status: freshCoach.subscription_status ?? 'active',
                alreadyCreated: true,
            })
        }

        // Fase 2b — crear la suscripcion (plans/create + subscription/create). Flow cobra la 1ra invoice
        // al toque; `firstInvoice` viene pagada en la respuesta.
        let result
        try {
            result = await flowProvider.createSubscriptionForEnrolledCustomer({
                customerId: coach.provider_customer_id,
                tier,
                cycle,
                amountClp,
                planLabel: `Suscripcion ${TIER_CONFIG[tier].label} ${BILLING_CYCLE_CONFIG[cycle].label} (EVA)`,
                webhookUrl,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Flow subscription create failed'
            // ⚠️ Liberar el claim SOLO ante un rechazo DEFINITIVO de la API de Flow (nuestro parseError
            // formatea `Flow <service> failed (HTTP ...)` = Flow respondio y NO creo). Un error AMBIGUO
            // (timeout/red: el fetch tiro sin respuesta HTTP) puede significar que Flow SI creo la sub
            // y se perdio la respuesta — Flow no expone idempotency key en subscription/create, asi que
            // reintentar crearia una 2ª sub cobrada (residual del escéptico Ola 4). En el caso ambiguo
            // el claim queda vivo y su TTL (5 min) es la recuperacion: si la sub no existe, el proximo
            // intento post-TTL la crea; si existe, el reconcile/soporte la detecta.
            const definitiveFlowRejection = /failed \(HTTP /.test(message)
            if (definitiveFlowRejection) {
                await clearFlowEnrollment(admin, user.id).catch(() => {})
            }
            console.error('[payments.flow.confirm-enrollment] createSubscription failed', {
                traceId,
                coachId: user.id,
                definitiveFlowRejection,
                message,
            })
            return NextResponse.json({ error: message }, { status: 502 })
        }

        // F7 (M): si la tarjeta declino el cargo inmediato, Flow reintenta (charges_retries_number=3) y el
        // webhook de invoice pagada activa (rama recurrente del pipeline). NO damos acceso full sin cobro:
        // el estado queda 'pending_payment' y sin current_period_end hasta que se confirme el pago.
        const finalStatus = result.firstInvoice?.paid ? 'active' : 'pending_payment'

        // Persistir el ESTADO DE PLATA primero, DURO (patron canonico: si esto falla, 500 ANTES de los
        // hooks tragables — el coach no queda a medias). UN update service-role.
        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_provider: 'flow',
                subscription_provider_external_id: result.subscriptionId,
                provider_plan_id: result.planId,
                payment_provider: 'flow',
                subscription_status: finalStatus,
                current_period_end: result.firstInvoice?.paid ? result.periodEnd : null,
                subscription_tier: tier,
                billing_cycle: cycle,
                max_clients: getTierMaxClients(tier),
                // F4 (H2): el coach ahora es Flow. Limpiar cualquier subscription_mp_id rancio: si conservara
                // el preapproval id viejo de MP, el webhook 'cancelled' de MP (gatillado por NUESTRO propio
                // cancel en Fase 1) matchearia al coach y lo tumbaria a canceled DESPUES de activarlo.
                // superseded_mp_preapproval_id NO se toca (backstop de retry del cancel).
                subscription_mp_id: null,
            })
            .eq('id', user.id)

        if (updateError) {
            // ⚠️ Estado critico: la sub EXISTE en Flow (ya cobro) pero el persist fallo. NO liberamos el
            // claim: su TTL (5 min) frena que un reintento inmediato cree una SEGUNDA sub. Dejamos rastro
            // durable del subscriptionId huerfano para reconciliacion manual/cron (best-effort).
            console.error('[payments.flow.confirm-enrollment] PERSIST FAILED after Flow sub created', {
                traceId,
                coachId: user.id,
                subscriptionId: result.subscriptionId,
                message: updateError.message,
            })
            await admin
                .from('subscription_events')
                .upsert(
                    {
                        coach_id: user.id,
                        provider: 'flow',
                        provider_event_id: `flow:subscription:${result.subscriptionId}:orphan_persist_failed`,
                        provider_checkout_id: result.subscriptionId,
                        provider_status: 'orphan_persist_failed',
                        payload: { action: 'flow_subscription_orphan', plan_id: result.planId, tier, cycle },
                    },
                    { onConflict: 'provider_event_id' }
                )
                .then(({ error: e }) => {
                    if (e) console.error('[payments.flow.confirm-enrollment] orphan event failed too', { traceId, message: e.message })
                })
            // F6: code terminal para que la pagina flow-processing NO reintente (revision manual/reconcile).
            return NextResponse.json({ error: updateError.message, code: 'ORPHAN_PERSIST_FAILED' }, { status: 500 })
        }

        // Sub creada Y persistida: liberar el claim (el guard por external_id cubre de aca en adelante).
        await clearFlowEnrollment(admin, user.id).catch(() => {})

        // ── Hooks best-effort (el coach ya quedo activo — un fallo se LOGUEA pero NO tumba el alta) ────
        // Cada hook es idempotente con el webhook (Ola 6): la materializacion dedup por el indice unico
        // parcial y el snapshot por (provider, provider_payment_id). El reconcile diario detecta drift.

        // (a) Materializar las filas de add-ons validados (idempotente por el indice unico parcial).
        try {
            const created = await materializeAddonsFromPreapproval(
                admin,
                user.id,
                addonsValidados,
                buildAcceptedRulesPayload(cycle).version
            )
            if (created.length > 0) {
                console.info('[payments.flow.confirm-enrollment] materialized addons', {
                    traceId,
                    coachId: user.id,
                    created: created.map((a) => a.moduleKey),
                })
            }
        } catch (addonErr) {
            console.error('[payments.flow.confirm-enrollment] addon materialize failed (coach already active)', {
                traceId,
                coachId: user.id,
                message: addonErr instanceof Error ? addonErr.message : String(addonErr),
            })
        }

        // (b) Primer billing_snapshot si Flow ya cobro la 1ra invoice. Idempotente con el webhook por
        // (provider, provider_payment_id) = ('flow', 'invoice:<id>') → evidencia SERNAC garantizada aunque
        // el urlCallback de Flow (PIN Ola 6) nunca entregue la notificacion de la 1ra invoice.
        if (result.firstInvoice?.paid) {
            try {
                const chargedAt = new Date().toISOString()
                const detail = await resolveActiveDiscountDetail(admin, user.id)
                // Releer las filas vivas (ya incluyen los add-ons recien materializados) para el desglose.
                const liveForSnap = await listLive(admin, user.id)
                const breakdown = buildAddonBreakdown(liveForSnap, cycle)
                const baseClp = tierBaseClp(tier, cycle)
                await insertBillingSnapshot(admin, {
                    coachId: user.id,
                    providerPaymentId: `invoice:${result.firstInvoice.id}`,
                    chargedAt,
                    tier,
                    billingCycle: cycle,
                    kind: 'recurring',
                    provider: 'flow',
                    baseClp,
                    addons: breakdown,
                    totalClp: composite.totalClp,
                    baseBeforeDiscountClp: composite.baseBeforeDiscountClp,
                    discountClp: composite.discountClp,
                    couponCode: detail?.couponCode ?? null,
                    couponRedemptionId: detail?.redemptionId ?? null,
                })
                // F11 (L2): decrementar el ciclo del cupon EXACTAMENTE una vez por este primer cobro
                // (idempotente por el MISMO payment id que usaria el webhook: 'invoice:<id>'). Sin esto, si el
                // urlCallback de Flow nunca entrega la notificacion de la 1ra invoice, el cupon no consume el
                // ciclo → un ciclo descontado de mas (SERNAC-unsafe al reves). Best-effort.
                await decrementCouponCycleForCharge(admin, user.id, `invoice:${result.firstInvoice.id}`)
            } catch (snapErr) {
                console.error('[payments.flow.confirm-enrollment] first snapshot failed (coach already active)', {
                    traceId,
                    coachId: user.id,
                    message: snapErr instanceof Error ? snapErr.message : String(snapErr),
                })
            }
        }

        // (c) Evento de historial del alta (dedup por provider_event_id).
        try {
            const eventRow: TablesInsert<'subscription_events'> = {
                coach_id: user.id,
                provider: 'flow',
                provider_event_id: `flow:subscription:${result.subscriptionId}:created`,
                provider_checkout_id: result.subscriptionId,
                provider_status: 'authorized',
                payload: {
                    action: 'flow_subscription_created',
                    plan_id: result.planId,
                    tier,
                    cycle,
                },
            }
            await admin
                .from('subscription_events')
                .upsert(eventRow, { onConflict: 'provider_event_id' })
        } catch (eventErr) {
            console.error('[payments.flow.confirm-enrollment] event upsert failed (coach already active)', {
                traceId,
                coachId: user.id,
                message: eventErr instanceof Error ? eventErr.message : String(eventErr),
            })
        }

        // F2: intent consumido → borrarlo (best-effort). Un checkout nuevo tambien lo pisaria (onConflict),
        // pero limpiarlo al completar evita que un reintento post-exito relea un intent rancio.
        const { error: intentDelError } = await admin
            .from('subscription_events')
            .delete()
            .eq('provider_event_id', `flow_checkout_intent:${user.id}`)
        if (intentDelError) {
            console.error('[payments.flow.confirm-enrollment] intent delete failed (best-effort)', {
                traceId,
                coachId: user.id,
                message: intentDelError.message,
            })
        }

        console.info('[payments.flow.confirm-enrollment] subscription created', {
            traceId,
            coachId: user.id,
            subscriptionId: result.subscriptionId,
            planId: result.planId,
            tier,
            cycle,
            status: finalStatus,
        })

        // F7: la pagina distingue active → dashboard; pending_payment → mensaje "pago en proceso".
        return NextResponse.json({
            ok: true,
            status: finalStatus,
            periodEnd: result.firstInvoice?.paid ? result.periodEnd : null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear la suscripcion.'
        console.error('[payments.flow.confirm-enrollment] unexpected error', { traceId, message })
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
