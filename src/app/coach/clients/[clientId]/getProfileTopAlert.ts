import { differenceInDays } from 'date-fns'

export type ProfileAlertType = 'warning' | 'danger' | 'info' | 'success'

export type ProfileTopAlert = {
    type: ProfileAlertType
    message: string
}

/**
 * Reglas deterministas (plan B3) — sin IA.
 */
export function getProfileTopAlert(data: {
    checkIns: { created_at: string }[] | null | undefined
    compliance: {
        workoutsThisWeek?: number
        workoutsTarget?: number
        nutritionCompliancePercent?: number
        planDaysRemaining?: number
        currentStreak?: number
    } | null | undefined
    /** Adherencia entreno última semana 0–100; si no se pasa, se deriva de compliance */
    weeklyWorkoutAdherencePct?: number
    oneRMDelta?: number | null
}): ProfileTopAlert | null {
    const checkIns = data.checkIns || []
    const lastCheckin = checkIns[0]
    const daysSinceCheckin = lastCheckin?.created_at
        ? differenceInDays(new Date(), new Date(lastCheckin.created_at))
        : null

    const c = data.compliance || {}
    const target = Math.max(1, c.workoutsTarget ?? 1)
    const adherence =
        data.weeklyWorkoutAdherencePct ??
        Math.min(100, Math.round(((c.workoutsThisWeek ?? 0) / target) * 100))

    const nutritionCompliance = c.nutritionCompliancePercent ?? 0
    const planDaysRemaining = c.planDaysRemaining
    const streak = c.currentStreak ?? 0
    const oneRMDelta = data.oneRMDelta ?? null

    if (checkIns.length > 0 && daysSinceCheckin !== null && daysSinceCheckin > 30) {
        return {
            type: 'warning',
            message:
                'Hace más de 30 días desde su último check-in — conviene contactarle.',
        }
    }
    if (adherence < 50) {
        return {
            type: 'danger',
            message: `Adherencia crítica esta semana en entrenamiento: ${adherence}%.`,
        }
    }
    if (nutritionCompliance < 60) {
        return {
            type: 'warning',
            message: `Solo completó el ${nutritionCompliance}% de sus comidas (hoy / plan activo).`,
        }
    }
    if (planDaysRemaining !== undefined && planDaysRemaining <= 0) {
        return {
            type: 'danger',
            message: 'El programa está vencido — necesita uno nuevo.',
        }
    }
    if (planDaysRemaining !== undefined && planDaysRemaining <= 3 && planDaysRemaining > 0) {
        return {
            type: 'info',
            message: `El programa vence en ${planDaysRemaining} día${planDaysRemaining === 1 ? '' : 's'}.`,
        }
    }
    if (oneRMDelta !== null && oneRMDelta < -5) {
        return {
            type: 'warning',
            message: 'Fuerza cayendo esta semana — revisar carga y recuperación.',
        }
    }
    if (streak >= 10 && adherence > 80) {
        return {
            type: 'success',
            message: `🔥 ${streak} días de racha con ${adherence}% adherencia al entreno.`,
        }
    }

    return null
}
