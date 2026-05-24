import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
    findOrgBySlug,
    findOrgMembers,
    findOrgClients,
    findOrgAnnouncements,
    findOrgNutritionTemplates,
    findOrgAuditLogs,
    findOrgClientPayments,
    findOrgInvoices,
    getCoachPerformanceData,
    getOrgStats as _getOrgStats,
} from '@/infrastructure/db/org.repository'

export type { OrgWithMembership, OrgMember, OrgClient, OrgAnnouncement, OrgNutritionTemplate, OrgInvoice, OrgClientPayment, OrgAuditLog, CoachPerformanceData } from '@/infrastructure/db/org.repository'

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

export const getOrgAuditLogs = cache(async (orgId: string) => {
    const supabase = await createClient()
    return findOrgAuditLogs(supabase, orgId)
})

export const getCoachPerformance = cache(async (coachId: string, orgId: string) => {
    const supabase = await createClient()
    return getCoachPerformanceData(supabase, coachId, orgId)
})
