import { NextRequest, NextResponse } from 'next/server'
import { SetPlanModeSchema } from '@eva/schemas/nutrition-exchanges'
import { gateExchanges } from '../_shared'

/**
 * Espejo mobile de `setPlanModeAction` (web). Cambia `nutrition_plans.plan_mode`
 * (gramos <-> porciones). Gating server-side `assertModule(nutrition_exchanges)`
 * antes de escribir; el UPDATE corre con el cliente token-scoped (RLS = 2da capa).
 */
export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = SetPlanModeSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 })
    }

    const { error } = await gate.userClient
        .from('nutrition_plans')
        .update({ plan_mode: parsed.data.mode })
        .eq('id', parsed.data.planId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
}
