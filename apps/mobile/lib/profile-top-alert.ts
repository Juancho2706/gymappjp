// Port 1:1 de la web (getProfileTopAlert.ts) — motor determinista de triage del perfil (sin IA, sin date-fns).
// A-F5: el detalle RN solo tenía un string ad-hoc de 3 ramas; esto replica las 7 reglas web.

export type ProfileAlertType = 'warning' | 'danger' | 'info' | 'success'
export type ProfileTopAlert = { type: ProfileAlertType; message: string }

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

export function getProfileTopAlert(data: {
  checkIns: { created_at?: string | null; date?: string | null }[] | null | undefined
  compliance?: {
    nutritionCompliancePercent?: number
    planDaysRemaining?: number
    currentStreak?: number
  } | null
  lastWorkoutDate?: string | null
  oneRMDelta?: number | null
}): ProfileTopAlert | null {
  const checkIns = data.checkIns || []
  const lastCheckin = checkIns[0]
  const lastCheckinIso = lastCheckin?.created_at ?? lastCheckin?.date ?? null
  const daysSinceCheckin = lastCheckinIso ? diffDays(new Date(lastCheckinIso), new Date()) : null

  const c = data.compliance || {}
  const daysSinceWorkout = data.lastWorkoutDate ? diffDays(new Date(data.lastWorkoutDate), new Date()) : null
  const nutritionCompliance = c.nutritionCompliancePercent ?? 0
  const planDaysRemaining = c.planDaysRemaining
  const streak = c.currentStreak ?? 0
  const oneRMDelta = data.oneRMDelta ?? null

  if (checkIns.length > 0 && daysSinceCheckin !== null && daysSinceCheckin > 30) {
    return { type: 'warning', message: 'Hace más de 1 mes desde su último check-in — conviene contactarle.' }
  }
  if (daysSinceWorkout === null || daysSinceWorkout >= 7) {
    return { type: 'danger', message: 'Adherencia crítica: no registra ejercicios en la última semana.' }
  }
  if (nutritionCompliance < 60) {
    return { type: 'warning', message: `Solo completó el ${nutritionCompliance}% de sus comidas (plan activo).` }
  }
  if (planDaysRemaining !== undefined && planDaysRemaining <= 0) {
    return { type: 'danger', message: 'El programa está vencido — necesita uno nuevo.' }
  }
  if (planDaysRemaining !== undefined && planDaysRemaining <= 3 && planDaysRemaining > 0) {
    return { type: 'info', message: `El programa vence en ${planDaysRemaining} día${planDaysRemaining === 1 ? '' : 's'}.` }
  }
  if (oneRMDelta !== null && oneRMDelta < -5) {
    return { type: 'warning', message: 'Fuerza cayendo esta semana — revisar carga y recuperación.' }
  }
  if (streak >= 10) {
    return { type: 'success', message: `🔥 ${streak} días de racha activa.` }
  }
  return null
}
