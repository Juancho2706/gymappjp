import { supabase } from './supabase'

export type OrgRole = 'org_owner' | 'org_admin' | 'coach'

export interface OrgAdminContext {
  orgId: string
  orgRole: OrgRole
  orgName: string
  orgSlug: string
  userId: string
}

export interface OrgStats {
  totalCoaches: number
  totalClients: number
  activeClients: number
}

export interface OrgCoach {
  id: string
  userId: string
  fullName: string
  email: string
  role: OrgRole
  clientCount: number
  joinedAt: string
}

export interface OrgClient {
  id: string
  fullName: string
  email: string
  coachName: string | null
  coachId: string | null
  isActive: boolean
  createdAt: string
}

export async function getOrgAdminContext(): Promise<OrgAdminContext | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const meta = session.user.app_metadata as Record<string, string> | undefined
  const orgId = meta?.org_id
  const orgRole = meta?.org_role as OrgRole | undefined

  if (!orgId || !orgRole || orgRole === 'coach') return null

  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', orgId)
    .single()

  if (!org) return null

  return {
    orgId,
    orgRole,
    orgName: org.name,
    orgSlug: org.slug,
    userId: session.user.id,
  }
}

export async function getOrgStats(orgId: string): Promise<OrgStats> {
  const [coachesRes, clientsRes, activeRes] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('is_active', true),
  ])

  return {
    totalCoaches: coachesRes.count ?? 0,
    totalClients: clientsRes.count ?? 0,
    activeClients: activeRes.count ?? 0,
  }
}

export async function getOrgCoaches(orgId: string): Promise<OrgCoach[]> {
  const { data } = await supabase
    .from('organization_members')
    .select(`
      id,
      user_id,
      role,
      created_at,
      coaches ( full_name, email )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (!data) return []

  const coachIds = data.map((m) => m.user_id)
  const { data: clientCounts } = await supabase
    .from('clients')
    .select('coach_id')
    .in('coach_id', coachIds)
    .eq('is_active', true)

  const countMap: Record<string, number> = {}
  for (const c of clientCounts ?? []) {
    countMap[c.coach_id] = (countMap[c.coach_id] ?? 0) + 1
  }

  return data.map((m) => {
    const coach = Array.isArray(m.coaches) ? m.coaches[0] : m.coaches
    return {
      id: m.id,
      userId: m.user_id,
      fullName: coach?.full_name ?? 'Sin nombre',
      email: coach?.email ?? '',
      role: m.role as OrgRole,
      clientCount: countMap[m.user_id] ?? 0,
      joinedAt: m.created_at,
    }
  })
}

export async function getOrgClients(orgId: string): Promise<OrgClient[]> {
  const { data } = await supabase
    .from('clients')
    .select(`
      id,
      full_name,
      email,
      is_active,
      coach_id,
      created_at,
      coaches ( full_name )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((c) => {
    const coach = Array.isArray(c.coaches) ? c.coaches[0] : c.coaches
    return {
      id: c.id,
      fullName: c.full_name,
      email: c.email ?? '',
      coachName: coach?.full_name ?? null,
      coachId: c.coach_id ?? null,
      isActive: c.is_active ?? false,
      createdAt: c.created_at,
    }
  })
}

export async function removeCoachFromOrg(orgId: string, memberId: string): Promise<void> {
  await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', orgId)
}

export async function assignClientToCoach(clientId: string, coachId: string): Promise<void> {
  await supabase
    .from('clients')
    .update({ coach_id: coachId })
    .eq('id', clientId)
}
