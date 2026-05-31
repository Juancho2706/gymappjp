'use client'

import { FormEvent, useState, useTransition } from 'react'
import { CalendarClock, ReceiptText } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { recordEnterpriseClientPaymentAction } from '../_actions/payment.actions'

const PAYMENT_STATUS_OPTIONS = [
    ['paid', 'Pagado'],
    ['pending', 'Pendiente'],
    ['overdue', 'Vencido'],
    ['scholarship', 'Becado'],
    ['paused', 'Pausado'],
] as const

type PaymentRecordSheetProps = {
    orgSlug: string
    clientId: string
    clientName: string
    coachName: string
    hasCoach: boolean
    today: string
    latestPayment?: {
        amount: number
        paymentDate: string
        status: string
        description: string
    }
    nextDueLabel?: string | null
}

export function PaymentRecordSheet({
    orgSlug,
    clientId,
    clientName,
    coachName,
    hasCoach,
    today,
    latestPayment,
    nextDueLabel,
}: PaymentRecordSheetProps) {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        setError(null)
        startTransition(async () => {
            const result = await recordEnterpriseClientPaymentAction(orgSlug, formData)
            if (result?.error) {
                setError(result.error)
                return
            }
            setOpen(false)
        })
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
                className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 text-xs font-black text-sky-200 md:hidden"
            >
                <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                {latestPayment ? 'Editar registro' : 'Registrar pago'}
            </SheetTrigger>
            <SheetContent
                side="bottom"
                className="max-h-[88dvh] overflow-y-auto rounded-t-2xl border-zinc-800 bg-zinc-950 pb-safe pl-safe pr-safe text-zinc-100"
            >
                <SheetHeader className="border-zinc-800 bg-zinc-900/80 p-4">
                    <SheetTitle className="text-base normal-case tracking-normal text-white">
                        Pago alumno
                    </SheetTitle>
                    <SheetDescription className="text-xs leading-5 text-zinc-400">
                        {clientName} · {coachName}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="grid gap-3 p-4">
                    <input type="hidden" name="client_id" value={clientId} />

                    {nextDueLabel && (
                        <div className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs font-bold text-sky-200">
                            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Proximo vencimiento: {nextDueLabel}
                        </div>
                    )}

                    <label className="grid gap-1.5 text-xs font-bold text-zinc-400">
                        Monto
                        <input
                            name="amount"
                            type="number"
                            min="0"
                            step="1000"
                            defaultValue={latestPayment?.amount ?? 0}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                        />
                    </label>

                    <label className="grid gap-1.5 text-xs font-bold text-zinc-400">
                        Fecha de pago
                        <input
                            name="payment_date"
                            type="date"
                            defaultValue={latestPayment?.paymentDate ?? today}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                        />
                    </label>

                    <label className="grid gap-1.5 text-xs font-bold text-zinc-400">
                        Estado
                        <select
                            name="status"
                            defaultValue={latestPayment?.status ?? 'paid'}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                        >
                            {PAYMENT_STATUS_OPTIONS.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="grid gap-1.5 text-xs font-bold text-zinc-400">
                        Nota interna
                        <input
                            name="service_description"
                            defaultValue={latestPayment?.description ?? ''}
                            placeholder="Ej: transferencia confirmada"
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-sky-400"
                        />
                    </label>

                    {!hasCoach && (
                        <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs font-bold leading-5 text-amber-200">
                            Asigna un coach antes de registrar pagos.
                        </p>
                    )}
                    {error && (
                        <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs font-bold leading-5 text-red-200">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!hasCoach || isPending}
                        className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isPending ? 'Guardando...' : 'Guardar pago'}
                    </button>
                </form>
            </SheetContent>
        </Sheet>
    )
}
