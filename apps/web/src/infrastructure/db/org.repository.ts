import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { ENTERPRISE_STAFF_ROLES, isEnterpriseStaffRole, type OrgRole } from '@/domain/org/permissions'

type DB = SupabaseClient<Database>

export type BrandDraft = {
    name?: string
    primary_color?: string
    logo_url?: string | null
}

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
    brand_draft: BrandDraft | null
    brand_published_at: string | null
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

export type AnnouncementAudience = 'all' | 'coaches' | 'clients'

export type OrgAnnouncement = {
    id: string
    title: string
    body: string
    is_active: boolean
    active_until: string | null
    created_at: string | null
    audience: AnnouncementAudience
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

export type OrgNutritionTemplateUsage = {
    template_id: string
    active_plans: number
    active_clients: number
    logged_clients_7d: number
    adherence_7d: number
    coach_usage: {
        coach_id: string
        coach_name: string | null
        active_plans: number
        active_clients: number
        logged_clients_7d: number
        adherence_7d: number
    }[]
}

export async function findOrgBySlug(
    db: DB,
    userId: string,
    slug: string
): Promise<OrgWithMembership | null> {
    const { data: org } = await db
        .from('organizations')
        .select('id, slug, name, logo_url, primary_color, plan, status, seats_included, trial_ends_at, billing_cycle, currency, created_at, onboarding_step, last_health_score, brand_draft, brand_published_at')
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

    return {
        ...org,
        brand_draft: (org.brand_draft ?? null) as BrandDraft | null,
        brand_published_at: (org as Record<string, unknown>).brand_published_at as string | null ?? null,
        myRole: membership.role,
    }
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
        .select('id, title, body, is_active, active_until, created_at, audience')
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

export async function findOrgNutritionTemplateUsage(
    db: DB,
    orgId: string,
    templates: OrgNutritionTemplate[]
): Promise<OrgNutritionTemplateUsage[]> {
    if (templates.length === 0) return []

    const { data: plans } = await db
        .from('nutrition_plans')
        .select('id, client_id, coach_id, name, daily_calories, protein_g, carbs_g, fats_g')
        .eq('org_id', orgId)
        .eq('is_active', true)

    const usage = new Map<string, {
        planIds: Set<string>
        clientIds: Set<string>
        coachBuckets: Map<string, { planIds: Set<string>; clientIds: Set<string> }>
    }>()
    for (const template of templates) {
        usage.set(template.id, { planIds: new Set(), clientIds: new Set(), coachBuckets: new Map() })
    }

    for (const plan of plans ?? []) {
        const matchedTemplate = templates.find((template) => (
            template.name === plan.name &&
            (template.daily_calories ?? null) === (plan.daily_calories ?? null) &&
            (template.protein_g ?? null) === (plan.protein_g ?? null) &&
            (template.carbs_g ?? null) === (plan.carbs_g ?? null) &&
            (template.fats_g ?? null) === (plan.fats_g ?? null)
        ))
        if (!matchedTemplate) continue
        const bucket = usage.get(matchedTemplate.id)
        if (!bucket) continue
        bucket.planIds.add(plan.id)
        bucket.clientIds.add(plan.client_id)
        if (!bucket.coachBuckets.has(plan.coach_id)) {
            bucket.coachBuckets.set(plan.coach_id, { planIds: new Set(), clientIds: new Set() })
        }
        const coachBucket = bucket.coachBuckets.get(plan.coach_id)!
        coachBucket.planIds.add(plan.id)
        coachBucket.clientIds.add(plan.client_id)
    }

    const allPlanIds = [...new Set([...usage.values()].flatMap((bucket) => [...bucket.planIds]))]
    const allCoachIds = [...new Set([...usage.values()].flatMap((bucket) => [...bucket.coachBuckets.keys()]))]
    const loggedPlanIds = new Map<string, Set<string>>()
    const coachNames = new Map<string, string | null>()

    await Promise.all([
        allPlanIds.length > 0 ? (async () => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
        const { data: logs } = await db
            .from('daily_nutrition_logs')
            .select('plan_id, client_id')
            .in('plan_id', allPlanIds)
            .gte('log_date', sevenDaysAgo)

        for (const log of logs ?? []) {
            if (!loggedPlanIds.has(log.plan_id)) loggedPlanIds.set(log.plan_id, new Set())
            loggedPlanIds.get(log.plan_id)!.add(log.client_id)
        }
        })() : Promise.resolve(),
        allCoachIds.length > 0 ? (async () => {
            const { data: coaches } = await db
                .from('coaches')
                .select('id, full_name')
                .in('id', allCoachIds)
            for (const coach of coaches ?? []) {
                coachNames.set(coach.id, coach.full_name ?? null)
            }
        })() : Promise.resolve(),
    ])

    return templates.map((template) => {
        const bucket = usage.get(template.id) ?? {
            planIds: new Set<string>(),
            clientIds: new Set<string>(),
            coachBuckets: new Map<string, { planIds: Set<string>; clientIds: Set<string> }>(),
        }
        const loggedClients = new Set<string>()
        for (const planId of bucket.planIds) {
            for (const clientId of loggedPlanIds.get(planId) ?? []) loggedClients.add(clientId)
        }
        const activeClients = bucket.clientIds.size
        const coachUsage = [...bucket.coachBuckets.entries()].map(([coachId, coachBucket]) => {
            const coachLoggedClients = new Set<string>()
            for (const planId of coachBucket.planIds) {
                for (const clientId of loggedPlanIds.get(planId) ?? []) coachLoggedClients.add(clientId)
            }
            const coachActiveClients = coachBucket.clientIds.size
            return {
                coach_id: coachId,
                coach_name: coachNames.get(coachId) ?? null,
                active_plans: coachBucket.planIds.size,
                active_clients: coachActiveClients,
                logged_clients_7d: coachLoggedClients.size,
                adherence_7d: coachActiveClients > 0 ? Math.round((coachLoggedClients.size / coachActiveClients) * 100) : 0,
            }
        }).sort((a, b) => b.active_clients - a.active_clients || b.logged_clients_7d - a.logged_clients_7d)

        return {
            template_id: template.id,
            active_plans: bucket.planIds.size,
            active_clients: activeClients,
            logged_clients_7d: loggedClients.size,
            adherence_7d: activeClients > 0 ? Math.round((loggedClients.size / activeClients) * 100) : 0,
            coach_usage: coachUsage,
        }
    })
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

export type OrgAssignmentHistoryItem = {
    id: string
    client_id: string
    client_name: string | null
    client_email: string | null
    coach_id: string
    coach_name: string | null
    coach_slug: string | null
    assigned_at: string | null
    assigned_by: string | null
    assigned_by_role: OrgRole | null
    assigned_by_name: string | null
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

export type OrgAuditLogFilters = {
    action?: string
    actorId?: string
    targetType?: string
    from?: string
    to?: string
}

export async function findOrgAuditLogs(
    db: DB,
    orgId: string,
    limit = 50,
    filters: OrgAuditLogFilters = {}
): Promise<OrgAuditLog[]> {
    let query = db
        .from('org_audit_logs')
        .select('id, org_id, actor_id, action, target_id, target_type, metadata, created_at')
        .eq('org_id', orgId)

    if (filters.action) query = query.eq('action', filters.action)
    if (filters.actorId) query = query.eq('actor_id', filters.actorId)
    if (filters.targetType) query = query.eq('target_type', filters.targetType)
    if (filters.from) query = query.gte('created_at', filters.from)
    if (filters.to) query = query.lte('created_at', filters.to)

    const { data } = await query
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 1000))

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

export async function findOrgAssignmentHistory(
    db: DB,
    orgId: string,
    limit = 12
): Promise<OrgAssignmentHistoryItem[]> {
    const { data: assignments } = await db
        .from('coach_client_assignments')
        .select('id, client_id, coach_id, assigned_at, assigned_by')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('assigned_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50))

    if (!assignments?.length) return []

    const clientIds = [...new Set(assignments.map((assignment) => assignment.client_id).filter(Boolean))]
    const coachIds = [...new Set(assignments.map((assignment) => assignment.coach_id).filter(Boolean))]
    const actorIds = [...new Set(assignments.map((assignment) => assignment.assigned_by).filter(Boolean))] as string[]

    const [clientsRes, coachesRes, actorsRes] = await Promise.all([
        clientIds.length > 0
            ? db.from('clients').select('id, full_name, email').eq('org_id', orgId).in('id', clientIds)
            : Promise.resolve({ data: [] }),
        coachIds.length > 0
            ? db.from('coaches').select('id, full_name, slug').in('id', coachIds)
            : Promise.resolve({ data: [] }),
        actorIds.length > 0
            ? db
                .from('organization_members')
                .select('user_id, role, coach:coaches(full_name)')
                .eq('org_id', orgId)
                .in('user_id', actorIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] }),
    ])

    const clients = new Map((clientsRes.data ?? []).map((client) => [client.id, client]))
    const coaches = new Map((coachesRes.data ?? []).map((coach) => [coach.id, coach]))
    const actors = new Map((actorsRes.data ?? []).map((actor) => [actor.user_id, actor]))

    return assignments.map((assignment) => {
        const client = clients.get(assignment.client_id)
        const coach = coaches.get(assignment.coach_id)
        const actor = assignment.assigned_by ? actors.get(assignment.assigned_by) : null
        const actorCoach = actor?.coach
        const actorCoachName = Array.isArray(actorCoach)
            ? actorCoach[0]?.full_name
            : actorCoach?.full_name

        return {
            id: assignment.id,
            client_id: assignment.client_id,
            client_name: client?.full_name ?? null,
            client_email: client?.email ?? null,
            coach_id: assignment.coach_id,
            coach_name: coach?.full_name ?? null,
            coach_slug: coach?.slug ?? null,
            assigned_at: assignment.assigned_at ?? null,
            assigned_by: assignment.assigned_by ?? null,
            assigned_by_role: (actor?.role as OrgRole | undefined) ?? null,
            assigned_by_name: actorCoachName ?? null,
        }
    })
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

export type OrgHealthBreakdown = {
    score: number          // 0-100
    adherence7d: number    // % active clients who logged workout last 7d (weight 40%)
    assignmentRate: number // % clients with coach_id (weight 25%)
    activeRate: number     // % clients who are is_active (weight 20%)
    programRate: number    // % active clients with active program (weight 15%)
    totalClients: number
    activeClients: number
    tier: 'green' | 'amber' | 'red'
}

/**
 * Computes org-level health score 0-100.
 * Formula from CSM research 2026:
 *   score = adherence×0.40 + assignment×0.25 + active_rate×0.20 + program_rate×0.15
 * Thresholds: green≥70, amber≥50, red<50
 */
export async function computeOrgHealthScore(db: DB, orgId: string): Promise<OrgHealthBreakdown> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

    const [clientsRes, logsRes, programsRes] = await Promise.all([
        db.from('clients')
            .select('id, is_active, coach_id')
            .eq('org_id', orgId),
        db.from('workout_logs')
            .select('client_id')
            .gte('logged_at', sevenDaysAgo),
        db.from('workout_programs')
            .select('client_id')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .not('client_id', 'is', null),
    ])

    const clients = clientsRes.data ?? []
    const totalClients = clients.length
    const activeClients = clients.filter(c => c.is_active).length
    const activeClientIds = new Set(clients.filter(c => c.is_active).map(c => c.id))

    if (totalClients === 0) {
        return { score: 0, adherence7d: 0, assignmentRate: 0, activeRate: 0, programRate: 0, totalClients: 0, activeClients: 0, tier: 'red' }
    }

    // Adherence: % of active clients who trained last 7d
    const recentIds = new Set((logsRes.data ?? [])
        .filter(l => activeClientIds.has(l.client_id))
        .map(l => l.client_id))
    const adherence7d = activeClients > 0 ? Math.round((recentIds.size / activeClients) * 100) : 0

    // Assignment rate: % of all clients with a coach
    const assigned = clients.filter(c => c.coach_id).length
    const assignmentRate = Math.round((assigned / totalClients) * 100)

    // Active rate: % of all clients who are active
    const activeRate = Math.round((activeClients / totalClients) * 100)

    // Program rate: % of active clients with an active program
    const programClientIds = new Set((programsRes.data ?? []).map(p => p.client_id))
    const withProgram = [...activeClientIds].filter(id => programClientIds.has(id)).length
    const programRate = activeClients > 0 ? Math.round((withProgram / activeClients) * 100) : 0

    const score = Math.round(
        adherence7d * 0.40 +
        assignmentRate * 0.25 +
        activeRate * 0.20 +
        programRate * 0.15
    )

    const tier: OrgHealthBreakdown['tier'] = score >= 70 ? 'green' : score >= 50 ? 'amber' : 'red'

    return { score, adherence7d, assignmentRate, activeRate, programRate, totalClients, activeClients, tier }
}

export type OrgWorkoutProgramOverview = {
    // coachId null = org-owned template (no specific coach)
    templates: { id: string; name: string; coachId: string | null; coachName: string; coachSlug: string }[]
    totalClients: number
    clientsWithProgram: number
    coveragePct: number
    byCoach: { coachId: string; coachName: string; coachSlug: string; activePrograms: number }[]
}

/**
 * Org-level workout program overview for /programs page.
 * Templates = programs where client_id IS NULL (not yet assigned).
 * Active = programs where is_active = true AND client_id IS NOT NULL.
 * Coaches resolved via organization_members for the org.
 */
export async function findOrgWorkoutProgramOverview(db: DB, orgId: string): Promise<OrgWorkoutProgramOverview> {
    const [templatesRes, activeRes, clientsRes, membersRes] = await Promise.all([
        db.from('workout_programs')
            .select('id, name, coach_id')
            .eq('org_id', orgId)
            .is('client_id', null)
            .order('name'),
        db.from('workout_programs')
            .select('client_id, coach_id')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .not('client_id', 'is', null),
        db.from('clients')
            .select('id')
            .eq('org_id', orgId),
        db.from('organization_members')
            .select('coach_id, coach:coaches(id, full_name, slug)')
            .eq('org_id', orgId)
            .eq('role', 'coach')
            .eq('status', 'active')
            .is('deleted_at', null),
    ])

    // Build coach lookup map
    const coachMap = new Map<string, { name: string; slug: string }>()
    for (const m of membersRes.data ?? []) {
        if (m.coach_id && m.coach && !Array.isArray(m.coach)) {
            coachMap.set(m.coach_id, { name: (m.coach as { full_name: string | null; slug: string }).full_name ?? 'Coach', slug: (m.coach as { slug: string }).slug })
        }
    }

    const templates = (templatesRes.data ?? []).map(t => ({
        id: t.id,
        name: t.name,
        coachId: t.coach_id,
        coachName: t.coach_id ? (coachMap.get(t.coach_id)?.name ?? 'Coach') : 'Organización',
        coachSlug: t.coach_id ? (coachMap.get(t.coach_id)?.slug ?? '') : '',
    }))

    const totalClients = clientsRes.data?.length ?? 0
    const clientsWithProgram = new Set((activeRes.data ?? []).map(p => p.client_id)).size
    const coveragePct = totalClients > 0 ? Math.round((clientsWithProgram / totalClients) * 100) : 0

    // Per-coach active program count (exclude org-template programs with null coach_id)
    const coachProgramCount = new Map<string, number>()
    for (const p of activeRes.data ?? []) {
        if (!p.coach_id) continue
        coachProgramCount.set(p.coach_id, (coachProgramCount.get(p.coach_id) ?? 0) + 1)
    }

    const byCoach = Array.from(coachProgramCount.entries())
        .map(([coachId, activePrograms]) => ({
            coachId,
            coachName: coachMap.get(coachId)?.name ?? 'Coach',
            coachSlug: coachMap.get(coachId)?.slug ?? '',
            activePrograms,
        }))
        .sort((a, b) => b.activePrograms - a.activePrograms)

    return { templates, totalClients, clientsWithProgram, coveragePct, byCoach }
}

export type OrgCheckInOverview = {
    total7d: number
    total30d: number
    clientsActive7d: number   // unique clients with check-in in last 7 days
    totalOrgClients: number
    noCheckIn14d: number      // active clients without check-in in 14+ days
    byCoach: {
        coachId: string
        coachName: string
        totalClients: number
        activeClients7d: number  // clients of this coach who submitted in 7d
    }[]
    recent: { clientId: string; clientName: string | null; date: string; coachName: string | null }[]
}

/**
 * Org-level check-in overview for /check-ins page.
 * Joins check_ins → clients (org_id = orgId) for all metrics.
 */
export async function findOrgCheckInOverview(db: DB, orgId: string): Promise<OrgCheckInOverview> {
    const now = new Date()
    const d7 = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    const d14 = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
    const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

    const [clientsRes, checkInsRes, membersRes] = await Promise.all([
        db.from('clients')
            .select('id, full_name, coach_id, is_active')
            .eq('org_id', orgId),
        db.from('check_ins')
            .select('id, client_id, date, created_at')
            .gte('date', d30)
            .order('date', { ascending: false })
            .limit(500),
        db.from('organization_members')
            .select('coach_id, coach:coaches(id, full_name)')
            .eq('org_id', orgId)
            .eq('role', 'coach')
            .eq('status', 'active')
            .is('deleted_at', null),
    ])

    const clients = clientsRes.data ?? []
    const orgClientIds = new Set(clients.map(c => c.id))
    const activeClients = clients.filter(c => c.is_active !== false)

    // Filter check-ins to only org clients
    const orgCheckIns = (checkInsRes.data ?? []).filter(ci => orgClientIds.has(ci.client_id))

    const total30d = orgCheckIns.length
    const checkIns7d = orgCheckIns.filter(ci => ci.date >= d7)
    const total7d = checkIns7d.length
    const clientsActive7d = new Set(checkIns7d.map(ci => ci.client_id)).size

    // Clients with last check-in older than 14 days (or never)
    const lastCheckInByClient = new Map<string, string>() // clientId -> date
    for (const ci of orgCheckIns) {
        const existing = lastCheckInByClient.get(ci.client_id)
        if (!existing || ci.date > existing) lastCheckInByClient.set(ci.client_id, ci.date)
    }
    const noCheckIn14d = activeClients.filter(c => {
        const last = lastCheckInByClient.get(c.id)
        return !last || last < d14
    }).length

    // Build coach lookup
    const coachMap = new Map<string, string>()
    for (const m of membersRes.data ?? []) {
        if (m.coach_id && m.coach && !Array.isArray(m.coach)) {
            coachMap.set(m.coach_id, (m.coach as { full_name: string | null }).full_name ?? 'Coach')
        }
    }

    // Per-coach stats
    const coachClientIds = new Map<string, Set<string>>() // coachId -> Set<clientId>
    for (const c of activeClients) {
        if (!c.coach_id) continue
        if (!coachClientIds.has(c.coach_id)) coachClientIds.set(c.coach_id, new Set())
        coachClientIds.get(c.coach_id)!.add(c.id)
    }
    const activeClientIds7d = new Set(checkIns7d.map(ci => ci.client_id))
    const byCoach = Array.from(coachClientIds.entries()).map(([coachId, clientSet]) => ({
        coachId,
        coachName: coachMap.get(coachId) ?? 'Coach',
        totalClients: clientSet.size,
        activeClients7d: [...clientSet].filter(id => activeClientIds7d.has(id)).length,
    })).sort((a, b) => b.totalClients - a.totalClients)

    // Recent 10 check-ins with client + coach name
    const clientMap = new Map(clients.map(c => [c.id, c]))
    const recent = orgCheckIns.slice(0, 10).map(ci => {
        const client = clientMap.get(ci.client_id)
        return {
            clientId: ci.client_id,
            clientName: client?.full_name ?? null,
            date: ci.date,
            coachName: client?.coach_id ? (coachMap.get(client.coach_id) ?? null) : null,
        }
    })

    return { total7d, total30d, clientsActive7d, totalOrgClients: clients.length, noCheckIn14d, byCoach, recent }
}
