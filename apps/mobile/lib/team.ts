import { supabase } from './supabase'

// Mi Equipo (mobile) — espejo user-scoped de apps/web .../coach/team.
// "team" = pool plano de coaches (feature PERMANENTE de EVA, aislada de enterprise).
// TODO acá corre bajo la sesión del coach (RLS es el techo): nunca service-role.
// Las operaciones que exigen admin/service-role en la web (crear cuenta de coach NUEVA)
// NO se replican: se derivan a la web (Linking). El resto (listar, editar rol, co-gestor,
// sacar, transferir, sumar coach existente) son user-scoped y sí viven acá.

export interface TeamMemberRow {
  id: string
  coach_id: string
  display_role: string | null
  can_manage: boolean
  name: string
}

export interface TeamOverview {
  id: string
  name: string
  slug: string
  seat_limit: number
  owner_coach_id: string
  invite_code: string | null
  primary_color: string | null
  logo_url: string | null
  logo_url_dark: string | null
  accent_light: string | null
  accent_dark: string | null
  neutral_tint: boolean
  splash_bg_color: string | null
  loader_text: string | null
  loader_text_color: string | null
  loader_icon_mode: string
  use_custom_loader: boolean
  enabled_modules: Record<string, boolean>
  members: TeamMemberRow[]
  activeMemberCount: number
  poolClientCount: number
  isOwner: boolean
  isManager: boolean
}

type Result = { ok: boolean; error?: string }

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Mapea mensajes crudos de triggers/constraints de DB a copy amigable (espejo web). */
function friendlyError(msg: string | undefined): string {
  if (!msg) return 'No se pudo completar la acción. Probá de nuevo.'
  if (msg.includes('seat_limit')) return 'Límite de cupos alcanzado. Pedí al administrador ampliar el equipo.'
  if (msg.includes('owner')) return 'Esta acción solo la puede hacer el owner del equipo.'
  if (msg.includes('can_manage')) return 'Solo el owner puede cambiar los permisos de gestión.'
  if (msg.includes('duplicate key') || msg.includes('unique')) return 'Ese coach ya está en el equipo.'
  return 'No se pudo completar la acción. Probá de nuevo.'
}

/**
 * Devuelve el team al que pertenece el coach actual (su contexto team), o null.
 * Cliente user-scoped → RLS: `teams` solo devuelve teams donde el coach es miembro/owner.
 * Si el coach está en >1 pool, toma el primero (mismo criterio de orden que la web).
 */
export async function getMyTeamOverview(): Promise<TeamOverview | null> {
  const coachId = await currentCoachId()
  if (!coachId) return null

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, slug, seat_limit, owner_coach_id, invite_code, primary_color, logo_url, logo_url_dark, accent_light, accent_dark, neutral_tint, splash_bg_color, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, enabled_modules')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)

  const team = (teams ?? [])[0] as any
  if (!team) return null

  const [membersRes, poolRes] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, coach_id, display_role, can_manage, joined_at, coaches(full_name, brand_name)')
      .eq('team_id', team.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('joined_at', { ascending: true }),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('is_archived', false),
  ])

  const members: TeamMemberRow[] = ((membersRes.data ?? []) as any[]).map((m) => {
    const rel = m.coaches
    const c = (Array.isArray(rel) ? rel[0] : rel) as { full_name?: string | null; brand_name?: string | null } | null
    return {
      id: m.id,
      coach_id: m.coach_id,
      display_role: m.display_role,
      can_manage: m.can_manage,
      name: c?.brand_name || c?.full_name || 'Coach',
    }
  })

  const isOwner = team.owner_coach_id === coachId
  const isManager = isOwner || (members.find((m) => m.coach_id === coachId)?.can_manage ?? false)

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    seat_limit: team.seat_limit,
    owner_coach_id: team.owner_coach_id,
    invite_code: team.invite_code ?? null,
    primary_color: team.primary_color ?? null,
    logo_url: team.logo_url ?? null,
    logo_url_dark: team.logo_url_dark ?? null,
    accent_light: team.accent_light ?? null,
    accent_dark: team.accent_dark ?? null,
    neutral_tint: !!team.neutral_tint,
    splash_bg_color: team.splash_bg_color ?? null,
    loader_text: team.loader_text ?? null,
    loader_text_color: team.loader_text_color ?? null,
    loader_icon_mode: team.loader_icon_mode ?? 'logo',
    use_custom_loader: !!team.use_custom_loader,
    enabled_modules: team.enabled_modules && typeof team.enabled_modules === 'object' ? (team.enabled_modules as Record<string, boolean>) : {},
    members,
    activeMemberCount: members.length,
    poolClientCount: poolRes.count ?? 0,
    isOwner,
    isManager,
  }
}

/** Cupos activos usados ahora (pre-check de UX; el trigger seat_guard es el guard duro). */
async function countActiveMembers(teamId: string): Promise<number> {
  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'active')
    .is('deleted_at', null)
  return count ?? 0
}

/**
 * Suma un coach EXISTENTE (por email) al pool. Si tiene una membresía previa revocada,
 * la reactiva; si no, inserta. user-scoped (RLS manager + seat pre-check + triggers de DB).
 * Lookup por email vía RPC SECURITY DEFINER `get_coach_id_by_email` (espejo web).
 */
export async function addExistingCoach(teamId: string, seatLimit: number, email: string, displayRole: string): Promise<Result> {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) return { ok: false, error: 'Indicá un email válido.' }

  if ((await countActiveMembers(teamId)) >= seatLimit) {
    return { ok: false, error: `Límite de ${seatLimit} cupos alcanzado.` }
  }

  const { data: targetCoachId } = await (supabase.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: string | null }>)(
    'get_coach_id_by_email', { p_email: clean },
  )
  if (!targetCoachId) return { ok: false, error: 'No existe un coach con ese email.' }

  // Aislamiento team<->enterprise: no absorber a un coach que ya está en una organización.
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', targetCoachId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (orgMember) return { ok: false, error: 'Ese coach pertenece a una organización; no se puede sumar a un equipo.' }

  const { data: existing } = await supabase
    .from('team_members')
    .select('id, status, deleted_at')
    .eq('team_id', teamId)
    .eq('coach_id', targetCoachId)
    .maybeSingle()

  if (existing && (existing as any).status === 'active' && !(existing as any).deleted_at) {
    return { ok: false, error: 'Ese coach ya es miembro del equipo.' }
  }

  if (existing) {
    const { error } = await supabase
      .from('team_members')
      .update({ status: 'active', deleted_at: null, display_role: displayRole.trim() || null })
      .eq('id', (existing as any).id)
    if (error) return { ok: false, error: friendlyError(error.message) }
  } else {
    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      coach_id: targetCoachId as string,
      display_role: displayRole.trim() || null,
      can_manage: false,
      status: 'active',
    })
    if (error) return { ok: false, error: friendlyError(error.message) }
  }
  return { ok: true }
}

/** Saca a un miembro del pool (soft-delete: status='revoked' + deleted_at). El owner no se puede sacar. */
export async function removeMember(teamId: string, memberId: string, ownerCoachId: string): Promise<Result> {
  const { data: member } = await supabase
    .from('team_members')
    .select('id, coach_id')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (!member) return { ok: false, error: 'Miembro no encontrado.' }
  if ((member as any).coach_id === ownerCoachId) return { ok: false, error: 'No se puede sacar al owner. Transferí la propiedad primero.' }

  const { error } = await supabase
    .from('team_members')
    .update({ status: 'revoked', deleted_at: new Date().toISOString() })
    .eq('id', memberId)
  if (error) return { ok: false, error: friendlyError(error.message) }
  return { ok: true }
}

/** Promueve/degrada co-gestor (can_manage). Solo owner (el trigger team_members_guard lo exige). */
export async function setMemberManage(teamId: string, memberId: string, canManage: boolean): Promise<Result> {
  const { error } = await supabase
    .from('team_members')
    .update({ can_manage: canManage })
    .eq('id', memberId)
    .eq('team_id', teamId)
  if (error) return { ok: false, error: friendlyError(error.message) }
  return { ok: true }
}

/** Edita la etiqueta de especialidad (display only). Cualquier gestor. */
export async function updateMemberRole(teamId: string, memberId: string, displayRole: string): Promise<Result> {
  const v = displayRole.trim()
  if (v.length > 60) return { ok: false, error: 'Especialidad: máximo 60 caracteres.' }
  const { error } = await supabase
    .from('team_members')
    .update({ display_role: v || null })
    .eq('id', memberId)
    .eq('team_id', teamId)
  if (error) return { ok: false, error: friendlyError(error.message) }
  return { ok: true }
}

/** Transfiere la propiedad del team a otro miembro activo. Solo owner. Atómico vía RPC. */
export async function transferOwnership(teamId: string, newOwnerCoachId: string): Promise<Result> {
  const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ error: { message: string } | null }>)(
    'transfer_team_ownership', { p_team_id: teamId, p_new_owner: newOwnerCoachId },
  )
  if (error) return { ok: false, error: friendlyError(error.message) }
  return { ok: true }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Marca del TEAM (subset editable en mobile: nombre + color primario + loader text).
 * Update user-scoped → RLS (team_teams_manager_update) es el techo. El upload de logos
 * exige service-role en la web (bucket/admin) → no se replica en mobile (se deriva a la web).
 */
export async function updateTeamBrand(teamId: string, fields: { name?: string; primary_color?: string | null; loader_text?: string | null }): Promise<Result> {
  const updates: Record<string, string | null> = {}

  if (fields.name !== undefined) {
    const v = fields.name.trim()
    if (v.length < 2 || v.length > 80) return { ok: false, error: 'Nombre del equipo: 2 a 80 caracteres.' }
    updates.name = v
  }
  if (fields.primary_color !== undefined) {
    const v = (fields.primary_color ?? '').trim()
    if (v === '') updates.primary_color = null
    else if (!HEX_RE.test(v)) return { ok: false, error: 'Color inválido (formato #RRGGBB).' }
    else updates.primary_color = v
  }
  if (fields.loader_text !== undefined) {
    const v = (fields.loader_text ?? '').trim()
    if (v.length > 24) return { ok: false, error: 'Texto del loader: máximo 24 caracteres.' }
    // Stored-XSS hardening (espejo web): este texto se inyecta en un <style> del shell del alumno.
    if (/[<>]/.test(v)) return { ok: false, error: 'El texto del loader no puede contener < o >.' }
    updates.loader_text = v || null
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: 'Nada que actualizar.' }

  const { error } = await supabase.from('teams').update(updates).eq('id', teamId)
  if (error) return { ok: false, error: friendlyError(error.message) }
  return { ok: true }
}
