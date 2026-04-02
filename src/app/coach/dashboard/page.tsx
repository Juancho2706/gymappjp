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
    Clock,
    TriangleAlert,
    CalendarClock
} from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'
import { Badge } from '@/components/ui/badge'

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

    const [{ count: totalClients }, { count: activePlans }, { data: rawRecentClients }, { data: rawRecentCheckins }, { data: rawExpiringPrograms }] =
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
                .order('end_date', { ascending: true })
        ])

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
        <div className="space-y-10 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                <div>
                    <h1
                        className="text-4xl font-bold text-white uppercase tracking-tighter"
                        style={{ fontFamily: 'Montserrat, sans-serif' }}
                    >
                        Centro de Control
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">System Online</Badge>
                        <p className="text-zinc-500 text-sm font-medium">
                            Análisis de rendimiento y gestión de alumnos
                        </p>
                    </div>
                </div>
                
                <Link 
                    href="/coach/clients"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 glow-primary hover:-translate-y-0.5 transition-all w-full sm:w-auto uppercase tracking-widest"
                >
                    <UserPlus className="w-4 h-4" />
                    Alta de Alumno
                </Link>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon
                    return (
                        <Link
                            key={stat.label}
                            href={stat.href}
                            className="group relative overflow-hidden bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-primary/40 transition-all duration-300"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -z-10 group-hover:bg-primary/10 transition-colors" />
                            <div className="flex items-start justify-between mb-6">
                                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                                    <Icon className="w-6 h-6 text-zinc-400 group-hover:text-primary transition-colors" />
                                </div>
                                <div className="p-2 rounded-lg bg-white/5 text-zinc-500 group-hover:text-primary transition-colors">
                                    <ArrowRight className="w-4 h-4 -rotate-45" />
                                </div>
                            </div>
                            <p
                                className="text-4xl font-bold text-white tracking-tighter"
                                style={{ fontFamily: 'Montserrat, sans-serif' }}
                            >
                                {stat.value}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-zinc-500 mt-2 group-hover:text-zinc-300 transition-colors">{stat.label}</p>
                        </Link>
                    )
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity Feed */}
                <div className="lg:col-span-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <Activity className="w-5 h-5 text-primary" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-[0.2em]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                Registro de Actividad
                            </h2>
                        </div>
                    </div>

                    {!recentActivities || recentActivities.length === 0 ? (
                        <div className="px-8 py-20 text-center">
                            <Activity className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                            <p className="text-zinc-500 text-sm font-medium">No hay registros en la terminal</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {recentActivities.map((activity) => {
                                const Icon = activity.icon
                                return (
                                    <Link key={activity.id} href={activity.href} className="flex items-center gap-6 px-8 py-5 hover:bg-white/[0.03] transition-all group">
                                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                                            <Icon className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
                                                {activity.title}
                                            </p>
                                            <p className="text-xs text-zinc-500 mt-1 font-medium">{activity.subtitle}</p>
                                        </div>
                                        <div className="flex-shrink-0 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                                            {activity.date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Sidebar Alerts / Secondary column */}
                <div className="space-y-8">
                    {/* Expiring Programs Alerts */}
                    {expiringPrograms.length > 0 && (
                        <div className="bg-black/40 backdrop-blur-xl border border-rose-500/20 rounded-2xl overflow-hidden shadow-2xl">
                            <div className="px-6 py-5 border-b border-rose-500/10 bg-rose-500/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <TriangleAlert className="w-5 h-5 text-rose-500" />
                                    <h2 className="text-xs font-bold text-rose-500 uppercase tracking-widest" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                        Vencimientos
                                    </h2>
                                </div>
                                <Badge variant="destructive" className="bg-rose-500/20 text-rose-500 border-rose-500/30 font-bold">
                                    {expiringPrograms.length}
                                </Badge>
                            </div>
                            <div className="divide-y divide-white/5">
                                {expiringPrograms.map((program) => (
                                    <div key={program.id} className="px-6 py-5 space-y-4 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                                                <CalendarClock className="w-5 h-5 text-zinc-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white leading-tight">
                                                    {program.clientName}
                                                </p>
                                                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-1">
                                                    {program.daysLeft === 0 ? 'Expira Hoy' : `En ${program.daysLeft} Días`}
                                                </p>
                                            </div>
                                        </div>
                                        <Link 
                                            href={`/coach/builder/${program.clientId}`}
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all w-full"
                                        >
                                            Actualizar Protocolo
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quick Access or System Status */}
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Estado del Sistema</h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400 font-medium">Bases de Datos</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-primary glow-primary" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400 font-medium">Motor de IA Nutricional</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-primary glow-primary" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400 font-medium">Sincronización PWA</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-primary glow-primary" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
