'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { CreditCard, Plus, Trash2, Calendar, Receipt } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { addPayment, deletePayment } from './actions'

function formatMoney(amount: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    }).format(amount)
}

function isPaidStatus(status: string | null | undefined) {
    const s = String(status || '').toLowerCase()
    return s === 'paid' || s === 'pagado' || s === 'completed'
}

function isPendingStatus(status: string | null | undefined) {
    return String(status || '').toLowerCase() === 'pending'
}

type PaymentRow = {
    id: string
    amount: number
    payment_date: string
    service_description: string
    status?: string | null
    period_months?: number | null
    receipt_image_url?: string | null
}

type BillingTabB8Props = {
    payments: PaymentRow[]
    clientId: string
}

export function BillingTabB8({ payments, clientId }: BillingTabB8Props) {
    const router = useRouter()
    const [isDeleting, startDeleteTransition] = useTransition()
    const [isAdding, startAddTransition] = useTransition()
    const [addOpen, setAddOpen] = useState(false)
    const [amount, setAmount] = useState('')
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
    const [description, setDescription] = useState('')
    const [periodMonths, setPeriodMonths] = useState('')
    const [formError, setFormError] = useState('')

    const sorted = useMemo(
        () =>
            [...payments].sort(
                (a, b) =>
                    new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
            ),
        [payments]
    )

    const paidRows = sorted.filter((p) => isPaidStatus(p.status))
    const totalPaid = paidRows.reduce((s, p) => s + Number(p.amount || 0), 0)
    const lastPaid = paidRows[0]

    const lastPaidDate = lastPaid?.payment_date
    const lastPaidMonths = lastPaid?.period_months
    let nextRenewalLabel = '—'
    if (lastPaidDate) {
        const months = Number(lastPaidMonths)
        if (months > 0) {
            try {
                nextRenewalLabel = format(addMonths(new Date(lastPaidDate), months), 'd MMM yyyy', { locale: es })
            } catch {
                nextRenewalLabel = '—'
            }
        }
    }

    const onDelete = (paymentId: string) => {
        if (!window.confirm('¿Eliminar este pago del historial?')) return
        startDeleteTransition(async () => {
            await deletePayment(paymentId, clientId)
            router.refresh()
        })
    }

    const resetAddForm = () => {
        setAmount('')
        setPaymentDate(new Date().toISOString().split('T')[0])
        setDescription('')
        setPeriodMonths('')
        setFormError('')
    }

    const onAddPayment = (e: FormEvent) => {
        e.preventDefault()
        setFormError('')
        const amt = Number(String(amount).replace(/\s/g, ''))
        if (!Number.isFinite(amt) || amt <= 0) {
            setFormError('Indica un monto válido.')
            return
        }
        if (!paymentDate) {
            setFormError('Indica la fecha del pago.')
            return
        }
        const desc = description.trim()
        if (!desc) {
            setFormError('Indica un concepto (ej. mensualidad).')
            return
        }
        const pm = periodMonths.trim() ? Number(periodMonths) : undefined
        if (periodMonths.trim() !== '' && (!Number.isFinite(pm) || (pm ?? 0) < 1)) {
            setFormError('Periodo en meses debe ser un número ≥ 1 o vacío.')
            return
        }
        startAddTransition(async () => {
            try {
                await addPayment({
                    client_id: clientId,
                    amount: Math.round(amt),
                    payment_date: paymentDate,
                    service_description: desc,
                    period_months: pm,
                    status: 'paid',
                })
                setAddOpen(false)
                resetAddForm()
                router.refresh()
            } catch {
                setFormError('No se pudo registrar el pago. Revisa los datos o intenta de nuevo.')
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <GlassCard className="border-dashed border-border/50 p-4 dark:border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Total cobrado
                    </p>
                    <p className="mt-1 text-lg font-black tabular-nums text-primary">
                        {formatMoney(totalPaid)}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                        Suma de pagos marcados como pagados
                    </p>
                </GlassCard>
                <GlassCard className="border-dashed border-border/50 p-4 dark:border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Último pago
                    </p>
                    <p className="mt-1 text-sm font-black text-foreground">
                        {lastPaid
                            ? formatDistanceToNow(new Date(lastPaid.payment_date), {
                                  addSuffix: true,
                                  locale: es,
                              })
                            : '—'}
                    </p>
                    {lastPaid ? (
                        <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                            {format(new Date(lastPaid.payment_date), "d MMM yyyy", { locale: es })} ·{' '}
                            {formatMoney(Number(lastPaid.amount))}
                        </p>
                    ) : null}
                </GlassCard>
                <GlassCard className="border-dashed border-border/50 p-4 dark:border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Próx. renovación (estim.)
                    </p>
                    <p className="mt-1 text-sm font-black text-foreground">{nextRenewalLabel}</p>
                    <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                        Desde último pago + periodo en meses
                    </p>
                </GlassCard>
            </div>

            <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10 md:p-8">
                <div className="pointer-events-none absolute top-1/2 left-1/2 -mt-32 -ml-32 h-64 w-64 rounded-full bg-primary/5 blur-3xl dark:bg-primary/10" />
                <div className="relative z-10 mb-6 flex flex-wrap items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                        <CreditCard className="h-4 w-4" /> Línea de tiempo
                    </h3>
                    <Button
                        type="button"
                        className="h-8 bg-primary px-4 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-[0_0_20px_-5px_var(--theme-primary)] hover:bg-primary/90"
                        onClick={() => setAddOpen(true)}
                    >
                        <Plus className="mr-2 h-3 w-3" /> Nuevo pago
                    </Button>
                    <Dialog
                        open={addOpen}
                        onOpenChange={(o) => {
                            setAddOpen(o)
                            if (!o) {
                                setFormError('')
                                resetAddForm()
                            }
                        }}
                    >
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="font-display text-xl font-black tracking-tighter uppercase">
                                    Registrar pago
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={onAddPayment} className="grid gap-4 py-2">
                                {formError ? (
                                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                                        {formError}
                                    </p>
                                ) : null}
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="pay-amount"
                                        className="text-right text-xs font-bold uppercase tracking-widest"
                                    >
                                        Monto
                                    </Label>
                                    <Input
                                        id="pay-amount"
                                        type="number"
                                        min={1}
                                        step={1}
                                        required
                                        className="col-span-3"
                                        placeholder="CLP"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="pay-date"
                                        className="text-right text-xs font-bold uppercase tracking-widest"
                                    >
                                        Fecha
                                    </Label>
                                    <Input
                                        id="pay-date"
                                        type="date"
                                        required
                                        className="col-span-3"
                                        value={paymentDate}
                                        onChange={(e) => setPaymentDate(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="pay-desc"
                                        className="text-right text-xs font-bold uppercase tracking-widest"
                                    >
                                        Concepto
                                    </Label>
                                    <Input
                                        id="pay-desc"
                                        className="col-span-3"
                                        placeholder="Ej. Mensualidad abril"
                                        required
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="pay-period"
                                        className="text-right text-xs font-bold uppercase tracking-widest"
                                    >
                                        Meses
                                    </Label>
                                    <Input
                                        id="pay-period"
                                        type="number"
                                        min={1}
                                        className="col-span-3"
                                        placeholder="Opcional (renovación)"
                                        value={periodMonths}
                                        onChange={(e) => setPeriodMonths(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="text-[10px] font-black uppercase tracking-widest"
                                        disabled={isAdding}
                                        onClick={() => setAddOpen(false)}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isAdding}
                                        className="bg-primary text-[10px] font-black uppercase tracking-widest text-primary-foreground hover:bg-primary/90"
                                    >
                                        {isAdding ? 'Guardando…' : 'Confirmar'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {sorted.length === 0 ? (
                    <p className="relative z-10 py-10 text-center text-sm text-muted-foreground">
                        No hay pagos registrados.
                    </p>
                ) : (
                    <div className="relative z-10 pl-2">
                        <div className="absolute top-3 bottom-3 left-[19px] w-px bg-border/70 dark:bg-white/15" />
                        <ul className="space-y-6">
                            {sorted.map((p) => {
                                const paid = isPaidStatus(p.status)
                                const pending = isPendingStatus(p.status)
                                return (
                                    <li key={p.id} className="relative flex gap-4 pl-10">
                                        <div
                                            className={cn(
                                                'absolute top-2 left-2 z-10 h-3.5 w-3.5 rounded-full border-2 border-background',
                                                paid && 'bg-emerald-500',
                                                pending && 'bg-amber-500',
                                                !paid && !pending && 'bg-muted-foreground/50'
                                            )}
                                        />
                                        <div className="min-w-0 flex-1 rounded-xl border border-border/50 bg-secondary/25 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 space-y-1">
                                                    <p className="text-base font-black tabular-nums text-primary">
                                                        {formatMoney(Number(p.amount))}
                                                    </p>
                                                    <p className="text-sm font-bold text-foreground">
                                                        {p.service_description || 'Sin descripción'}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                        <span className="inline-flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {format(new Date(p.payment_date), "d MMM yyyy", {
                                                                locale: es,
                                                            })}
                                                        </span>
                                                        {p.period_months != null && p.period_months > 0 ? (
                                                            <span>{p.period_months} mes(es)</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end gap-2">
                                                    <span
                                                        className={cn(
                                                            'rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
                                                            paid &&
                                                                'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                                            pending &&
                                                                'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                                            !paid &&
                                                                !pending &&
                                                                'border-border/50 bg-muted/40 text-muted-foreground'
                                                        )}
                                                    >
                                                        {p.status || '—'}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={isDeleting || isAdding}
                                                        className="h-8 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                                                        onClick={() => onDelete(p.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            {p.receipt_image_url ? (
                                                <a
                                                    href={p.receipt_image_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 p-2 text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 dark:border-white/10"
                                                >
                                                    <div className="relative h-12 w-12 overflow-hidden rounded-md">
                                                        <Image
                                                            src={p.receipt_image_url}
                                                            alt=""
                                                            fill
                                                            className="object-cover"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    <Receipt className="h-4 w-4 text-primary" />
                                                    Comprobante
                                                </a>
                                            ) : null}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </GlassCard>
        </div>
    )
}
