import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Download,
    FileSpreadsheet,
    Gauge,
    LineChart,
    LockKeyhole,
    PieChart,
    TrendingUp,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgClients, getOrgInvoices, getOrgMembers, getOrgStats } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Reportes' }

interface Props {
    params: Promise<{ slug: string }>
}

function percentage(value: number, total: number) {
    if (total <= 0) return 0
    return Math.round((value / total) * 100)
}

function reportTone(value: number) {
    if (value >= 80) return 'text-emerald-300'
    if (value >= 55) return 'text-amber-300'
    return 'text-red-300'
}

export default async function OrgReportsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [stats, members, clients, invoices] = await Promise.all([
        getOrgStats(org.id),
        getOrgMembers(org.id),
        getOrgClients(org.id),
        getOrgInvoices(org.id),
    ])

    const activeMembers = members.filter((member) => member.status === 'active')
    const coachMembers = activeMembers.filter((member) => member.role === 'coach' && member.coach_id)
    const activeClients = clients.filter((client) => client.is_active !== false)
    const inactiveClients = clients.filter((client) => client.is_active === false)
    const unassignedClients = activeClients.filter((client) => !client.coach_id)
    const assignedClients = activeClients.filter((client) => client.coach_id)
    const assignmentRate = percentage(assignedClients.length, activeClients.length)
    const activeRate = percentage(activeClients.length, clients.length)
    const seatUsage = percentage(activeMembers.length, org.seats_included)
    const pendingInvoices = invoices.filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue')
    const riskScore = Math.max(0, 100 - (unassignedClients.length * 8) - (inactiveClients.length * 5) - (pendingInvoices.length * 6))

    const coachLoad = coachMembers
        .map((member) => ({
            id: member.id,
            name: member.coach?.full_name ?? 'Coach enterprise',
            clients: activeClients.filter((client) => client.coach_id === member.coach_id).length,
            health: member.last_health_score,
        }))
        .sort((a, b) => b.clients - a.clients)
        .slice(0, 6)

    const reportCards = [
        { label: 'Salud operacional', value: org.last_health_score ?? riskScore, suffix: '/100', icon: Gauge },
        { label: 'Asignacion alumnos', value: assignmentRate, suffix: '%', icon: PieChart },
        { label: 'Alumnos activos', value: activeRate, suffix: '%', icon: TrendingUp },
        { label: 'Uso de seats', value: seatUsage, suffix: '%', icon: Users },
    ]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(16,185,129,0.12),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                                Decision intelligence
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Reportes operacionales
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Paquete semanal para owners: carga de coaches, salud de alumnos, riesgos y exports futuros sin mezclarlo con cobro in-app.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Weekly brief</p>
                                    <p className="mt-2 text-3xl font-black text-white">{new Date().toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })}</p>
                                </div>
                                <div className="rounded-xl border border-sky-400/25 bg-sky-400/10 p-3 text-sky-300">
                                    <CalendarDays className="h-6 w-6" aria-hidden="true" />
                                </div>
                            </div>
                            <p className="mt-4 text-sm leading-6 text-zinc-500">
                                Snapshot read-only. CSV/PDF quedan bloqueados hasta permisos dedicados y audit event `report.exported`.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {reportCards.map(({ label, value, suffix, icon: Icon }) => (
                        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                    <p className={`mt-3 text-3xl font-black ${reportTone(value)}`}>
                                        {value}{suffix}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sky-300">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <LineChart className="h-4 w-4 text-sky-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Coach performance report</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Reporte inicial de carga. Adherencia real avanzada queda para metricas de workout/check-in normalizadas.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {coachLoad.length > 0 ? (
                                coachLoad.map((coach) => {
                                    const load = percentage(coach.clients, Math.max(1, Math.ceil(activeClients.length / Math.max(1, coachMembers.length))))
                                    return (
                                        <div key={coach.id} className="grid gap-4 border-b border-zinc-800 bg-zinc-950/50 p-4 last:border-b-0 md:grid-cols-[1fr_130px_170px] md:items-center">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-zinc-100">{coach.name}</p>
                                                <p className="mt-1 text-xs text-zinc-500">Health score: {coach.health ?? 'sin calcular'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-zinc-500">Alumnos activos</p>
                                                <p className="text-sm font-bold text-zinc-100">{coach.clients}</p>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs text-zinc-500">
                                                    <span>Carga relativa</span>
                                                    <span>{Math.min(load, 100)}%</span>
                                                </div>
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                                    <div
                                                        className={load >= 100 ? 'h-full bg-red-400' : load >= 80 ? 'h-full bg-amber-400' : 'h-full bg-sky-400'}
                                                        style={{ width: `${Math.min(load, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">No hay coaches activos suficientes para reporte.</div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Weekly findings</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Alumnos sin coach', `${unassignedClients.length} requieren asignacion.`, unassignedClients.length === 0],
                                    ['Alumnos inactivos', `${inactiveClients.length} deben revisarse antes de reporting externo.`, inactiveClients.length === 0],
                                    ['Pagos enterprise', `${pendingInvoices.length} invoices pendientes/overdue.`, pendingInvoices.length === 0],
                                    ['Seats', `${activeMembers.length}/${org.seats_included} seats usados.`, seatUsage < 90],
                                ].map(([title, detail, ok]) => (
                                    <div key={title as string} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        {ok ? (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                        ) : (
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                                        )}
                                        <div>
                                            <p className="text-sm font-bold text-zinc-100">{title as string}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail as string}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    <h2 className="text-lg font-black text-white">Export CSV</h2>
                                </div>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-emerald-100/80">
                                Reporte semanal operacional: KPIs, rendimiento por coach, alumnos en riesgo y listado completo. Se registra en Audit Log.
                            </p>
                            <a
                                href={`/org/${slug}/reports/export`}
                                download
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 transition-colors"
                            >
                                <Download className="h-4 w-4" aria-hidden="true" />
                                Descargar reporte
                            </a>
                        </section>
                    </aside>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-400/20 bg-zinc-900/70 p-4">
                        <FileSpreadsheet className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                        <h3 className="mt-4 text-sm font-black text-white">CSV operativo</h3>
                        <p className="mt-2 text-xs leading-5 text-zinc-400">Disponible. KPIs, coaches, alumnos en riesgo y listado completo. Auditado.</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/70 p-4 opacity-60">
                        <Download className="h-5 w-5 text-zinc-500" aria-hidden="true" />
                        <h3 className="mt-4 text-sm font-black text-zinc-400">PDF ejecutivo</h3>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">Próximamente. Resumen listo para socios y reuniones internas.</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                        <LockKeyhole className="h-5 w-5 text-sky-300" aria-hidden="true" />
                        <h3 className="mt-4 text-sm font-black text-white">Audit trail</h3>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">Cada export registra actor, tipo, filtros y timestamp en el Audit Log.</p>
                    </div>
                </section>

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <h2 className="text-lg font-black text-white">Formula status</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Este reporte usa formulas conservadoras basadas en datos existentes. Antes de venderlo como analytics avanzado, falta normalizar adherencia real, check-ins, pagos alumno y rangos historicos.
                    </p>
                    <div className="mt-4 grid gap-2 md:grid-cols-4">
                        {[
                            ['Coaches', stats.totalCoaches],
                            ['Clientes', stats.totalClients],
                            ['Activos', stats.activeClients],
                            ['Invites', stats.pendingInvites],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                <p className="mt-2 text-2xl font-black text-white">{value}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
