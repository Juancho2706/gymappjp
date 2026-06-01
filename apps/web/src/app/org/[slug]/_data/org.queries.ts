import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
    findOrgBySlug,
    findOrgMembers,
    findOrgClients,
    findOrgAnnouncements,
    findOrgNutritionTemplates,
    findOrgNutritionTemplateUsage,
    findOrgAuditLogs,
    findOrgClientPayments,
    findOrgAssignmentHistory,
    findOrgInvoices,
    getCoachPerformanceData,
    getOrgStats as _getOrgStats,
    findOrgWorkoutProgramOverview,
    findOrgCheckInOverview,
    findOrgCoachStreaks,
} from '@/infrastructure/db/org.repository'

export type { OrgWithMembership, OrgMember, OrgClient, OrgAnnouncement, OrgNutritionTemplate, OrgNutritionTemplateUsage, OrgInvoice, OrgClientPayment, OrgAssignmentHistoryItem, OrgAuditLog, CoachPerformanceData, OrgWorkoutProgramOverview, OrgCheckInOverview, CoachStreak } from '@/infrastructure/db/org.repository'

export const getOrgBySlug = cache(async (slug: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return findOrgBySlug(supabase, user.id, slug)
})

export const getOrgMembers = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgMembers(supabase, orgId)
})

export const getOrgClients = cache(async (orgId: string, search?: string) => {
    const supabase = await createClient()
    return findOrgClients(supabase, orgId, search)
})

export const getOrgAnnouncements = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgAnnouncements(supabase, orgId)
})

export const getOrgNutritionTemplates = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgNutritionTemplates(supabase, orgId)
})

export const getOrgNutritionTemplateUsage = cache(async (
    orgId: string,
    templates: import('@/infrastructure/db/org.repository').OrgNutritionTemplate[],
) => {
    const supabase = await createClient()
    return findOrgNutritionTemplateUsage(supabase, orgId, templates)
})

export const getOrgStats = cache(async (orgId: string) => {
    const supabase = await createClient()
    return _getOrgStats(supabase, orgId)
})

export const getOrgInvoices = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgInvoices(supabase, orgId)
})

export const getOrgClientPayments = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgClientPayments(supabase, orgId)
})

export const getOrgAssignmentHistory = cache(async (orgId: string, limit = 12) => {
    const supabase = await createClient()
    return findOrgAssignmentHistory(supabase, orgId, limit)
})

export const getOrgAuditLogs = cache(async (
    orgId: string,
    filters?: import('@/infrastructure/db/org.repository').OrgAuditLogFilters,
    limit = 100,
) => {
    const supabase = await createClient()
    return findOrgAuditLogs(supabase, orgId, limit, filters)
})

export const getCoachPerformance = cache(async (coachId: string, orgId: string) => {
    const supabase = await createClient()
    return getCoachPerformanceData(supabase, coachId, orgId)
})

export const getOrgWorkoutProgramOverview = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgWorkoutProgramOverview(supabase, orgId)
})

export const getOrgCheckInOverview = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgCheckInOverview(supabase, orgId)
})

export const getOrgCoachStreaks = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgCoachStreaks(supabase, orgId)
})

/** Org-owned nutrition plan templates (coach_id = null, from nutrition_plan_templates). */
export const getOrgNutritionPlanTemplates = cache(async (orgId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('nutrition_plan_templates')
        .select('id, name, description, goal_type, daily_calories, protein_g, carbs_g, fats_g')
        .eq('org_id', orgId)
        .is('coach_id', null)
        .order('created_at', { ascending: false })
    return data ?? []
})

/** Active nutrition plans across the org, grouped by coach. */
export const getOrgActiveNutritionPlans = cache(async (orgId: string) => {
    const supabase = await createClient()
    const [plansRes, membersRes] = await Promise.all([
        supabase
            .from('nutrition_plans')
            .select('id, name, coach_id, client_id, daily_calories')
            .eq('org_id', orgId)
            .eq('is_active', true),
        supabase
            .from('organization_members')
            .select('coach_id, coach:coaches(full_name)')
            .eq('org_id', orgId)
            .eq('role', 'coach')
            .eq('status', 'active')
            .is('deleted_at', null),
    ])
    const coachName = new Map<string, string>()
    for (const m of membersRes.data ?? []) {
        if (m.coach_id && m.coach && !Array.isArray(m.coach)) {
            coachName.set(m.coach_id, (m.coach as { full_name: string | null }).full_name ?? 'Coach')
        }
    }
    const byCoach = new Map<string, { coachId: string; coachName: string; plans: number; clients: Set<string> }>()
    for (const p of plansRes.data ?? []) {
        if (!p.coach_id) continue
        if (!byCoach.has(p.coach_id)) {
            byCoach.set(p.coach_id, { coachId: p.coach_id, coachName: coachName.get(p.coach_id) ?? 'Coach', plans: 0, clients: new Set() })
        }
        const b = byCoach.get(p.coach_id)!
        b.plans++
        if (p.client_id) b.clients.add(p.client_id)
    }
    return {
        totalActivePlans: plansRes.data?.length ?? 0,
        byCoach: Array.from(byCoach.values())
            .map(b => ({ coachId: b.coachId, coachName: b.coachName, plans: b.plans, clients: b.clients.size }))
            .sort((a, b) => b.plans - a.plans),
    }
})
