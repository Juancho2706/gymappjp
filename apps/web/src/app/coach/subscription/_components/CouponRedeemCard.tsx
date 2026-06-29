'use client'

import { useEffect, useRef, useState } from 'react'
import { Ticket } from 'lucide-react'

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
 * Tarjeta de canje de código (coach). Flujo SERNAC: Aplicar → PREVIEW server-priced → disclosure
 * bloqueante (texto + precio del SERVER) → Confirmar (commit). Self-contained: lee subscription-status
 * para el gate (plan pago activo) + el cupón vigente. UI funcional; el pulido (focus-trap, motion) es posterior.
 */
export function CouponRedeemCard() {
    const [enabled, setEnabled] = useState(false)
    const [activeCode, setActiveCode] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [phase, setPhase] = useState<'idle' | 'checking' | 'preview' | 'applying' | 'done'>('idle')
    const [preview, setPreview] = useState<Preview | null>(null)
    const [error, setError] = useState('')
    const dialogRef = useRef<HTMLDivElement>(null)

    // Focus-trap del disclosure (SERNAC: el consentimiento no debe poder escaparse con Tab). Al entrar
    // en 'preview' enfoca el botón confirmar; Tab/Shift+Tab ciclan dentro del diálogo; Escape cancela.
    useEffect(() => {
        if (phase !== 'preview') return
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
        focusables[0]?.focus()
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

    async function loadStatus() {
        try {
            const res = await fetch('/api/payments/subscription-status')
            if (!res.ok) return
            const data = await res.json()
            const tier = data?.coach?.subscription_tier
            const status = data?.coach?.subscription_status
            setEnabled(tier && tier !== 'free' && (status === 'active' || status === 'trialing'))
            setActiveCode(data?.activeCoupon?.code ?? null)
        } catch {
            /* tolerante a fallos */
        }
    }
    useEffect(() => {
        void loadStatus()
    }, [])

    async function post(commit: boolean) {
        const res = await fetch('/api/payments/redeem-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim(), commit }),
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

    if (!enabled && !activeCode) return null

    return (
        <div className="rounded-card border border-subtle bg-surface-card p-4">
            <div className="mb-2 flex items-center gap-2 font-display text-sm font-bold tracking-tight text-strong">
                <Ticket className="h-4 w-4 text-emerald-500" /> Código de descuento
            </div>

            {activeCode ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Código <span className="font-mono font-semibold">{activeCode}</span> aplicado a tu suscripción.
                </p>
            ) : (phase === 'preview' || phase === 'applying') && preview ? (
                <div ref={dialogRef} onKeyDown={onDialogKeyDown} role="dialog" aria-modal="true" aria-label="Confirmar código de descuento" className="space-y-3">
                    <p className="text-sm text-body">{preview.termsText}</p>
                    <div className="rounded-control bg-surface-sunken p-3 text-sm">
                        <div className="flex justify-between text-muted">
                            <span>Precio normal</span>
                            <span className="line-through">{clp(preview.baseBeforeDiscountClp)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                            <span>Descuento ({preview.durationLabel})</span>
                            <span>−{clp(preview.discountClp)}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-subtle pt-1 font-semibold text-strong">
                            <span>Pagas</span>
                            <span>{clp(preview.totalClp)}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onConfirmar}
                            disabled={phase === 'applying'}
                            className="flex-1 rounded-control bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 min-h-[44px]"
                        >
                            {phase === 'applying' ? 'Aplicando…' : 'Confirmar y aplicar'}
                        </button>
                        <button
                            onClick={() => {
                                setPhase('idle')
                                setPreview(null)
                            }}
                            className="rounded-control border border-default px-4 py-2.5 text-sm text-muted min-h-[44px]"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : phase === 'done' ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">¡Código aplicado! Se reflejará en tu próximo cobro.</p>
            ) : (
                <div className="flex gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Ingresa tu código"
                        className="h-11 min-h-[44px] flex-1 rounded-control border border-default bg-surface-card px-3 text-sm text-strong placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    />
                    <button
                        onClick={onAplicar}
                        disabled={!code.trim() || phase === 'checking'}
                        className="rounded-control bg-surface-sunken px-4 text-sm font-semibold text-strong disabled:opacity-40 min-h-[44px]"
                    >
                        {phase === 'checking' ? '…' : 'Aplicar'}
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
    )
}
