import { NextRequest, NextResponse } from 'next/server'
import { SaveMealExchangeTargetsSchema } from '@eva/schemas/nutrition-exchanges'
import { gateExchanges } from '../_shared'

/**
 * Espejo mobile de `saveMealExchangeTargetsAction` (web → replaceMealExchangeTargets):
 * reemplaza (delete + insert) los `meal_exchange_targets` de UNA comida. Gating
 * server-side antes de escribir; delete+insert con el cliente token-scoped (RLS = 2da capa).
 */
export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = SaveMealExchangeTargetsSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 })
    }
    const { mealId, targets } = parsed.data

    const { error: delErr } = await gate.userClient.from('meal_exchange_targets').delete().eq('meal_id', mealId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

    const live = targets.filter((t) => t.portions > 0)
    if (live.length === 0) return NextResponse.json({ ok: true })

    const { error: insErr } = await gate.userClient.from('meal_exchange_targets').insert(
        live.map((t) => ({ meal_id: mealId, exchange_group_id: t.exchangeGroupId, portions: t.portions, notes: t.notes ?? null }))
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
}
