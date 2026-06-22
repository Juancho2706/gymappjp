import { supabase } from './supabase'
import { getCoachProfile } from './coach'
import { getCoachOrgContext } from './org'
import { selectWithFallback } from './db-compat'
import { apiFetch } from './api'

export type AttentionFlag =
  | 'SIN_WORKOUT_7D'
  | 'SIN_CHECKIN_1M'
  | 'PLAN_VENCIDO'
  | 'SIN_PROGRAMA'
  | 'PENDIENTE_SYNC'
  | 'INACTIVO'

export type DirectoryRiskFilter =
  | 'all'
  | 'urgent'
  | 'review'
  | 'on_track'
  | 'expired_program'
  | 'password_reset'
  | 'no_program'
  | 'with_program'
  | 'nutrition_low'

export type SortDir = 'asc' | 'desc'

/** Métricas ricas por alumno (1:1 web DirectoryPulseRow) servidas por /api/mobile/coach/clients/pulse. */
export interface PulseRow {
  clientId: string
  percentage: number
  nutritionPercentage: number
  weightHistory30d: { date: string; value: number }[]
  adherenceHistory4w: number[]
  currentWeight: number | null
  weightDelta7d: number | null
  latestEnergyLevel: number | null
  streak: number
  planCurrentWeek: number | null
  planTotalWeeks: number | null
  attentionScore: number
  attentionFlags?: string[]
  lastWorkoutDate: string | null
}

// 1:1 con web (directory-types.ts). Las keys legacy mobile quedan como alias para no romper consumidores previos.
export type DirectorySortKey =
  | 'attention_score'
  | 'name_asc'
  | 'last_activity'
  | 'adherence_desc'
  | 'weight_delta'
  | 'plan_days'

export type StatusFilter = 'any' | 'active' | 'paused' | 'archived' | 'pending_sync'

/** 1:1 con web ProgramDirectoryFilter (filtro de programa del action bar). */
export type ProgramFilter = 'any' | 'with_program' | 'no_program' | 'expired'

export interface DirectoryClient {
  id: string
  fullName: string
  email: string
  phone: string | null
  isActive: boolean
  isArchived: boolean
  forcePwChange: boolean
  createdAt: string
  activeProgramName: string | null
  planDaysRemaining: number | null
  hasActiveProgram: boolean
  attentionScore: number
  attentionFlags: AttentionFlag[]
  lastWorkoutDate: string | null
  lastCheckinDate: string | null
  subscriptionStartDate: string | null
}

/** Días restantes de suscripción (start + 1 mes − hoy). null si no hay fecha. */
export function subscriptionDaysRemaining(startDate: string | null): number | null {
  if (!startDate) return null
  const end = new Date(startDate)
  end.setMonth(end.getMonth() + 1)
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

/** Pulse (métricas ricas) por id de alumno, vía endpoint mobile (reusa el cálculo web). */
export async function getCoachDirectoryPulse(): Promise<Map<string, PulseRow>> {
  try {
    const res = await apiFetch<{ pulse: PulseRow[] }>('/api/mobile/coach/clients/pulse', { authenticated: true })
    return new Map((res.pulse ?? []).map((p) => [p.clientId, p]))
  } catch {
    return new Map()
  }
}

// ─── Edición de datos del alumno (1:1 web EditClientDataModal: clients + client_intake) ──
// La web usa server actions (getClientIntakeAction / updateClientDataAction). En mobile leemos/
// escribimos vía la sesión RLS del coach: clients tiene GRANT UPDATE(full_name, phone, …) para
// authenticated y client_intake tiene GRANT ALL para authenticated (RLS = coach sobre su alumno).
// NUNCA service-role.
export interface ClientIntakeData {
  full_name: string
  phone: string | null
  weight_kg: number | null
  height_cm: number | null
  goals: string | null
  experience_level: string | null
  availability: string | null
  injuries: string | null
  medical_conditions: string | null
}

/** Lee nombre/teléfono + intake completo del alumno (1:1 web getClientIntakeAction). */
export async function getClientIntake(clientId: string): Promise<{ data?: ClientIntakeData; error?: string }> {
  const { data, error } = await supabase
    .from('clients')
    .select('full_name, phone, client_intake(weight_kg, height_cm, goals, experience_level, availability, injuries, medical_conditions)')
    .eq('id', clientId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Alumno no encontrado.' }
  const ci = Array.isArray((data as any).client_intake) ? (data as any).client_intake[0] : (data as any).client_intake
  return {
    data: {
      full_name: (data as any).full_name,
      phone: (data as any).phone ?? null,
      weight_kg: ci?.weight_kg ?? null,
      height_cm: ci?.height_cm ?? null,
      goals: ci?.goals ?? null,
      experience_level: ci?.experience_level ?? null,
      availability: ci?.availability ?? null,
      injuries: ci?.injuries ?? null,
      medical_conditions: ci?.medical_conditions ?? null,
    },
  }
}

/** Actualiza nombre/teléfono (clients) + upsert de intake (1:1 web updateClientDataAction). */
export async function updateClientData(
  clientId: string,
  values: Omit<ClientIntakeData, never>
): Promise<{ ok: boolean; error?: string }> {
  const { error: clientErr } = await supabase
    .from('clients')
    .update({ full_name: values.full_name, phone: values.phone || null })
    .eq('id', clientId)
  if (clientErr) return { ok: false, error: 'Error al actualizar datos del alumno.' }

  // Espejo exacto del payload web: numéricos a 0 si vacíos, strings a '' (columnas NOT NULL).
  const { error: intakeErr } = await supabase
    .from('client_intake')
    .upsert(
      {
        client_id: clientId,
        weight_kg: values.weight_kg != null ? Number(values.weight_kg) : 0,
        height_cm: values.height_cm != null ? Number(values.height_cm) : 0,
        goals: values.goals || '',
        experience_level: values.experience_level || '',
        availability: values.availability || '',
        injuries: values.injuries || null,
        medical_conditions: values.medical_conditions || null,
      },
      { onConflict: 'client_id' }
    )
  if (intakeErr) return { ok: false, error: 'Error al actualizar datos de onboarding.' }
  return { ok: true }
}

export interface DirectoryStats {
  total: number
  active: number
  reviewCount: number
  urgentCount: number
  onTrackCount: number
  pendingSyncCount: number
  expiredProgramCount: number
  noProgramCount: number
}

function calcPlanDaysRemaining(
  startDate: string | null | undefined,
  weeksToRepeat: number | null | undefined
): number | null {
  if (!startDate || !weeksToRepeat) return null
  const end = new Date(startDate)
  end.setDate(end.getDate() + weeksToRepeat * 7)
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export async function getCoachDirectoryClients(): Promise<DirectoryClient[]> {
  const coach = await getCoachProfile()
  if (!coach) return []

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  // TX-4: scoping de org explícito (no solo RLS). Seguro en standalone vía selectWithFallback:
  // si la columna org_id no existe en una prod vieja, cae a la query sin filtro de org.
  const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
  const clientsSelect = 'id, full_name, email, phone, is_active, is_archived, force_password_change, created_at, subscription_start_date, workout_programs(id, name, start_date, weeks_to_repeat, is_active)'

  const [clientsRes, workoutLogsRes, checkInsRes] = await Promise.all([
    selectWithFallback<any>(
      () => {
        const q = supabase.from('clients').select(clientsSelect).eq('coach_id', coach.id)
        return (orgId ? q.eq('org_id', orgId) : q.is('org_id', null)).order('full_name')
      },
      () => supabase.from('clients').select(clientsSelect).eq('coach_id', coach.id).order('full_name')
    ),
    supabase
      .from('workout_logs')
      .select('client_id, logged_at')
      .gte('logged_at', sevenDaysAgo)
      .order('logged_at', { ascending: false }),
    supabase
      .from('check_ins')
      .select('client_id, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }),
  ])

  const clients = (clientsRes.data ?? []) as any[]
  const workoutLogs = (workoutLogsRes.data ?? []) as { client_id: string; logged_at: string }[]
  const checkIns = (checkInsRes.data ?? []) as { client_id: string; created_at: string }[]

  const hasWorkout7d = new Set(workoutLogs.map((l) => l.client_id))
  const hasCheckin1m = new Set(checkIns.map((ci) => ci.client_id))

  const lastWorkoutMap = new Map<string, string>()
  for (const l of workoutLogs) {
    if (!lastWorkoutMap.has(l.client_id)) lastWorkoutMap.set(l.client_id, l.logged_at)
  }
  const lastCheckinMap = new Map<string, string>()
  for (const ci of checkIns) {
    if (!lastCheckinMap.has(ci.client_id)) lastCheckinMap.set(ci.client_id, ci.created_at)
  }

  return clients.map((c) => {
    const programs = (c.workout_programs ?? []) as any[]
    const activeProgram = programs.find((p) => p.is_active) ?? null
    const planDaysRemaining = activeProgram
      ? calcPlanDaysRemaining(activeProgram.start_date, activeProgram.weeks_to_repeat)
      : null

    const flags: AttentionFlag[] = []
    let score = 0

    if (c.is_active === false) { flags.push('INACTIVO'); score += 10 }
    if (c.force_password_change) { flags.push('PENDIENTE_SYNC'); score += 10 }
    if (!activeProgram) { flags.push('SIN_PROGRAMA'); score += 20 }
    else if (planDaysRemaining !== null && planDaysRemaining <= 0) { flags.push('PLAN_VENCIDO'); score += 30 }
    if (!hasWorkout7d.has(c.id)) { flags.push('SIN_WORKOUT_7D'); score += 30 }
    if (!hasCheckin1m.has(c.id)) { flags.push('SIN_CHECKIN_1M'); score += 20 }

    return {
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phone: c.phone ?? null,
      isActive: c.is_active !== false,
      isArchived: c.is_archived === true,
      forcePwChange: c.force_password_change === true,
      createdAt: c.created_at,
      activeProgramName: activeProgram?.name ?? null,
      planDaysRemaining,
      hasActiveProgram: !!activeProgram,
      attentionScore: Math.min(100, score),
      attentionFlags: flags,
      lastWorkoutDate: lastWorkoutMap.get(c.id) ?? null,
      lastCheckinDate: lastCheckinMap.get(c.id) ?? null,
      subscriptionStartDate: c.subscription_start_date ?? null,
    }
  })
}

export function buildStats(clients: DirectoryClient[]): DirectoryStats {
  const nonArchived = clients.filter((c) => !c.isArchived)
  return {
    total: nonArchived.length,
    active: nonArchived.filter((c) => c.isActive && !c.forcePwChange).length,
    reviewCount: nonArchived.filter((c) => c.attentionScore >= 25 && c.attentionScore < 50).length,
    urgentCount: nonArchived.filter((c) => c.attentionScore >= 50).length,
    onTrackCount: nonArchived.filter((c) => c.attentionScore < 25).length,
    pendingSyncCount: nonArchived.filter((c) => c.forcePwChange).length,
    expiredProgramCount: nonArchived.filter((c) => c.planDaysRemaining !== null && c.planDaysRemaining <= 0).length,
    noProgramCount: nonArchived.filter((c) => !c.hasActiveProgram).length,
  }
}

export function filterClients(
  clients: DirectoryClient[],
  search: string,
  riskFilter: DirectoryRiskFilter,
  statusFilter: StatusFilter,
  pulseById?: Map<string, PulseRow>,
  programFilter: ProgramFilter = 'any'
): DirectoryClient[] {
  return clients.filter((c) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      c.fullName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)

    let matchesStatus = true
    if (statusFilter === 'active') matchesStatus = !c.isArchived && c.isActive && !c.forcePwChange
    else if (statusFilter === 'paused') matchesStatus = !c.isArchived && !c.isActive
    else if (statusFilter === 'archived') matchesStatus = c.isArchived
    else if (statusFilter === 'pending_sync') matchesStatus = !c.isArchived && c.forcePwChange
    else matchesStatus = !c.isArchived

    let matchesRisk = true
    if (riskFilter === 'urgent') matchesRisk = c.attentionScore >= 50
    else if (riskFilter === 'review') matchesRisk = c.attentionScore >= 25 && c.attentionScore < 50
    else if (riskFilter === 'on_track') matchesRisk = c.attentionScore < 25
    else if (riskFilter === 'expired_program') matchesRisk = c.planDaysRemaining !== null && c.planDaysRemaining <= 0
    else if (riskFilter === 'password_reset') matchesRisk = c.forcePwChange
    else if (riskFilter === 'no_program') matchesRisk = !c.hasActiveProgram
    else if (riskFilter === 'with_program') matchesRisk = c.hasActiveProgram
    else if (riskFilter === 'nutrition_low') {
      const p = pulseById?.get(c.id)
      matchesRisk = !!p && (p.attentionFlags?.includes('NUTRICION_RIESGO') || (p.nutritionPercentage > 0 && p.nutritionPercentage < 60))
    }

    // Filtro de programa (1:1 web matchesProgramFilter): with_program / no_program / expired.
    let matchesProgram = true
    if (programFilter === 'with_program') matchesProgram = c.hasActiveProgram
    else if (programFilter === 'no_program') matchesProgram = !c.hasActiveProgram
    else if (programFilter === 'expired') matchesProgram = c.planDaysRemaining !== null && c.planDaysRemaining <= 0

    return matchesSearch && matchesStatus && matchesRisk && matchesProgram
  })
}

/** Dirección por defecto al elegir una key (1:1 web defaultSortDir). */
export function defaultSortDir(key: DirectorySortKey): SortDir {
  if (key === 'name_asc' || key === 'plan_days') return 'asc'
  return 'desc'
}

// 1:1 web sortClientsByKey: calcula cmp "ascendente" por key y aplica dir al final.
// Usa el attentionScore del pulse (autoritativo) cuando existe, con fallback al local.
export function sortClients(
  clients: DirectoryClient[],
  key: DirectorySortKey,
  dir: SortDir = 'desc',
  pulseById?: Map<string, PulseRow>
): DirectoryClient[] {
  const p = (id: string) => pulseById?.get(id)
  return [...clients].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'attention_score':
        cmp = (p(a.id)?.attentionScore ?? a.attentionScore ?? 0) - (p(b.id)?.attentionScore ?? b.attentionScore ?? 0)
        break
      case 'name_asc':
        cmp = a.fullName.localeCompare(b.fullName, 'es')
        break
      case 'last_activity': {
        const ta = (p(a.id)?.lastWorkoutDate ?? a.lastWorkoutDate) ? new Date((p(a.id)?.lastWorkoutDate ?? a.lastWorkoutDate)!).getTime() : 0
        const tb = (p(b.id)?.lastWorkoutDate ?? b.lastWorkoutDate) ? new Date((p(b.id)?.lastWorkoutDate ?? b.lastWorkoutDate)!).getTime() : 0
        cmp = ta - tb
        break
      }
      case 'adherence_desc':
        cmp = (p(a.id)?.percentage ?? 0) - (p(b.id)?.percentage ?? 0)
        break
      case 'weight_delta':
        cmp = Math.abs(p(a.id)?.weightDelta7d ?? 0) - Math.abs(p(b.id)?.weightDelta7d ?? 0)
        break
      case 'plan_days': {
        const na = a.planDaysRemaining ?? 99999
        const nb = b.planDaysRemaining ?? 99999
        cmp = na - nb
        break
      }
      default:
        cmp = 0
    }
    if (dir === 'desc') cmp = -cmp
    return cmp
  })
}
