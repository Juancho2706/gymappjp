import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import {
    type AttentionFlag,
    mapDirectoryPulseToAdherenceStats,
    mapDirectoryPulseToNutritionStats,
} from '@/services/dashboard.service'

const FLAG_LABELS: Record<AttentionFlag, string> = {
    SIN_CHECKIN_7D: 'Sin check-in en 7 dias',
    CHECKIN_TARDIO: 'Check-in tardio',
    ADHERENCIA_CRITICA: 'Adherencia critica',
    ADHERENCIA_BAJA: 'Adherencia baja',
    NUTRICION_RIESGO: 'Nutricion en riesgo',
    PROGRAMA_VENCIDO: 'Programa vencido',
    PROGRAMA_POR_VENCER: 'Programa por vencer',
    FUERZA_CAYENDO: 'Fuerza cayendo',
}

export interface ActivityItemClient {
    id: string
    type: 'nuevo alumno' | 'check-in'
    title: string
    subtitle: string
    date: string
    href: string
}

export interface RiskAlertItem {
    clientId: string
    clientName: string
    attentionScore: number
    flags: AttentionFlag[]
    label: string
}

export async function getCoachDashboardData(userId: string) {
    const supabase = await createClient()

    const [
        clientsCount,
        workoutPlansCount,
        recentClientsRaw,
        recentCheckinsRaw,
        expiringProgramsRaw,
        clientsGrowthRaw,
        weeklyCheckinsRaw,
        pulse,
    ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', userId),
        supabase.from('workout_plans').select('*', { count: 'exact', head: true }).eq('coach_id', userId),
        supabase
            .from('clients')
            .select('id, full_name, email, created_at, onboarding_completed')
            .eq('coach_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('check_ins')
            .select('id, created_at, clients!inner(id, full_name, coach_id)')
            .eq('clients.coach_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('workout_programs')
            .select('id, name, end_date, client_id, clients:client_id (id, full_name, slug)')
            .eq('coach_id', userId)
            .eq('is_active', true)
            .not('end_date', 'is', null)
            .order('end_date', { ascending: true }),
        supabase.from('clients').select('created_at').eq('coach_id', userId),
        supabase
            .from('check_ins')
            .select('created_at, clients!inner(coach_id)')
            .eq('clients.coach_id', userId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        getCachedDirectoryPulse(userId),
    ])

    const adherenceStats = mapDirectoryPulseToAdherenceStats(pulse)
    const nutritionStats = mapDirectoryPulseToNutritionStats(pulse)
    const avgAdherence =
        adherenceStats.length > 0
            ? Math.round(adherenceStats.reduce((acc, s) => acc + s.percentage, 0) / adherenceStats.length)
            : 0
    const avgNutrition =
        nutritionStats.length > 0
            ? Math.round(nutritionStats.reduce((acc, s) => acc + s.percentage, 0) / nutritionStats.length)
            : 0

    const rawRecentClients = recentClientsRaw.data || []
    const rawRecentCheckins = (recentCheckinsRaw.data as { id: string; created_at: string; clients: { id: string; full_name: string } }[] | null) || []
    const rawExpiringPrograms = (expiringProgramsRaw.data as any[] | null) || []
    const allClientsData = clientsGrowthRaw.data || []
    const weeklyCheckinsData = weeklyCheckinsRaw.data || []

    const activities: ActivityItemClient[] = []

    rawRecentClients.forEach((c) => {
        activities.push({
            id: `client-${c.id}`,
            type: 'nuevo alumno',
            title: `${c.full_name} se ha unido`,
            subtitle: c.onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding',
            date: c.created_at,
            href: `/coach/clients/${c.id}`,
        })
    })

    rawRecentCheckins.forEach((c) => {
        activities.push({
            id: `checkin-${c.id}`,
            type: 'check-in',
            title: `${c.clients.full_name} subio su Check-in`,
            subtitle: 'Revisa su progreso semanal',
            date: c.created_at,
            href: `/coach/clients/${c.clients.id}`,
        })
    })

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const recentActivities = activities.slice(0, 5)

    const nowUTC = new Date()
    const todayMidnight = new Date(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate())
    const expiringPrograms = rawExpiringPrograms
        .map((p) => {
            const endDateParts = p.end_date.split('-')
            const endDate = new Date(
                Number.parseInt(endDateParts[0], 10),
                Number.parseInt(endDateParts[1], 10) - 1,
                Number.parseInt(endDateParts[2], 10)
            )
            const diffTime = endDate.getTime() - todayMidnight.getTime()
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
            return {
                id: p.id,
                name: p.name,
                endDate: p.end_date,
                clientId: p.clients?.id,
                clientName: p.clients?.full_name,
                clientSlug: p.clients?.slug,
                daysLeft: diffDays,
            }
        })
        .filter((p) => p.daysLeft <= 3)

    const topRiskClients: RiskAlertItem[] = pulse
        .filter((row) => row.attentionScore > 0)
        .sort((a, b) => b.attentionScore - a.attentionScore)
        .slice(0, 5)
        .map((row) => ({
            clientId: row.clientId,
            clientName: row.clientName,
            attentionScore: row.attentionScore,
            flags: row.attentionFlags,
            label: row.attentionFlags.length > 0 ? FLAG_LABELS[row.attentionFlags[0]] : 'Seguimiento recomendado',
        }))

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const growthMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i -= 1) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = `${monthNames[d.getMonth()]}`
        growthMap[key] = 0
    }
    allClientsData.forEach((c) => {
        const d = new Date(c.created_at)
        const key = `${monthNames[d.getMonth()]}`
        if (growthMap[key] !== undefined) growthMap[key] += 1
    })
    let total = 0
    const areaData = Object.entries(growthMap).map(([name, count]) => {
        total += count
        return { name, alumnos: total }
    })

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
    const checkinsMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = dayNames[d.getDay()]
        checkinsMap[key] = 0
    }
    weeklyCheckinsData.forEach((c) => {
        const d = new Date(c.created_at)
        const key = dayNames[d.getDay()]
        if (checkinsMap[key] !== undefined) checkinsMap[key] += 1
    })
    const barData = Object.entries(checkinsMap).map(([name, checkins]) => ({ name, checkins }))

    return {
        totalClients: clientsCount.count ?? 0,
        activePlans: workoutPlansCount.count ?? 0,
        avgAdherence,
        avgNutrition,
        adherenceStats,
        nutritionStats,
        recentActivities,
        expiringPrograms,
        topRiskClients,
        areaData,
        barData,
    }
}
