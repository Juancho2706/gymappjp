/**
 * Estado unificado del alumno para el Hero de la ficha (Fase 1 quick-win #1).
 *
 * Reemplaza los DOS indicadores contradictorios de hoy (el `bucket`
 * Al día/En riesgo/Atrasada + el chip `Score {n} · Estable/Revisar/Urgente`) por
 * UN solo badge de 3 niveles (`ok`/`attention`/`urgent`) con 2-3 MOTIVOS legibles.
 * El número crudo (`score`) se conserva en el retorno para el tooltip.
 *
 * FUNCIÓN PURA: no toca red ni Date.now() implícito salvo lo que se le pasa. Las
 * señales llegan ya computadas (el service las tiene: días sin check-in/ejercicio,
 * adherencia, días de ciclo). Espejo de los umbrales de `calculateAttentionScore`
 * (dashboard.service.ts) — NO la reemplaza; se apoya en su `score` + señales crudas.
 */

// Espejo de las constantes de dashboard.service (CHECKIN_OVERDUE_AFTER_DAYS=30,
// WORKOUT_INACTIVE_AFTER_DAYS=7) para que los motivos coincidan con el score.
const CHECKIN_OVERDUE_AFTER_DAYS = 30
const WORKOUT_INACTIVE_AFTER_DAYS = 7
const NUTRITION_RISK_BELOW = 60

export type ClientStatusLevel = 'ok' | 'attention' | 'urgent'

export type ClientStatusInput = {
    /** Score crudo de calculateAttentionScore (0..~100). Alimenta niveles + tooltip. */
    attentionScore: number
    /** Días desde el último check-in; null si nunca hubo check-in. */
    daysSinceCheckin: number | null
    /** Días desde el último workout logueado; null si no hay programa activo o nunca entrenó. */
    daysSinceWorkout: number | null
    hasActiveWorkoutProgram: boolean
    /** Adherencia nutricional representativa (0..100); null si no hay plan. */
    nutritionAdherencePct: number | null
    /** Días restantes del ciclo/programa; null si no hay programa con fechas. */
    planDaysRemaining: number | null
}

export type ClientStatus = {
    level: ClientStatusLevel
    /** Etiqueta ES del badge único: 'Al día' | 'Atención' | 'Urgente'. */
    label: string
    /** 2-3 motivos legibles, ya recortados. Vacío = sin señales de riesgo. */
    reasons: string[]
    /** Score crudo (para tooltip / detalle). */
    score: number
}

const LEVEL_LABEL: Record<ClientStatusLevel, string> = {
    ok: 'Al día',
    attention: 'Atención',
    urgent: 'Urgente',
}

/**
 * Deriva { level, label, reasons, score } a partir de las señales existentes.
 * Niveles:
 *   - urgent : score ≥ 50, o ciclo vencido, o ≥14 días sin actividad alguna.
 *   - attention: score ≥ 25, o cualquier motivo activo (check-in/ejercicio/nutrición/ciclo por vencer).
 *   - ok     : sin motivos y score < 25.
 */
export function deriveClientStatus(input: ClientStatusInput): ClientStatus {
    const {
        attentionScore,
        daysSinceCheckin,
        daysSinceWorkout,
        hasActiveWorkoutProgram,
        nutritionAdherencePct,
        planDaysRemaining,
    } = input

    const reasons: string[] = []

    if (daysSinceCheckin != null && daysSinceCheckin > CHECKIN_OVERDUE_AFTER_DAYS) {
        reasons.push(`${daysSinceCheckin} días sin check-in`)
    }
    if (
        hasActiveWorkoutProgram &&
        daysSinceWorkout != null &&
        daysSinceWorkout >= WORKOUT_INACTIVE_AFTER_DAYS
    ) {
        reasons.push(`${daysSinceWorkout} días sin entrenar`)
    }
    if (nutritionAdherencePct != null && nutritionAdherencePct < NUTRITION_RISK_BELOW) {
        reasons.push(`adherencia ${Math.round(nutritionAdherencePct)}%`)
    }
    if (planDaysRemaining != null && planDaysRemaining <= 0) {
        reasons.push('ciclo vencido')
    } else if (planDaysRemaining != null && planDaysRemaining <= 3) {
        reasons.push(`ciclo en ${planDaysRemaining} día${planDaysRemaining === 1 ? '' : 's'}`)
    }

    const noActivityDays =
        daysSinceCheckin != null && daysSinceWorkout != null
            ? Math.min(daysSinceCheckin, daysSinceWorkout)
            : (daysSinceCheckin ?? daysSinceWorkout)

    const cycleExpired = planDaysRemaining != null && planDaysRemaining <= 0
    const stale14 = noActivityDays != null && noActivityDays >= 14

    let level: ClientStatusLevel
    if (attentionScore >= 50 || cycleExpired || stale14) {
        level = 'urgent'
    } else if (attentionScore >= 25 || reasons.length > 0) {
        level = 'attention'
    } else {
        level = 'ok'
    }

    return {
        level,
        label: LEVEL_LABEL[level],
        reasons: reasons.slice(0, 3),
        score: attentionScore,
    }
}
