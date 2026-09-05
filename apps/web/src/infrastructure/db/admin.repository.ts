import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { PAID_COACH_OR_FILTER } from '@/lib/constants'

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type AdminCoachListRow = Pick<
    Tables['coaches']['Row'],
    'id' | 'full_name' | 'brand_name' | 'subscription_status' | 'subscription_tier' | 'created_at'
>
export type AdminClientListRow = Pick<
    Tables['clients']['Row'],
    'id' | 'full_name' | 'email' | 'coach_id' | 'is_active' | 'created_at'
>
export type AdminDashboardClientRow = Pick<
    Tables['clients']['Row'],
    'id' | 'full_name' | 'email' | 'coach_id' | 'is_active' | 'is_archived' | 'created_at' | 'onboarding_completed'
> & {
    coaches: { full_name: string | null } | null
}
export type AdminAuditLogRow = Pick<
    Tables['admin_audit_logs']['Row'],
    'id' | 'admin_email' | 'action' | 'target_table' | 'target_id' | 'created_at'
>
export type PublishedNewsItemRow = Pick<
    Tables['news_items']['Row'],
    'id' | 'title' | 'type' | 'content' | 'image_url' | 'cta_url' | 'cta_label' | 'is_pinned' | 'published_at'
>

export type AdminBasicCoachRow = Pick<Tables['coaches']['Row'], 'id' | 'full_name' | 'brand_name' | 'slug'>
export type AdminRecentCoachSignupRow = Pick<Tables['coaches']['Row'], 'id' | 'full_name' | 'brand_name' | 'created_at' | 'subscription_status' | 'subscription_tier'>
export type AdminExpiringCoachRow = Pick<Tables['coaches']['Row'], 'id' | 'full_name' | 'brand_name' | 'current_period_end' | 'subscription_status'>
export type AdminPendingPaymentCoachRow = Pick<Tables['coaches']['Row'], 'id' | 'full_name' | 'brand_name' | 'created_at' | 'subscription_tier'>
export type AdminPaidCoachTierRow = Pick<Tables['coaches']['Row'], 'subscription_tier'>

export async function countActiveAdminCoaches(db: DB): Promise<number> {
    const { count } = await db
        .from('coaches')
        .select('id', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trialing'])
        .not('payment_provider', 'in', '(beta,internal)')

    return count ?? 0
}

export async function findPaidAdminCoachTiers(db: DB): Promise<AdminPaidCoachTierRow[]> {
    // Pagando = suscripcion real en su gateway (MP o Flow) — el filtro viejo por mp_id
    // dejaba a los coaches Flow fuera del fallback de MRR del dashboard (F0 08-05).
    const { data } = await db
        .from('coaches')
        .select('subscription_tier')
        .eq('subscription_status', 'active')
        .or(PAID_COACH_OR_FILTER)

    return (data ?? []) as AdminPaidCoachTierRow[]
}

export async function findRecentAdminCoachSignups(db: DB, limit = 10): Promise<AdminRecentCoachSignupRow[]> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, created_at, subscription_status, subscription_tier')
        .order('created_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as AdminRecentCoachSignupRow[]
}

export async function countBetaAdminInvites(db: DB): Promise<number> {
    const { count } = await db
        .from('coaches')
        .select('id', { count: 'exact', head: true })
        .eq('payment_provider', 'beta')
        .in('subscription_status', ['active', 'trialing'])

    return count ?? 0
}

export async function findExpiringSoonAdminCoaches(
    db: DB,
    upperIso: string,
    lowerIso: string,
    limit = 10
): Promise<AdminExpiringCoachRow[]> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, current_period_end, subscription_status')
        .in('subscription_status', ['active', 'trialing'])
        .lt('current_period_end', upperIso)
        .gt('current_period_end', lowerIso)
        .order('current_period_end')
        .limit(limit)

    return (data ?? []) as AdminExpiringCoachRow[]
}

export async function findPendingPaymentAdminCoaches(db: DB, limit = 20): Promise<AdminPendingPaymentCoachRow[]> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, created_at, subscription_tier')
        .eq('subscription_status', 'pending_payment')
        .order('created_at', { ascending: true })
        .limit(limit)

    return (data ?? []) as AdminPendingPaymentCoachRow[]
}

export async function findAdminCoachesPaginated(
    db: DB,
    limit = 50,
    offset = 0
): Promise<AdminCoachListRow[]> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, subscription_status, subscription_tier, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    return (data ?? []) as AdminCoachListRow[]
}

export async function findAdminCoachesFallback(db: DB, limit = 50): Promise<Array<Pick<Tables['coaches']['Row'], 'id' | 'full_name' | 'brand_name' | 'slug' | 'subscription_tier' | 'subscription_status' | 'billing_cycle' | 'payment_provider' | 'max_clients' | 'current_period_end' | 'trial_ends_at' | 'created_at'>>> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, subscription_tier, subscription_status, billing_cycle, payment_provider, max_clients, current_period_end, trial_ends_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

    return data ?? []
}

export async function findAdminBasicCoaches(db: DB): Promise<AdminBasicCoachRow[]> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug')
        .order('full_name')

    return (data ?? []) as AdminBasicCoachRow[]
}

export async function findAdminClientsPaginated(
    db: DB,
    limit = 50,
    offset = 0
): Promise<AdminClientListRow[]> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, email, coach_id, is_active, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    return (data ?? []) as AdminClientListRow[]
}

export type AdminClientEstadoFilter = 'activo' | 'inactivo' | 'archivado'
export type AdminClientOnboardingFilter = 'completo' | 'pendiente'

/**
 * Filtros compartidos entre el listado de alumnos del panel y el conteo de demos:
 * si divergen, el chip «(+N de prueba)» dejaria de describir el mismo universo que la tabla.
 * El tipo es estructural a proposito — los builders de PostgREST devuelven `this`.
 */
type AdminClientsFilterable<Q> = {
    or(filters: string): Q
    eq(column: string, value: unknown): Q
    is(column: string, value: unknown): Q
    not(column: string, operator: string, value: unknown): Q
}

function applyAdminClientFilters<Q extends AdminClientsFilterable<Q>>(
    query: Q,
    params: {
        search?: string
        coachId?: string
        estado?: AdminClientEstadoFilter
        onboarding?: AdminClientOnboardingFilter
    }
): Q {
    let q = query
    if (params.search) {
        q = q.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`)
    }
    if (params.coachId) {
        q = q.eq('coach_id', params.coachId)
    }
    // Estado: archivado es el corte duro (is_archived gana). is_active es NULLABLE y la UI
    // pinta NULL como "Activo" (is_active !== false) — por eso activo usa `not.is.false`
    // en vez de `eq(true)`: con eq(true) los alumnos sin flag desaparecian del filtro.
    if (params.estado === 'archivado') {
        q = q.eq('is_archived', true)
    } else if (params.estado === 'activo') {
        q = q.eq('is_archived', false).not('is_active', 'is', false)
    } else if (params.estado === 'inactivo') {
        q = q.eq('is_archived', false).is('is_active', false)
    }
    if (params.onboarding === 'completo') {
        q = q.eq('onboarding_completed', true)
    } else if (params.onboarding === 'pendiente') {
        q = q.eq('onboarding_completed', false)
    }
    return q
}

/**
 * Pedido del owner 05-09: «los alumnos de prueba no deben contar como alumnos en la seccion
 * alumnos del CEO panel». Los demo (`clients.is_demo = true`, sembrados por onboarding) quedan
 * FUERA del listado y de `total`; se devuelven aparte en `demoTotal` para el chip informativo.
 * Es la misma regla que ya aplican la RPC `get_admin_coaches_paginated` (client_count sin demos)
 * y `get_platform_clients_count`.
 */
export async function findAdminClientsForDashboard(
    db: DB,
    params: {
        search?: string
        coachId?: string
        estado?: AdminClientEstadoFilter
        onboarding?: AdminClientOnboardingFilter
        pageSize: number
        offset: number
    }
): Promise<{ clients: AdminDashboardClientRow[]; total: number; demoTotal: number }> {
    const listQuery = applyAdminClientFilters(
        db
            .from('clients')
            .select('id, full_name, email, coach_id, is_active, is_archived, created_at, onboarding_completed, coaches(full_name)', { count: 'exact' })
            .eq('is_demo', false)
            .order('created_at', { ascending: false }),
        params
    )
    const demoCountQuery = applyAdminClientFilters(
        db.from('clients').select('id', { count: 'exact', head: true }).eq('is_demo', true),
        params
    )

    const [listRes, demoRes] = await Promise.all([
        listQuery.range(params.offset, params.offset + params.pageSize - 1),
        demoCountQuery,
    ])

    const demoTotal = demoRes.error ? 0 : demoRes.count ?? 0
    if (listRes.error || !listRes.data) return { clients: [], total: 0, demoTotal }

    return { clients: listRes.data as unknown as AdminDashboardClientRow[], total: listRes.count ?? 0, demoTotal }
}

export async function findAdminAuditLogs(db: DB, limit = 50): Promise<AdminAuditLogRow[]> {
    const { data } = await db
        .from('admin_audit_logs')
        .select('id, admin_email, action, target_table, target_id, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as AdminAuditLogRow[]
}

export async function countAdminCoaches(db: DB): Promise<number> {
    const { count } = await db
        .from('coaches')
        .select('id', { count: 'exact', head: true })

    return count ?? 0
}

export async function countAdminClients(db: DB): Promise<number> {
    const { count } = await db
        .from('clients')
        .select('id', { count: 'exact', head: true })

    return count ?? 0
}

export async function findPublishedNewsIds(db: DB, nowIso: string): Promise<Array<{ id: string }>> {
    const { data, error } = await db
        .from('news_items')
        .select('id')
        .eq('status', 'published')
        .lte('published_at', nowIso)

    if (error) throw error
    return data ?? []
}

export async function findNewsReadsByCoach(db: DB, coachId: string): Promise<Array<{ news_item_id: string }>> {
    const { data, error } = await db
        .from('news_reads')
        .select('news_item_id')
        .eq('coach_id', coachId)

    if (error) throw error
    return data ?? []
}

export async function findPublishedNewsItems(db: DB, nowIso: string): Promise<PublishedNewsItemRow[]> {
    const { data, error } = await db
        .from('news_items')
        .select('id, title, type, content, image_url, cta_url, cta_label, is_pinned, published_at')
        .eq('status', 'published')
        .lte('published_at', nowIso)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as PublishedNewsItemRow[]
}
