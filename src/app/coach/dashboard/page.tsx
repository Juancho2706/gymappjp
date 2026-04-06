import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'
import CoachDashboardClient from './CoachDashboardClient'
import { getAdherenceStats, getNutritionStats } from './actions'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

type Client = Tables<'clients'>

export const metadata: Metadata = { title: 'Dashboard' }

export interface ActivityItemClient {
    id: string
    type: 'nuevo alumno' | 'check-in'
    title: string
    subtitle: string
    date: string
    href: string
}

// Separate components for streaming
async function StatsCards({ userId }: { userId: string }) {
    const supabase = await createClient()
    
    // Quick queries first
    const [clientsCount, workoutPlansCount] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', userId),
        supabase.from('workout_plans').select('*', { count: 'exact', head: true }).eq('coach_id', userId)
    ])

    // Heavier queries (stats) are also awaited here but we could further split if needed.
    // For now, we'll fetch adherence/nutrition here since they are needed for the top cards.
    const [adherenceStats, nutritionStats] = await Promise.all([
        getAdherenceStats(),
        getNutritionStats()
    ])

    const avgAdherence = adherenceStats.length > 0 
        ? Math.round(adherenceStats.reduce((acc, s) => acc + s.percentage, 0) / adherenceStats.length)
        : 0
    
    const avgNutrition = nutritionStats.length > 0
        ? Math.round(nutritionStats.reduce((acc, s) => acc + s.percentage, 0) / nutritionStats.length)
        : 0

    return {
        totalClients: clientsCount.count ?? 0,
        activePlans: workoutPlansCount.count ?? 0,
        avgAdherence,
        avgNutrition,
        adherenceStats,
        nutritionStats
    }
}

async function MainDashboardData({ userId }: { userId: string }) {
    const supabase = await createClient()

    const [
        recentClientsRaw,
        recentCheckinsRaw,
        expiringProgramsRaw,
        clientsGrowthRaw,
        weeklyCheckinsRaw,
        stats
    ] = await Promise.all([
        supabase.from('clients').select('id, full_name, email, created_at, onboarding_completed').eq('coach_id', userId).order('created_at', { ascending: false }).limit(5),
        supabase.from('check_ins').select('id, created_at, clients!inner(id, full_name, coach_id)').eq('clients.coach_id', userId).order('created_at', { ascending: false }).limit(5),
        supabase.from('workout_programs').select('id, name, end_date, client_id, clients:client_id (id, full_name, slug)').eq('coach_id', userId).eq('is_active', true).not('end_date', 'is', null).order('end_date', { ascending: true }),
        supabase.from('clients').select('created_at').eq('coach_id', userId),
        supabase.from('check_ins').select('created_at, clients!inner(coach_id)').eq('clients.coach_id', userId).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        StatsCards({ userId })
    ])

    // Process all data as in the original file
    const rawRecentClients = recentClientsRaw.data
    const rawRecentCheckins = recentCheckinsRaw.data
    const rawExpiringPrograms = expiringProgramsRaw.data
    const allClientsData = clientsGrowthRaw.data || []
    const weeklyCheckinsData = weeklyCheckinsRaw.data || []

    const recentClients = rawRecentClients as Pick<Client, 'id' | 'full_name' | 'email' | 'onboarding_completed' | 'created_at'>[] | null
    
    const nowUTC = new Date()
    const todayMidnight = new Date(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate())
    const expiringPrograms = (rawExpiringPrograms as any[] || [])
        .map(p => {
            const endDateParts = p.end_date.split('-')
            const endDate = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]))
            const diffTime = endDate.getTime() - todayMidnight.getTime()
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
            return {
                id: p.id,
                name: p.name,
                endDate: p.end_date,
                clientId: p.clients?.id,
                clientName: p.clients?.full_name,
                clientSlug: p.clients?.slug,
                daysLeft: diffDays
            }
        })
        .filter(p => p.daysLeft <= 3)
    
    const typedCheckins = rawRecentCheckins as { id: string, created_at: string, clients: { id: string, full_name: string } }[] | null
    const activities: ActivityItemClient[] = []
    
    if (recentClients) {
        recentClients.forEach(c => {
            activities.push({
                id: `client-${c.id}`,
                type: 'nuevo alumno',
                title: `${c.full_name} se ha unido`,
                subtitle: c.onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding',
                date: c.created_at,
                href: `/coach/clients/${c.id}`,
            })
        })
    }
    
    if (typedCheckins) {
        typedCheckins.forEach(c => {
            activities.push({
                id: `checkin-${c.id}`,
                type: 'check-in',
                title: `${c.clients.full_name} subió su Check-in`,
                subtitle: 'Revisa su progreso semanal',
                date: c.created_at,
                href: `/coach/clients/${c.clients.id}`,
            })
        })
    }
    
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const recentActivities = activities.slice(0, 5)

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const growthMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = `${monthNames[d.getMonth()]}`
        growthMap[key] = 0
    }
    allClientsData.forEach(c => {
        const d = new Date(c.created_at)
        const key = `${monthNames[d.getMonth()]}`
        if (growthMap[key] !== undefined) growthMap[key]++
    })
    let total = 0
    const areaData = Object.entries(growthMap).map(([name, count]) => {
        total += count
        return { name, alumnos: total }
    })

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const checkinsMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = dayNames[d.getDay()]
        checkinsMap[key] = 0
    }
    weeklyCheckinsData.forEach(c => {
        const d = new Date(c.created_at)
        const key = dayNames[d.getDay()]
        if (checkinsMap[key] !== undefined) checkinsMap[key]++
    })
    const barData = Object.entries(checkinsMap).map(([name, checkins]) => ({ name, checkins }))

    return (
        <CoachDashboardClient 
            totalClients={stats.totalClients}
            activePlans={stats.activePlans}
            avgAdherence={stats.avgAdherence}
            avgNutrition={stats.avgNutrition}
            adherenceStats={stats.adherenceStats}
            nutritionStats={stats.nutritionStats}
            recentActivities={recentActivities}
            expiringPrograms={expiringPrograms}
            areaData={areaData}
            barData={barData}
        />
    )
}

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <MainDashboardData userId={user.id} />
        </Suspense>
    )
}

function DashboardSkeleton() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <Skeleton className="h-12 w-64 md:h-14 md:w-80" />
                    <Skeleton className="h-4 w-48 md:w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <GlassCard key={i} className="h-32 md:h-40 p-4 md:p-6 space-y-4">
                        <div className="flex justify-between">
                            <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-xl" />
                            <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-16 md:h-8 md:w-20" />
                            <Skeleton className="h-3 w-24 md:w-28" />
                        </div>
                    </GlassCard>
                ))}
            </div>
            <GlassCard className="h-[400px] w-full p-6">
                <Skeleton className="h-full w-full opacity-20" />
            </GlassCard>
        </div>
    )
}
