import { NextRequest, NextResponse } from 'next/server'
import { AssignMealVariantSchema } from '@eva/schemas/nutrition-exchanges'
import { gateExchanges } from '../_shared'

/**
 * Espejo mobile de `assignMealDayVariantAction` (web → assignMealDayVariant): asigna o
 * limpia (null) la variante de dia de una comida (`nutrition_meals.day_variant_id`).
 * Gating server-side antes de escribir; UPDATE con el cliente token-scoped (RLS = 2da capa).
 */
export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = AssignMealVariantSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 })
    }

    const { error } = await gate.userClient
        .from('nutrition_meals')
        .update({ day_variant_id: parsed.data.variantId })
        .eq('id', parsed.data.mealId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
}
