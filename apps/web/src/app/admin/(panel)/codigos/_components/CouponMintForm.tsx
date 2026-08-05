'use client'

import { useActionState, useState } from 'react'
import { MAX_PERCENT_WITHOUT_OVERRIDE } from '@eva/schemas'
import { mintCouponAction, type MintActionState } from '../_actions/codigos.actions'

const initial: MintActionState = { ok: false, message: '' }

const inputCls =
    'w-full rounded-md border border-subtle bg-surface-card px-3 py-2 text-sm text-strong focus:outline-none focus:ring-1 focus:ring-[var(--sport-500)]'
const labelCls = 'mb-1 block text-xs font-medium text-body'

/**
 * Formulario de alta de cupón (CEO). Native <select>/<input> (NO Base UI Select — renderiza value no
 * label, memoria). Server-priced + validación Zod en el action. UI funcional; el pulido es posterior.
 */
export function CouponMintForm() {
    const [state, formAction, pending] = useActionState(mintCouponAction, initial)
    const [discountType, setDiscountType] = useState<'percent' | 'fixed_clp'>('percent')
    const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('repeating')
    const [percentValue, setPercentValue] = useState<number>(20)
    // R3.8: arriba de 21% el CEO debe tildar el check de descuento alto (lo enforce el schema Zod).
    const needsOverride = discountType === 'percent' && percentValue > MAX_PERCENT_WITHOUT_OVERRIDE

    return (
        <form
            action={formAction}
            className="rounded-lg border border-subtle bg-surface-sunken p-4"
        >
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
                        <input name="amountOffClp" type="number" min={0} className={inputCls} placeholder="5000" />
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
                    <label className={labelCls}>Piso de margen (CLP, opcional)</label>
                    <input name="floorClp" type="number" min={0} className={inputCls} placeholder="el neto nunca baja de acá" />
                </div>

                <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-xs text-body">
                        <input name="firstTimeOnly" type="checkbox" /> Solo primera vez
                    </label>
                </div>

                <div className="flex flex-wrap gap-2">
                    {(['starter', 'pro', 'elite'] as const).map((t) => (
                        <label key={t} className="flex items-center gap-1 text-xs text-body">
                            <input name="scopeTiers" type="checkbox" value={t} /> {t}
                        </label>
                    ))}
                    <span className="text-[10px] text-muted">(planes; vacío = todos)</span>
                </div>
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
                    className="rounded-md bg-[var(--cta-fill)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {pending ? 'Creando…' : 'Crear código'}
                </button>
                {state.message && (
                    <span className={`text-xs ${state.ok ? 'text-[var(--success-500)]' : 'text-[var(--danger-500)]'}`}>{state.message}</span>
                )}
            </div>
        </form>
    )
}
