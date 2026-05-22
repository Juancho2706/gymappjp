import { FileText, ExternalLink } from 'lucide-react'
import type { OrgInvoice } from '../../_data/org.queries'

const STATUS_STYLES: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    overdue: 'bg-red-500/10 text-red-500',
    cancelled: 'bg-muted text-muted-foreground',
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
    const s = new Date(start).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
    const e = new Date(end).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
    return s === e ? s : `${s} – ${e}`
}

interface Props {
    invoices: OrgInvoice[]
}

export function OrgInvoiceList({ invoices }: Props) {
    if (invoices.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-2">
                Sin facturas registradas aún.
            </p>
        )
    }

    return (
        <div className="divide-y divide-border">
            {invoices.map(inv => {
                const statusStyle = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending
                const statusLabel = STATUS_LABELS[inv.status] ?? inv.status

                return (
                    <div key={inv.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{formatPeriod(inv.period_start, inv.period_end)}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground">{formatCLP(inv.amount_clp)}</span>
                                    {inv.paid_at && (
                                        <span className="text-[11px] text-muted-foreground">
                                            Pagado {new Date(inv.paid_at).toLocaleDateString('es-CL')}
                                        </span>
                                    )}
                                    {inv.payment_ref && (
                                        <span className="text-[11px] font-mono text-muted-foreground">
                                            ref: {inv.payment_ref}
                                        </span>
                                    )}
                                </div>
                                {inv.notes && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xs">{inv.notes}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle}`}>
                                {statusLabel}
                            </span>
                            {inv.notes?.startsWith('http') && (
                                <a
                                    href={inv.notes}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    title="Ver documento"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
