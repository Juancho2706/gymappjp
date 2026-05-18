'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { addPayment } from '@/app/coach/clients/[clientId]/actions'
import type { ClientListItem } from '../../_data/types'

interface Props {
    open: boolean
    onOpenChange: (v: boolean) => void
    clients: ClientListItem[]
}

export function QuickAddPaymentModal({ open, onOpenChange, clients }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [clientId, setClientId] = useState('')
    const [amount, setAmount] = useState('')
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
    const [description, setDescription] = useState('')
    const [periodMonths, setPeriodMonths] = useState('')
    const [error, setError] = useState('')

    function reset() {
        setClientId('')
        setAmount('')
        setPaymentDate(new Date().toISOString().split('T')[0])
        setDescription('')
        setPeriodMonths('')
        setError('')
    }

    function handleClose() {
        reset()
        onOpenChange(false)
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')

        if (!clientId) { setError('Selecciona un alumno.'); return }
        const amt = Math.round(Number(String(amount).replace(/\s/g, '')))
        if (!Number.isFinite(amt) || amt <= 0) { setError('Indica un monto válido.'); return }
        if (!paymentDate) { setError('Indica la fecha del pago.'); return }
        const desc = description.trim()
        if (!desc) { setError('Indica un concepto (ej. mensualidad).'); return }
        const pm = periodMonths.trim() ? Number(periodMonths) : undefined
        if (periodMonths.trim() !== '' && (!Number.isFinite(pm) || (pm ?? 0) < 1)) {
            setError('Período en meses debe ser ≥ 1 o vacío.')
            return
        }

        startTransition(async () => {
            try {
                await addPayment({ client_id: clientId, amount: amt, payment_date: paymentDate, service_description: desc, period_months: pm, status: 'paid' })
                handleClose()
                router.refresh()
            } catch {
                setError('No se pudo registrar el pago. Intenta de nuevo.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true) }}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl font-black uppercase tracking-tighter">
                        Registrar pago
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-2 text-foreground">
                    {error && (
                        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                            {error}
                        </p>
                    )}

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="qp-client" className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Alumno
                        </Label>
                        <select
                            id="qp-client"
                            required
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            className="col-span-3 h-10 min-h-10 w-full rounded-full border border-input bg-muted/50 px-4 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 dark:bg-background/80"
                        >
                            <option value="">Seleccionar alumno…</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="qp-amount" className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Monto
                        </Label>
                        <Input
                            id="qp-amount"
                            type="number"
                            min={1}
                            step={1}
                            required
                            placeholder="CLP"
                            className="col-span-3 rounded-full bg-muted/50 dark:bg-background/80"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="qp-date" className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Fecha
                        </Label>
                        <Input
                            id="qp-date"
                            type="date"
                            required
                            className="col-span-3 rounded-full bg-muted/50 dark:bg-background/80"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="qp-desc" className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Concepto
                        </Label>
                        <Input
                            id="qp-desc"
                            required
                            placeholder="Ej. Mensualidad abril"
                            className="col-span-3 rounded-full bg-muted/50 dark:bg-background/80"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="qp-period" className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Meses
                        </Label>
                        <Input
                            id="qp-period"
                            type="number"
                            min={1}
                            placeholder="Opcional"
                            className="col-span-3 rounded-full bg-muted/50 dark:bg-background/80"
                            value={periodMonths}
                            onChange={(e) => setPeriodMonths(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={handleClose}
                            className="rounded-full border-border bg-secondary/80 text-[10px] font-black uppercase tracking-widest hover:bg-secondary dark:bg-transparent"
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending} className="rounded-full text-[10px] font-black uppercase tracking-widest">
                            {isPending ? 'Guardando…' : 'Confirmar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
