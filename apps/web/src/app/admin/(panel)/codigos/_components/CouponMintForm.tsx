'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { MAX_PERCENT_WITHOUT_OVERRIDE } from '@eva/schemas'
import { TIER_CONFIG } from '@eva/tiers'
import { mintCouponAction, type MintActionState } from '../_actions/codigos.actions'

const initial: MintActionState = { ok: false, message: '' }

const inputCls =
    'w-full rounded-md border border-subtle bg-surface-card px-3 py-2 text-sm text-strong focus:outline-none focus:ring-1 focus:ring-[var(--sport-500)]'
const labelCls = 'mb-1 block text-xs font-medium text-body'

export type MintFormCoach = { id: string; full_name: string | null; brand_name: string | null; slug: string }

/** Referencia del preview: el plan más vendido a precio de lista mensual (fuente única @eva/tiers). */
const PREVIEW_TIER = 'pro' as const
const PREVIEW_LIST_CLP = TIER_CONFIG[PREVIEW_TIER].monthlyPriceClp

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

function coachLabel(c: MintFormCoach): string {
    const name = c.brand_name?.trim() || c.full_name?.trim() || c.slug
    return name === c.slug ? c.slug : `${name} (${c.slug})`
}

/**
 * Formulario de alta de cupón (CEO). Native <select>/<input> (NO Base UI Select — renderiza value no
 * label, memoria). Server-priced + validación Zod en el action.
 *
 * El preview de precio es SOLO orientativo (client-side): espeja la regla del motor
 * (`computeDiscountedClp`: Math.round del %, fixed clampeado al monto) sobre el plan Pro mensual. El
 * cobro real siempre lo recalcula el server contra el plan/ciclo del coach.
 */
export function CouponMintForm({
    coaches = [],
    defaultCoachId = '',
}: {
    coaches?: MintFormCoach[]
    /** Prefill desde /admin/coaches/[id] → /admin/codigos?coach=<uuid>. */
    defaultCoachId?: string
}) {
    const [state, formAction, pending] = useActionState(mintCouponAction, initial)
    const formRef = useRef<HTMLFormElement>(null)
    const handledState = useRef<MintActionState | null>(null)

    const prefill = coaches.some((c) => c.id === defaultCoachId) ? defaultCoachId : ''
    const [discountType, setDiscountType] = useState<'percent' | 'fixed_clp'>('percent')
    const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('repeating')
    const [percentValue, setPercentValue] = useState<number>(20)
    const [amountOffClp, setAmountOffClp] = useState<number>(0)
    const [restrictedToCoachId, setRestrictedToCoachId] = useState<string>(prefill)
    const [mintedCode, setMintedCode] = useState<string | null>(null)

    // R3.8: arriba de 21% el CEO debe tildar el check de descuento alto (lo enforce el schema Zod).
    const needsOverride = discountType === 'percent' && percentValue > MAX_PERCENT_WITHOUT_OVERRIDE

    // Preview vivo: MISMA regla de redondeo que el motor de cobro.
    const previewOff =
        discountType === 'percent'
            ? Math.round((PREVIEW_LIST_CLP * Math.min(100, Math.max(0, Number.isFinite(percentValue) ? percentValue : 0))) / 100)
            : Math.min(Math.max(0, Math.round(Number.isFinite(amountOffClp) ? amountOffClp : 0)), PREVIEW_LIST_CLP)
    const previewNet = Math.max(PREVIEW_LIST_CLP - previewOff, 0)

    // Éxito → limpiar el formulario (antes quedaba cargado y se duplicaba un código sin querer).
    useEffect(() => {
        if (state === handledState.current) return
        handledState.current = state
        if (!state.message) return
        if (!state.ok) {
            toast.error(state.message)
            return
        }
        toast.success(state.message)
        setMintedCode(state.codeDisplay ?? null)
        formRef.current?.reset()
        setDiscountType('percent')
        setDuration('repeating')
        setPercentValue(20)
        setAmountOffClp(0)
        setRestrictedToCoachId('')
    }, [state])

    async function copyCode() {
        if (!mintedCode) return
        try {
            await navigator.clipboard.writeText(mintedCode)
            toast.success('Código copiado.')
        } catch {
            toast.error('No se pudo copiar. Selecciona el código a mano.')
        }
    }

    return (
        <form ref={formRef} action={formAction} className="rounded-lg border border-subtle bg-surface-sunken p-4">
            <h2 className="mb-3 text-sm font-semibold text-strong">Crear código</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                    <label className={labelCls}>Tipo de descuento</label>
                    <select
                        name="discountType"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed_clp')}
                        className={inputCls}
                    >
                        <option value="percent">Porcentaje (%)</option>
                        <option value="fixed_clp">Monto fijo (CLP)</option>
                    </select>
                </div>

                {discountType === 'percent' ? (
                    <div>
                        <label className={labelCls}>Porcentaje (1–100)</label>
                        <input
                            name="percentValue"
                            type="number"
                            min={1}
                            max={100}
                            value={percentValue}
                            onChange={(e) => setPercentValue(Number(e.target.value))}
                            className={inputCls}
                            placeholder="20"
                        />
                    </div>
                ) : (
                    <div>
                        <label className={labelCls}>Monto off (CLP)</label>
                        <input
                            name="amountOffClp"
                            type="number"
                            min={0}
                            value={amountOffClp}
                            onChange={(e) => setAmountOffClp(Number(e.target.value))}
                            className={inputCls}
                            placeholder="5000"
                        />
                    </div>
                )}

                <div>
                    <label className={labelCls}>Aplica sobre</label>
                    <select name="fixedClpTarget" defaultValue="total" className={inputCls}>
                        <option value="total">Toda la cuenta (base + módulos)</option>
                        <option value="base">Solo el plan base</option>
                        <option value="module" disabled>
                            Un módulo (próximamente)
                        </option>
                    </select>
                </div>

                <div>
                    <label className={labelCls}>Duración</label>
                    <select
                        name="duration"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value as 'once' | 'repeating' | 'forever')}
                        className={inputCls}
                    >
                        <option value="once">1 ciclo</option>
                        <option value="repeating">N ciclos (ej. 1 o 2 meses)</option>
                        <option value="forever">De por vida (casos especiales)</option>
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                        De por vida: solo para casos especiales que eliges a mano (aplica al plan y a los
                        módulos add-on, para siempre). Para promociones usa 1 o N ciclos — el descuento corre
                        esos cobros y luego vuelve al precio normal.
                    </p>
                </div>

                {duration === 'repeating' && (
                    <div>
                        <label className={labelCls}>Ciclos</label>
                        <input name="durationInCycles" type="number" min={1} className={inputCls} placeholder="3" />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Cantidad de cobros con descuento (ej. 1 o 2 para 1–2 meses). Luego vuelve al precio normal.
                        </p>
                    </div>
                )}

                <div>
                    <label className={labelCls}>Código (vanity, opcional)</label>
                    <input name="codeDisplay" className={inputCls} placeholder="PARTNER20 (vacío = autogenerado)" />
                </div>

                <div>
                    <label className={labelCls}>Máx. canjes (opcional)</label>
                    <input name="maxRedemptions" type="number" min={0} className={inputCls} placeholder="sin límite" />
                </div>

                <div>
                    <label className={labelCls}>Límite por cuenta</label>
                    <input name="perAccountLimit" type="number" min={1} defaultValue={1} className={inputCls} />
                </div>

                <div>
                    <label className={labelCls}>Expira el (opcional)</label>
                    <input name="redeemBy" type="date" className={inputCls} />
                    <p className="mt-1 text-xs text-muted-foreground">
                        Último día para canjear (vence al final de ese día, hora de Chile). Los canjes ya hechos
                        siguen corriendo su término.
                    </p>
                </div>

                <div>
                    <label className={labelCls}>Solo para un coach (opcional)</label>
                    <select
                        name="restrictedToCoachId"
                        value={restrictedToCoachId}
                        onChange={(e) => setRestrictedToCoachId(e.target.value)}
                        className={inputCls}
                    >
                        <option value="">Cualquier coach</option>
                        {coaches.map((c) => (
                            <option key={c.id} value={c.id}>
                                {coachLabel(c)}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {prefill
                            ? 'Prellenado desde la ficha del coach. Si otro coach lo intenta, el canje se rechaza.'
                            : 'Código de partner: si otro coach lo intenta, el canje se rechaza.'}
                    </p>
                </div>

                <div>
                    <label className={labelCls}>Piso de margen (CLP, opcional)</label>
                    <input name="floorClp" type="number" min={0} className={inputCls} placeholder="el neto nunca baja de acá" />
                </div>

                <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-xs text-body">
                        <input name="firstTimeOnly" type="checkbox" /> Solo primera vez
                    </label>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* Pricing v2 (C2): starter fuera de venta — la emisión nueva solo ofrece pro/elite
                        (espejo de COUPON_TIERS en @eva/schemas; el server rechaza starter igual). */}
                    {(['pro', 'elite'] as const).map((t) => (
                        <label key={t} className="flex items-center gap-1 text-xs text-body">
                            <input name="scopeTiers" type="checkbox" value={t} /> {t}
                        </label>
                    ))}
                    <span className="text-[10px] text-muted">(planes; vacío = todos)</span>
                </div>
            </div>

            {/* Preview de precio: lo que este descuento significa en plata, antes de crear el código. */}
            <div className="mt-3 rounded-md border border-subtle bg-surface-card px-3 py-2">
                <p className="text-xs text-body">
                    Un coach <strong className="text-strong">{TIER_CONFIG[PREVIEW_TIER].label} mensual</strong> pagaría{' '}
                    <strong className="text-[var(--sport-500)]">{clp(previewNet)}</strong>{' '}
                    <span className="text-muted">
                        (lista {clp(PREVIEW_LIST_CLP)} · descuento {clp(previewOff)})
                    </span>
                </p>
                {previewNet === 0 && (
                    <p className="mt-1 text-xs text-[var(--warning-500)]">
                        Un neto de $0 no es cobrable: eso va por cortesía (admin_grant), no por código.
                    </p>
                )}
                <p className="mt-1 text-[10px] text-muted">
                    Referencia orientativa. El cobro real se recalcula server-side contra el plan y ciclo del coach.
                </p>
            </div>

            {/* R1.0: allowlist de correos — el código solo lo canjean estos correos (lista cerrada). */}
            <div className="mt-3">
                <label className={labelCls}>Correos permitidos (uno por línea; vacío = abierto a cualquiera)</label>
                <textarea
                    name="allowed_emails"
                    rows={3}
                    className={`${inputCls} font-mono`}
                    placeholder={'coach1@gmail.com\ncoach2@outlook.com'}
                />
            </div>

            {/* R3.8: override del CEO para descuentos > 21%. */}
            {needsOverride && (
                <label className="mt-3 flex items-center gap-2 rounded-md border border-[var(--warning-500)]/30 bg-[var(--warning-500)]/15 px-3 py-2 text-xs text-[var(--warning-500)]">
                    <input name="high_discount_override" type="checkbox" />
                    Confirmo que el descuento de <strong>{percentValue}%</strong> (mayor a {MAX_PERCENT_WITHOUT_OVERRIDE}%) es intencional.
                </label>
            )}

            <div className="mt-4 flex items-center gap-3">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-[var(--cta-fill)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    {pending ? 'Creando…' : 'Crear código'}
                </button>
                {state.message && !state.ok && (
                    <span className="text-xs text-[var(--danger-500)]">{state.message}</span>
                )}
            </div>

            {mintedCode && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[var(--success-500)]/30 bg-[var(--success-500)]/10 px-3 py-2">
                    <span className="text-xs text-body">Código creado:</span>
                    <span className="font-mono text-sm font-semibold text-strong">{mintedCode}</span>
                    <button
                        type="button"
                        onClick={copyCode}
                        className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-2 py-1 text-xs text-body transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                    </button>
                </div>
            )}
        </form>
    )
}
