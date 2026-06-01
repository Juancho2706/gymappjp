import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Flame,
    TrendingUp,
    User,
} from 'lucide-react'
import { getOrgBySlug, getOrgCheckInOverview, getOrgCoachStreaks } from '../_data/org.queries'
import { OrgEmptyState } from '../_components/OrgEmptyState'
import { orgRoleCan } from '@/domain/org/permissions'

export const metadata: Metadata = { title: 'Check-ins' }

interface Props {
    params: Promise<{ slug: string }>
}

function percentage(value: number, total: number) {
    if (total <= 0) return 0
    return Math.round((value / total) * 100)
}

function activityColor(rate: number) {
    if (rate >= 70) return 'text-emerald-300'
    if (rate >= 40) return 'text-amber-300'
    return 'text-red-300'
}

export default async function OrgCheckInsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')
    if (!orgRoleCan(org.myRole, 'org.dashboard.view')) redirect(`/org/${slug}`)

    const [data, streaks] = await Promise.all([
        getOrgCheckInOverview(org.id),
        getOrgCoachStreaks(org.id),
    ])
    const {
        total7d,
        total30d,
        clientsActive7d,
        totalOrgClients,
        noCheckIn14d,
        byCoach,
        recent,
    } = data

    const participationRate = percentage(clientsActive7d, totalOrgClients)
    const atRiskRate = percentage(noCheckIn14d, totalOrgClients)

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">

                {/* Header */}
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(245,158,11,0.10),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_400px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                                Seguimiento operacional
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Check-ins
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Actividad de check-ins de alumnos enterprise. Mide adherencia al seguimiento semanal y detecta alumnos sin contacto reciente.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                { label: 'Últ. 7 días', value: total7d },
                                { label: 'Últ. 30 días', value: total30d },
                                { label: 'Participación', value: `${participationRate}%` },
                                { label: 'Sin contacto', value: noCheckIn14d },
                            ].map(({ label, value }) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className={`text-2xl font-black ${
                                        label === 'Sin contacto' && noCheckIn14d > 0 ? 'text-amber-300' :
                                        label === 'Participación' ? activityColor(participationRate) :
                                        'text-white'
                                    }`}>{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* At-risk banner */}
                {noCheckIn14d > 0 && (
                    <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-amber-200">
                                        {noCheckIn14d} {noCheckIn14d === 1 ? 'alumno' : 'alumnos'} sin check-in en 14+ días
                                    </p>
                                    <p className="mt-1 text-xs text-amber-300/70">
                                        {atRiskRate}% del pool enterprise sin contacto reciente. Revisar con coaches asignados.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/org/${slug}/clients`}
                                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
                            >
                                Ver alumnos <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </section>
                )}

                <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

                    {/* Per-coach breakdown */}
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <User className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Actividad por coach</h2>
                            <span className="ml-auto text-xs text-zinc-500">Últ. 7 días</span>
                        </div>

                        {byCoach.length > 0 ? (
                            <div className="space-y-2">
                                {byCoach.map(coach => {
                                    const rate = percentage(coach.activeClients7d, coach.totalClients)
                                    return (
                                        <div key={coach.coachId} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-xs font-black text-emerald-300">
                                                        {coach.coachName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-bold text-zinc-100">{coach.coachName}</p>
                                                        <p className="text-xs text-zinc-500">{coach.totalClients} alumnos asignados</p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={`text-lg font-black ${activityColor(rate)}`}>{rate}%</p>
                                                    <p className="text-xs text-zinc-600">{coach.activeClients7d}/{coach.totalClients}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 h-1.5 w-full rounded-full bg-zinc-800">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all ${
                                                        rate >= 70 ? 'bg-emerald-400' : rate >= 40 ? 'bg-amber-400' : 'bg-red-400'
                                                    }`}
                                                    style={{ width: `${rate}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <OrgEmptyState
                                icon={ClipboardList}
                                tone="emerald"
                                headline="Sin check-ins en los últimos 30 días"
                                description="Los alumnos envían check-ins desde su app. Cuando lleguen, verás participación, rachas por coach y alumnos sin contacto."
                            />
                        )}
                    </section>

                    {/* Right panel: metrics + recent */}
                    <aside className="space-y-5">
                        {/* Summary metrics */}
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-base font-black text-white">Resumen</h2>
                            </div>
                            <div className="space-y-3">
                                {[
                                    {
                                        label: 'Participación 7d',
                                        value: `${participationRate}%`,
                                        detail: `${clientsActive7d} de ${totalOrgClients} alumnos`,
                                        ok: participationRate >= 60,
                                    },
                                    {
                                        label: 'Check-ins 30d',
                                        value: total30d,
                                        detail: `${Math.round(total30d / 4)} promedio semanal`,
                                        ok: total30d > 0,
                                    },
                                    {
                                        label: 'Sin contacto 14d',
                                        value: noCheckIn14d,
                                        detail: `${atRiskRate}% del pool`,
                                        ok: noCheckIn14d === 0,
                                    },
                                ].map(({ label, value, detail, ok }) => (
                                    <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <div className="flex items-center gap-2">
                                            {ok
                                                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                                : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                                            }
                                            <div>
                                                <p className="text-xs font-bold text-zinc-200">{label}</p>
                                                <p className="text-[10px] text-zinc-600">{detail}</p>
                                            </div>
                                        </div>
                                        <p className={`text-lg font-black ${ok ? 'text-zinc-100' : 'text-amber-300'}`}>{value}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Recent activity */}
                        {recent.length > 0 && (
                            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    <h2 className="text-base font-black text-white">Recientes</h2>
                                </div>
                                <div className="space-y-2">
                                    {recent.slice(0, 8).map((ci, i) => (
                                        <div key={`${ci.clientId}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-zinc-200">{ci.clientName ?? 'Alumno'}</p>
                                                {ci.coachName && (
                                                    <p className="truncate text-[10px] text-zinc-600">{ci.coachName}</p>
                                                )}
                                            </div>
                                            <p className="shrink-0 text-[10px] font-mono text-zinc-600">{ci.date}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </aside>
                </div>
                {/* Coach streaks */}
                {streaks.length > 0 && (
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Flame className="h-4 w-4 text-orange-400" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Rachas de actividad</h2>
                            <span className="ml-auto text-xs text-zinc-500">Semanas consecutivas con check-ins</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {streaks.slice(0, 6).map(streak => (
                                <div key={streak.coachId} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                                            streak.currentStreak >= 4 ? 'bg-orange-400/15 text-orange-300' :
                                            streak.currentStreak >= 2 ? 'bg-amber-400/15 text-amber-300' :
                                            'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {streak.currentStreak > 0 ? `${streak.currentStreak}s` : '—'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-zinc-100">{streak.coachName}</p>
                                            <p className="text-[10px] text-zinc-600">
                                                Mejor: {streak.longestStreak} sem
                                                {streak.lastActiveWeek && ` · activo hasta ${streak.lastActiveWeek}`}
                                            </p>
                                        </div>
                                    </div>
                                    {streak.currentStreak >= 4 && (
                                        <Flame className="shrink-0 h-4 w-4 text-orange-400" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

            </div>
        </div>
    )
}
