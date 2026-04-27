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

/** Align with BillingTabB8: only completed / paid rows count toward coach revenue. */
function isClientPaymentCountedForRevenue(status: string | null | undefined): boolean {
    const s = String(status || '').toLowerCase()
    return s === 'paid' || s === 'pagado' || s === 'completed'
}

function parsePaymentAmount(amount: unknown): number {
    if (typeof amount === 'number' && !Number.isNaN(amount)) return amount
    if (typeof amount === 'string') {
        const n = Number.parseFloat(amount)
        return Number.isNaN(n) ? 0 : n
    }
    return 0
}

/** YYYY-MM-DD from ISO or timestamptz string */
function parsePaymentYmd(iso: string): { y: number; m: number; d: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
    if (!m) return null
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function isLastDayOfCalendarMonth(y: number, month1to12: number, day: number): boolean {
    return day === new Date(y, month1to12, 0).getDate()
}

function monthKeyFromYm(y: number, month0: number): string {
    return `${y}-${String(month0 + 1).padStart(2, '0')}`
}

function addWholeMonths(y: number, month0: number, delta: number): { y: number; month0: number } {
    const dt = new Date(y, month0 + delta, 1)
    return { y: dt.getFullYear(), month0: dt.getMonth() }
}

/**
 * Reparte el monto en meses calendario del coach:
 * - Si el pago cae el último día del mes, el primer mes de servicio se considera el **siguiente**
 *   (ej. 31 mar + mensualidad abril → todo el monto en abril).
 * - Con period_months > 1, reparte amount/periodo en meses consecutivos desde ese inicio.
 */
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

    for (let i = 0; i < pm; i++) {
        const { y, month0 } = addWholeMonths(startY, startM0, i)
        const key = monthKeyFromYm(y, month0)
        const slice = base + (i === pm - 1 ? remainder : 0)
        out[key] = (out[key] ?? 0) + slice
    }

    return out
}

export interface RiskAlertItem {
    clientId: string
    clientName: string
    attentionScore: number
    flags: AttentionFlag[]
    label: string
}

export async function getCoachDashboardDataV2(userId: string) {
    return measureServer('getCoachDashboardDataV2', async () => {
        const base = await getCoachDashboardDataInner(userId)
        const pulse = await getCachedDirectoryPulse(userId)

        const mrrDeltaPct =
            base.mrrPreviousMonth > 0
                ? Math.round(((base.mrrCurrentMonth - base.mrrPreviousMonth) / base.mrrPreviousMonth) * 100)
                : base.mrrCurrentMonth > 0
                ? 100
                : 0

        const agenda = buildAgendaFromPulse(pulse, base.expiringPrograms)

        const riskCount = base.topRiskClients.length

        const kpi = {
            mrrCurrentMonth: base.mrrCurrentMonth,
            mrrPreviousMonth: base.mrrPreviousMonth,
            mrrDeltaPct,
            totalClients: base.totalClients,
            riskCount,
            avgAdherence: base.avgAdherence,
            avgNutrition: base.avgNutrition,
        }

        const clientList = pulse.map((p) => ({ id: p.clientId, name: p.clientName }))
        const clientPaymentSummary = buildClientPaymentSummary(base._rawClientPayments ?? [], pulse)

        return { ...base, pulse, mrrDeltaPct, agenda, kpi, clientList, clientPaymentSummary }
    })
}

function buildAgendaFromPulse(
    pulse: Awaited<ReturnType<typeof getCachedDirectoryPulse>>,
    expiring: Array<{ id: string; clientId?: string; clientName?: string; daysLeft: number; name: string }>
) {
    const items: Array<{
        id: string
        clientId: string
        clientName: string
        kind: 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
        label: string
        href: string
        dueAt: string | null
    }> = []

    for (const p of expiring) {
        if (!p.clientId || !p.clientName) continue
        items.push({
            id: `expire-${p.id}`,
            clientId: p.clientId,
            clientName: p.clientName,
            kind: 'programa_vence',
            label: p.daysLeft <= 0 ? `${p.name} vencio` : `${p.name} vence en ${p.daysLeft}d`,
            href: `/coach/clients/${p.clientId}`,
            dueAt: null,
        })
    }

    for (const row of pulse) {
        if (row.attentionFlags.includes('SIN_CHECKIN_1M')) {
            items.push({
                id: `checkin-${row.clientId}`,
                clientId: row.clientId,
                clientName: row.clientName,
                kind: 'checkin_pendiente',
                label: 'Check-in pendiente (>30d)',
                href: `/coach/clients/${row.clientId}`,
                dueAt: row.lastCheckinDate,
            })
        } else if (row.attentionFlags.includes('SIN_EJERCICIO_7D')) {
            items.push({
                id: `workout-${row.clientId}`,
                clientId: row.clientId,
                clientName: row.clientName,
                kind: 'sin_ejercicio',
                label: 'Sin ejercicio esta semana',
                href: `/coach/clients/${row.clientId}`,
                dueAt: row.lastWorkoutDate,
            })
        }
    }

    return items.slice(0, 8)
}

async function getCoachDashboardDataInner(userId: string) {
    const supabase = await createClient()

    const now = new Date()
    // Incluye filas antiguas que aún reparten ingresos al mes actual (period_months largos)
    const clientPaymentsLookbackStart = new Date(now.getFullYear(), now.getMonth() - 13, 1).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const expiringEndUpper = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const expiringEndLower = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [
        clientsCount,
        workoutPlansCount,
        recentClientsRaw,
        recentCheckinsRaw,
        expiringProgramsRaw,
        signupsByMonthRaw,
        workoutSessionsSeriesRaw,
        workoutLogs30dRaw,
        recentWorkoutsRaw,
        clientPaymentsRaw,
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
            .gte('end_date', expiringEndLower)
            .lte('end_date', expiringEndUpper)
            .order('end_date', { ascending: true })
            .limit(200),
        supabase.rpc('get_coach_client_signups_last_6_months', { p_coach_id: userId }),
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
        // Coach revenue: payments registered from clients (same month windows as before)
        supabase
            .from('client_payments')
            .select('client_id, payment_date, amount, status, period_months')
            .eq('coach_id', userId)
            .gte('payment_date', clientPaymentsLookbackStart),
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
    let signupsRows =
        signupsByMonthRaw.error || !signupsByMonthRaw.data
            ? []
            : (signupsByMonthRaw.data as { ym: string; client_count: number }[])

    // Fallback: if RPC fails or returns empty, aggregate directly from clients table
    if (signupsRows.length === 0) {
        if (signupsByMonthRaw.error) {
            console.error('[dashboard] RPC get_coach_client_signups_last_6_months failed:', signupsByMonthRaw.error)
        }
        const { data: clientsFallback } = await supabase
            .from('clients')
            .select('created_at')
            .eq('coach_id', userId)
        if (clientsFallback && clientsFallback.length > 0) {
            const monthCounts = new Map<string, number>()
            for (const c of clientsFallback) {
                const iso = c.created_at as string
                const m = /^(\d{4})-(\d{2})/.exec(iso)
                if (m) {
                    const ym = `${m[1]}-${m[2]}`
                    monthCounts.set(ym, (monthCounts.get(ym) || 0) + 1)
                }
            }
            signupsRows = Array.from(monthCounts.entries()).map(([ym, client_count]) => ({ ym, client_count }))
        }
    }

    const signupMap = new Map(signupsRows.map((r) => [r.ym, Number(r.client_count)]))
    const workoutLogs30d = workoutLogs30dRaw.data || []
    const workoutSessionsSeries =
        !workoutSessionsSeriesRaw.error && Array.isArray(workoutSessionsSeriesRaw.data)
            ? (workoutSessionsSeriesRaw.data as { day: string; sessions: number }[])
            : null
    const rawRecentWorkouts = (recentWorkoutsRaw.data as { id: string; logged_at: string; client_id: string; clients: { id: string; full_name: string } }[] | null) || []
    const clientPayments = (clientPaymentsRaw.data || []) as {
        client_id: string | null
        payment_date: string
        amount: number | string
        status: string | null
        period_months: number | null
    }[]

    const revenueByMonth: Record<string, number> = {}
    for (const p of clientPayments) {
        if (!isClientPaymentCountedForRevenue(p.status)) continue
        const slices = allocatePaymentToMonthKeys(p.payment_date, p.amount, p.period_months)
        for (const [key, v] of Object.entries(slices)) {
            revenueByMonth[key] = (revenueByMonth[key] ?? 0) + v
        }
    }

    const currentMonthKey = monthKeyFromYm(now.getFullYear(), now.getMonth())
    const prevMonthRef = addWholeMonths(now.getFullYear(), now.getMonth(), -1)
    const prevMonthKey = monthKeyFromYm(prevMonthRef.y, prevMonthRef.month0)

    // Ingresos del mes: pagos de alumnos (repartidos por period_months; fin de mes → mes siguiente)
    const mrrCurrentMonth = revenueByMonth[currentMonthKey] ?? 0
    const mrrPreviousMonth = revenueByMonth[prevMonthKey] ?? 0

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
            // row.day is a calendar date string (YYYY-MM-DD) from Postgres.
            // Parse manually to avoid timezone shifts from new Date('YYYY-MM-DD').
            const [yStr, mStr, dStr] = row.day.split('-')
            const dayKey = `${dStr}/${mStr}`
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
    // Only show days with sessions to keep the chart clean and tooltip precise
    const areaData = Object.entries(sessionsByDay)
        .filter(([_, sesiones]) => sesiones > 0)
        .map(([name, sesiones]) => ({
            name,
            fullName: name,
            sesiones,
        }))

    // BarChart: new clients per month (last 6 sliding months; counts from RPC by YYYY-MM)
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const growthMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i -= 1) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = monthNames[d.getMonth()]
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        growthMap[key] = signupMap.get(ym) ?? 0
    }
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
        _rawClientPayments: clientPayments,
    }
}

function buildClientPaymentSummary(
    payments: { client_id: string | null; payment_date: string; amount: number | string; status: string | null; period_months: number | null }[],
    pulse: { clientId: string; clientName: string }[]
) {
    const thirtyFiveDaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000

    const paidByClient = new Map<string, { payment_date: string; amount: number; period_months: number | null }>()
    for (const p of payments) {
        if (!p.client_id) continue
        const s = String(p.status || '').toLowerCase()
        if (s !== 'paid' && s !== 'pagado' && s !== 'completed') continue
        const existing = paidByClient.get(p.client_id)
        if (!existing || new Date(p.payment_date) > new Date(existing.payment_date)) {
            paidByClient.set(p.client_id, {
                payment_date: p.payment_date,
                amount: Math.round(parseFloat(String(p.amount)) || 0),
                period_months: p.period_months,
            })
        }
    }

    return pulse.map((c) => {
        const last = paidByClient.get(c.clientId) ?? null
        let nextRenewalDate: string | null = null
        if (last?.period_months && last.period_months > 0) {
            try {
                const d = new Date(last.payment_date)
                d.setMonth(d.getMonth() + last.period_months)
                nextRenewalDate = d.toISOString().slice(0, 10)
            } catch {}
        }
        return {
            clientId: c.clientId,
            clientName: c.clientName,
            lastPaymentDate: last?.payment_date ?? null,
            lastPaymentAmount: last?.amount ?? null,
            lastPaymentPeriodMonths: last?.period_months ?? null,
            nextRenewalDate,
            hasRecentPayment: last ? new Date(last.payment_date).getTime() > thirtyFiveDaysAgo : false,
        }
    }).sort((a, b) => {
        if (a.hasRecentPayment === b.hasRecentPayment) return 0
        return a.hasRecentPayment ? 1 : -1
    })
}
