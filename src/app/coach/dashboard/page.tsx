import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
    Users,
    TrendingUp,
    Activity,
    Calendar,
    ArrowRight,
    CheckCircle,
    UserPlus,
    Clock
} from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>

export const metadata: Metadata = { title: 'Dashboard' }

interface ActivityItem {
    id: string
    type: 'new_client' | 'check_in'
    title: string
    subtitle: string
    date: Date
    href: string
    icon: any
    iconBg: string
    iconColor: string
}

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [{ count: totalClients }, { count: activePlans }, { data: rawRecentClients }, { data: rawRecentCheckins }] =
        await Promise.all([
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
        ])

    const recentClients = rawRecentClients as Pick<Client, 'id' | 'full_name' | 'email' | 'onboarding_completed' | 'created_at'>[] | null
    
    // Process Check-ins
    const typedCheckins = rawRecentCheckins as { id: string, created_at: string, clients: { id: string, full_name: string } }[] | null
    
    // Combine activities
    const activities: ActivityItem[] = []
    
    if (recentClients) {
        recentClients.forEach(c => {
            activities.push({
                id: `client-${c.id}`,
                type: 'new_client',
                title: `${c.full_name} se ha unido`,
                subtitle: c.onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding',
                date: new Date(c.created_at),
                href: `/coach/clients/${c.id}`,
                icon: UserPlus,
                iconBg: 'bg-emerald-100 dark:bg-emerald-500/10',
                iconColor: 'text-emerald-600 dark:text-emerald-400',
            })
        })
    }
    
    if (typedCheckins) {
        typedCheckins.forEach(c => {
            activities.push({
                id: `checkin-${c.id}`,
                type: 'check_in',
                title: `${c.clients.full_name} subió su Check-in`,
                subtitle: 'Revisa su progreso semanal',
                date: new Date(c.created_at),
                href: `/coach/clients/${c.clients.id}`,
                icon: CheckCircle,
                iconBg: 'bg-blue-100 dark:bg-blue-500/10',
                iconColor: 'text-blue-600 dark:text-blue-400',
            })
        })
    }
    
    // Sort combined activities by date descending and take top 5
    activities.sort((a, b) => b.date.getTime() - a.date.getTime())
    const recentActivities = activities.slice(0, 5)

    const stats = [
        {
            label: 'Alumnos Activos',
            value: totalClients ?? 0,
            icon: Users,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-100 dark:bg-emerald-500/10',
            border: 'border-emerald-200 dark:border-emerald-500/20',
            href: '/coach/clients',
        },
        {
            label: 'Rutinas Asignadas',
            value: activePlans ?? 0,
            icon: Activity,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-100 dark:bg-blue-500/10',
            border: 'border-blue-200 dark:border-blue-500/20',
            href: '/coach/clients',
        },
        {
            label: 'Esta Semana',
            value: 0,
            icon: TrendingUp,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-100 dark:bg-amber-500/10',
            border: 'border-amber-200 dark:border-amber-500/20',
            href: '/coach/clients',
        },
        {
            label: 'Check-ins Pendientes',
            value: 0,
            icon: Calendar,
            color: 'text-rose-600 dark:text-rose-400',
            bg: 'bg-rose-100 dark:bg-rose-500/10',
            border: 'border-rose-200 dark:border-rose-500/20',
            href: '/coach/clients',
        },
    ]

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1
                        className="text-3xl font-extrabold text-foreground"
                        style={{ fontFamily: 'var(--font-outfit)' }}
                    >
                        Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Resumen de tu actividad como coach
                    </p>
                </div>
                
                <Link 
                    href="/coach/clients"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5 transition-all w-full sm:w-auto"
                >
                    <Users className="w-4 h-4" />
                    Nuevo Alumno
                </Link>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = stat.icon
                    return (
                        <Link
                            key={stat.label}
                            href={stat.href}
                            className={`group bg-card border ${stat.border} rounded-2xl p-5 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className={`w-10 h-10 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center`}>
                                    <Icon className={`w-5 h-5 ${stat.color}`} />
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors -rotate-45" />
                            </div>
                            <p
                                className="text-3xl font-extrabold text-foreground"
                                style={{ fontFamily: 'var(--font-outfit)' }}
                            >
                                {stat.value}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
                        </Link>
                    )
                })}
            </div>

            {/* Recent Activity Feed */}
            <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        Actividad Reciente
                    </h2>
                </div>

                {!recentActivities || recentActivities.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <Activity className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No hay actividad reciente</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {recentActivities.map((activity) => {
                            const Icon = activity.icon
                            return (
                                <li key={activity.id}>
                                    <Link href={activity.href} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/50 transition-colors group">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${activity.iconBg} ${activity.iconColor}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                                {activity.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{activity.subtitle}</p>
                                        </div>
                                        <div className="flex-shrink-0 text-xs text-muted-foreground font-medium">
                                            {activity.date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
