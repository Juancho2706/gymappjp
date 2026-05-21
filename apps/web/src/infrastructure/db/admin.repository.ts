import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

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
        .not('payment_provider', 'in', ['beta', 'internal'])

    return count ?? 0
}

export async function findPaidAdminCoachTiers(db: DB): Promise<AdminPaidCoachTierRow[]> {
    const { data } = await db
        .from('coaches')
        .select('subscription_tier')
        .not('subscription_mp_id', 'is', null)
        .eq('subscription_status', 'active')
        .not('payment_provider', 'in', ['beta', 'internal'])

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

export async function findAdminClientsForDashboard(
    db: DB,
    params: { search?: string; coachId?: string; pageSize: number; offset: number }
): Promise<{ clients: AdminDashboardClientRow[]; total: number }> {
    let query = db
        .from('clients')
        .select('id, full_name, email, coach_id, is_active, is_archived, created_at, onboarding_completed, coaches(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (params.search) {
        query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`)
    }
    if (params.coachId) {
        query = query.eq('coach_id', params.coachId)
    }

    const { data, error, count } = await query.range(params.offset, params.offset + params.pageSize - 1)
    if (error || !data) return { clients: [], total: 0 }

    return { clients: data as unknown as AdminDashboardClientRow[], total: count ?? 0 }
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
