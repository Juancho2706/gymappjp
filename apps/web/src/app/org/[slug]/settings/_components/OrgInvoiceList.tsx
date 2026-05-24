import { ExternalLink, FileText } from 'lucide-react'
import type { OrgInvoice } from '../../_data/org.queries'

const STATUS_STYLES: Record<string, string> = {
    paid: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    pending: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    overdue: 'border-red-400/25 bg-red-400/10 text-red-300',
    cancelled: 'border-zinc-700 bg-zinc-900 text-zinc-400',
}

const STATUS_LABELS: Record<string, string> = {
    paid: 'Pagado',
    pending: 'Pendiente',
    overdue: 'Vencido',
    cancelled: 'Cancelado',
}

function formatCLP(amount: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
}

function formatPeriod(start: string, end: string) {
    const periodStart = new Date(start).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
    const periodEnd = new Date(end).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
    return periodStart === periodEnd ? periodStart : `${periodStart} - ${periodEnd}`
}

interface Props {
    invoices: OrgInvoice[]
}

export function OrgInvoiceList({ invoices }: Props) {
    if (invoices.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-sm font-bold text-zinc-300">Sin facturas registradas</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Mantener billing manual evita depender de pagos in-app mientras enterprise valida revenue.</p>
            </div>
        )
    }

    return (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
            {invoices.map(inv => {
                const statusStyle = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending
                const statusLabel = STATUS_LABELS[inv.status] ?? inv.status

                return (
                    <div key={inv.id} className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-950/50 p-3 last:border-b-0">
                        <div className="flex min-w-0 items-start gap-2.5">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-zinc-100">{formatPeriod(inv.period_start, inv.period_end)}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-zinc-500">{formatCLP(inv.amount_clp)}</span>
                                    {inv.paid_at && (
                                        <span className="text-[11px] text-zinc-500">
                                            Pagado {new Date(inv.paid_at).toLocaleDateString('es-CL')}
                                        </span>
                                    )}
                                    {inv.payment_ref && (
                                        <span className="font-mono text-[11px] text-zinc-500">
                                            ref: {inv.payment_ref}
                                        </span>
                                    )}
                                </div>
                                {inv.notes && (
                                    <p className="mt-1 max-w-xs truncate text-[11px] text-zinc-500">{inv.notes}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusStyle}`}>
                                {statusLabel}
                            </span>
                            {inv.notes?.startsWith('http') && (
                                <a
                                    href={inv.notes}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-500 transition hover:text-zinc-200"
                                    title="Ver documento"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
