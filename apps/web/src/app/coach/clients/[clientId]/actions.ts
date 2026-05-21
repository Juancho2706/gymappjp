'use server'

import {
    addPayment as addPaymentImpl,
    deletePayment as deletePaymentImpl,
    getClientHabitsForDate as getClientHabitsForDateImpl,
    getClientNutritionActivityDates as getClientNutritionActivityDatesImpl,
    getClientNutritionForDate as getClientNutritionForDateImpl,
    getClientProfileData as getClientProfileDataImpl,
    getClientWorkoutActivityDates as getClientWorkoutActivityDatesImpl,
    getClientWorkoutForDate as getClientWorkoutForDateImpl,
    getDynamicMetrics as getDynamicMetricsImpl,
    getWeeklyCompliance as getWeeklyComplianceImpl,
    updateClientGoalWeight as updateClientGoalWeightImpl,
} from './_actions/client-detail.actions'

export async function getClientProfileData(...args: Parameters<typeof getClientProfileDataImpl>) {
    return getClientProfileDataImpl(...args)
}

export async function addPayment(...args: Parameters<typeof addPaymentImpl>) {
    return addPaymentImpl(...args)
}

export async function deletePayment(...args: Parameters<typeof deletePaymentImpl>) {
    return deletePaymentImpl(...args)
}

export async function getWeeklyCompliance(...args: Parameters<typeof getWeeklyComplianceImpl>) {
    return getWeeklyComplianceImpl(...args)
}

export async function getDynamicMetrics(...args: Parameters<typeof getDynamicMetricsImpl>) {
    return getDynamicMetricsImpl(...args)
}

export async function getClientNutritionForDate(...args: Parameters<typeof getClientNutritionForDateImpl>) {
    return getClientNutritionForDateImpl(...args)
}

export async function getClientWorkoutForDate(...args: Parameters<typeof getClientWorkoutForDateImpl>) {
    return getClientWorkoutForDateImpl(...args)
}

export async function updateClientGoalWeight(...args: Parameters<typeof updateClientGoalWeightImpl>) {
    return updateClientGoalWeightImpl(...args)
}

export async function getClientWorkoutActivityDates(...args: Parameters<typeof getClientWorkoutActivityDatesImpl>) {
    return getClientWorkoutActivityDatesImpl(...args)
}

export async function getClientHabitsForDate(...args: Parameters<typeof getClientHabitsForDateImpl>) {
    return getClientHabitsForDateImpl(...args)
}

export async function getClientNutritionActivityDates(...args: Parameters<typeof getClientNutritionActivityDatesImpl>) {
    return getClientNutritionActivityDatesImpl(...args)
}
