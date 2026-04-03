import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'
import CoachDashboardClient from './CoachDashboardClient'

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

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const results = await Promise.all([
            supabase
                .from('clients')
                .select('*', { count: 'exact', head: true })
                .eq('coach_id', user.id),
            supabase
                .from('workout_plans')
                .select('*', { count: 'exact', head: true })
                .eq('coach_id', user.id),
            supabase
                .from('clients')
                .select('id, full_name, email, created_at, onboarding_completed')
                .eq('coach_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5),
            supabase
                .from('check_ins')
                .select('id, created_at, clients!inner(id, full_name, coach_id)')
                .eq('clients.coach_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5),
            supabase
                .from('workout_programs')
                .select(`
                    id, 
                    name, 
                    end_date, 
                    client_id, 
                    clients:client_id (
                        id,
                        full_name
                    )
                `)
                .eq('coach_id', user.id)
                .eq('is_active', true)
                .not('end_date', 'is', null)
                .order('end_date', { ascending: true }),
            // Data for charts
            supabase
                .from('clients')
                .select('created_at')
                .eq('coach_id', user.id),
            supabase
                .from('check_ins')
                .select('created_at, clients!inner(coach_id)')
                .eq('clients.coach_id', user.id)
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        ])

    const totalClients = results[0].count
    const activePlans = results[1].count
    const rawRecentClients = results[2].data
    const rawRecentCheckins = results[3].data
    const rawExpiringPrograms = results[4].data
    const allClientsData = results[5].data || []
    const weeklyCheckinsData = results[6].data || []

    const recentClients = rawRecentClients as Pick<Client, 'id' | 'full_name' | 'email' | 'onboarding_completed' | 'created_at'>[] | null
    
    // Process expiring programs
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
                daysLeft: diffDays
            }
        })
        .filter(p => p.daysLeft <= 3)
    
    // Process Check-ins
    const typedCheckins = rawRecentCheckins as { id: string, created_at: string, clients: { id: string, full_name: string } }[] | null
    
    // Combine activities
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

    // Process Chart Data
    // 1. Client Growth (by month)
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const growthMap: Record<string, number> = {}
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = `${monthNames[d.getMonth()]}`
        growthMap[key] = 0
    }

    allClientsData.forEach(c => {
        const d = new Date(c.created_at)
        const key = `${monthNames[d.getMonth()]}`
        if (growthMap[key] !== undefined) {
            growthMap[key]++
        }
    })

    // Accumulate for growth chart
    let total = 0
    const areaData = Object.entries(growthMap).map(([name, count]) => {
        total += count
        return { name, alumnos: total }
    })

    // 2. Weekly Checkins (last 7 days)
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
        if (checkinsMap[key] !== undefined) {
            checkinsMap[key]++
        }
    })

    const barData = Object.entries(checkinsMap).map(([name, checkins]) => ({ name, checkins }))

    return (
        <CoachDashboardClient 
            totalClients={totalClients ?? 0}
            activePlans={activePlans ?? 0}
            recentActivities={recentActivities}
            expiringPrograms={expiringPrograms}
            areaData={areaData}
            barData={barData}
        />
    )
}
