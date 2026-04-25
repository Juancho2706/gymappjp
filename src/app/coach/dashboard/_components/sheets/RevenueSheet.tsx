'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { ClientPaymentSummary, KpiSummary } from '../../_data/types'

interface Props {
    open: boolean
    onOpenChange: (v: boolean) => void
    kpi: KpiSummary
    clientPaymentSummary: ClientPaymentSummary[]
}

function formatCLP(n: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string) {
    return format(new Date(d), 'd MMM yyyy', { locale: es })
}

export function RevenueSheet({ open, onOpenChange, kpi, clientPaymentSummary }: Props) {
    const sorted = [...clientPaymentSummary].sort((a, b) => {
        if (a.hasRecentPayment === b.hasRecentPayment) return 0
        return a.hasRecentPayment ? 1 : -1
    })

    const deltaPct = kpi.mrrDeltaPct
    const DeltaIcon = deltaPct > 0 ? TrendingUp : deltaPct < 0 ? TrendingDown : Minus
    const deltaColor = deltaPct > 0 ? 'text-emerald-500' : deltaPct < 0 ? 'text-destructive' : 'text-muted-foreground'

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-[480px]">
                <SheetHeader className="border-b border-border pb-4">
                    <SheetTitle className="font-display text-xl font-black uppercase tracking-tighter text-foreground">
                        Panel de ingresos
                    </SheetTitle>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl font-black tabular-nums text-foreground">
                            {formatCLP(kpi.mrrCurrentMonth)}
                        </span>
                        <span className={`mb-1 inline-flex items-center gap-1 text-sm font-semibold ${deltaColor}`}>
                            <DeltaIcon className="h-4 w-4" />
                            {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Mes anterior: {formatCLP(kpi.mrrPreviousMonth)}
                    </p>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-1 py-2 sm:px-2">
                    {sorted.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Sin datos de pagos registrados.
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-border">
                            {sorted.map((c) => (
                                <li key={c.clientId}>
                                    <Link
                                        href={`/coach/clients/${c.clientId}`}
                                        className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50 dark:hover:bg-muted/30"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-semibold">
                                                    {c.clientName}
                                                </span>
                                                <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                {c.lastPaymentDate ? (
                                                    <span>
                                                        Último pago: {formatDate(c.lastPaymentDate)}
                                                        {c.lastPaymentAmount != null && ` · ${formatCLP(c.lastPaymentAmount)}`}
                                                    </span>
                                                ) : (
                                                    <span>Sin pagos registrados</span>
                                                )}
                                                {c.nextRenewalDate && (
                                                    <span>Renovación: {formatDate(c.nextRenewalDate)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <StatusBadge hasRecentPayment={c.hasRecentPayment} hasAnyPayment={c.lastPaymentDate !== null} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

function StatusBadge({ hasRecentPayment, hasAnyPayment }: { hasRecentPayment: boolean; hasAnyPayment: boolean }) {
    if (!hasAnyPayment) {
        return (
            <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:border-muted-foreground/30 dark:bg-transparent">
                Sin pago
            </span>
        )
    }
    if (hasRecentPayment) {
        return (
            <span className="shrink-0 rounded-full border border-emerald-500/45 bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400">
                Al día
            </span>
        )
    }
    return (
        <span className="shrink-0 rounded-full border border-orange-500/45 bg-orange-500/[0.12] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-400">
            Vencido
        </span>
    )
}
