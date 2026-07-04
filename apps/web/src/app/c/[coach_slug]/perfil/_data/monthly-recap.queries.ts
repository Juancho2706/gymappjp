import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getSantiagoMonthPrefix, formatSantiagoMonthLabel } from '@/lib/date-utils'
import { reduceMonthlyRecap } from './monthly-recap.reduce'

export interface MonthlyRecap {
    /** Sesiones (días entrenados) del mes calendario Santiago. */
    sessions: number
    /** Volumen total del mes en kg. */
    volumeKg: number
    /** Etiqueta legible del mes ("Julio 2026"). */
    monthLabel: string
}

/**
 * Resumen del mes calendario (Santiago) para la share-card mensual. Reusa los RPC existentes
 * (ya con GRANT a `authenticated` y guard IDOR 3-vías): sesiones vía `get_client_workout_day_counts`
 * y volumen vía `get_client_daily_tonnage`, ambos agregados en zona Santiago. Se piden 31 días y se
 * filtra al mes calendario (cubre cualquier día del mes). v1 sin conteo de PRs.
 */
export const getMonthlyRecap = cache(async (clientId: string): Promise<MonthlyRecap> => {
    const supabase = await createClient()
    const monthPrefix = getSantiagoMonthPrefix()

    const [dayCountsRes, tonnageRes] = await Promise.all([
        supabase.rpc('get_client_workout_day_counts', { p_client_id: clientId, p_days_back: 31 }),
        supabase.rpc('get_client_daily_tonnage', { p_client_id: clientId, p_max_days: 31 }),
    ])

    const dayCounts = (dayCountsRes.data ?? []) as { day: string; sets: number }[]
    const tonnage = (tonnageRes.data ?? []) as { day: string; tonnage: number }[]

    const { sessions, volumeKg } = reduceMonthlyRecap(dayCounts, tonnage, monthPrefix)

    return { sessions, volumeKg, monthLabel: formatSantiagoMonthLabel() }
})
