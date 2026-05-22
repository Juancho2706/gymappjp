import { getCoachProfile, type CoachProfile } from './coach'
import { supabase } from './supabase'

export type MobileKpiSummary = {
  mrrCurrentMonth: number
  mrrPreviousMonth: number
  mrrDeltaPct: number
  totalClients: number
  riskCount: number
  avgAdherence: number
  avgNutrition: number
}

export type MobileRiskAlertItem = {
  clientId: string
  clientName: string
  attentionScore: number
  label: string
}

export type MobileAgendaItem = {
  id: string
  clientId: string
  clientName: string
  kind: 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
  label: string
}

export type MobileExpiringProgramItem = {
  id: string
  name: string
  clientId: string
  clientName: string
  daysLeft: number
}

export type MobileActivityItem = {
  id: string
  type: 'nuevo alumno' | 'check-in' | 'workout'
  title: string
  subtitle: string
  date: string
  clientId?: string | null
}

export type MobileDashboardData = {
  coach: CoachProfile
  kpi: MobileKpiSummary
  topRiskClients: MobileRiskAlertItem[]
  agenda: MobileAgendaItem[]
  expiringPrograms: MobileExpiringProgramItem[]
  recentActivities: MobileActivityItem[]
}

type ClientRow = {
  id: string
  full_name: string
  created_at: string
  onboarding_completed?: boolean | null
}

type CheckInRow = {
  id: string
  client_id: string
  created_at: string
}

type WorkoutLogRow = {
  id: string
  client_id: string
  logged_at: string
}

type ClientPaymentRow = {
  client_id: string | null
  payment_date: string
  amount: number | string
  status: string | null
  period_months: number | null
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function monthKeyFromYm(y: number, month0: number): string {
  return `${y}-${String(month0 + 1).padStart(2, '0')}`
}

function addWholeMonths(y: number, month0: number, delta: number): { y: number; month0: number } {
  const dt = new Date(y, month0 + delta, 1)
  return { y: dt.getFullYear(), month0: dt.getMonth() }
}

function parsePaymentAmount(amount: unknown): number {
  if (typeof amount === 'number' && !Number.isNaN(amount)) return amount
  if (typeof amount === 'string') {
    const n = Number.parseFloat(amount)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function parsePaymentYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function isLastDayOfCalendarMonth(y: number, month1to12: number, day: number): boolean {
  return day === new Date(y, month1to12, 0).getDate()
}

function isPaidStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'paid' || s === 'pagado' || s === 'completed'
}

function allocatePaymentToMonthKeys(
  paymentDateIso: string,
  amountRaw: unknown,
  periodMonths: number | null | undefined
): Record<string, number> {
  const ymd = parsePaymentYmd(paymentDateIso)
  if (!ymd) return {}

  const total = Math.round(parsePaymentAmount(amountRaw))
  if (total <= 0) return {}

  const pm = Math.max(1, periodMonths ?? 1)
  let startY = ymd.y
  let startM0 = ymd.m - 1

  if (isLastDayOfCalendarMonth(ymd.y, ymd.m, ymd.d)) {
    const next = addWholeMonths(startY, startM0, 1)
    startY = next.y
    startM0 = next.month0
  }

  const base = Math.floor(total / pm)
  const remainder = total - base * pm
  const out: Record<string, number> = {}

  for (let i = 0; i < pm; i += 1) {
    const { y, month0 } = addWholeMonths(startY, startM0, i)
    const key = monthKeyFromYm(y, month0)
    const slice = base + (i === pm - 1 ? remainder : 0)
    out[key] = (out[key] ?? 0) + slice
  }

  return out
}

function latestByClient<T extends { client_id: string }>(rows: T[], dateKey: keyof T): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    const existing = out.get(row.client_id)
    if (!existing || new Date(String(row[dateKey])).getTime() > new Date(String(existing[dateKey])).getTime()) {
      out.set(row.client_id, row)
    }
  }
  return out
}

export async function getCoachDashboardDataMobile(): Promise<MobileDashboardData | null> {
  const coach = await getCoachProfile()
  if (!coach) return null

  const now = new Date()
  const today = startOfDay(now)
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const paymentsLookbackStart = new Date(now.getFullYear(), now.getMonth() - 13, 1).toISOString()
  const expiringEndUpper = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const expiringEndLower = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    clientsResult,
    plansCountResult,
    checkInsResult,
    workoutLogsResult,
    expiringProgramsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, created_at, onboarding_completed')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)
      .eq('is_active', true),
    supabase
      .from('workout_plans')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coach.id),
    supabase
      .from('check_ins')
      .select('id, client_id, created_at')
      .gte('created_at', thirtyDaysAgoIso)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('workout_logs')
      .select('id, client_id, logged_at')
      .gte('logged_at', thirtyDaysAgoIso)
      .order('logged_at', { ascending: false })
      .limit(500),
    supabase
      .from('workout_programs')
      .select('id, name, end_date, client_id')
      .eq('coach_id', coach.id)
      .eq('is_active', true)
      .not('end_date', 'is', null)
      .gte('end_date', expiringEndLower)
      .lte('end_date', expiringEndUpper)
      .order('end_date', { ascending: true })
      .limit(100),
    supabase
      .from('client_payments')
      .select('client_id, payment_date, amount, status, period_months')
      .eq('coach_id', coach.id)
      .gte('payment_date', paymentsLookbackStart),
  ])

  const clients = (clientsResult.data ?? []) as ClientRow[]
  const clientMap = new Map(clients.map((c) => [c.id, c]))
  const clientIds = new Set(clients.map((c) => c.id))
  const checkIns = ((checkInsResult.data ?? []) as CheckInRow[]).filter((row) => clientIds.has(row.client_id))
  const workoutLogs = ((workoutLogsResult.data ?? []) as WorkoutLogRow[]).filter((row) => clientIds.has(row.client_id))
  const payments = (paymentsResult.data ?? []) as ClientPaymentRow[]

  const latestCheckIn = latestByClient(checkIns, 'created_at')
  const latestWorkout = latestByClient(workoutLogs, 'logged_at')

  const riskItems: MobileRiskAlertItem[] = []
  for (const client of clients) {
    const checkIn = latestCheckIn.get(client.id)
    const workout = latestWorkout.get(client.id)
    const noCheckIn30d = !checkIn
    const noWorkout7d = !workout || new Date(workout.logged_at).getTime() < new Date(sevenDaysAgoIso).getTime()

    if (noCheckIn30d) {
      riskItems.push({
        clientId: client.id,
        clientName: client.full_name,
        attentionScore: noWorkout7d ? 95 : 85,
        label: 'Adherencia critica - sin check-in en 1 mes',
      })
    } else if (noWorkout7d) {
      riskItems.push({
        clientId: client.id,
        clientName: client.full_name,
        attentionScore: 75,
        label: 'Adherencia critica - sin ejercicio en 7 dias',
      })
    }
  }

  const topRiskClients = riskItems.sort((a, b) => b.attentionScore - a.attentionScore).slice(0, 5)

  const expiringPrograms = ((expiringProgramsResult.data ?? []) as Array<{
    id: string
    name: string
    end_date: string
    client_id: string | null
  }>)
    .map((program) => {
      const endDateParts = program.end_date.split('-')
      const endDate = new Date(
        Number.parseInt(endDateParts[0], 10),
        Number.parseInt(endDateParts[1], 10) - 1,
        Number.parseInt(endDateParts[2], 10)
      )
      const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400000)
      const client = program.client_id ? clientMap.get(program.client_id) : null
      return {
        id: program.id,
        name: program.name,
        clientId: program.client_id ?? '',
        clientName: client?.full_name ?? 'Sin alumno',
        daysLeft,
      }
    })
    .filter((program) => program.clientId && program.daysLeft <= 3)
    .slice(0, 8)

  const agenda: MobileAgendaItem[] = [
    ...expiringPrograms.map((program) => ({
      id: `expire-${program.id}`,
      clientId: program.clientId,
      clientName: program.clientName,
      kind: 'programa_vence' as const,
      label: program.daysLeft <= 0 ? `${program.name} vencio` : `${program.name} vence en ${program.daysLeft}d`,
    })),
    ...topRiskClients.map((client) => ({
      id: `risk-${client.clientId}`,
      clientId: client.clientId,
      clientName: client.clientName,
      kind: client.label.includes('check-in') ? 'checkin_pendiente' as const : 'sin_ejercicio' as const,
      label: client.label,
    })),
  ].slice(0, 8)

  const revenueByMonth: Record<string, number> = {}
  for (const payment of payments) {
    if (!isPaidStatus(payment.status)) continue
    const slices = allocatePaymentToMonthKeys(payment.payment_date, payment.amount, payment.period_months)
    for (const [key, value] of Object.entries(slices)) {
      revenueByMonth[key] = (revenueByMonth[key] ?? 0) + value
    }
  }

  const currentMonthKey = monthKeyFromYm(now.getFullYear(), now.getMonth())
  const prevMonthRef = addWholeMonths(now.getFullYear(), now.getMonth(), -1)
  const prevMonthKey = monthKeyFromYm(prevMonthRef.y, prevMonthRef.month0)
  const mrrCurrentMonth = revenueByMonth[currentMonthKey] ?? 0
  const mrrPreviousMonth = revenueByMonth[prevMonthKey] ?? 0
  const mrrDeltaPct =
    mrrPreviousMonth > 0
      ? Math.round(((mrrCurrentMonth - mrrPreviousMonth) / mrrPreviousMonth) * 100)
      : mrrCurrentMonth > 0
        ? 100
        : 0

  const clientsWithWorkout30d = new Set(workoutLogs.map((row) => row.client_id)).size
  const avgAdherence = clients.length > 0 ? Math.round((clientsWithWorkout30d / clients.length) * 100) : 0
  const avgNutrition = 0

  const activities: MobileActivityItem[] = []
  clients.slice(0, 5).forEach((client) => {
    activities.push({
      id: `client-${client.id}`,
      type: 'nuevo alumno',
      title: `${client.full_name} se ha unido`,
      subtitle: client.onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding',
      date: client.created_at,
      clientId: client.id,
    })
  })
  checkIns.slice(0, 5).forEach((checkIn) => {
    const client = clientMap.get(checkIn.client_id)
    if (!client) return
    activities.push({
      id: `checkin-${checkIn.id}`,
      type: 'check-in',
      title: `${client.full_name} subio su Check-in`,
      subtitle: 'Revisa su progreso semanal',
      date: checkIn.created_at,
      clientId: client.id,
    })
  })

  const seenWorkoutSessions = new Set<string>()
  workoutLogs.forEach((workout) => {
    const day = workout.logged_at.slice(0, 10)
    const sessionKey = `${workout.client_id}|${day}`
    if (seenWorkoutSessions.has(sessionKey)) return
    seenWorkoutSessions.add(sessionKey)
    const client = clientMap.get(workout.client_id)
    if (!client) return
    activities.push({
      id: `workout-${workout.client_id}-${day}`,
      type: 'workout',
      title: `${client.full_name} completo una sesion`,
      subtitle: 'Workout registrado',
      date: workout.logged_at,
      clientId: client.id,
    })
  })

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    coach,
    kpi: {
      mrrCurrentMonth,
      mrrPreviousMonth,
      mrrDeltaPct,
      totalClients: clients.length,
      riskCount: topRiskClients.length,
      avgAdherence,
      avgNutrition,
    },
    topRiskClients,
    agenda,
    expiringPrograms,
    recentActivities: activities.slice(0, 8),
  }
}
