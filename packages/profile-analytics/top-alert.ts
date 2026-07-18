// Motor determinista de triage del perfil (plan B3) — sin IA, sin date-fns.
// Fuente unica web + mobile. Reglas y numeros = web (gana WEB). Ver deltas en el header del package.

import { diffDays } from './dates'
import type { ProfileTopAlert } from './types'

export function getProfileTopAlert(data: {
  // Input permisivo (superset web+mobile): acepta created_at y/o date.
  checkIns: { created_at?: string | null; date?: string | null }[] | null | undefined
  compliance?: {
    workoutsThisWeek?: number
    workoutsTarget?: number
    nutritionCompliancePercent?: number
    planDaysRemaining?: number
    currentStreak?: number
  } | null
  /** Adherencia entreno ultima semana 0–100 (reservado; las reglas usan lastWorkoutDate). */
  weeklyWorkoutAdherencePct?: number
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
    return { type: 'warning', message: `Solo completó el ${nutritionCompliance}% de sus comidas (hoy / plan activo).` }
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
