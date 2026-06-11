/**
 * Dominio — Screening de Movimiento de Ingreso (modulo movement_assessment).
 * Tipos de negocio puros: sin Next.js, sin Supabase, sin lib/.
 * Espejo 1:1 del schema DB (migr. 20260611091001_movement_assessment_module.sql).
 */

export type PriorityBand = 'low' | 'moderate' | 'high'

export type AssessmentStatus = 'draft' | 'final'

export type MovementPatternSlug =
    | 'deep_squat'
    | 'hurdle_step'
    | 'inline_lunge'
    | 'shoulder_mobility'
    | 'active_straight_leg_raise'
    | 'trunk_stability_pushup'
    | 'rotary_stability'

export interface MovementAssessment {
    id: string
    client_id: string
    coach_id: string | null
    team_id: string | null
    status: AssessmentStatus
    protocol_version: string
    assessed_at: string
    composite_score: number | null
    has_pain: boolean
    has_asymmetry: boolean
    risk_band: PriorityBand | null
    consent_confirmed_at: string | null
    notes: string | null
    last_edited_by: string | null
    created_at: string
    updated_at: string
}

export interface MovementAssessmentItem {
    id: string
    assessment_id: string
    pattern: MovementPatternSlug
    is_per_side: boolean
    score_left: number | null
    score_right: number | null
    score_single: number | null
    final_score: number
    pain: boolean
    clearing_positive: boolean | null
    comment: string | null
}

export interface MovementAssessmentWithItems extends MovementAssessment {
    items: MovementAssessmentItem[]
}

/** Resumen por alumno para el hub del modulo (ultimo final + borrador pendiente). */
export interface ClientMovementSummary {
    client_id: string
    full_name: string | null
    latest_final: Pick<
        MovementAssessment,
        'id' | 'assessed_at' | 'composite_score' | 'risk_band' | 'has_pain' | 'has_asymmetry'
    > | null
    draft_id: string | null
}
