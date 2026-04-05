'use server'

import { createClient } from '@/lib/supabase/server'
import { DashboardService } from '@/services/dashboard.service'

export async function getAdherenceStats() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const dashboardService = new DashboardService(supabase)
    return await dashboardService.getAdherenceStats(user.id)
}

export async function getNutritionStats() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const dashboardService = new DashboardService(supabase)
    return await dashboardService.getNutritionStats(user.id)
}
