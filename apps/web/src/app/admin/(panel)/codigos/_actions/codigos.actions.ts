'use server'

import { revalidatePath } from 'next/cache'
import { CreateCouponAdminSchema } from '@eva/schemas'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { mintCoupon } from '@/services/billing/coupons.service'

// Solo async functions exportadas ('use server'). Tipos/consts viven en @eva/schemas y el service.

export type MintActionState = { ok: boolean; message: string; code?: string }

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
}
function strOrUndef(v: FormDataEntryValue | null): string | undefined {
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length > 0 ? s : undefined
}

export async function mintCouponAction(_prev: MintActionState, formData: FormData): Promise<MintActionState> {
    const { user, adminClient } = await assertAdmin()

    const scopeTiers = formData.getAll('scopeTiers').map(String).filter(Boolean)
    // R1.0: allowlist de correos desde el textarea (una por línea o coma). El server normaliza en mintCoupon.
    const allowedEmails = String(formData.get('allowed_emails') ?? '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes('@'))
    const raw = {
        discountType: formData.get('discountType'),
        percentValue: numOrUndef(formData.get('percentValue')),
        amountOffClp: numOrUndef(formData.get('amountOffClp')),
        fixedClpTarget: strOrUndef(formData.get('fixedClpTarget')) ?? 'base',
        scopeTiers: scopeTiers.length > 0 ? scopeTiers : undefined,
        duration: formData.get('duration'),
        durationInCycles: numOrUndef(formData.get('durationInCycles')),
        maxRedemptions: numOrUndef(formData.get('maxRedemptions')),
        codeDisplay: strOrUndef(formData.get('codeDisplay')),
        perAccountLimit: numOrUndef(formData.get('perAccountLimit')) ?? 1,
        firstTimeOnly: formData.get('firstTimeOnly') === 'on' || formData.get('firstTimeOnly') === 'true',
        floorClp: numOrUndef(formData.get('floorClp')),
        allowedEmails: allowedEmails.length > 0 ? allowedEmails : undefined,
        // R3.8: el check del CEO para descuentos > 21%.
        highDiscountOverride: formData.get('high_discount_override') === 'on' || formData.get('high_discount_override') === 'true',
    }

    const parsed = CreateCouponAdminSchema.safeParse(raw)
    if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }

    const result = await mintCoupon(adminClient, parsed.data, user.id)
    if (!result.ok) {
        return { ok: false, message: result.message, code: result.code }
    }

    await logAdminAction(
        adminClient,
        'coupon.mint',
        'coupons',
        result.couponId,
        { code_display: result.codeDisplay, discount_type: parsed.data.discountType, duration: parsed.data.duration },
        user.email
    )
    revalidatePath('/admin/codigos')
    return { ok: true, message: `Código ${result.codeDisplay} creado.` }
}

export type DeactivateActionState = { ok: boolean; message: string }

/**
 * Reversal SERNAC-safe: desactiva el código (active=false) → CERO canjes nuevos al instante; las
 * redenciones VIGENTES honran su término (no se toca el precio de nadie). Reversa por-código.
 */
export async function deactivateCodeAction(codeId: string): Promise<DeactivateActionState> {
    const { user, adminClient } = await assertAdmin()
    const { error } = await adminClient.from('coupon_codes').update({ active: false }).eq('id', codeId)
    if (error) return { ok: false, message: error.message }
    await logAdminAction(adminClient, 'coupon.deactivate', 'coupon_codes', codeId, null, user.email)
    revalidatePath('/admin/codigos')
    return { ok: true, message: 'Código desactivado.' }
}
