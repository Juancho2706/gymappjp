import { supabase } from './supabase'
import { getCoachProfile } from './coach'
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

export type DirectorySortKey =
  | 'attention_score'
  | 'name_asc'
  | 'last_workout'
  | 'plan_days'

export type StatusFilter = 'any' | 'active' | 'paused' | 'archived'

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

  const [clientsRes, workoutLogsRes, checkInsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, phone, is_active, is_archived, force_password_change, created_at, subscription_start_date, workout_programs(id, name, start_date, weeks_to_repeat, is_active)')
      .eq('coach_id', coach.id)
      .order('full_name'),
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
  pulseById?: Map<string, PulseRow>
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
      matchesRisk = !!p && (p.attentionFlags?.includes('NUTRICION_RIESGO') || (p.nutritionPercentage > 0 && p.nutritionPercentage < 50))
    }

    return matchesSearch && matchesStatus && matchesRisk
  })
}

export function sortClients(clients: DirectoryClient[], key: DirectorySortKey, dir: SortDir = 'desc'): DirectoryClient[] {
  const sign = dir === 'asc' ? -1 : 1
  return [...clients].sort((a, b) => {
    if (key === 'name_asc') return a.fullName.localeCompare(b.fullName) * (dir === 'asc' ? 1 : -1)
    if (key === 'plan_days') {
      const da = a.planDaysRemaining ?? 9999
      const db = b.planDaysRemaining ?? 9999
      return (da - db) * (dir === 'asc' ? 1 : -1)
    }
    if (key === 'last_workout') {
      const da = a.lastWorkoutDate ? new Date(a.lastWorkoutDate).getTime() : 0
      const db = b.lastWorkoutDate ? new Date(b.lastWorkoutDate).getTime() : 0
      return (db - da) * sign
    }
    // attention_score
    return (b.attentionScore - a.attentionScore) * sign
  })
}
