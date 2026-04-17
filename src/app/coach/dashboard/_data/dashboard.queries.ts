import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import { measureServer } from '@/lib/perf/measure-server'
import {
    type AttentionFlag,
    mapDirectoryPulseToAdherenceStats,
    mapDirectoryPulseToNutritionStats,
} from '@/services/dashboard.service'

const FLAG_LABELS: Record<AttentionFlag, string> = {
    SIN_CHECKIN_1M: 'Adherencia critica · sin check-in en 1 mes',
    SIN_EJERCICIO_7D: 'Adherencia critica · sin ejercicio en 7 dias',
    NUTRICION_RIESGO: 'Nutricion en riesgo',
    PROGRAMA_VENCIDO: 'Programa vencido',
    PROGRAMA_POR_VENCER: 'Programa por vencer',
    FUERZA_CAYENDO: 'Fuerza cayendo',
}

export interface ActivityItemClient {
    id: string
    type: 'nuevo alumno' | 'check-in' | 'workout'
    title: string
    subtitle: string
    date: string
    href: string
    photoUrl?: string | null
}

function extractAmountClp(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const candidates = [
        root.transaction_amount,
        (root.auto_recurring as Record<string, unknown> | undefined)?.transaction_amount,
        (root.data as Record<string, unknown> | undefined)?.transaction_amount,
    ]
    for (const c of candidates) {
        if (typeof c === 'number' && c > 0) return c
        if (typeof c === 'string') {
            const n = parseFloat(c)
            if (!Number.isNaN(n) && n > 0) return n
        }
    }
    return null
}

export interface RiskAlertItem {
    clientId: string
    clientName: string
    attentionScore: number
    flags: AttentionFlag[]
    label: string
}

export async function getCoachDashboardData(userId: string) {
    return measureServer('getCoachDashboardData', () => getCoachDashboardDataInner(userId))
}

async function getCoachDashboardDataInner(userId: string) {
    const supabase = await createClient()

    const now = new Date()
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
        clientsCount,
        workoutPlansCount,
        recentClientsRaw,
        recentCheckinsRaw,
        expiringProgramsRaw,
        clientsGrowthRaw,
        workoutSessionsSeriesRaw,
        workoutLogs30dRaw,
        recentWorkoutsRaw,
        subscriptionEventsRaw,
        pulse,
        coachSubscriptionRaw,
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
            .select('id, created_at, photos, clients!inner(id, full_name, coach_id)')
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
        // Fast SQL aggregation (if migration is applied)
        supabase.rpc('get_coach_workout_sessions_30d' as never, { p_coach_id: userId } as never),
        // 30-day workout sessions for AreaChart (solo columnas necesarias; join para RLS/filtro coach)
        supabase
            .from('workout_logs')
            .select('logged_at, client_id, clients!inner(coach_id)')
            .eq('clients.coach_id', userId)
            .gte('logged_at', thirtyDaysAgo),
        // Recent workout completions for activity feed
        supabase
            .from('workout_logs')
            .select('id, logged_at, client_id, clients!inner(id, full_name, coach_id)')
            .eq('clients.coach_id', userId)
            .order('logged_at', { ascending: false })
            .limit(50),
        // Subscription events for MRR (last 60 days)
        supabase
            .from('subscription_events')
            .select('created_at, payload, provider_status')
            .eq('coach_id', userId)
            .gte('created_at', startOfPrevMonth),
        getCachedDirectoryPulse(userId),
        supabase
            .from('coaches')
            .select('subscription_status, current_period_end, trial_ends_at')
            .eq('id', userId)
            .maybeSingle(),
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
    const rawRecentCheckins = (recentCheckinsRaw.data as { id: string; created_at: string; photos: string[] | null; clients: { id: string; full_name: string } }[] | null) || []
    const rawExpiringPrograms = (expiringProgramsRaw.data as any[] | null) || []
    const allClientsData = clientsGrowthRaw.data || []
    const workoutLogs30d = workoutLogs30dRaw.data || []
    const workoutSessionsSeries =
        !workoutSessionsSeriesRaw.error && Array.isArray(workoutSessionsSeriesRaw.data)
            ? (workoutSessionsSeriesRaw.data as { day: string; sessions: number }[])
            : null
    const rawRecentWorkouts = (recentWorkoutsRaw.data as { id: string; logged_at: string; client_id: string; clients: { id: string; full_name: string } }[] | null) || []
    const subscriptionEvents = subscriptionEventsRaw.data || []

    // MRR: sum amounts from subscription_events in current and previous month
    const mrrCurrentMonth = subscriptionEvents
        .filter((e) => e.created_at >= startOfCurrentMonth)
        .reduce((sum, e) => sum + (extractAmountClp(e.payload) ?? 0), 0)
    const mrrPreviousMonth = subscriptionEvents
        .filter((e) => e.created_at >= startOfPrevMonth && e.created_at < startOfCurrentMonth)
        .reduce((sum, e) => sum + (extractAmountClp(e.payload) ?? 0), 0)

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
        const firstPhoto = Array.isArray(c.photos) && c.photos.length > 0 ? c.photos[0] : null
        activities.push({
            id: `checkin-${c.id}`,
            type: 'check-in',
            title: `${c.clients.full_name} subio su Check-in`,
            subtitle: 'Revisa su progreso semanal',
            date: c.created_at,
            href: `/coach/clients/${c.clients.id}`,
            photoUrl: firstPhoto,
        })
    })

    // Deduplicate workout entries: one activity per (client_id + day)
    const seenWorkoutSessions = new Set<string>()
    rawRecentWorkouts.forEach((w) => {
        const dayStr = w.logged_at.slice(0, 10)
        const sessionKey = `${w.client_id}|${dayStr}`
        if (!seenWorkoutSessions.has(sessionKey)) {
            seenWorkoutSessions.add(sessionKey)
            activities.push({
                id: `workout-${w.client_id}-${dayStr}`,
                type: 'workout',
                title: `${w.clients.full_name} completó una sesión`,
                subtitle: 'Workout registrado',
                date: w.logged_at,
                href: `/coach/clients/${w.clients.id}`,
            })
        }
    })

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const recentActivities = activities.slice(0, 8)

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

    const criticalFlags: AttentionFlag[] = ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D']
    const topRiskClients: RiskAlertItem[] = pulse
        .filter((row) => row.attentionFlags.some((flag) => criticalFlags.includes(flag)))
        .sort((a, b) => b.attentionScore - a.attentionScore)
        .slice(0, 5)
        .map((row) => ({
            clientId: row.clientId,
            clientName: row.clientName,
            attentionScore: row.attentionScore,
            flags: row.attentionFlags,
            label: row.attentionFlags.length > 0 ? FLAG_LABELS[row.attentionFlags[0]] : 'Seguimiento recomendado',
        }))

    // AreaChart: unique workout sessions per day (last 30 days, deduplicated by client+day)
    const sessionsByDay: Record<string, number> = {}
    for (let i = 29; i >= 0; i -= 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
        sessionsByDay[key] = 0
    }
    if (workoutSessionsSeries && workoutSessionsSeries.length > 0) {
        for (const row of workoutSessionsSeries) {
            const d = new Date(row.day)
            const dayKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
            if (sessionsByDay[dayKey] !== undefined) sessionsByDay[dayKey] = row.sessions
        }
    } else {
        const seenSessionKeys = new Set<string>()
        workoutLogs30d.forEach((w) => {
            const d = new Date(w.logged_at)
            const dayKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
            // Fallback path: deduplicate by client per day in app.
            const sessionKey = `${(w as { client_id?: string }).client_id ?? ''}|${dayKey}`
            if (!seenSessionKeys.has(sessionKey)) {
                seenSessionKeys.add(sessionKey)
                if (sessionsByDay[dayKey] !== undefined) sessionsByDay[dayKey] += 1
            }
        })
    }
    // Show every 5th label to avoid crowding
    const areaData = Object.entries(sessionsByDay).map(([name, sesiones], idx) => ({
        name: idx % 5 === 0 ? name : '',
        fullName: name,
        sesiones,
    }))

    // BarChart: new clients per month (last 6 months, non-cumulative)
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const growthMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i -= 1) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = monthNames[d.getMonth()]
        growthMap[key] = 0
    }
    allClientsData.forEach((c) => {
        const d = new Date(c.created_at)
        const key = monthNames[d.getMonth()]
        if (growthMap[key] !== undefined) growthMap[key] += 1
    })
    const barData = Object.entries(growthMap).map(([name, alumnos]) => ({ name, alumnos }))

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
        mrrCurrentMonth,
        mrrPreviousMonth,
        subscriptionStatus: coachSubscriptionRaw.data?.subscription_status ?? null,
        currentPeriodEnd: coachSubscriptionRaw.data?.current_period_end ?? null,
        trialEndsAt: coachSubscriptionRaw.data?.trial_ends_at ?? null,
    }
}
