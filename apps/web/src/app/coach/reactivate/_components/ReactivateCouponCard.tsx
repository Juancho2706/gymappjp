'use client'

import { useEffect, useRef, useState } from 'react'
import { Ticket } from 'lucide-react'
import type { BillingCycle, SaleTier } from '@/lib/constants'

type Preview = {
    baseBeforeDiscountClp: number
    discountClp: number
    totalClp: number
    couponCode: string
    durationLabel: string
    termsText: string
}

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

/**
 * Canje de código en la pantalla de REACTIVACIÓN. Mismo flujo SERNAC que CouponRedeemCard
 * (Aplicar → PREVIEW server-priced → disclosure bloqueante → Confirmar) pero contra
 * `/api/payments/redeem-coupon-signup`, enviando el tier/ciclo ELEGIDOS (`previewTier`/`previewCycle`)
 * para que el precio mostrado = el que cobrará create-preference (un coach reactivando sigue en
 * tier='free' en DB hasta pagar). La redención queda apuntada en coaches.active_coupon_redemption_id
 * (vía trigger) y el botón "Continuar al pago" la threadea sola en el monto del checkout.
 *
 * Solo se muestra con un tier PAGO seleccionado y el flag de cupones ON. Si el coach cambia de
 * tier/ciclo, el preview pre-commit se invalida (la disclosure debe reflejar el plan a cobrar).
 */
export function ReactivateCouponCard({
    tier,
    billingCycle,
    couponsEnabled,
}: {
    tier: SaleTier
    billingCycle: BillingCycle
    couponsEnabled: boolean
}) {
    const [activeCode, setActiveCode] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [phase, setPhase] = useState<'idle' | 'checking' | 'preview' | 'applying' | 'done'>('idle')
    const [preview, setPreview] = useState<Preview | null>(null)
    const [error, setError] = useState('')
    const dialogRef = useRef<HTMLDivElement>(null)

    // Cambio de tier/ciclo → el preview pre-commit deja de coincidir con el plan a cobrar: se invalida
    // y el coach debe re-aplicar. Una redención YA confirmada (activeCode) es %-based y vale para
    // cualquier plan (create-preference recalcula el 50% sobre el plan final), así que se conserva.
    useEffect(() => {
        setPhase((p) => (p === 'preview' || p === 'checking' ? 'idle' : p))
        setPreview((pv) => (pv ? null : pv))
    }, [tier, billingCycle])

    // Focus-trap del disclosure (SERNAC: el consentimiento no debe escaparse con Tab).
    useEffect(() => {
        if (phase !== 'preview') return
        dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    }, [phase])

    function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (e.key === 'Escape') {
            setPhase('idle')
            setPreview(null)
            return
        }
        if (e.key !== 'Tab') return
        const root = dialogRef.current
        if (!root) return
        const f = Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'))
        if (f.length === 0) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
        }
    }

    async function post(commit: boolean) {
        const res = await fetch('/api/payments/redeem-coupon-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim(), commit, previewTier: tier, previewCycle: billingCycle }),
        })
        const data = await res.json().catch(() => ({}))
        return { res, data }
    }

    async function onAplicar() {
        if (!code.trim()) return
        setError('')
        setPhase('checking')
        const { res, data } = await post(false)
        if (!res.ok) {
            setError(data?.error ?? 'No se pudo validar el código.')
            setPhase('idle')
            return
        }
        setPreview(data.preview)
        setPhase('preview')
    }

    async function onConfirmar() {
        setError('')
        setPhase('applying')
        const { res, data } = await post(true)
        if (!res.ok) {
            setError(data?.error ?? 'No se pudo aplicar el código.')
            setPhase('idle')
            return
        }
        setPhase('done')
        setActiveCode(data?.preview?.couponCode ?? code.trim())
    }

    if (!couponsEnabled || tier === 'free') return null

    return (
        <section className="mt-6 rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Ticket className="h-4 w-4 text-emerald-500" /> ¿Tienes un código de descuento?
            </div>

            {activeCode ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Código <span className="font-mono font-semibold">{activeCode}</span> aplicado. El descuento se
                    reflejará en el monto al continuar al pago.
                </p>
            ) : (phase === 'preview' || phase === 'applying') && preview ? (
                <div
                    ref={dialogRef}
                    onKeyDown={onDialogKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Confirmar código de descuento"
                    className="space-y-3"
                >
                    <p className="text-sm text-foreground/90">{preview.termsText}</p>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                            <span>Precio normal</span>
                            <span className="line-through">{clp(preview.baseBeforeDiscountClp)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                            <span>Descuento ({preview.durationLabel})</span>
                            <span>−{clp(preview.discountClp)}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                            <span>Pagas</span>
                            <span>{clp(preview.totalClp)}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onConfirmar}
                            disabled={phase === 'applying'}
                            className="min-h-[44px] flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {phase === 'applying' ? 'Aplicando…' : 'Confirmar y aplicar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setPhase('idle')
                                setPreview(null)
                            }}
                            className="min-h-[44px] rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : phase === 'done' ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    ¡Código aplicado! El descuento se reflejará en el monto al continuar al pago.
                </p>
            ) : (
                <div className="flex gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Ingresa tu código"
                        className="h-11 min-h-[44px] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <button
                        type="button"
                        onClick={onAplicar}
                        disabled={!code.trim() || phase === 'checking'}
                        className="min-h-[44px] rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground disabled:opacity-40"
                    >
                        {phase === 'checking' ? '…' : 'Aplicar'}
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </section>
    )
}
