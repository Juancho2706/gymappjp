import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
    Users,
    TrendingUp,
    Activity,
    Calendar,
    ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Client } from '@/lib/database.types'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [{ count: totalClients }, { count: activePlans }, { data: rawRecentClients }] =
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
        ])

    const recentClients = rawRecentClients as Pick<Client, 'id' | 'full_name' | 'email' | 'onboarding_completed'>[] | null

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
            value: '—',
            icon: TrendingUp,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-100 dark:bg-amber-500/10',
            border: 'border-amber-200 dark:border-amber-500/20',
            href: '/coach/clients',
        },
        {
            label: 'Check-ins Pendientes',
            value: '—',
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

            {/* Recent clients */}
            <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        Alumnos Recientes
                    </h2>
                    <Link
                        href="/coach/clients"
                        className="text-xs text-primary hover:opacity-80 transition-opacity flex items-center gap-1 font-medium"
                    >
                        Ver todos <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>

                {!recentClients || recentClients.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No tienes alumnos aún</p>
                        <Link
                            href="/coach/clients"
                            className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity"
                        >
                            Agregar primer alumno →
                        </Link>
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {recentClients.map((client) => (
                            <li key={client.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors">
                                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm font-bold text-primary">
                                        {client.full_name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">{client.full_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                </div>
                                <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${client.onboarding_completed
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                    }`}>
                                    {client.onboarding_completed ? 'Activo' : 'Pendiente'}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
