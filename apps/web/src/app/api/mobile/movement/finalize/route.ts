import { NextRequest, NextResponse } from 'next/server'
import { MovementFinalizeSchema } from '@eva/schemas'
import { summarizeAssessment, type MovementItemInput } from '@eva/calc'
import { authorizeMovement } from '../_lib'

/**
 * POST /api/mobile/movement/finalize — finaliza el borrador (espejo de finalizeAssessment del lib
 * mobile + finalizeMovementAssessment del service web, via STANDALONE). Gate
 * assertModule('movement_assessment') antes de escribir (ver _lib.ts).
 *
 * Reglas (standalone v1):
 *  - consent_attested obligatorio (atestacion explicita del coach). Si no hay consentimiento
 *    health_data_processing activo, se inserta uno por coach_attestation (espeja el service web;
 *    el CHECK movement_assessments_final_complete exige consent_confirmed_at NOT NULL en final).
 *  - composite / band / has_pain / has_asymmetry se RECALCULAN server-side con @eva/calc; lanza
 *    si el protocolo esta incompleto (faltan patrones). Jamas se aceptan agregados del cliente.
 *
 * Body: { client_id, assessment_id, notes, consent_attested }
 * Retorna: { error: null } en exito | { error, code? }
 */
export async function POST(request: NextRequest) {
    const auth = await authorizeMovement(request)
    if (auth instanceof NextResponse) return auth
    const { userId, userClient } = auth

    const body = await request.json().catch(() => null)
    const parsed = MovementFinalizeSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? 'Datos de finalizacion invalidos.' },
            { status: 400 }
        )
    }
    const { client_id: clientId, assessment_id: assessmentId, notes, consent_attested } = parsed.data
    if (!consent_attested) {
        return NextResponse.json(
            { error: 'Debes atestar que el alumno consintio el tratamiento de sus datos de salud.' },
            { status: 400 }
        )
    }

    // Cargar el borrador + items (RLS: coach_id = auth.uid()).
    const { data: draft } = await userClient
        .from('movement_assessments')
        .select(
            'id, status, movement_assessment_items ( pattern, is_per_side, score_left, score_right, score_single, pain, clearing_positive )'
        )
        .eq('client_id', clientId)
        .eq('status', 'draft')
        .maybeSingle()
    if (!draft || draft.id !== assessmentId) {
        return NextResponse.json(
            { error: 'Borrador no encontrado (pudo haber sido finalizado o eliminado).' },
            { status: 404 }
        )
    }

    // Recalculo server SIEMPRE (lanza si el protocolo esta incompleto — faltan patrones).
    const items: MovementItemInput[] = (draft.movement_assessment_items ?? []).map((r) => ({
        pattern: r.pattern as MovementItemInput['pattern'],
        isPerSide: !!r.is_per_side,
        scoreLeft: r.score_left,
        scoreRight: r.score_right,
        scoreSingle: r.score_single,
        pain: !!r.pain,
        clearingPositive: r.clearing_positive,
    }))
    let summary
    try {
        summary = summarizeAssessment(items)
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Protocolo incompleto.' },
            { status: 400 }
        )
    }

    // Consentimiento (standalone): atestacion explicita del coach. Inserta el registro si no existe
    // (espeja insertCoachAttestationConsent del repo web; RLS standalone lo permite).
    const { data: consent } = await userClient
        .from('client_consents')
        .select('id')
        .eq('client_id', clientId)
        .eq('purpose', 'health_data_processing')
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle()
    const now = new Date().toISOString()
    if (!consent) {
        const { error: consErr } = await userClient.from('client_consents').insert({
            client_id: clientId,
            purpose: 'health_data_processing',
            granted_at: now,
            consent_text_version: 'v1',
            granted_via: 'coach_attestation',
        })
        if (consErr) return NextResponse.json({ error: consErr.message }, { status: 400 })
    }

    const { error: updErr } = await userClient
        .from('movement_assessments')
        .update({
            status: 'final',
            composite_score: summary.composite,
            has_pain: summary.hasPain,
            has_asymmetry: summary.hasAsymmetry,
            risk_band: summary.band,
            consent_confirmed_at: now,
            assessed_at: now,
            notes: notes?.trim() || null,
            last_edited_by: userId,
        })
        .eq('id', assessmentId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    return NextResponse.json({ error: null })
}
