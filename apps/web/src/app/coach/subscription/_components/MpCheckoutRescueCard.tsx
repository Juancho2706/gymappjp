import Image from 'next/image'
import { ArrowRight, Check, CreditCard, RefreshCw, X } from 'lucide-react'

/**
 * «¿No pudiste terminar en Mercado Pago?» — aparece cuando el coach free volvió de MP sin pagar
 * (marca de `_lib/mp-checkout-rescue.ts`). Le ofrece Webpay con el MISMO plan ya elegido y deja
 * reintentar MP. Presentacional: el padre resuelve plan, monto y acciones.
 */
export function MpCheckoutRescueCard({
    planLabel,
    amountClp,
    priceSuffix,
    busy,
    onPayWithFlow,
    onRetryMp,
    onDismiss,
}: {
    /** «Pro · Mensual». */
    planLabel: string
    amountClp: number
    priceSuffix: string
    busy: boolean
    onPayWithFlow: () => void
    onRetryMp: () => void
    onDismiss: () => void
}) {
    return (
        <section
            aria-labelledby="mp-rescue-title"
            className="relative mb-3.5 flex flex-col gap-3.5 rounded-card border-[1.5px] border-sport-500/35 bg-surface-card p-[18px] shadow-[0_18px_38px_-20px_color-mix(in_srgb,var(--sport-500)_60%,transparent)]"
        >
            <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={onDismiss}
                className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-control text-subtle transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
                <X className="h-[18px] w-[18px]" />
            </button>

            <div className="flex items-start gap-3.5 pr-7">
                <span aria-hidden="true" className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-sport-100 text-sport-600">
                    <CreditCard className="h-7 w-7" strokeWidth={1.8} />
                    <span className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--surface-card)] bg-emerald-500 text-white">
                        <RefreshCw className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                    <h2 id="mp-rescue-title" className="font-display text-lg font-extrabold leading-tight tracking-tight text-strong">
                        ¿No pudiste terminar en Mercado Pago?
                    </h2>
                    <p className="text-[13.5px] leading-snug text-muted">
                        A varios coaches les pasa con tarjetas de débito o prepago. Con Webpay pagas con Redcompra,
                        débito, crédito o prepago.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 rounded-xl bg-surface-sunken px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-strong">
                    <Check className="h-[15px] w-[15px] shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span className="truncate">{planLabel} sigue elegido</span>
                </span>
                <span className="shrink-0">
                    <span className="eva-metric text-base text-strong">${amountClp.toLocaleString('es-CL')}</span>
                    <span className="text-[11px] text-muted"> {priceSuffix}</span>
                </span>
            </div>

            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={onPayWithFlow}
                    disabled={busy}
                    className="flex h-14 w-full items-center gap-3 rounded-control bg-sport-500 pl-2 pr-4 text-white shadow-[0_12px_24px_-10px_color-mix(in_srgb,var(--sport-500)_70%,transparent)] transition-colors hover:bg-sport-600 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    <span className="flex h-10 w-20 shrink-0 items-center justify-center rounded-[10px] bg-white">
                        <Image src="/payments/webpay-light.svg" alt="" width={64} height={16} className="h-4 w-auto" />
                    </span>
                    <span className="flex-1 text-left text-[15.5px] font-extrabold tracking-tight">
                        {busy ? 'Procesando...' : 'Pagar con Webpay'}
                    </span>
                    <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={onRetryMp}
                    disabled={busy}
                    className="h-11 w-full rounded-control text-[13.5px] font-bold text-sport-600 transition-colors hover:text-sport-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    Reintentar con Mercado Pago
                </button>
            </div>
        </section>
    )
}
