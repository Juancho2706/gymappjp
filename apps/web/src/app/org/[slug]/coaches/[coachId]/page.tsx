import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Users, AlertTriangle, TrendingUp, Activity } from 'lucide-react'
import Link from 'next/link'
import { getOrgBySlug, getOrgMembers, getCoachPerformance } from '../../_data/org.queries'

export const metadata: Metadata = { title: 'Performance Coach' }

interface Props {
    params: Promise<{ slug: string; coachId: string }>
}

function AdherenceBar({ value, orgAvg }: { value: number; orgAvg: number }) {
    const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
            </div>
            <span className="text-xs font-mono w-8 text-right">{value}%</span>
        </div>
    )
}

const WEEK_LABELS = ['Sem -4', 'Sem -3', 'Sem -2', 'Última sem']

export default async function CoachPerformancePage({ params }: Props) {
    const { slug, coachId } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'
    if (!isAdmin) redirect(`/org/${slug}`)

    const members = await getOrgMembers(org.id)
    const member = members.find(m => m.coach_id === coachId && m.status === 'active')
    if (!member) redirect(`/org/${slug}/coaches`)

    const perf = await getCoachPerformance(coachId, org.id)
    const coachName = member.coach?.full_name ?? 'Coach'

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
                <Link
                    href={`/org/${slug}/coaches`}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Coaches
                </Link>
            </div>

            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 font-bold shrink-0">
                    {coachName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h1 className="text-lg font-bold">{coachName}</h1>
                    {member.coach?.slug && (
                        <p className="text-xs text-muted-foreground">{member.coach.slug}</p>
                    )}
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-[11px] uppercase tracking-wide font-semibold">Asignados</span>
                    </div>
                    <p className="text-2xl font-bold">{perf.assignedCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-500">
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-[11px] uppercase tracking-wide font-semibold">Activos</span>
                    </div>
                    <p className="text-2xl font-bold">{perf.activeCount}</p>
                    {perf.assignedCount > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                            {Math.round(perf.activeCount / perf.assignedCount * 100)}% del total
                        </p>
                    )}
                </div>
                <div className={`rounded-xl border bg-card p-3 space-y-1 ${perf.alertCount > 0 ? 'border-amber-500/30' : 'border-border'}`}>
                    <div className={`flex items-center gap-1.5 ${perf.alertCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="text-[11px] uppercase tracking-wide font-semibold">En alerta</span>
                    </div>
                    <p className="text-2xl font-bold">{perf.alertCount}</p>
                    <p className="text-[11px] text-muted-foreground">sin log &gt;7d</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-violet-500">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-[11px] uppercase tracking-wide font-semibold">Adherencia</span>
                    </div>
                    <p className="text-2xl font-bold">{perf.avgAdherence}%</p>
                    <p className={`text-[11px] font-medium ${perf.avgAdherence >= perf.orgAvgAdherence ? 'text-emerald-500' : 'text-red-400'}`}>
                        {perf.avgAdherence >= perf.orgAvgAdherence ? '▲' : '▼'} org: {perf.orgAvgAdherence}%
                    </p>
                </div>
            </div>

            {/* Weekly adherence */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h2 className="text-sm font-semibold">Adherencia semanal (últimas 4 semanas)</h2>
                <div className="space-y-2">
                    {perf.adherenceWeeks.map((val, i) => (
                        <div key={i} className="grid grid-cols-[80px_1fr] items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">{WEEK_LABELS[i]}</span>
                            <AdherenceBar value={val} orgAvg={perf.orgAvgAdherence} />
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                    % de alumnos activos que registraron al menos un entrenamiento esa semana.
                </p>
            </div>

            {/* Alert clients */}
            {perf.alertClients.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Alumnos en alerta ({perf.alertClients.length})
                    </h2>
                    <div className="divide-y divide-border">
                        {perf.alertClients.map(client => (
                            <div key={client.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <p className="text-sm">{client.full_name ?? 'Alumno'}</p>
                                <span className="text-xs font-semibold text-red-400">
                                    {client.daysSinceLastLog === 999 ? 'Nunca' : `${client.daysSinceLastLog}d sin log`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {perf.assignedCount === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                    Sin alumnos asignados todavía.
                </p>
            )}
        </div>
    )
}
