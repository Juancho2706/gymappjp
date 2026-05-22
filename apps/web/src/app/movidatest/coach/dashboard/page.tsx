'use client'

import Link from 'next/link'
import { Users, TrendingUp, Calendar, ChevronRight, Dumbbell, Apple, Activity, CheckCircle2, Clock } from 'lucide-react'
import { useDemoState } from '../../_providers/DemoStateProvider'
import { felipeCoach, movidaPrograms, mariaWorkoutHistory } from '../../_mock'

export default function CoachDashboardPage() {
    const { clients } = useDemoState()
    const myClients = clients.filter(c => c.coach_id === felipeCoach.id)
    const activeClients = myClients.filter(c => c.is_active)
    const recentActivity = myClients.filter(c => c.last_activity).slice(0, 4)

    const quickStats = [
        { label: 'Alumnos a cargo', value: myClients.length, icon: Users, color: 'text-teal-500' },
        { label: 'Alumnos activos', value: activeClients.length, icon: CheckCircle2, color: 'text-emerald-500' },
        { label: 'Programas activos', value: movidaPrograms.length, icon: Dumbbell, color: 'text-violet-500' },
        { label: 'Sesiones esta semana', value: mariaWorkoutHistory.slice(0, 4).length, icon: Activity, color: 'text-blue-500' },
    ]

    const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-bold">¡Hola, Felipe! 👋</h1>
                    <p className="text-sm text-muted-foreground mt-0.5 capitalize">{today}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-500 font-semibold">PRO Enterprise</span>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {quickStats.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-2xl font-bold">{value}</p>
                    </div>
                ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link href="/movidatest/coach/clients" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center">
                        <Users className="w-4.5 h-4.5 text-teal-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Mis alumnos</p>
                        <p className="text-xs text-muted-foreground">{myClients.length} asignados</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </Link>
                <Link href="/movidatest/coach/nutrition-plans" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Apple className="w-4.5 h-4.5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Nutrición</p>
                        <p className="text-xs text-muted-foreground">3 plantillas</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                </Link>
            </div>

            {/* Recent activity */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Actividad reciente de alumnos</h2>
                    <Link href="/movidatest/coach/clients" className="text-xs text-teal-500 hover:underline">Ver todos →</Link>
                </div>
                <div className="space-y-2">
                    {recentActivity.map(client => (
                        <div key={client.id} className="flex items-center gap-3 py-1.5">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: '#0D9488' }}
                            >
                                {client.avatar_initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{client.full_name}</p>
                                <p className="text-[11px] text-muted-foreground">{client.program_name ?? 'Sin programa asignado'}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                {client.last_activity ? (
                                    <div className="flex items-center gap-1 text-[11px] text-emerald-500">
                                        <Activity className="w-3 h-3" />
                                        <span>Activo</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        <span>Sin actividad</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Programs overview */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Mis programas</h2>
                    <Link href="/movidatest/coach/workout-programs" className="text-xs text-teal-500 hover:underline">Ver todos →</Link>
                </div>
                <div className="space-y-2">
                    {movidaPrograms.slice(0, 3).map(prog => (
                        <div key={prog.id} className="flex items-center gap-3 py-1.5">
                            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                <Dumbbell className="w-3.5 h-3.5 text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{prog.name}</p>
                                <p className="text-[11px] text-muted-foreground">{prog.weeks} sem · {prog.days_per_week}x/sem · {prog.level}</p>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{prog.client_count} alumnos</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Invite code */}
            <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Tu código de invitación para alumnos</p>
                <div className="flex items-center gap-3">
                    <span className="text-xl font-mono font-bold tracking-widest">{felipeCoach.invite_code}</span>
                    <span className="text-xs text-muted-foreground">Los alumnos lo usan al crear su cuenta</span>
                </div>
            </div>
        </div>
    )
}
