'use client'

import { useEffect, useState } from 'react'
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
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Ticket className="h-4 w-4 text-emerald-400" /> Código de descuento
            </div>

            {activeCode ? (
                <p className="text-sm text-emerald-400">
                    Código <span className="font-mono font-semibold">{activeCode}</span> aplicado a tu suscripción.
                </p>
            ) : (phase === 'preview' || phase === 'applying') && preview ? (
                <div role="dialog" aria-modal="true" className="space-y-3">
                    <p className="text-sm text-white/90">{preview.termsText}</p>
                    <div className="rounded-lg bg-white/5 p-3 text-sm">
                        <div className="flex justify-between text-white/60">
                            <span>Precio normal</span>
                            <span className="line-through">{clp(preview.baseBeforeDiscountClp)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                            <span>Descuento ({preview.durationLabel})</span>
                            <span>−{clp(preview.discountClp)}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold text-white">
                            <span>Pagas</span>
                            <span>{clp(preview.totalClp)}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onConfirmar}
                            disabled={phase === 'applying'}
                            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                        >
                            {phase === 'applying' ? 'Aplicando…' : 'Confirmar y aplicar'}
                        </button>
                        <button
                            onClick={() => {
                                setPhase('idle')
                                setPreview(null)
                            }}
                            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 min-h-[44px]"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : phase === 'done' ? (
                <p className="text-sm text-emerald-400">¡Código aplicado! Se reflejará en tu próximo cobro.</p>
            ) : (
                <div className="flex gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Ingresa tu código"
                        className="h-11 min-h-[44px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <button
                        onClick={onAplicar}
                        disabled={!code.trim() || phase === 'checking'}
                        className="rounded-lg bg-white/10 px-4 text-sm font-medium text-white disabled:opacity-40 min-h-[44px]"
                    >
                        {phase === 'checking' ? '…' : 'Aplicar'}
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
    )
}
