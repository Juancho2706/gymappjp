// Estado unificado del alumno para el Hero de la ficha (Fase 1 quick-win #1).
// FUNCION PURA: las senales llegan ya computadas. Espejo de los umbrales de
// calculateAttentionScore (dashboard.service.ts) — no lo reemplaza.

import type { ClientStatus, ClientStatusInput, ClientStatusLevel } from './types'

// Espejo de dashboard.service (CHECKIN_OVERDUE_AFTER_DAYS=30, WORKOUT_INACTIVE_AFTER_DAYS=7).
const CHECKIN_OVERDUE_AFTER_DAYS = 30
const WORKOUT_INACTIVE_AFTER_DAYS = 7
const NUTRITION_RISK_BELOW = 60

const LEVEL_LABEL: Record<ClientStatusLevel, string> = {
  ok: 'Al día',
  attention: 'Atención',
  urgent: 'Urgente',
}

/**
 * Deriva { level, label, reasons, score } a partir de las senales existentes.
 *   - urgent : score ≥ 50, o ciclo vencido, o ≥14 dias sin actividad alguna.
 *   - attention: score ≥ 25, o cualquier motivo activo.
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
  if (hasActiveWorkoutProgram && daysSinceWorkout != null && daysSinceWorkout >= WORKOUT_INACTIVE_AFTER_DAYS) {
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
