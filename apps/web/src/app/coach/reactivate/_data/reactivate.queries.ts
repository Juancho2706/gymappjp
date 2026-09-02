import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { listAll } from '@/infrastructure/db/coach-addons.repository'
import { resolveActiveDiscountFromRpc } from '@/services/billing/discount.service'
import type { ModuleKey } from '@/services/entitlements.service'
import type { ReactivateActiveDiscount } from '../_lib/reactivate-price'

/** Ventana para pre-marcar ex-add-ons cancelados recientemente (plan 05 F5.6). */
const RECENT_CANCELLED_WINDOW_DAYS = 60

export const getReactivatePageData = cache(async () => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, coach: null, activeClientCount: 0, activeClients: [] as { id: string; full_name: string }[], recentlyCancelledAddons: [] as ModuleKey[], activeDiscount: null as ReactivateActiveDiscount | null }

    const [coachResult, clientCountResult, activeClientsResult, addonsResult, discountResult] = await Promise.all([
        supabase
            .from('coaches')
            // Ancla de la gracia de ALUMNOS (politica CEO 2026-07-18) para el banner "Tus N
            // alumnos perderan acceso el {fecha}". paid_access_ended_at (migracion B-datos) gana
            // sobre current_period_end: los flujos de expiracion (cron/webhook/espejo manual)
            // pueden NULLear current_period_end, y sin esta columna el banner degrada a copy
            // generico sin fecha.
            // max_clients + created_at: el cupo REAL del coach. Pricing v3 (owner 2026-08-21) puso
            // el grandfather en la COLUMNA (backfill por uso del día D), así que `max_clients` manda
            // para el tier ACTUAL y `created_at` solo proyecta los tiers que todavía no tiene
            // (escalera de 3 peldaños: pre-v2 3 · v2 2 · v3 1). Nunca el catálogo de venta plano.
            .select('subscription_tier, subscription_status, current_period_end, paid_access_ended_at, max_clients, subscription_mp_id, created_at')
            .eq('id', user.id)
            .maybeSingle(),
        // Cupo STANDALONE (`coach_id` + `org_id IS NULL` + `team_id IS NULL`): mismo scoping que la lista archivable, el archivado
        // (`archiveClientsForFreeAction`) y el gate de dinero (`/api/payments/activate-free`). Sin
        // el filtro, este count sería un superset y en data drifteada (coach standalone bloqueado
        // con alumnos de org bajo su coach_id) sobre-contaría → escondería el path Free / dejaría
        // al coach varado tras archivar. Todos los conteos del flujo deben compartir el filtro.
        supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .is('org_id', null)
            .is('team_id', null)
            .eq('is_archived', false)
            // Onboarding v2: el alumno de ejemplo no ocupa cupo, así que tampoco entra en la
            // cuenta que decide si el coach puede volver a Free ni en el «archiva N alumnos».
            .eq('is_demo', false),
        // Alumnos STANDALONE activos (archivables) para el panel de salida del deadlock de cupo:
        // el coach bloqueado + sobre-cupo archiva desde aquí para bajar a Free. Mismo filtro que
        // el archivado (`org_id IS NULL`); tolerante a fallos → lista vacía = sin panel.
        supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', user.id)
            .is('org_id', null)
            .is('team_id', null)
            .eq('is_archived', false)
            // El demo no ocupa cupo ⇒ archivarlo no libera nada: fuera del panel de salida.
            .eq('is_demo', false)
            .order('full_name', { ascending: true }),
        // SELECT propio (RLS) — el client user-scoped solo ve las filas del coach.
        // tolerante a fallos: si la lectura falla, la reactivación sigue sin pre-marcado.
        listAll(supabase, user.id).catch(() => []),
        // Cupon vivo del coach via la RPC `resolve_active_discount` (SECURITY DEFINER, sin param ->
        // auth.uid() interno, anti-IDOR): el cliente user-scoped NO puede joinear el catalogo de
        // cupones bajo RLS. Es el MISMO resolver que usa /api/payments/subscription-status, y el
        // spec que devuelve es el que `create-preference` re-resuelve para hornear el monto => el
        // precio MOSTRADO en Reactivar == el COBRADO. Tolerante a fallos: si la RPC falla, null
        // (la pantalla queda exactamente como antes, sin descuento y sin romperse).
        resolveActiveDiscountFromRpc(supabase).catch(() => ({ spec: null, redemptionId: null, code: null })),
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

    // Forma serializable (RSC -> client). `moduleKeys` no viaja: la pantalla precia el plan BASE,
    // asi que un cupon target='module' no tiene linea que descontar (precio intacto, como hoy).
    const spec = discountResult.spec
    const activeDiscount: ReactivateActiveDiscount | null = spec
        ? {
              code: discountResult.code,
              type: spec.type,
              value: spec.value,
              target: spec.target,
              remainingCycles: spec.remainingCycles ?? null,
          }
        : null

    return {
        user,
        coach: coachResult.data,
        activeClientCount: clientCountResult.count ?? 0,
        activeClients: activeClientsResult.data ?? [],
        recentlyCancelledAddons,
        activeDiscount,
    }
})
