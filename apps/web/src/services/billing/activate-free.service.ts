import type { Json, TablesInsert } from '@/lib/database.types'
import type { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getPaymentsProviderForCoach } from '@/lib/payments/provider'
import { getTierMaxClients, SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import type { SubscriptionTier } from '@/lib/constants'

type AdminClient = ReturnType<typeof createServiceRoleClient>

export type ActivateFreeResult =
    | { ok: true }
    | { ok: false; status: number; error: string; activeCount?: number; freeLimit?: number }

/** Superficie desde la que se disparo la bajada a Free (solo trazabilidad en la auditoria). */
export type ActivateFreeOrigin = 'web' | 'mobile'

function isAlreadyCanceledError(message: string) {
    return /already|cancelled|canceled|cancelado|invalid status|not authorized|cannot be modified/i.test(
        message
    )
}

/**
 * Baja a un coach BLOQUEADO al plan gratuito (salida del deadlock de cupo, sin pagar).
 *
 * Extraido de `/api/payments/activate-free` para que la app RN pueda ofrecer la MISMA salida via
 * `/api/mobile/coach/activate-free` sin duplicar ni una linea de la validacion de dinero. La
 * autenticacion/autorizacion del caller (sesion cookie en web, bearer en mobile) queda en cada
 * route handler; aca solo entra un `coachId` YA autorizado.
 *
 * Reglas que este service NO delega a la UI:
 *  - solo estados bloqueados (`SUBSCRIPTION_BLOCKED_STATUSES`) pueden bajar a Free por esta via,
 *  - el cupo se recuenta server-side contra alumnos activos standalone (money-safety real),
 *  - la sub del gateway se cancela por el provider PERSISTIDO del coach (Flow -> external_id,
 *    MP -> subscription_mp_id); best-effort, un fallo de cancelacion no bloquea la bajada.
 */
export async function activateFreePlanForCoach(
    admin: AdminClient,
    coachId: string,
    origin: ActivateFreeOrigin = 'web'
): Promise<ActivateFreeResult> {
    const { data: coach } = await admin
        .from('coaches')
        .select(
            'id, subscription_status, subscription_mp_id, subscription_provider, subscription_provider_external_id'
        )
        .eq('id', coachId)
        .maybeSingle()

    if (!coach) {
        return { ok: false, status: 404, error: 'Coach no encontrado' }
    }

    // Cualquier estado bloqueado que canda el panel (expired/pending_payment/past_due/paused
    // pasada la gracia): el coach ya cayó en /coach/reactivate y su única salida sin pagar es
    // volver a Free. El límite ≤3 lo revalida el count de abajo (money-safety real).
    if (!(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[]).includes(coach.subscription_status ?? '')) {
        return { ok: false, status: 403, error: 'Esta acción solo está disponible para suscripciones bloqueadas.' }
    }

    const { count } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .is('org_id', null)
        .eq('is_archived', false)

    const activeCount = count ?? 0
    const freeLimit = getTierMaxClients('free' as SubscriptionTier)

    if (activeCount > freeLimit) {
        return {
            ok: false,
            status: 400,
            error: `Tienes ${activeCount} alumnos activos. Para continuar con el plan gratuito necesitas archivar ${activeCount - freeLimit} alumno${activeCount - freeLimit > 1 ? 's' : ''}.`,
            activeCount,
            freeLimit,
        }
    }

    // Best-effort cancel at provider — POR EL GATEWAY PERSISTIDO del coach (U3, money-safety).
    // Antes usaba SIEMPRE MP + un gate `providerMatches` por `payment_provider`: para un coach Flow
    // eso NO cancelaba nada y dejaba la sub Flow VIVA cobrando a un coach que pasó a plan gratis.
    // Ahora se resuelve el provider por `subscription_provider` (fuente de verdad) y el id a cancelar
    // según el gateway — Flow → `subscription_provider_external_id`; MP → `subscription_mp_id`.
    const provider = getPaymentsProviderForCoach(coach)
    const checkoutId = (coach.subscription_provider === 'flow'
        ? coach.subscription_provider_external_id
        : coach.subscription_mp_id
    )?.trim()

    if (checkoutId) {
        try {
            await provider.cancelCheckoutAtProvider(checkoutId)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isAlreadyCanceledError(msg)) {
                console.warn('[activate-free] provider cancel failed (non-critical):', msg)
            }
        }
    }

    const { error: updateError } = await admin
        .from('coaches')
        .update({
            subscription_status: 'active',
            subscription_tier: 'free',
            billing_cycle: 'monthly',
            max_clients: freeLimit,
            subscription_mp_id: null,
            current_period_end: null,
            // Limpiar los refs de la sub Flow que se acaba de cancelar y volver el gateway al
            // default neutro (MP). `provider_customer_id` se CONSERVA (tarjeta reutilizable si el
            // coach vuelve a un plan pago). Sin esto, un ex-Flow reactivado quedaría con refs muertos.
            subscription_provider: 'mercadopago',
            subscription_provider_external_id: null,
            provider_plan_id: null,
        })
        .eq('id', coachId)

    if (updateError) {
        return { ok: false, status: 500, error: updateError.message }
    }

    const eventRow: TablesInsert<'subscription_events'> = {
        coach_id: coachId,
        provider: provider.name,
        provider_event_id: `activate-free:${coachId}:${Date.now()}`,
        provider_status: 'active',
        payload: { activated_free: true, previous_status: coach.subscription_status, origin } as Json,
    }
    await admin.from('subscription_events').insert(eventRow)

    const auditRow: TablesInsert<'admin_audit_logs'> = {
        admin_email: 'coach-self-action',
        action: 'coach.activate_free',
        target_table: 'coaches',
        target_id: coachId,
        payload: { previous_status: coach.subscription_status, origin } as Json,
    }
    await admin.from('admin_audit_logs').insert(auditRow)

    return { ok: true }
}
