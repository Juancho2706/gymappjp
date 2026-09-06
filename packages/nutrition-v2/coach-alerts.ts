/**
 * coach-alerts — las dos alertas de Nutrición V2 en la ficha del coach (W4.2 del tren «Cantidades
 * honestas», SPEC §7.2, MIDE).
 *
 * Por qué existe: el motor de alertas de la ficha (`nutrition-coach-alerts` web y su port RN) nació
 * sobre datos V1 — meta calórica del plan, adherencia semanal, timeline de comidas marcadas — y no
 * mira nada de lo que este tren descubrió: un día con 5.637 kcal registradas contra una meta de
 * 1.556 no levantaba UNA sola señal, y los 5 registros huérfanos que aportaban 4.470 de esas kcal
 * tampoco. Acá viven esas dos señales, puras (sin React, sin red, sin fechas) y compartidas: web y
 * RN las concatenan a sus alertas existentes en vez de escribir cada una la suya.
 *
 * Forma IDÉNTICA a `NutritionCoachAlert` de las dos apps (`{ id, variant, title, description }`)
 * a propósito: el consumo es un `concat`, no un mapeo.
 */

import { formatNutritionCalories } from './design'
import { COACH_ALERT_CONSUMED_RATIO } from './plausibility'

/** Tono de la alerta; mismo dominio que el `NutritionCoachAlert` de web y RN. */
export type NutritionV2AlertVariant = 'danger' | 'warning' | 'info'

export interface NutritionV2Alert {
  id: string
  variant: NutritionV2AlertVariant
  title: string
  description: string
}

export interface NutritionV2AlertsInput {
  /** kcal CONSUMIDAS hoy (`today.consumed.calories`). */
  todayConsumedCalories: number | null | undefined
  /** Meta del día (`today.targets.calories`); sin meta no hay proporción que medir. */
  todayTargetCalories: number | null | undefined
  /** Registros de hoy que apuntan a una versión anterior del plan (`priorVersionEntries().length`). */
  priorVersionEntryCount: number | null | undefined
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Las alertas V2 del día, en orden de gravedad (primero `danger`).
 *
 *  - `overconsumption` (danger): lo consumido supera `COACH_ALERT_CONSUMED_RATIO` veces la meta
 *    (D7: 2×). MISMO umbral que el chip «N× la meta» del panel de registros (W4.1), para que el
 *    coach no vea una señal sin la otra.
 *  - `prior_version_entries` (warning): N registros de hoy vienen de una versión anterior del plan
 *    (republicación del mismo día, §1 Causa 2). Explica de dónde salen kcal que el plan vigente no
 *    prescribe y empuja al panel donde se retiran.
 *
 * Sin meta, sin consumo o sin huérfanos, la lista queda vacía: nunca se inventa una alerta.
 */
export function deriveNutritionV2Alerts(input: NutritionV2AlertsInput): NutritionV2Alert[] {
  const alerts: NutritionV2Alert[] = []

  const target = finitePositive(input.todayTargetCalories)
  const consumed = finitePositive(input.todayConsumedCalories)
  if (target !== null && consumed !== null && consumed / target >= COACH_ALERT_CONSUMED_RATIO) {
    alerts.push({
      id: 'overconsumption',
      variant: 'danger',
      title: 'Consumo muy por encima de la meta',
      description:
        `Hoy registró ${formatNutritionCalories(consumed)}, más de ${COACH_ALERT_CONSUMED_RATIO}× ` +
        `su meta de ${formatNutritionCalories(target)}. Revisa los registros del día: puede ser una ` +
        'cantidad mal ingresada.',
    })
  }

  const orphans = input.priorVersionEntryCount
  if (typeof orphans === 'number' && Number.isFinite(orphans) && orphans > 0) {
    const count = Math.trunc(orphans)
    alerts.push({
      id: 'prior_version_entries',
      variant: 'warning',
      title: 'Registros de una versión anterior del plan',
      description:
        `${count} ${count === 1 ? 'registro' : 'registros'} de hoy ${count === 1 ? 'es' : 'son'} de ` +
        'una versión anterior del plan. Suman al día aunque el plan vigente ya no los prescriba; ' +
        'puedes retirarlos desde los registros de hoy.',
    })
  }

  return alerts
}
