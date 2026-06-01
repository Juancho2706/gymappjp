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
} from '@/infrastructure/db/org.repository'

export type { OrgWithMembership, OrgMember, OrgClient, OrgAnnouncement, OrgNutritionTemplate, OrgNutritionTemplateUsage, OrgInvoice, OrgClientPayment, OrgAssignmentHistoryItem, OrgAuditLog, CoachPerformanceData, OrgWorkoutProgramOverview, OrgCheckInOverview } from '@/infrastructure/db/org.repository'

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
