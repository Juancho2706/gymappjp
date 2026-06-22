import { NextRequest, NextResponse } from 'next/server'
import { MovementItemInputSchema } from '@eva/schemas'
import { finalItemScore, movementPatternDef, type MovementPatternSlug } from '@eva/calc'
import { authorizeMovement } from '../_lib'

/**
 * POST /api/mobile/movement/item — autosave por paso del wizard (espejo de upsertDraftItem,
 * apps/mobile/lib/movement.ts). Crea el borrador (max 1 por alumno) si no existe y upserta el
 * item con final_score RECALCULADO server-side (jamas se confia en el cliente). Gate
 * assertModule('movement_assessment') antes de escribir (ver _lib.ts).
 *
 * Body: { client_id: string, item: WizardItemValues (pattern, score_left, score_right,
 *         score_single, pain, clearing_positive, comment) }
 * Retorna: { assessmentId: string } | { error, code? }
 */
export async function POST(request: NextRequest) {
    const auth = await authorizeMovement(request)
    if (auth instanceof NextResponse) return auth
    const { userId, userClient } = auth

    const body = await request.json().catch(() => null)
    const clientId = typeof body?.client_id === 'string' ? body.client_id : null
    if (!clientId) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const parsed = MovementItemInputSchema.safeParse(body?.item)
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? 'Datos del patron invalidos.' },
            { status: 400 }
        )
    }
    const values = parsed.data
    const def = movementPatternDef(values.pattern as MovementPatternSlug)

    // Borrador existente o nuevo (RLS: coach_id = auth.uid()).
    let assessmentId: string
    const { data: existing } = await userClient
        .from('movement_assessments')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'draft')
        .maybeSingle()
    if (existing) {
        assessmentId = existing.id
    } else {
        const { data: created, error: insErr } = await userClient
            .from('movement_assessments')
            .insert({ client_id: clientId, coach_id: userId, status: 'draft', last_edited_by: userId })
            .select('id')
            .single()
        if (insErr || !created) {
            return NextResponse.json({ error: insErr?.message ?? 'No se pudo crear el borrador.' }, { status: 400 })
        }
        assessmentId = created.id
    }

    // Recalculo server del puntaje final del item.
    const finalScore = finalItemScore({
        pattern: def.slug,
        isPerSide: def.isPerSide,
        scoreLeft: def.isPerSide ? (values.score_left ?? null) : null,
        scoreRight: def.isPerSide ? (values.score_right ?? null) : null,
        scoreSingle: def.isPerSide ? null : (values.score_single ?? null),
        pain: values.pain,
        clearingPositive: def.hasClearing ? (values.clearing_positive ?? false) : null,
    })

    // Upsert por (assessment_id, pattern): borra el item previo y reinserta (mismo patron que el lib).
    await userClient
        .from('movement_assessment_items')
        .delete()
        .eq('assessment_id', assessmentId)
        .eq('pattern', def.slug)

    const { error: itemErr } = await userClient.from('movement_assessment_items').insert({
        assessment_id: assessmentId,
        pattern: def.slug,
        is_per_side: def.isPerSide,
        score_left: def.isPerSide ? (values.score_left ?? null) : null,
        score_right: def.isPerSide ? (values.score_right ?? null) : null,
        score_single: def.isPerSide ? null : (values.score_single ?? null),
        final_score: finalScore,
        pain: values.pain,
        clearing_positive: def.hasClearing ? (values.clearing_positive ?? false) : null,
        comment: values.comment?.trim() || null,
    })
    if (itemErr) return NextResponse.json({ assessmentId, error: itemErr.message }, { status: 400 })

    // Awareness: last_edited_by en cada write.
    await userClient.from('movement_assessments').update({ last_edited_by: userId }).eq('id', assessmentId)

    return NextResponse.json({ assessmentId })
}
