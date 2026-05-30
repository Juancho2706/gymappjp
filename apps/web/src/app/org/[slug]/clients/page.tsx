import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    ArrowRight,
    BadgeCheck,
    Search,
    Upload,
    UserCheck,
    UserPlus,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgClientPayments, getOrgClients, getOrgMembers } from '../_data/org.queries'
import { AddClientForm } from './_components/AddClientForm'
import { ImportClientsModal } from './_components/ImportClientsModal'
import { ClientsListClient, type ClientDisplayRow, type ActiveCoachOption } from './_components/ClientsListClient'

export const metadata: Metadata = { title: 'Alumnos' }

interface Props {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ q?: string; view?: string }>
}


export default async function OrgClientsPage({ params, searchParams }: Props) {
    const { slug } = await params
    const { q, view = 'all' } = await searchParams

    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'

    const [clients, members, payments] = await Promise.all([
        getOrgClients(org.id, q),
        getOrgMembers(org.id),
        getOrgClientPayments(org.id),
    ])

    const activeCoaches = members
        .filter(member => member.status === 'active' && member.role === 'coach' && member.coach)
        .map(member => ({ id: member.coach!.id, full_name: member.coach!.full_name, slug: member.coach!.slug }))

    const latestPaymentByClient = new Map<string, typeof payments[number]>()
    for (const payment of payments) {
        if (!latestPaymentByClient.has(payment.client_id)) {
            latestPaymentByClient.set(payment.client_id, payment)
        }
    }

    const activeClients = clients.filter(client => client.is_active !== false)
    const inactiveClients = clients.filter(client => client.is_active === false)
    const unassignedClients = activeClients.filter(client => !client.coach_id)
    const noPaymentClients = activeClients.filter(client => !latestPaymentByClient.has(client.id))
    const overdueClients = activeClients.filter(client => latestPaymentByClient.get(client.id)?.status === 'overdue')

    const filteredClients = clients.filter(client => {
        if (view === 'unassigned') return client.is_active !== false && !client.coach_id
        if (view === 'inactive') return client.is_active === false
        if (view === 'no-payment') return client.is_active !== false && !latestPaymentByClient.has(client.id)
        if (view === 'overdue') return latestPaymentByClient.get(client.id)?.status === 'overdue'
        return true
    })

    const tabs = [
        { id: 'all', label: 'Todos', count: clients.length },
        { id: 'unassigned', label: 'Sin coach', count: unassignedClients.length },
        { id: 'no-payment', label: 'Sin pago', count: noPaymentClients.length },
        { id: 'overdue', label: 'Vencidos', count: overdueClients.length },
        { id: 'inactive', label: 'Inactivos', count: inactiveClients.length },
    ]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.16),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(168,85,247,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_460px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                Operaciones / Alumnos
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Alumnos, asignacion y estado operacional
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Inbox operativo para ver quien esta sin coach, quien no tiene registro de pago y que alumnos requieren accion antes de que el negocio pierda control.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <Link
                                    href={`/org/${slug}/assignments`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
                                >
                                    Resolver asignaciones
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <Link
                                    href={`/org/${slug}/payments`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                                >
                                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                                    Ver pagos
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Activos', activeClients.length],
                                ['Sin coach', unassignedClients.length],
                                ['Sin pago', noPaymentClients.length],
                                ['Vencidos', overdueClients.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {([
                        [UserCheck, 'Asignacion', `${Math.max(0, activeClients.length - unassignedClients.length)}/${activeClients.length}`, 'alumnos activos con coach'],
                        [BadgeCheck, 'Pago operativo', `${activeClients.length - noPaymentClients.length}/${activeClients.length}`, 'con registro reciente'],
                        [AlertTriangle, 'Riesgo accion', unassignedClients.length + overdueClients.length, 'sin coach o vencidos'],
                        [Upload, 'Import', activeCoaches.length, 'coaches disponibles'],
                    ] as const).map(([Icon, title, value, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                                <p className="text-2xl font-black text-white">{value as string | number}</p>
                            </div>
                            <h2 className="mt-4 text-sm font-black text-white">{title as string}</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                {isAdmin && (
                    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <UserPlus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Agregar alumno</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Alta individual con consentimiento de edad y asignacion opcional a coach enterprise.
                            </p>
                            <div className="mt-5">
                                <AddClientForm orgSlug={slug} coaches={activeCoaches} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Upload className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Importar alumnos</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Carga CSV con preview, resolucion de coach por slug/nombre y resultados por fila.
                            </p>
                            <div className="mt-5">
                                <ImportClientsModal
                                    orgSlug={slug}
                                    coaches={activeCoaches.map(coach => ({ id: coach.id, name: coach.full_name ?? 'Coach', slug: coach.slug }))}
                                />
                            </div>
                        </div>
                    </section>
                )}

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-black text-white">Inbox de alumnos</h2>
                            <p className="mt-1 text-sm text-zinc-500">
                                Prioriza excepciones: sin coach, sin registro de pago, vencidos e inactivos.
                            </p>
                        </div>
                        <form method="GET" className="flex w-full gap-2 xl:w-[430px]">
                            <input type="hidden" name="view" value={view} />
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                                <input
                                    name="q"
                                    defaultValue={q ?? ''}
                                    placeholder="Buscar nombre o email..."
                                    className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
                                />
                            </div>
                            <button
                                type="submit"
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 transition hover:bg-zinc-700"
                            >
                                Buscar
                            </button>
                        </form>
                    </div>

                    <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                        {tabs.map(tab => (
                            <Link
                                key={tab.id}
                                href={`/org/${slug}/clients?view=${tab.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                                className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition ${
                                    view === tab.id
                                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                        : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                {tab.label} / {tab.count}
                            </Link>
                        ))}
                    </div>

                    <ClientsListClient
                        orgSlug={slug}
                        isAdmin={isAdmin}
                        coaches={activeCoaches.map<ActiveCoachOption>(c => ({
                            id: c.id,
                            name: c.full_name ?? 'Coach',
                            slug: c.slug,
                        }))}
                        clients={filteredClients.map<ClientDisplayRow>(client => {
                            const latestPayment = latestPaymentByClient.get(client.id)
                            const paymentStatus = latestPayment?.status ?? null
                            const riskCount = (client.coach_id ? 0 : 1) + (!latestPayment && client.is_active !== false ? 1 : 0) + (paymentStatus === 'overdue' ? 1 : 0)
                            return {
                                id: client.id,
                                name: client.full_name,
                                email: client.email,
                                phone: client.phone,
                                isActive: client.is_active !== false,
                                coachId: client.coach_id,
                                coachName: client.assignedCoach?.full_name ?? null,
                                paymentStatus,
                                riskCount,
                            }
                        })}
                    />
                </section>
            </div>
        </div>
    )
}
