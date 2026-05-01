import type { AttentionFlag, DirectoryPulseRow } from '@/services/dashboard.service'
import type { RiskAlertItem, ActivityItemClient } from './dashboard.queries'

export type { AttentionFlag, RiskAlertItem, ActivityItemClient }

export interface KpiTrendPoint {
    label: string
    value: number
}

export interface KpiSummary {
    mrrCurrentMonth: number
    mrrPreviousMonth: number
    mrrDeltaPct: number
    totalClients: number
    riskCount: number
    avgAdherence: number
    avgNutrition: number
}

export interface ExpiringProgramItem {
    id: string
    name: string
    endDate: string
    clientId: string | undefined
    clientName: string | undefined
    clientSlug: string | undefined
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
