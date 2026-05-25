import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { ENTERPRISE_STAFF_ROLES, isEnterpriseStaffRole, type OrgRole } from '@/domain/org/permissions'

type DB = SupabaseClient<Database>

export type OrgWithMembership = {
    id: string
    slug: string
    name: string
    logo_url: string | null
    primary_color: string | null
    plan: string
    status: string
    seats_included: number
    trial_ends_at: string | null
    billing_cycle: string | null
    currency: string
    created_at: string | null
    onboarding_step: number | null
    last_health_score: number | null
    myRole: Exclude<OrgRole, 'coach'>
}

export type OrgMember = {
    id: string
    user_id: string
    coach_id: string | null
    role: OrgRole
    status: string
    invited_at: string | null
    joined_at: string | null
    last_health_score: number | null
    coach: {
        id: string
        full_name: string | null
        slug: string | null
        logo_url: string | null
        subscription_status: string | null
        invite_code: string | null
    } | null
}

export type OrgClient = {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    is_active: boolean | null
    created_at: string | null
    coach_id: string | null
    assignedCoach: { id: string; full_name: string | null; slug: string | null } | null
}

export type OrgAnnouncement = {
    id: string
    title: string
    body: string
    is_active: boolean
    active_until: string | null
    created_at: string | null
}

export type OrgNutritionTemplate = {
    id: string
    name: string
    description: string | null
    goal_type: string | null
    daily_calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fats_g: number | null
    instructions: string | null
    meal_names: { name: string; order_index: number; description?: string }[]
    created_at: string | null
}

export async function findOrgBySlug(
    db: DB,
    userId: string,
    slug: string
): Promise<OrgWithMembership | null> {
    const { data: org } = await db
        .from('organizations')
        .select('id, slug, name, logo_url, primary_color, plan, status, seats_included, trial_ends_at, billing_cycle, currency, created_at, onboarding_step, last_health_score')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle()

    if (!org) return null

    const { data: membership } = await db
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .in('role', ENTERPRISE_STAFF_ROLES)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    if (!membership) return null
    if (!isEnterpriseStaffRole(membership.role)) return null

    return { ...org, myRole: membership.role }
}

export async function findOrgMembers(db: DB, orgId: string): Promise<OrgMember[]> {
    const { data } = await db
        .from('organization_members')
        .select(`
            id, user_id, coach_id, role, status, invited_at, joined_at, last_health_score,
            coach:coaches(id, full_name, slug, logo_url, subscription_status, invite_code)
        `)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('joined_at', { ascending: false })

    return (data ?? []) as OrgMember[]
}

export async function findOrgAnnouncements(db: DB, orgId: string): Promise<OrgAnnouncement[]> {
    const { data } = await db
        .from('org_announcements')
        .select('id, title, body, is_active, active_until, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50)

    return (data ?? []) as OrgAnnouncement[]
}

export async function findOrgNutritionTemplates(db: DB, orgId: string): Promise<OrgNutritionTemplate[]> {
    const { data } = await db
        .from('org_nutrition_templates')
        .select('id, name, description, goal_type, daily_calories, protein_g, carbs_g, fats_g, instructions, meal_names, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })

    return (data ?? []).map(template => ({
        ...template,
        meal_names: Array.isArray(template.meal_names) ? (template.meal_names as OrgNutritionTemplate['meal_names']) : [],
    }))
}

export async function findOrgClients(
    db: DB,
    orgId: string,
    search?: string
): Promise<OrgClient[]> {
    let query = db
        .from('clients')
        .select('id, full_name, email, phone, is_active, created_at, coach_id')
        .eq('org_id', orgId)

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients } = await query.order('created_at', { ascending: false }).limit(100)

    if (!clients?.length) return []

    const coachIds = [...new Set(clients.map(c => c.coach_id).filter(Boolean))] as string[]
    let coachMap: Record<string, { id: string; full_name: string | null; slug: string | null }> = {}

    if (coachIds.length > 0) {
        const { data: coaches } = await db
            .from('coaches')
            .select('id, full_name, slug')
            .in('id', coachIds)
        coachMap = Object.fromEntries((coaches ?? []).map(c => [c.id, c]))
    }

    return clients.map(c => ({
        ...c,
        assignedCoach: c.coach_id ? (coachMap[c.coach_id] ?? null) : null,
    }))
}

export type OrgInvoice = {
    id: string
    amount_clp: number
    expected_amount_clp: number | null
    period_start: string
    period_end: string
    status: string
    paid_at: string | null
    payment_ref: string | null
    notes: string | null
    created_at: string | null
}

export type OrgClientPayment = {
    id: string
    client_id: string
    coach_id: string
    amount: number
    service_description: string
    period_months: number | null
    payment_date: string
    status: string
    created_at: string
}

export type OrgAuditLog = {
    id: string
    org_id: string
    actor_id: string
    action: string
    target_id: string | null
    target_type: string | null
    metadata: Database['public']['Tables']['org_audit_logs']['Row']['metadata']
    created_at: string | null
}

export async function findOrgAuditLogs(db: DB, orgId: string, limit = 50): Promise<OrgAuditLog[]> {
    const { data } = await db
        .from('org_audit_logs')
        .select('id, org_id, actor_id, action, target_id, target_type, metadata, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as OrgAuditLog[]
}

export type CoachPerformanceData = {
    assignedCount: number
    activeCount: number
    alertCount: number           // active clients with no log in last 7d
    adherenceWeeks: number[]     // % per week, last 4 weeks (index 0 = oldest)
    avgAdherence: number         // mean of adherenceWeeks
    orgAvgAdherence: number      // org-wide comparison
    alertClients: { id: string; full_name: string | null; daysSinceLastLog: number }[]
}

export async function getCoachPerformanceData(
    db: DB,
    coachId: string,
    orgId: string
): Promise<CoachPerformanceData> {
    const now = Date.now()
    const msDay = 86400000
    const sevenDaysAgo = new Date(now - 7 * msDay).toISOString()
    const thirtyDaysAgo = new Date(now - 30 * msDay).toISOString()

    // assigned client ids via coach_client_assignments
    const { data: assignments } = await db
        .from('coach_client_assignments')
        .select('client_id')
        .eq('coach_id', coachId)
        .eq('org_id', orgId)
        .is('deleted_at', null)

    const clientIds = (assignments ?? []).map(a => a.client_id)

    if (!clientIds.length) {
        return { assignedCount: 0, activeCount: 0, alertCount: 0, adherenceWeeks: [0, 0, 0, 0], avgAdherence: 0, orgAvgAdherence: 0, alertClients: [] }
    }

    const [clientsRes, logsRes, orgClientsRes] = await Promise.all([
        db.from('clients').select('id, full_name, is_active').in('id', clientIds),
        db.from('workout_logs').select('client_id, logged_at').in('client_id', clientIds).gte('logged_at', thirtyDaysAgo),
        db.from('clients').select('id, is_active').eq('org_id', orgId),
    ])

    const clients = clientsRes.data ?? []
    const logs = logsRes.data ?? []
    const orgClients = orgClientsRes.data ?? []

    const activeClients = clients.filter(c => c.is_active)
    const activeCount = activeClients.length
    const activeIds = new Set(activeClients.map(c => c.id))

    // clients with log in last 7d
    const recentIds = new Set(logs.filter(l => l.logged_at >= sevenDaysAgo).map(l => l.client_id))
    const alertCount = activeClients.filter(c => !recentIds.has(c.id)).length

    // alert clients with days since last log
    const lastLogMap: Record<string, string> = {}
    for (const log of logs) {
        if (!lastLogMap[log.client_id] || log.logged_at > lastLogMap[log.client_id]) {
            lastLogMap[log.client_id] = log.logged_at
        }
    }
    const alertClients = activeClients
        .filter(c => !recentIds.has(c.id))
        .map(c => ({
            id: c.id,
            full_name: c.full_name,
            daysSinceLastLog: lastLogMap[c.id]
                ? Math.floor((now - new Date(lastLogMap[c.id]).getTime()) / msDay)
                : 999,
        }))
        .sort((a, b) => b.daysSinceLastLog - a.daysSinceLastLog)

    // weekly adherence (4 weeks, coach)
    const adherenceWeeks = [3, 2, 1, 0].map(weeksAgo => {
        const start = new Date(now - (weeksAgo + 1) * 7 * msDay).toISOString()
        const end = new Date(now - weeksAgo * 7 * msDay).toISOString()
        const weekLogs = logs.filter(l => l.logged_at >= start && l.logged_at < end)
        const weekIds = new Set(weekLogs.map(l => l.client_id))
        const eligible = activeClients.filter(c => activeIds.has(c.id)).length
        return eligible > 0 ? Math.round((weekIds.size / eligible) * 100) : 0
    })
    const avgAdherence = Math.round(adherenceWeeks.reduce((a, b) => a + b, 0) / 4)

    // org-wide adherence (last 7d active / total active)
    const orgActiveIds = new Set(orgClients.filter(c => c.is_active).map(c => c.id))
    const orgClientIds = [...orgActiveIds]
    let orgAvgAdherence = 0
    if (orgClientIds.length > 0) {
        const { data: orgLogs } = await db
            .from('workout_logs')
            .select('client_id')
            .in('client_id', orgClientIds)
            .gte('logged_at', sevenDaysAgo)
        const orgRecentIds = new Set((orgLogs ?? []).map(l => l.client_id))
        orgAvgAdherence = Math.round((orgRecentIds.size / orgClientIds.length) * 100)
    }

    return {
        assignedCount: clientIds.length,
        activeCount,
        alertCount,
        adherenceWeeks,
        avgAdherence,
        orgAvgAdherence,
        alertClients,
    }
}

export async function findOrgInvoices(db: DB, orgId: string): Promise<OrgInvoice[]> {
    const { data } = await db
        .from('org_invoices')
        .select('id, amount_clp, expected_amount_clp, period_start, period_end, status, paid_at, payment_ref, notes, created_at')
        .eq('org_id', orgId)
        .order('period_start', { ascending: false })
        .limit(24)
    return (data ?? []) as OrgInvoice[]
}

export async function findOrgClientPayments(db: DB, orgId: string): Promise<OrgClientPayment[]> {
    const { data: clients } = await db
        .from('clients')
        .select('id')
        .eq('org_id', orgId)

    const clientIds = (clients ?? []).map((client) => client.id)
    if (clientIds.length === 0) return []

    const { data } = await db
        .from('client_payments')
        .select('id, client_id, coach_id, amount, service_description, period_months, payment_date, status, created_at')
        .in('client_id', clientIds)
        .order('payment_date', { ascending: false })
        .limit(500)

    return (data ?? []) as OrgClientPayment[]
}

export async function getOrgStats(db: DB, orgId: string) {
    const [membersRes, clientsRes] = await Promise.all([
        db
            .from('organization_members')
            .select('id, status', { count: 'exact' })
            .eq('org_id', orgId)
            .is('deleted_at', null),
        db
            .from('clients')
            .select('id, is_active', { count: 'exact' })
            .eq('org_id', orgId),
    ])

    const members = membersRes.data ?? []
    const clients = clientsRes.data ?? []

    return {
        totalCoaches: members.filter(m => m.status === 'active').length,
        pendingInvites: members.filter(m => m.status === 'invited').length,
        totalClients: clients.length,
        activeClients: clients.filter(c => c.is_active).length,
    }
}
