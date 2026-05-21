'use server'

import {
    getAdherenceStats as getAdherenceStatsImpl,
    getNutritionStats as getNutritionStatsImpl,
} from './_actions/dashboard.actions'

export async function getAdherenceStats(...args: Parameters<typeof getAdherenceStatsImpl>) {
    return getAdherenceStatsImpl(...args)
}

export async function getNutritionStats(...args: Parameters<typeof getNutritionStatsImpl>) {
    return getNutritionStatsImpl(...args)
}
