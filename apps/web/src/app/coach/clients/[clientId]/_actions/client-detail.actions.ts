'use server'

import {
    addPayment as addPaymentService,
    deletePayment as deletePaymentService,
    getClientHabitsForDate as getClientHabitsForDateService,
    getClientNutritionActivityDates as getClientNutritionActivityDatesService,
    getClientNutritionForDate as getClientNutritionForDateService,
    getClientProfileData as getClientProfileDataService,
    getClientWorkoutActivityDates as getClientWorkoutActivityDatesService,
    getClientWorkoutForDate as getClientWorkoutForDateService,
    getDynamicMetrics as getDynamicMetricsService,
    getWeeklyCompliance as getWeeklyComplianceService,
    updateClientGoalWeight as updateClientGoalWeightService,
    markCheckInReviewed as markCheckInReviewedService,
} from '@/services/client/client-detail.service'
import { assembleClientFichaPanel } from '../_data/ficha-panel.data'
import { revalidatePath } from 'next/cache'

export async function getClientProfileData(clientId: string) {
    return getClientProfileDataService(clientId)
}

/**
 * Bundle completo de la ficha (hero + dashboard + zona C nutrición + módulos) para el
 * panel derecho del master-detail de Alumnos (desktop). Datos REALES, mismo origen que
 * la ruta `/coach/clients/[clientId]`. Se invoca al seleccionar un alumno en el rail.
 */
export async function getClientFichaPanel(clientId: string) {
    return assembleClientFichaPanel(clientId)
}

export async function addPayment(data: {
    client_id: string
    amount: number
    service_description: string
    period_months?: number
    payment_date: string
    status?: string
}) {
    return addPaymentService(data)
}

export async function deletePayment(paymentId: string, clientId: string) {
    return deletePaymentService(paymentId, clientId)
}

export async function markCheckInReviewed(clientId: string, checkInId: string) {
    const res = await markCheckInReviewedService(clientId, checkInId)
    revalidatePath(`/coach/clients/${clientId}`)
    return res
}

export async function getWeeklyCompliance(clientId: string) {
    return getWeeklyComplianceService(clientId)
}

export async function getDynamicMetrics(clientId: string) {
    return getDynamicMetricsService(clientId)
}

export async function getClientNutritionForDate(clientId: string, date: string) {
    return getClientNutritionForDateService(clientId, date)
}

export async function getClientWorkoutForDate(clientId: string, date: string) {
    return getClientWorkoutForDateService(clientId, date)
}

export async function updateClientGoalWeight(clientId: string, goalWeightKg: number | null) {
    return updateClientGoalWeightService(clientId, goalWeightKg)
}

export async function getClientWorkoutActivityDates(clientId: string): Promise<string[]> {
    return getClientWorkoutActivityDatesService(clientId)
}

export async function getClientHabitsForDate(
    clientId: string,
    date: string
): Promise<{ water_ml: number | null; steps: number | null; sleep_hours: number | null; fasting_hours: number | null; supplements: string[] | null; notes: string | null } | null> {
    return getClientHabitsForDateService(clientId, date)
}

export async function getClientNutritionActivityDates(clientId: string): Promise<string[]> {
    return getClientNutritionActivityDatesService(clientId)
}
