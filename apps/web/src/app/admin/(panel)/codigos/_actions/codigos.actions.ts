'use server'

import { revalidatePath } from 'next/cache'
import { CreateCouponAdminSchema, RevokeRedemptionSchema } from '@eva/schemas'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { mintCoupon } from '@/services/billing/coupons.service'

// Solo async functions exportadas ('use server'). Tipos/consts viven en @eva/schemas y el service.

export type MintActionState = { ok: boolean; message: string; code?: string; codeDisplay?: string }

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
}
function strOrUndef(v: FormDataEntryValue | null): string | undefined {
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length > 0 ? s : undefined
}

/**
 * `<input type="date">` entrega 'YYYY-MM-DD' y el schema exige ISO datetime UTC (`redeemBy`). El motor
 * corta con `redeem_by <= now`, así que se convierte al FIN de ese día en Chile (UTC-4 fijo) para que
 * el código siga canjeable durante todo el día elegido. En horario de verano (UTC-3) sobra 1 hora:
 * preferimos regalar una hora a cortarle el día al CEO.
 */
function endOfDayIsoOrUndef(v: FormDataEntryValue | null): string | undefined {
    const s = typeof v === 'string' ? v.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
    const d = new Date(`${s}T23:59:59.999-04:00`)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
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
        // Fecha de expiración del canje (opcional): el service la persiste en coupons.redeem_by y en
        // coupon_codes.expires_at, y el canje ya la respeta (RedeemErrorCode 'EXPIRED').
        redeemBy: endOfDayIsoOrUndef(formData.get('redeemBy')),
        codeDisplay: strOrUndef(formData.get('codeDisplay')),
        perAccountLimit: numOrUndef(formData.get('perAccountLimit')) ?? 1,
        firstTimeOnly: formData.get('firstTimeOnly') === 'on' || formData.get('firstTimeOnly') === 'true',
        // Código de partner atado a 1 coach (anti-leak): el canje de cualquier otro coach cae NOT_ELIGIBLE.
        restrictedToCoachId: strOrUndef(formData.get('restrictedToCoachId')),
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
        {
            code_display: result.codeDisplay,
            discount_type: parsed.data.discountType,
            duration: parsed.data.duration,
            redeem_by: parsed.data.redeemBy ?? null,
            restricted_to_coach_id: parsed.data.restrictedToCoachId ?? null,
        },
        user.email
    )
    revalidatePath('/admin/codigos')
    return { ok: true, message: `Código ${result.codeDisplay} creado.`, codeDisplay: result.codeDisplay }
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

export type RevokeRedemptionActionState = { ok: boolean; message: string }

/**
 * REVOCA el canje vivo de UN coach: su próximo cobro vuelve a precio de lista. Toca dinero, así que
 * la UI lo confirma con blast radius explícito.
 *
 * Estado terminal = `reverted`, NO `revoked`: la CHECK de la tabla es
 * `status IN ('active','expired','reverted')` (migración 20260620120000, verificada en LIVE 2026-08-05)
 * — escribir 'revoked' reventaría con 23514 en cada intento. `reverted` es el mismo estado que usa
 * `revertActiveCouponForCoach` (refund/chargeback) y el que ya interpretan los resolvers de precio.
 *
 * El ledger es append-only (trigger de inmutabilidad): solo `status` cambia, la evidencia SERNAC queda.
 * El trigger `trg_coupon_redemptions_sync` recomputa el puntero del coach; el UPDATE condicional de
 * abajo es cinturón-y-tirantes y jamás pisa un puntero que apunte a OTRO canje.
 */
export async function revokeRedemptionAction(redemptionId: string): Promise<RevokeRedemptionActionState> {
    const { user, adminClient } = await assertAdmin()

    const parsed = RevokeRedemptionSchema.safeParse({ redemptionId })
    if (!parsed.success) return { ok: false, message: 'Canje inválido.' }
    const id = parsed.data.redemptionId

    const { data: redemption, error: readErr } = await adminClient
        .from('coupon_redemptions')
        .select('id, coach_id, status, discount_value_snapshot')
        .eq('id', id)
        .maybeSingle()
    if (readErr) return { ok: false, message: `No se pudo leer el canje: ${readErr.message}` }
    if (!redemption) return { ok: false, message: 'El canje no existe.' }
    if (redemption.status !== 'active') {
        return { ok: false, message: `El canje ya no está vigente (estado actual: ${redemption.status}).` }
    }

    const snap = (redemption.discount_value_snapshot ?? {}) as Record<string, unknown>
    const code = typeof snap.code === 'string' ? snap.code : null

    // `.eq('status','active')` evita pisar una transición concurrente (expired por ciclo agotado); el
    // `select` de vuelta distingue "revocado" de "no matcheó ninguna fila" (carrera) — en dinero, un
    // update de 0 filas NO puede reportarse como éxito.
    const { data: updated, error: updErr } = await adminClient
        .from('coupon_redemptions')
        .update({ status: 'reverted' })
        .eq('id', id)
        .eq('status', 'active')
        .select('id')
        .maybeSingle()
    if (updErr) return { ok: false, message: `No se pudo revocar el canje: ${updErr.message}` }
    if (!updated) {
        return { ok: false, message: 'El canje cambió de estado mientras confirmabas. Recarga y revisa.' }
    }

    const { error: ptrErr } = await adminClient
        .from('coaches')
        .update({ active_coupon_redemption_id: null })
        .eq('id', redemption.coach_id)
        .eq('active_coupon_redemption_id', id)

    await logAdminAction(
        adminClient,
        'coupon.revoke_redemption',
        'coupon_redemptions',
        id,
        {
            redemptionId: id,
            coachId: redemption.coach_id,
            code,
            ...(ptrErr ? { pointer_cleanup_error: ptrErr.message } : {}),
        },
        user.email
    )
    revalidatePath('/admin/codigos')
    revalidatePath('/admin/coaches')
    revalidatePath(`/admin/coaches/${redemption.coach_id}`)

    if (ptrErr) {
        // El descuento YA no aplica (todo resolver de precio exige status='active'), pero el puntero
        // quedó sucio: se reporta en vez de esconderlo bajo un "listo".
        return {
            ok: true,
            message: 'Canje revocado. Aviso: no se pudo limpiar el puntero del coach (queda en auditoría).',
        }
    }
    return { ok: true, message: 'Canje revocado. El próximo cobro vuelve a precio de lista.' }
}
