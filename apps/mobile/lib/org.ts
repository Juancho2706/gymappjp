import { supabase } from './supabase'

export interface CoachOrgContext {
  orgId: string | null
  orgRole: 'org_owner' | 'org_admin' | 'coach' | null
  orgName: string | null
  isOrgManaged: boolean
}

export async function getCoachOrgContext(): Promise<CoachOrgContext> {
  const { data: { session } } = await supabase.auth.getSession()
  const meta = session?.user?.app_metadata as Record<string, string> | undefined
  const orgId = meta?.org_id ?? null
  const orgRole = (meta?.org_role ?? null) as CoachOrgContext['orgRole']

  let orgName: string | null = null
  if (orgId) {
    const { data } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    orgName = data?.name ?? null
  }

  return { orgId, orgRole, orgName, isOrgManaged: !!orgId }
}

const ORG_ROLE_LABELS: Record<string, string> = {
  org_owner: 'Dueño',
  org_admin: 'Administrador',
  coach: 'Coach',
}

export function orgRoleLabel(role: string | null): string {
  return role ? (ORG_ROLE_LABELS[role] ?? role) : '—'
}
