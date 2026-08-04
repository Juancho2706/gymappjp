'use client'

import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Ticket } from 'lucide-react'
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
 * Tarjeta de canje de código (coach). Flujo SERNAC: Aplicar → PREVIEW server-priced → disclosure
 * bloqueante (texto + precio del SERVER) → Confirmar (commit). Self-contained: lee subscription-status
 * para el gate (plan pago activo O free activo) + el cupón vigente.
 *
 * Coach FREE ACTIVO: también puede canjear ANTES de suscribirse, pero el precio del preview depende del
 * plan que esté eligiendo más abajo en la pantalla → recibe `selectedTier`/`selectedCycle` del padre y los
 * manda como `previewTier`/`previewCycle`. Sin plan elegido no se dispara el POST (el server responde
 * 422 PLAN_REQUIRED igual). Para un coach PAGO el body NO cambia: sigue siendo `{ code, commit }`.
 */
export function CouponRedeemCard({
    selectedTier,
    selectedCycle,
    onRedeemed,
}: {
    /** Plan elegido en el selector de la página — solo se usa (y se envía) cuando el coach es free. */
    selectedTier?: SaleTier
    selectedCycle?: BillingCycle
    /** Se dispara tras un commit exitoso de un coach FREE, para que el padre recargue el precio con descuento. */
    onRedeemed?: () => void
}) {
    const [enabled, setEnabled] = useState(false)
    // Coach en plan gratuito con cuenta activa: canje pre-checkout (precia sobre el plan elegido).
    const [isFreePlan, setIsFreePlan] = useState(false)
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
            const paidActive = tier && tier !== 'free' && (status === 'active' || status === 'trialing')
            // Free ACTIVO = puede canjear pre-checkout (el server acepta esa combinación exacta).
            const freeActive = tier === 'free' && status === 'active'
            setEnabled(Boolean(paidActive || freeActive))
            setIsFreePlan(Boolean(freeActive))
            setActiveCode(data?.activeCoupon?.code ?? null)
        } catch {
            /* tolerante a fallos */
        }
    }
    useEffect(() => {
        void loadStatus()
    }, [])

    // Coach free: si cambia el plan/ciclo elegido, el preview pre-commit deja de coincidir con lo
    // que se cobrará → se invalida y hay que re-aplicar (la disclosure SERNAC debe mostrar el plan real).
    // Una redención YA confirmada (activeCode) se conserva: el server la re-precia en el checkout.
    useEffect(() => {
        if (!isFreePlan) return
        setPhase((p) => (p === 'preview' || p === 'checking' ? 'idle' : p))
        setPreview((pv) => (pv ? null : pv))
    }, [isFreePlan, selectedTier, selectedCycle])

    // Sin plan elegido un coach free no tiene sobre qué preciar el código (422 PLAN_REQUIRED del server).
    const needsPlan = isFreePlan && !selectedTier

    async function post(commit: boolean) {
        const res = await fetch('/api/payments/redeem-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // previewTier/previewCycle SOLO para el coach free: el server los ignora en el path pago, pero
            // no los mandamos para dejar el body del coach pago idéntico al histórico.
            body: JSON.stringify(
                isFreePlan && selectedTier
                    ? { code: code.trim(), commit, previewTier: selectedTier, previewCycle: selectedCycle }
                    : { code: code.trim(), commit }
            ),
        })
        const data = await res.json().catch(() => ({}))
        return { res, data }
    }

    async function onAplicar() {
        if (!code.trim() || needsPlan) return
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
        // Free: el precio con descuento del selector de planes vive en el padre (activeCoupon de
        // subscription-status) → hay que recargarlo para que el CTA "Continuar" muestre el neto.
        if (isFreePlan) onRedeemed?.()
    }

    if (!enabled && !activeCode) return null

    return (
        <div className="rounded-card border border-subtle bg-surface-card p-4">
            <div className="mb-2 flex items-center gap-2 font-display text-sm font-bold tracking-tight text-strong">
                <Ticket className="h-4 w-4 text-sport-500" /> Código de descuento
            </div>

            {activeCode ? (
                <div className="flex items-center gap-2.5 rounded-control bg-[var(--success-100)] px-3 py-2.5">
                    <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-[var(--success-700)]" />
                    <p className="text-[13.5px] font-bold text-strong">
                        Código <span className="font-mono">{activeCode}</span> aplicado a tu suscripción.
                    </p>
                </div>
            ) : (phase === 'preview' || phase === 'applying') && preview ? (
                <div ref={dialogRef} onKeyDown={onDialogKeyDown} role="dialog" aria-modal="true" aria-label="Confirmar código de descuento" className="space-y-3">
                    <p className="text-sm text-body">{preview.termsText}</p>
                    <div className="rounded-control bg-surface-sunken p-3 text-sm">
                        <div className="flex justify-between text-muted">
                            <span>Precio normal</span>
                            <span className="line-through">{clp(preview.baseBeforeDiscountClp)}</span>
                        </div>
                        <div className="flex justify-between text-[var(--success-600)]">
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
                            className="flex-1 rounded-control bg-sport-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sport-600 disabled:opacity-50 min-h-[44px]"
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
                <div className="flex items-center gap-2.5 rounded-control bg-[var(--success-100)] px-3 py-2.5">
                    <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-[var(--success-700)]" />
                    <p className="text-[13.5px] font-bold text-strong">
                        {isFreePlan
                            ? '¡Código aplicado! Se descontará cuando actives tu plan.'
                            : '¡Código aplicado! Se reflejará en tu próximo cobro.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex gap-2">
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Ingresa tu código"
                            className="h-11 min-h-[44px] flex-1 rounded-control border border-default bg-surface-card px-3 text-sm text-strong placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                        />
                        <button
                            onClick={onAplicar}
                            disabled={!code.trim() || phase === 'checking' || needsPlan}
                            title={needsPlan ? 'Elige un plan más abajo para aplicar tu código.' : undefined}
                            className="rounded-control bg-surface-sunken px-4 text-sm font-semibold text-strong disabled:opacity-40 min-h-[44px]"
                        >
                            {phase === 'checking' ? '…' : 'Aplicar'}
                        </button>
                    </div>
                    {needsPlan && (
                        <p className="mt-2 text-xs text-muted">Elige un plan más abajo para aplicar tu código.</p>
                    )}
                </>
            )}

            {error && <p className="mt-2 text-xs text-[var(--danger-600)]">{error}</p>}
        </div>
    )
}
