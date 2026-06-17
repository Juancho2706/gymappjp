import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { listAll } from '@/infrastructure/db/coach-addons.repository'
import type { ModuleKey } from '@/services/entitlements.service'

/** Ventana para pre-marcar ex-add-ons cancelados recientemente (plan 05 F5.6). */
const RECENT_CANCELLED_WINDOW_DAYS = 60

export const getReactivatePageData = cache(async () => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, coach: null, activeClientCount: 0, recentlyCancelledAddons: [] as ModuleKey[] }

    const [coachResult, clientCountResult, addonsResult] = await Promise.all([
        supabase
            .from('coaches')
            .select('subscription_tier, subscription_status, max_clients, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .eq('is_archived', false),
        // SELECT propio (RLS) — el client user-scoped solo ve las filas del coach.
        // tolerante a fallos: si la lectura falla, la reactivación sigue sin pre-marcado.
        listAll(supabase, user.id).catch(() => []),
    ])

    // Ex-add-ons PAGOS cancelados en la ventana reciente → pre-marca (deseleccionable). El
    // precio NO se hereda: la fila nueva re-congela el precio de lista VIGENTE (lo decide el
    // server al materializar). Un módulo con fila viva NO se pre-marca (ya está activo).
    const cutoff = Date.now() - RECENT_CANCELLED_WINDOW_DAYS * 86_400_000
    const liveKeys = new Set(
        addonsResult.filter((a) => a.status !== 'cancelled').map((a) => a.moduleKey)
    )
    const recentlyCancelledAddons = Array.from(
        new Set(
            addonsResult
                .filter(
                    (a) =>
                        a.source === 'self_service' &&
                        a.status === 'cancelled' &&
                        !liveKeys.has(a.moduleKey) &&
                        a.cancelledAt != null &&
                        new Date(a.cancelledAt).getTime() >= cutoff
                )
                .map((a) => a.moduleKey)
        )
    )

    return {
        user,
        coach: coachResult.data,
        activeClientCount: clientCountResult.count ?? 0,
        recentlyCancelledAddons,
    }
})
