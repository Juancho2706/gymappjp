import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    ArrowRightLeft,
    CheckCircle2,
    ClipboardCheck,
    Gauge,
    Layers3,
    Route,
    Sparkles,
    UserPlus,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgClients, getOrgMembers } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Asignaciones' }

interface Props {
    params: Promise<{ slug: string }>
}

const TARGET_CLIENTS_PER_COACH = 25

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

function capacityTone(load: number) {
    if (load >= 100) return 'text-red-300 bg-red-400/10 border-red-400/25'
    if (load >= 80) return 'text-amber-300 bg-amber-400/10 border-amber-400/25'
    return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25'
}

export default async function OrgAssignmentsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [clients, members] = await Promise.all([
        getOrgClients(org.id),
        getOrgMembers(org.id),
    ])

    const linkedCoaches = members
        .filter((member) => member.role === 'coach' && member.status === 'active' && member.coach)
        .map((member) => member.coach!)

    const activeClients = clients.filter((client) => client.is_active !== false)
    const unassignedClients = activeClients.filter((client) => !client.coach_id)
    const assignedClients = activeClients.filter((client) => client.coach_id)
    const inactiveClients = clients.filter((client) => client.is_active === false)

    const coachRows = linkedCoaches
        .map((coach) => {
            const count = activeClients.filter((client) => client.coach_id === coach.id).length
            const load = Math.round((count / TARGET_CLIENTS_PER_COACH) * 100)
            return {
                id: coach.id,
                name: coach.full_name ?? 'Coach',
                slug: coach.slug,
                count,
                load,
                available: Math.max(TARGET_CLIENTS_PER_COACH - count, 0),
            }
        })
        .sort((a, b) => b.load - a.load)

    const openCapacity = coachRows.reduce((total, row) => total + row.available, 0)
    const overloaded = coachRows.filter((row) => row.load >= 100)
    const recommendedTargets = coachRows
        .filter((row) => row.available > 0)
        .sort((a, b) => a.load - b.load)
        .slice(0, 3)

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(14,165,233,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Assignment control
                            </span>
                            <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
                                Asignaciones alumno-coach
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Vista operacional para decidir que alumno necesita coach, que coach tiene capacidad y que cambios deben quedar auditados antes de permitir mutations.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Sin coach', unassignedClients.length],
                                ['Asignados', assignedClients.length],
                                ['Capacidad', openCapacity],
                                ['Sobrecarga', overloaded.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Queue sin coach</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Lista prioritaria para el futuro bulk assign. Por ahora solo lee el estado actual.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {unassignedClients.length > 0 ? (
                                unassignedClients.slice(0, 8).map((client, index) => (
                                    <div key={client.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/50 p-4 last:border-b-0 md:grid-cols-[1fr_140px_150px] md:items-center">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-sm font-black text-emerald-300">
                                                {initials(client.full_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-zinc-100">{client.full_name ?? 'Alumno sin nombre'}</p>
                                                <p className="truncate text-xs text-zinc-500">{client.email ?? client.phone ?? 'Sin contacto registrado'}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-zinc-500">Prioridad sugerida</p>
                                            <p className="text-sm font-bold text-zinc-100">P{Math.min(index + 1, 5)}</p>
                                        </div>
                                        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                                            <Route className="h-3 w-3" aria-hidden="true" />
                                            Listo para asignar
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">No hay alumnos activos sin coach.</div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Sugerencia futura</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                La primera version editable debe recomendar por capacidad, especialidad, disponibilidad y riesgo del alumno.
                            </p>
                            <div className="mt-4 space-y-3">
                                {recommendedTargets.length > 0 ? (
                                    recommendedTargets.map((coach) => (
                                        <div key={coach.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <div>
                                                <p className="text-sm font-bold text-zinc-100">{coach.name}</p>
                                                <p className="text-xs text-zinc-500">{coach.available} cupos sugeridos</p>
                                            </div>
                                            <span className={`rounded-full border px-2 py-1 text-xs font-bold ${capacityTone(coach.load)}`}>
                                                {coach.load}%
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100/80">
                                        Sin capacidad disponible segun el umbral actual.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Layers3 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Reglas antes de editar</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Historial obligatorio', 'Cada reasignacion debe crear audit event.'],
                                    ['Bulk seguro', 'Preview antes de confirmar cambios masivos.'],
                                    ['Rollback', 'Revertir ultima asignacion si soporte lo necesita.'],
                                    ['Coach isolation', 'Coach no decide ownership enterprise.'],
                                ].map(([title, detail]) => (
                                    <div key={title} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-bold text-zinc-100">{title}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </aside>
                </section>

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-sky-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Capacidad por coach</h2>
                    </div>
                    <div className="mt-5 grid gap-3 lg:grid-cols-3">
                        {coachRows.length > 0 ? (
                            coachRows.map((coach) => (
                                <div key={coach.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-black text-white">{coach.name}</h3>
                                            <p className="mt-1 truncate text-xs text-zinc-500">{coach.slug ?? 'coach enterprise'}</p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${capacityTone(coach.load)}`}>
                                            {coach.load}%
                                        </span>
                                    </div>
                                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                                        <div
                                            className={coach.load >= 100 ? 'h-full bg-red-400' : coach.load >= 80 ? 'h-full bg-amber-400' : 'h-full bg-emerald-400'}
                                            style={{ width: `${Math.min(coach.load, 100)}%` }}
                                        />
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                                            <p className="text-zinc-500">Alumnos</p>
                                            <p className="mt-1 text-lg font-black text-white">{coach.count}</p>
                                        </div>
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                                            <p className="text-zinc-500">Cupos</p>
                                            <p className="mt-1 text-lg font-black text-white">{coach.available}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-sm text-zinc-500 lg:col-span-3">
                                No hay coaches activos para asignar alumnos.
                            </div>
                        )}
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    {[
                        [AlertTriangle, 'Riesgo operativo', `${inactiveClients.length} alumnos inactivos deben quedar fuera de bulk assign por defecto.`],
                        [ArrowRightLeft, 'Reasignacion', 'El flujo editable debe mostrar impacto antes/despues por coach.'],
                        [Users, 'Workload', `Umbral inicial: ${TARGET_CLIENTS_PER_COACH} alumnos activos por coach.`],
                    ].map(([Icon, title, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                            <h3 className="mt-4 text-sm font-black text-white">{title as string}</h3>
                            <p className="mt-2 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    )
}
