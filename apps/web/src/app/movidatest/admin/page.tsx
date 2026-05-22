'use client'

import { Users, UserCheck, Clock, TrendingUp, PlusCircle, Activity } from 'lucide-react'
import { useDemoState } from '../_providers/DemoStateProvider'

export default function AdminDashboardPage() {
    const { org, stats, coaches, clients } = useDemoState()

    const seatsUsed = stats.totalCoaches
    const seatsAtLimit = seatsUsed >= org.seats_included
    const healthScore = org.last_health_score ?? 0

    const statCards = [
        { label: 'Coaches activos', value: stats.totalCoaches, icon: Users, color: 'text-violet-500' },
        { label: 'Invitaciones pendientes', value: stats.pendingInvites, icon: Clock, color: 'text-amber-500' },
        { label: 'Clientes totales', value: stats.totalClients, icon: UserCheck, color: 'text-emerald-500' },
        { label: 'Clientes activos', value: stats.activeClients, icon: TrendingUp, color: 'text-blue-500' },
    ]

    const activeCoaches = coaches.filter(c => c.status === 'active').slice(0, 5)

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold">Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Resumen de {org.name}</p>
            </div>

            {seatsAtLimit && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                        <PlusCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold">Límite de coaches alcanzado ({seatsUsed}/{org.seats_included})</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Agrega más coaches por $9.990/mes cada uno.</p>
                        </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-amber-500">Ampliar plan →</span>
                </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-2xl font-bold">{value}</p>
                    </div>
                ))}
            </div>

            {/* Health score */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-teal-500" />
                        <h2 className="text-sm font-semibold">Health Score del Gym</h2>
                    </div>
                    <span className="text-2xl font-bold text-teal-500">{healthScore}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${healthScore}%`, backgroundColor: healthScore > 70 ? '#0D9488' : healthScore > 50 ? '#F59E0B' : '#EF4444' }}
                    />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                    {healthScore > 70 ? '✓ Adopción alta — coaches y alumnos activos' : 'Adopción en progreso'}
                </p>
            </div>

            {/* Seat usage */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Uso de seats</h2>
                    <span className="text-xs text-muted-foreground">{seatsUsed} / {org.seats_included}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (seatsUsed / org.seats_included) * 100)}%`, backgroundColor: '#0D9488' }}
                    />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                    {Math.max(0, org.seats_included - seatsUsed)} seats disponibles
                </p>
            </div>

            {/* Active coaches */}
            <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Coaches activos</h2>
                <div className="space-y-2">
                    {activeCoaches.map(coach => (
                        <div key={coach.id} className="flex items-center gap-3 py-1">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                                style={{ backgroundColor: '#0D9488' }}
                            >
                                {coach.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{coach.full_name}</p>
                                <p className="text-[11px] text-muted-foreground">{coach.specialty}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <span className="text-xs font-medium">{coach.clients_count}</span>
                                <p className="text-[10px] text-muted-foreground">alumnos</p>
                            </div>
                            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                {coach.invite_code}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Plan info */}
            <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Plan</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Tipo</p>
                        <p className="font-medium capitalize">{org.plan}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Estado</p>
                        <p className="font-medium text-emerald-500">Activo</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Ciclo</p>
                        <p className="font-medium capitalize">{org.billing_cycle ?? 'mensual'}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Moneda</p>
                        <p className="font-medium">{org.currency}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Precio mensual</p>
                        <p className="font-medium">$149.990 + IVA</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Próxima factura</p>
                        <p className="font-medium text-amber-500">En 10 días</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
