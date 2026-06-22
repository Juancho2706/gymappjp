import { NextRequest, NextResponse } from 'next/server'
import { CreateDayVariantSchema, DeleteDayVariantSchema } from '@eva/schemas/nutrition-exchanges'
import { gateExchanges } from '../_shared'

/**
 * Espejo mobile de `createDayVariantAction` / `deletePlanDayVariantAction` (web →
 * createPlanDayVariant / deletePlanDayVariant). Variantes de dia de una pauta
 * (`nutrition_plan_day_variants`). Gating server-side antes de escribir; escrituras
 * con el cliente token-scoped (RLS = 2da capa).
 */

export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = CreateDayVariantSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 })
    }
    const { planId, name } = parsed.data

    // Espejo de createPlanDayVariant: max 6, sin nombres repetidos (RLS = techo del SELECT).
    const { data: existing } = await gate.userClient
        .from('nutrition_plan_day_variants')
        .select('id, name, sort_order')
        .eq('plan_id', planId)
    const list = existing ?? []
    if (list.length >= 6) return NextResponse.json({ error: 'Máximo 6 variantes por pauta.' }, { status: 400 })
    if (list.some((v) => String(v.name).toLowerCase() === name.toLowerCase())) {
        return NextResponse.json({ error: 'Ya existe una variante con ese nombre.' }, { status: 400 })
    }

    const { data, error } = await gate.userClient
        .from('nutrition_plan_day_variants')
        .insert({ plan_id: planId, name, sort_order: list.length })
        .select('id, plan_id, name, sort_order')
        .single()
    if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'No se pudo crear la variante.' }, { status: 400 })
    }

    return NextResponse.json({
        ok: true,
        variant: { id: data.id, planId: data.plan_id, name: data.name, sortOrder: data.sort_order ?? list.length },
    })
}

export async function DELETE(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = DeleteDayVariantSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 })
    }

    // Las comidas asignadas quedan day_variant_id NULL (ON DELETE SET NULL).
    const { error } = await gate.userClient
        .from('nutrition_plan_day_variants')
        .delete()
        .eq('id', parsed.data.variantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
}
