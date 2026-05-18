import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgStats, getOrgMembers } from './_data/org.queries'
import { Users, UserCheck, Clock, TrendingUp, AlertTriangle, PlusCircle } from 'lucide-react'

interface Props {
    params: Promise<{ slug: string }>
}

export const metadata: Metadata = { title: 'Dashboard' }

export default async function OrgDashboardPage({ params }: Props) {
    const { slug } = await params
    const [org, stats] = await Promise.all([
        getOrgBySlug(slug),
        getOrgBySlug(slug).then(o => o ? getOrgStats(o.id) : null),
    ])

    if (!org) redirect('/coach/dashboard')

    const recentMembers = await getOrgMembers(org.id)
    const activeMembers = recentMembers.filter(m => m.status === 'active').slice(0, 5)

    const seatsUsed = stats?.totalCoaches ?? 0
    const seatsAtLimit = seatsUsed >= org.seats_included
    const healthScore = org.last_health_score ?? null
    const healthLow = healthScore !== null && healthScore < 60

    const statCards = [
        { label: 'Coaches activos', value: stats?.totalCoaches ?? 0, icon: Users, color: 'text-violet-500' },
        { label: 'Invitaciones pendientes', value: stats?.pendingInvites ?? 0, icon: Clock, color: 'text-amber-500' },
        { label: 'Clientes totales', value: stats?.totalClients ?? 0, icon: UserCheck, color: 'text-emerald-500' },
        { label: 'Clientes activos', value: stats?.activeClients ?? 0, icon: TrendingUp, color: 'text-blue-500' },
    ]

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold">Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Resumen de {org.name}
                </p>
            </div>

            {/* Upsell: coach seat limit reached */}
            {seatsAtLimit && (
                <div
                    data-testid="seat-upsell-banner"
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3"
                >
                    <div className="flex items-start gap-2.5">
                        <PlusCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                Límite de coaches alcanzado ({seatsUsed}/{org.seats_included})
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Agrega más coaches por $9.990/mes cada uno.
                            </p>
                        </div>
                    </div>
                    <a
                        href="mailto:contacto@eva-app.cl?subject=Agregar seat adicional"
                        className="shrink-0 text-xs font-semibold text-amber-500 hover:text-amber-400 whitespace-nowrap"
                    >
                        Ampliar plan →
                    </a>
                </div>
            )}

            {/* Upsell: health score below threshold */}
            {healthLow && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                Adopción baja — score {healthScore}/100
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Algunos coaches o alumnos no están activos. ¿Necesitás ayuda?
                            </p>
                        </div>
                    </div>
                    <a
                        href={`https://calendly.com/contacto-eva-app/eva-enterprise`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-semibold text-red-400 hover:text-red-300 whitespace-nowrap"
                    >
                        Agendar llamada →
                    </a>
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

            {/* Seat usage */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Uso de seats</h2>
                    <span className="text-xs text-muted-foreground">{stats?.totalCoaches ?? 0} / {org.seats_included}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-violet-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((stats?.totalCoaches ?? 0) / org.seats_included) * 100)}%` }}
                    />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                    {Math.max(0, org.seats_included - (stats?.totalCoaches ?? 0))} seats disponibles
                </p>
            </div>

            {/* Recent coaches */}
            {activeMembers.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold mb-3">Coaches activos</h2>
                    <div className="space-y-2">
                        {activeMembers.map(member => (
                            <div key={member.id} className="flex items-center gap-3 py-1">
                                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 font-bold text-xs shrink-0">
                                    {member.coach?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{member.coach?.full_name ?? 'Coach'}</p>
                                    <p className="text-[11px] text-muted-foreground capitalize">{member.role.replace('org_', '')}</p>
                                </div>
                                {member.coach?.invite_code && (
                                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                        {member.coach.invite_code}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Plan info */}
            <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-2">Plan</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Tipo</p>
                        <p className="font-medium capitalize">{org.plan}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Estado</p>
                        <p className={`font-medium capitalize ${org.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {org.status}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Ciclo</p>
                        <p className="font-medium capitalize">{org.billing_cycle ?? 'mensual'}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Moneda</p>
                        <p className="font-medium">{org.currency}</p>
                    </div>
                </div>
                {org.trial_ends_at && (
                    <p className="text-[11px] text-amber-500 mt-2">
                        Trial hasta: {new Date(org.trial_ends_at).toLocaleDateString('es-CL')}
                    </p>
                )}
            </div>
        </div>
    )
}
