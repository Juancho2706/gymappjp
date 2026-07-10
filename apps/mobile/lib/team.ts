/**
 * team — capa de datos de "Mi Equipo" (E7-06). Lectura del team ACTIVO via PostgREST RLS del
 * coach (espejo de apps/web/.../coach/team/_data/team.queries.ts, recorte mobile: sin master-detail
 * ni tally por coach) + mutaciones via los endpoints /api/mobile/team/* (que aplican triggers de
 * gobernanza — seat_guard / anti-escalacion — imposibles de replicar por PostgREST directo).
 *
 * El `teamId` viene SIEMPRE del contexto de workspace (`useWorkspace().teamId`): un coach en dos
 * pools solo ve el del contexto activo. NADIE re-deriva el team fuera de este contrato.
 */
import { supabase } from './supabase'
import { apiFetch } from './api'

export interface TeamMemberView {
  id: string
  coachId: string
  displayRole: string | null
  canManage: boolean
  name: string
  isOwner: boolean
  isSelf: boolean
}

export interface TeamOverview {
  id: string
  name: string
  slug: string
  seatLimit: number
  ownerCoachId: string
  inviteCode: string | null
  primaryColor: string | null
  logoUrl: string | null
  enabledModules: Record<string, boolean>
  activeModuleCount: number
  members: TeamMemberView[]
  activeMemberCount: number
  seatsFull: boolean
  poolClientCount: number
  /** El coach actual es owner del pool. */
  isOwner: boolean
  /** El coach actual puede gestionar (owner o co-gestor). */
  isManager: boolean
}

/**
 * Overview del team activo. `null` si no hay sesion o el team no es visible por RLS (no-miembro /
 * borrado / suspendido). Cliente user-scoped => RLS es el techo: solo lee teams donde el coach es
 * miembro y co-miembros del mismo pool.
 */
export async function getTeamOverview(teamId: string): Promise<TeamOverview | null> {
  const { data: sess } = await supabase.auth.getSession()
  const userId = sess.session?.user?.id
  if (!userId) return null

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, seat_limit, owner_coach_id, invite_code, primary_color, logo_url, enabled_modules')
    .eq('id', teamId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!team) return null

  const [membersRes, poolRes] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, coach_id, display_role, can_manage, joined_at, coaches(full_name, brand_name)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('joined_at', { ascending: true }),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_archived', false),
  ])

  const members: TeamMemberView[] = (membersRes.data ?? []).map((m) => {
    const rel = (m as { coaches?: unknown }).coaches
    const c = (Array.isArray(rel) ? rel[0] : rel) as { full_name?: string | null; brand_name?: string | null } | null
    return {
      id: m.id as string,
      coachId: m.coach_id as string,
      displayRole: (m.display_role as string | null) ?? null,
      canManage: m.can_manage === true,
      name: c?.brand_name || c?.full_name || 'Coach',
      isOwner: m.coach_id === team.owner_coach_id,
      isSelf: m.coach_id === userId,
    }
  })

  const isOwner = team.owner_coach_id === userId
  const isManager = isOwner || (members.find((m) => m.coachId === userId)?.canManage ?? false)
  const enabledModules =
    team.enabled_modules && typeof team.enabled_modules === 'object'
      ? (team.enabled_modules as Record<string, boolean>)
      : {}
  const activeMemberCount = members.length
  const seatLimit = team.seat_limit ?? 0

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    seatLimit,
    ownerCoachId: team.owner_coach_id,
    inviteCode: team.invite_code ?? null,
    primaryColor: team.primary_color ?? null,
    logoUrl: team.logo_url ?? null,
    enabledModules,
    activeModuleCount: Object.values(enabledModules).filter(Boolean).length,
    members,
    activeMemberCount,
    seatsFull: seatLimit > 0 && activeMemberCount >= seatLimit,
    poolClientCount: poolRes.count ?? 0,
    isOwner,
    isManager,
  }
}

// ── Mutaciones (via /api/mobile/team/*; los triggers de gobernanza son el guard duro) ────────────

/** Vincula un coach EXISTENTE (por email) al pool. Endpoint: add-coach (espejo addExistingCoachAction). */
export function addTeamMember(teamId: string, email: string, displayRole?: string | null) {
  return apiFetch<{ success: true }>('/api/mobile/team/add-coach', {
    method: 'POST',
    authenticated: true,
    body: { teamId, email, display_role: displayRole?.trim() || undefined },
  })
}

/** Saca a un miembro del pool (soft-delete). Endpoint: remove-member. */
export function removeTeamMember(teamId: string, memberId: string) {
  return apiFetch<{ success: true }>('/api/mobile/team/remove-member', {
    method: 'POST',
    authenticated: true,
    body: { teamId, memberId },
  })
}

/** Promueve/degrada co-gestor (can_manage). SOLO owner. Endpoint: set-manage. */
export function setTeamMemberManage(teamId: string, memberId: string, canManage: boolean) {
  return apiFetch<{ success: true }>('/api/mobile/team/set-manage', {
    method: 'POST',
    authenticated: true,
    body: { teamId, memberId, canManage },
  })
}

/** Edita la marca del team (subconjunto: nombre + color primario). Endpoint: update-brand. */
export function updateTeamBrand(teamId: string, input: { name?: string; primary_color?: string | null }) {
  return apiFetch<{ success: true }>('/api/mobile/team/update-brand', {
    method: 'POST',
    authenticated: true,
    body: { teamId, ...input },
  })
}
