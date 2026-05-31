import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    ArrowRight,
    BookOpen,
    ClipboardCheck,
    Dumbbell,
    ExternalLink,
    User,
} from 'lucide-react'
import { getOrgBySlug, getOrgWorkoutProgramOverview } from '../_data/org.queries'
import { orgRoleCan } from '@/domain/org/permissions'

export const metadata: Metadata = { title: 'Programas' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgProgramsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')
    // ops, admin, owner — not coaches
    if (!orgRoleCan(org.myRole, 'org.dashboard.view')) redirect(`/org/${slug}`)

    const overview = await getOrgWorkoutProgramOverview(org.id)
    const {
        templates,
        totalClients,
        clientsWithProgram,
        coveragePct,
        byCoach,
    } = overview

    const clientsWithoutProgram = totalClients - clientsWithProgram

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">

                {/* Header */}
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(139,92,246,0.15),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(245,158,11,0.10),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_400px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                                <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
                                Programas de entrenamiento
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Programas
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Cobertura de programas de entrenamiento en la organización. Los coaches crean y asignan programas desde su panel.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Cobertura', `${coveragePct}%`],
                                ['Con programa', clientsWithProgram],
                                ['Sin programa', clientsWithoutProgram],
                                ['Templates', templates.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className={`text-2xl font-black ${label === 'Sin programa' && clientsWithoutProgram > 0 ? 'text-amber-300' : 'text-white'}`}>{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Coverage bar + action */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-zinc-100">Cobertura de programas</p>
                                <p className="text-sm font-black text-white">{coveragePct}%</p>
                            </div>
                            <div className="h-2 w-full rounded-full bg-zinc-800">
                                <div
                                    className={`h-2 rounded-full transition-all ${coveragePct >= 80 ? 'bg-emerald-400' : coveragePct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                    style={{ width: `${coveragePct}%` }}
                                />
                            </div>
                            <p className="mt-2 text-xs text-zinc-500">
                                {clientsWithProgram} de {totalClients} alumnos tienen programa activo
                            </p>
                        </div>
                        {clientsWithoutProgram > 0 && (
                            <Link
                                href={`/org/${slug}/assignments`}
                                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
                            >
                                <ClipboardCheck className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{clientsWithoutProgram} sin asignar →</span>
                                <span className="sm:hidden">Asignar</span>
                            </Link>
                        )}
                    </div>
                </section>

                <div className="grid gap-5 lg:grid-cols-[1fr_400px]">

                    {/* Per-coach breakdown */}
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <User className="h-4 w-4 text-violet-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Programas por coach</h2>
                        </div>

                        {byCoach.length > 0 ? (
                            <div className="space-y-2">
                                {byCoach.map(coach => (
                                    <div
                                        key={coach.coachId}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-xs font-black text-violet-300">
                                                {coach.coachName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-zinc-100">{coach.coachName}</p>
                                                <p className="text-xs text-zinc-500">{coach.activePrograms} programa{coach.activePrograms !== 1 ? 's' : ''} activo{coach.activePrograms !== 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <Link
                                            href="/coach/workout-programs"
                                            className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                                            title="Abrir builder del coach"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            <span className="hidden sm:inline">Builder</span>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-center">
                                <Dumbbell className="mx-auto h-8 w-8 text-zinc-700 mb-3" />
                                <p className="text-sm font-bold text-zinc-400">Sin programas activos</p>
                                <p className="mt-1 text-xs text-zinc-600">
                                    Los coaches crean programas desde{' '}
                                    <Link href="/coach/workout-programs" className="text-violet-400 hover:underline">
                                        su panel
                                    </Link>
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Templates */}
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center justify-between gap-2 mb-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-violet-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Templates</h2>
                            </div>
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-400">
                                {templates.length}
                            </span>
                        </div>

                        {templates.length > 0 ? (
                            <div className="space-y-2">
                                {templates.map(t => (
                                    <div
                                        key={t.id}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-zinc-100">{t.name}</p>
                                            <p className="text-xs text-zinc-500">{t.coachName}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 text-center">
                                <p className="text-sm text-zinc-500">Sin templates creados.</p>
                                <p className="mt-1 text-xs text-zinc-600">Los coaches crean templates desde su panel de programas.</p>
                            </div>
                        )}

                        <div className="mt-4 rounded-lg bg-zinc-800/40 border border-zinc-700/50 p-3">
                            <p className="text-xs text-zinc-400 font-medium mb-1">Templates org completos</p>
                            <p className="text-xs text-zinc-600 leading-5">
                                Crear templates de organización que todos los coaches pueden usar está planificado para una próxima fase (P2.5-C).
                            </p>
                            <Link
                                href={`/org/${slug}/assignments`}
                                className="mt-2 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            >
                                Ver asignaciones <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
