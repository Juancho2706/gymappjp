import type { AttentionFlag, DirectoryPulseRow } from '@/services/dashboard.service'
import type { RiskAlertItem, ActivityItemClient } from './dashboard.queries'

export type { AttentionFlag, RiskAlertItem, ActivityItemClient }

export interface KpiTrendPoint {
    label: string
    value: number
}

/**
 * Delta de un KPI del bento, ya resuelto en la capa de datos: número, copy y tono.
 *
 * `null` significa «sin dato honesto»: el tile no pinta línea de delta y nunca inventa un número.
 * El `text` viaja armado desde el servidor para que web desktop, web móvil y RN digan exactamente
 * lo mismo (copy en un solo lugar, regla anti-drift). El `tone` ya incorpora la dirección «buena»
 * de cada KPI, así que la UI solo mapea tono → token de color.
 */
export type KpiDelta = { value: number; text: string; tone: 'positive' | 'negative' | 'neutral' } | null

/**
 * Los cuatro deltas del bento del coach. `risk` es `null` solo hasta que exista la fila de hace 7
 * días del snapshot diario (`coach_kpi_snapshots`): coach recién dado de alta, o cron sin historial
 * todavía. Con esa fila también `clients` pasa de altas brutas a saldo NETO.
 */
export type KpiDeltas = {
    clients: KpiDelta
    risk: KpiDelta
    adherence: KpiDelta
    sessionsToday: KpiDelta
}

export interface KpiSummary {
    mrrCurrentMonth: number
    mrrPreviousMonth: number
    mrrDeltaPct: number
    totalClients: number
    riskCount: number
    avgAdherence: number
    avgNutrition: number
    /**
     * Deltas reales de los tiles del bento, resueltos en la capa de datos (`_lib/kpi-deltas`).
     * Requerido: si un KPI no tiene comparación honesta, su entrada vale `null`, no se omite.
     */
    deltas: KpiDeltas
}

export interface ExpiringProgramItem {
    id: string
    name: string
    endDate: string
    clientId: string | undefined
    clientName: string | undefined
    daysLeft: number
}

export interface ChartPoint {
    name: string
    fullName?: string
    sesiones?: number
    alumnos?: number
}

export interface AgendaItem {
    id: string
    clientId: string
    clientName: string
    kind: 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
    label: string
    href: string
    dueAt: string | null
}

export interface AdherenceStat {
    clientId: string
    clientName: string
    percentage: number
    lastPlan: string
    completedSets: number
    totalSets: number
    lastWorkoutDate: string | null
    lastCheckinDate: string | null
    currentWeight: number | null
    weightDelta7d: number | null
    weightHistory30d: { date: string; value: number }[]
    adherenceHistory4w: number[]
    oneRMDelta: number | null
    planDaysRemaining: number | null
    planCurrentWeek: number | null
    planTotalWeeks: number | null
    attentionScore: number
    attentionFlags: AttentionFlag[]
    streak: number
    latestEnergyLevel: number | null
    nutritionCompliance: number
}

export interface NutritionStat {
    clientId: string
    clientName: string
    percentage: number
    lastPlan: string
    consumed: { cal: number; prot: number; carb: number; fat: number }
    target: { cal: number; prot: number; carb: number; fat: number }
    lastWorkoutDate: string | null
    lastCheckinDate: string | null
    currentWeight: number | null
    weightDelta7d: number | null
    weightHistory30d: { date: string; value: number }[]
    adherenceHistory4w: number[]
    oneRMDelta: number | null
    planDaysRemaining: number | null
    planCurrentWeek: number | null
    planTotalWeeks: number | null
    attentionScore: number
    attentionFlags: AttentionFlag[]
    streak: number
    latestEnergyLevel: number | null
    adherence: number
}

export interface ClientPaymentSummary {
    clientId: string
    clientName: string
    lastPaymentDate: string | null
    lastPaymentAmount: number | null
    lastPaymentPeriodMonths: number | null
    nextRenewalDate: string | null
    hasRecentPayment: boolean
}

export interface ClientListItem {
    id: string
    name: string
}

export interface DashboardV2Data {
    kpi: KpiSummary
    activePlans: number
    /** Check-in o workout_log de alumnos del coach en los últimos 30 días (alineado a `thirtyDaysAgo` en dashboard.queries). */
    hasStudentSignal30d: boolean
    clientList: ClientListItem[]
    clientPaymentSummary: ClientPaymentSummary[]
    adherenceStats: AdherenceStat[]
    nutritionStats: NutritionStat[]
    recentActivities: ActivityItemClient[]
    /** Check-ins recientes (ventana del feed) sin revisar por el coach. Alimenta el badge "por revisar". */
    pendingCheckinsCount: number
    expiringPrograms: ExpiringProgramItem[]
    topRiskClients: RiskAlertItem[]
    areaData: ChartPoint[]
    barData: ChartPoint[]
    agenda: AgendaItem[]
    pulse: DirectoryPulseRow[]
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    trialEndsAt: string | null
}
