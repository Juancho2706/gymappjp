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
    if (!user) return { user: null, coach: null, activeClientCount: 0, activeClients: [] as { id: string; full_name: string }[], recentlyCancelledAddons: [] as ModuleKey[] }

    const [coachResult, clientCountResult, activeClientsResult, addonsResult] = await Promise.all([
        supabase
            .from('coaches')
            // Ancla de la gracia de ALUMNOS (politica CEO 2026-07-18) para el banner "Tus N
            // alumnos perderan acceso el {fecha}". paid_access_ended_at (migracion B-datos) gana
            // sobre current_period_end: los flujos de expiracion (cron/webhook/espejo manual)
            // pueden NULLear current_period_end, y sin esta columna el banner degrada a copy
            // generico sin fecha.
            .select('subscription_tier, subscription_status, current_period_end, paid_access_ended_at, max_clients, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle(),
        // Cupo STANDALONE (`org_id IS NULL`): mismo scoping que la lista archivable, el archivado
        // (`archiveClientsForFreeAction`) y el gate de dinero (`/api/payments/activate-free`). Sin
        // el filtro, este count sería un superset y en data drifteada (coach standalone bloqueado
        // con alumnos de org bajo su coach_id) sobre-contaría → escondería el path Free / dejaría
        // al coach varado tras archivar. Todos los conteos del flujo deben compartir el filtro.
        supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .is('org_id', null)
            .eq('is_archived', false),
        // Alumnos STANDALONE activos (archivables) para el panel de salida del deadlock de cupo:
        // el coach bloqueado + sobre-cupo archiva desde aquí para bajar a Free. Mismo filtro que
        // el archivado (`org_id IS NULL`); tolerante a fallos → lista vacía = sin panel.
        supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', user.id)
            .is('org_id', null)
            .eq('is_archived', false)
            .order('full_name', { ascending: true }),
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
        activeClients: activeClientsResult.data ?? [],
        recentlyCancelledAddons,
    }
})
