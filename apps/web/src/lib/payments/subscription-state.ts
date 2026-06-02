import { addMonths } from 'date-fns'
import { BILLING_CYCLE_CONFIG } from '@/lib/constants'

export function mapProviderStatus(status?: string | null) {
    if (!status) return 'pending_payment'
    if (status === 'trialing') return 'trialing'
    if (['approved', 'authorized'].includes(status)) return 'active'
    if (['pending', 'in_process', 'in_mediation'].includes(status)) return 'pending_payment'
    if (status === 'paused') return 'paused'
    if (['cancelled', 'canceled'].includes(status)) return 'canceled'
    if (['rejected', 'refunded', 'charged_back'].includes(status)) return 'expired'
    return 'pending_payment'
}

function parseDate(value?: string | null) {
    if (!value) return null
    const timestamp = Date.parse(value)
    return Number.isNaN(timestamp) ? null : new Date(timestamp)
}

export function resolveCurrentPeriodEnd(input: {
    status: string
    billingCycle?: string | null
    currentPeriodEnd?: string | null
    providerCurrentPeriodEnd?: string | null
}) {
    // Canceled coaches keep their period_end so they can still use the app
    // until the date they paid through. Only hard-blocked statuses get null.
    if (input.status === 'canceled') {
        return parseDate(input.currentPeriodEnd)?.toISOString() ?? null
    }
    if (input.status !== 'active' && input.status !== 'trialing') return null

    const providerDate = parseDate(input.providerCurrentPeriodEnd)
    if (providerDate) return providerDate.toISOString()

    const existingDate = parseDate(input.currentPeriodEnd)
    const now = new Date()
    if (existingDate && existingDate.getTime() > now.getTime()) {
        return existingDate.toISOString()
    }

    const cycle = (input.billingCycle || 'monthly') as keyof typeof BILLING_CYCLE_CONFIG
    const months = BILLING_CYCLE_CONFIG[cycle]?.months ?? 1
    return addMonths(now, months).toISOString()
}

export type TerminalEventDecision = 'expire' | 'ignore-free' | 'none'

/**
 * Decides how a subscription webhook event that may terminate a coach should be applied.
 *
 * - 'expire'      → block the coach (status='expired'); they must reactivate.
 * - 'ignore-free' → a terminal event reached a free-tier coach who has no paid subscription
 *                   to terminate; leave their subscription untouched. Guards the race where a
 *                   coach abandons paid checkout then clicks "Activar plan gratuito":
 *                   activate-free cancels the pending MP preapproval, MP emits a cancellation
 *                   webhook, and without this guard the stale event re-locked the just-activated
 *                   free coach as 'expired' (tier=free + status=expired).
 * - 'none'        → not a terminal event; no blocking.
 *
 * A cancellation only terminates once the paid period has lapsed (periodExpiredOrNull).
 */
export function resolveTerminalEvent(input: {
    statusForUpdate: string
    periodExpiredOrNull: boolean
    subscriptionTier: string | null | undefined
}): TerminalEventDecision {
    const isTerminal =
        input.statusForUpdate === 'expired' ||
        (input.statusForUpdate === 'canceled' && input.periodExpiredOrNull)
    if (!isTerminal) return 'none'
    if (input.subscriptionTier === 'free') return 'ignore-free'
    return 'expire'
}
