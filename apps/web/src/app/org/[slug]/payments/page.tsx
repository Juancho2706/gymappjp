import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    AlertCircle,
    BadgeCheck,
    Banknote,
    CalendarClock,
    Download,
    FileSpreadsheet,
    Landmark,
    Lock,
    ReceiptText,
    Search,
    ShieldCheck,
    WalletCards,
} from 'lucide-react'
import { getOrgBySlug, getOrgClients } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Pagos alumnos' }

interface Props {
    params: Promise<{ slug: string }>
}

const PAYMENT_STATES = [
    { label: 'Pagado', tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    { label: 'Pendiente', tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
    { label: 'Vencido', tone: 'border-red-400/25 bg-red-400/10 text-red-300' },
    { label: 'Becado', tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
    { label: 'Pausado', tone: 'border-zinc-600 bg-zinc-800 text-zinc-300' },
]

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

export default async function OrgPaymentsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const clients = await getOrgClients(org.id)
    const activeClients = clients.filter((client) => client.is_active !== false)
    const inactiveClients = clients.filter((client) => client.is_active === false)
    const trackedPayments = 0
    const missingPaymentStatus = activeClients.length
    const coverage = activeClients.length > 0 ? Math.round((trackedPayments / activeClients.length) * 100) : 0

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(245,158,11,0.12),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_430px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Payment operations
                            </span>
                            <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
                                Pagos alumnos
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Registro operacional de pagos externos por alumno. EVA no cobra dentro de la app en este MVP y esta pantalla no reemplaza facturacion tributaria.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Cobertura', `${coverage}%`],
                                ['Sin registro', missingPaymentStatus],
                                ['Pausados', inactiveClients.length],
                                ['Cobro in-app', 'No'],
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
                            <ReceiptText className="h-4 w-4 text-sky-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Ledger operacional</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Preview del libro de control. Los estados reales deben venir de una tabla dedicada antes de habilitar edicion.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {clients.length > 0 ? (
                                clients.slice(0, 10).map((client) => {
                                    const state = client.is_active === false ? PAYMENT_STATES[4] : { label: 'Sin registro', tone: 'border-zinc-700 bg-zinc-900 text-zinc-400' }
                                    return (
                                        <div key={client.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/50 p-4 last:border-b-0 md:grid-cols-[1fr_140px_150px_120px] md:items-center">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sm font-black text-sky-300">
                                                    {initials(client.full_name)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-zinc-100">{client.full_name ?? 'Alumno sin nombre'}</p>
                                                    <p className="truncate text-xs text-zinc-500">{client.email ?? client.phone ?? 'Sin contacto registrado'}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-zinc-500">Coach</p>
                                                <p className="truncate text-sm font-bold text-zinc-100">{client.assignedCoach?.full_name ?? 'Sin coach'}</p>
                                            </div>
                                            <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-bold ${state.tone}`}>
                                                {state.label}
                                            </span>
                                            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-400">
                                                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                                Sin fecha
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">No hay alumnos para controlar pagos.</div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <WalletCards className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Modelo MVP</h2>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {PAYMENT_STATES.map((state) => (
                                    <span key={state.label} className={`rounded-full border px-2 py-1 text-xs font-bold ${state.tone}`}>
                                        {state.label}
                                    </span>
                                ))}
                            </div>
                            <div className="mt-5 space-y-3">
                                {[
                                    [Landmark, 'Medio externo', 'Transferencia, efectivo, POS u otro.'],
                                    [Search, 'Conciliacion manual', 'Filtro por estado y vencimiento antes de exportar.'],
                                    [Download, 'CSV primero', 'Export simple antes de PDF o integraciones.'],
                                ].map(([Icon, title, detail]) => (
                                    <div key={title as string} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-bold text-zinc-100">{title as string}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail as string}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                            <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4 text-amber-200" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Guardrails</h2>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-amber-100/80">
                                No guardar montos, vencimientos ni estados sin permission checks, audit log y texto legal claro para Chile.
                            </p>
                        </section>
                    </aside>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    {[
                        [Banknote, 'Dinero', 'Registro interno del negocio, no pasarela de pago.'],
                        [ShieldCheck, 'Compliance', 'Debe decir que no emite boleta/factura ni reemplaza contabilidad.'],
                        [FileSpreadsheet, 'Import futuro', 'CSV desde planilla o sistema externo antes de integraciones complejas.'],
                    ].map(([Icon, title, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <Icon className="h-5 w-5 text-sky-300" aria-hidden="true" />
                            <h3 className="mt-4 text-sm font-black text-white">{title as string}</h3>
                            <p className="mt-2 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                {missingPaymentStatus > 0 && (
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
                            <div>
                                <h2 className="text-sm font-black text-white">Decision tecnica pendiente</h2>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">
                                    Falta crear el source of truth de pagos por alumno. Hasta entonces, esta pantalla no debe permitir editar ni exportar datos financieros.
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}
