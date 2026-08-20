import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { tierMaxClientsFor, type SubscriptionTier } from '@eva/tiers'

type Admin = SupabaseClient<Database>

/**
 * P7 (specs/pricing-v2): cerco de verdad del alta por invite.
 *
 * El hueco documentado: `joinViaInviteAction` insertaba alumnos SIN contar contra ningún
 * cupo. Este helper resuelve el límite APLICABLE por scope y cuenta los activos
 * (`is_archived = false`; un alumno pausado sigue ocupando cupo — mismas semánticas que
 * el alta manual en clients.actions y que getClientUnarchiveCapacity):
 *
 * - `standalone`: límite del COACH — la columna `coaches.max_clients` GANA cuando existe;
 *   el fallback es `tierMaxClientsFor(tier, created_at)` (grandfather P2: coach creado antes
 *   de PRICING_V2_CUTOVER conserva los límites viejos). Tier ilegible cae a 'free' (P5:
 *   jamás `?? 'starter'`). Este camino volvió a estar VIVO el 2026-08-20 (alta standalone
 *   reabierta para el loop de Share Entreno): este cerco es el que reemplaza al C-KILL.
 * - `enterprise`: el cupo real es de la ORG — `organizations.client_limit` (migración
 *   20260517140001) sobre el pool completo de la org; el tier personal del coach no aplica
 *   (la org paga centralizado, mismo criterio que el alta manual).
 * - `team`: el pool NO tiene cuota de alumnos persistida en el schema. `teams.seat_limit`
 *   limita las membresías de COACHES en `team_members` (trigger `team_members_seat_guard`,
 *   migración 20260609050855), nunca a los alumnos del pool — espejo de
 *   `getWorkspaceCapacity` en client-archive.service.ts. Si algún día el modelo team gana
 *   cuota de alumnos, se gatea acá.
 *
 * Fail-closed: cualquier error leyendo el límite o contando activos devuelve
 * `check_failed` — ante la duda no se crea la cuenta (el alumno puede reintentar).
 *
 * Los filtros de conteo espejan `applyArchiveScope` (client-archive.service.ts) para que
 * "activo" signifique lo mismo en alta, archivo y desarchivo.
 */
export type JoinCapacityScope =
    | { scope: 'standalone'; coachId: string }
    | { scope: 'team'; teamId: string }
    | { scope: 'enterprise'; orgId: string }

export type JoinCapacityResult =
    | { ok: true; used: number; limit: number }
    /** El workspace no tiene cuota de alumnos persistida (hoy: pool de team). */
    | { ok: true; used: null; limit: null }
    | { ok: false; reason: 'limit_reached'; used: number; limit: number }
    | { ok: false; reason: 'check_failed' }

export async function checkJoinCapacity(admin: Admin, invite: JoinCapacityScope): Promise<JoinCapacityResult> {
    if (invite.scope === 'team') {
        // Sin cuota de alumnos en el schema (ver doc arriba): el join de pool no gatea acá.
        return { ok: true, used: null, limit: null }
    }

    if (invite.scope === 'enterprise') {
        const { data: org, error: orgError } = await admin
            .from('organizations')
            .select('client_limit')
            .eq('id', invite.orgId)
            .maybeSingle()
        if (orgError || !org || !Number.isInteger(org.client_limit) || org.client_limit < 1) {
            return { ok: false, reason: 'check_failed' }
        }

        const { count, error: countError } = await admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('is_archived', false)
            .eq('org_id', invite.orgId)
            .is('team_id', null)
        if (countError) return { ok: false, reason: 'check_failed' }

        const used = count ?? 0
        return used >= org.client_limit
            ? { ok: false, reason: 'limit_reached', used, limit: org.client_limit }
            : { ok: true, used, limit: org.client_limit }
    }

    // standalone
    const { data: coach, error: coachError } = await admin
        .from('coaches')
        .select('max_clients, subscription_tier, created_at')
        .eq('id', invite.coachId)
        .maybeSingle()
    if (coachError || !coach) return { ok: false, reason: 'check_failed' }

    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    // La columna gana; el fallback aplica el grandfather (P2). El `??` es defensivo:
    // la columna es NOT NULL en DB, pero un select parcial jamás debe inflar el límite.
    const limit = coach.max_clients ?? tierMaxClientsFor(tier, coach.created_at)

    const { count, error: countError } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false)
        .eq('coach_id', invite.coachId)
        .is('org_id', null)
        .is('team_id', null)
    if (countError) return { ok: false, reason: 'check_failed' }

    const used = count ?? 0
    return used >= limit
        ? { ok: false, reason: 'limit_reached', used, limit }
        : { ok: true, used, limit }
}
