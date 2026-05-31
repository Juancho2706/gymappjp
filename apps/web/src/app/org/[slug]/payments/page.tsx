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
import { getOrgBySlug, getOrgClientPayments, getOrgClients } from '../_data/org.queries'
import { recordEnterpriseClientPaymentFormAction } from './_actions/payment.actions'

export const metadata: Metadata = { title: 'Pagos alumnos' }

interface Props {
    params: Promise<{ slug: string }>
    searchParams?: Promise<{ status?: string }>
}

const PAYMENT_STATES = [
    { label: 'Pagado', tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    { label: 'Pendiente', tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
    { label: 'Vencido', tone: 'border-red-400/25 bg-red-400/10 text-red-300' },
    { label: 'Becado', tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
    { label: 'Pausado', tone: 'border-zinc-600 bg-zinc-800 text-zinc-300' },
]

const PAYMENT_STATUS_OPTIONS = [
    ['paid', 'Pagado'],
    ['pending', 'Pendiente'],
    ['overdue', 'Vencido'],
    ['scholarship', 'Becado'],
    ['paused', 'Pausado'],
] as const

const PAYMENT_FILTERS = [
    ['all', 'Todos'],
    ['paid', 'Pagado'],
    ['pending', 'Pendiente'],
    ['overdue', 'Vencido'],
    ['scholarship', 'Becado'],
    ['paused', 'Pausado'],
    ['missing', 'Sin registro'],
] as const

type PaymentFilter = typeof PAYMENT_FILTERS[number][0]

function isPaymentFilter(value: string | undefined): value is PaymentFilter {
    return PAYMENT_FILTERS.some(([filter]) => filter === value)
}

function paymentStateForStatus(status: string | null | undefined) {
    if (status === 'paid') return PAYMENT_STATES[0]
    if (status === 'pending') return PAYMENT_STATES[1]
    if (status === 'overdue') return PAYMENT_STATES[2]
    if (status === 'scholarship') return PAYMENT_STATES[3]
    if (status === 'paused') return PAYMENT_STATES[4]
    return { label: 'Sin registro', tone: 'border-zinc-700 bg-zinc-900 text-zinc-400' }
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

function formatCLP(amount: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
}

export default async function OrgPaymentsPage({ params, searchParams }: Props) {
    const { slug } = await params
    const resolvedSearchParams = await searchParams
    const statusFilter = isPaymentFilter(resolvedSearchParams?.status) ? resolvedSearchParams.status : 'all'
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [clients, payments] = await Promise.all([
        getOrgClients(org.id),
        getOrgClientPayments(org.id),
    ])
    const activeClients = clients.filter((client) => client.is_active !== false)
    const inactiveClients = clients.filter((client) => client.is_active === false)
    const latestPaymentByClient = new Map<string, typeof payments[number]>()
    for (const payment of payments) {
        if (!latestPaymentByClient.has(payment.client_id)) {
            latestPaymentByClient.set(payment.client_id, payment)
        }
    }
    const trackedPayments = activeClients.filter((client) => latestPaymentByClient.has(client.id)).length
    const missingPaymentStatus = activeClients.length - trackedPayments
    const coverage = activeClients.length > 0 ? Math.round((trackedPayments / activeClients.length) * 100) : 0
    const today = new Date().toISOString().slice(0, 10)
    const filteredClients = clients.filter((client) => {
        const latestPayment = latestPaymentByClient.get(client.id)
        if (statusFilter === 'all') return true
        if (statusFilter === 'missing') return client.is_active !== false && !latestPayment
        if (statusFilter === 'paused') return client.is_active === false || latestPayment?.status === 'paused'
        return latestPayment?.status === statusFilter
    })

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
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Pagos alumnos
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
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

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-sm font-black text-white">Filtros operacionales</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                                Filtra el ledger antes de revisar o exportar. El CSV exporta solo el estado filtrado actual.
                            </p>
                        </div>
                        <a
                            href={`/org/${slug}/payments/export?status=${statusFilter}`}
                            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-200 sm:w-fit"
                        >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            Export CSV
                        </a>
                    </div>
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                        {PAYMENT_FILTERS.map(([value, label]) => (
                            <a
                                key={value}
                                href={value === 'all' ? `/org/${slug}/payments` : `/org/${slug}/payments?status=${value}`}
                                className={value === statusFilter
                                    ? 'inline-flex min-h-9 shrink-0 items-center rounded-full border border-sky-300/40 bg-sky-300/15 px-3 text-xs font-black text-sky-100'
                                    : 'inline-flex min-h-9 shrink-0 items-center rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-bold text-zinc-400 transition hover:text-zinc-100'
                                }
                            >
                                {label}
                            </a>
                        ))}
                    </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <ReceiptText className="h-4 w-4 text-sky-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Ledger operacional</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Libro de control manual. Registra pagos externos sin cobrar dentro de EVA y con audit log obligatorio.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {filteredClients.length > 0 ? (
                                filteredClients.slice(0, 30).map((client) => {
                                    const latestPayment = latestPaymentByClient.get(client.id)
                                    const state = client.is_active === false
                                        ? PAYMENT_STATES[4]
                                        : latestPayment
                                            ? paymentStateForStatus(latestPayment.status)
                                            : { label: 'Sin registro', tone: 'border-zinc-700 bg-zinc-900 text-zinc-400' }
                                    return (
                                        <div key={client.id} className="border-b border-zinc-800 bg-zinc-950/50 last:border-b-0">
                                            {/* Mobile: compact single-line + expandable form */}
                                            <div className="flex items-center gap-3 p-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-xs font-black text-sky-300">
                                                    {initials(client.full_name)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-zinc-100">{client.full_name ?? 'Alumno sin nombre'}</p>
                                                    <p className="truncate text-[11px] text-zinc-500">
                                                        {client.assignedCoach?.full_name ?? 'Sin coach'}
                                                        {latestPayment ? ` · ${latestPayment.payment_date}` : ''}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.tone}`}>
                                                        {state.label}
                                                    </span>
                                                </div>
                                            </div>
                                            <details className="px-3 pb-3 -mt-1">
                                                <summary className="cursor-pointer text-xs font-bold text-sky-300">
                                                    {latestPayment ? `Ultimo: ${formatCLP(Number(latestPayment.amount))}` : 'Registrar pago externo'}
                                                </summary>
                                                <form action={recordEnterpriseClientPaymentFormAction.bind(null, slug)} className="mt-3 grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 md:grid-cols-[120px_140px_150px_1fr_auto]">
                                                    <input type="hidden" name="client_id" value={client.id} />
                                                    <input
                                                        name="amount"
                                                        type="number"
                                                        min="0"
                                                        step="1000"
                                                        defaultValue={latestPayment ? Math.round(Number(latestPayment.amount)) : 0}
                                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                                                        aria-label="Monto"
                                                    />
                                                    <input
                                                        name="payment_date"
                                                        type="date"
                                                        defaultValue={latestPayment?.payment_date ?? today}
                                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                                                        aria-label="Fecha de pago"
                                                    />
                                                    <select
                                                        name="status"
                                                        defaultValue={latestPayment?.status ?? 'paid'}
                                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                                                        aria-label="Estado"
                                                    >
                                                        {PAYMENT_STATUS_OPTIONS.map(([value, label]) => (
                                                            <option key={value} value={value}>{label}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        name="service_description"
                                                        placeholder="Nota interna opcional"
                                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={!client.coach_id}
                                                        className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        Guardar
                                                    </button>
                                                </form>
                                                {!client.coach_id && (
                                                    <p className="mt-2 text-xs text-amber-300">Asigna un coach antes de registrar pagos.</p>
                                                )}
                                            </details>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">No hay alumnos para el filtro seleccionado.</div>
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
                                Registro interno: no emite boleta/factura y no reemplaza contabilidad. Cada cambio escribe audit log.
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
                                    Hay alumnos activos sin registro de pago operacional. Completa estado, monto y fecha solo si el negocio ya verifico el pago por fuera de EVA.
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}
