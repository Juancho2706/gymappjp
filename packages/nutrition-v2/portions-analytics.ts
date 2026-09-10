/**
 * Analytics de la capa de porciones (PostHog) — nombres de evento y payloads en UN solo lugar,
 * compartidos por web y RN (tren «Porciones a la chilena», W2.10).
 *
 * FUENTE UNICA DE LA FORMA: DATA.md §11 («shape exacto de los 5 eventos», fix seguridad S-07).
 * Ni SPEC §11 ni TASKS reescriben esa tabla: la citan. Si el payload de aca no calza con §11, el
 * que esta mal es este archivo.
 *
 * REGLA DURA (Ley 21.719 + SPEC §17 no-negociable 9): CERO cifras de salud. Ni kcal, ni gramos,
 * ni porciones, ni nombres de alimentos, ni ids. `group_code` SI viaja porque este evento lo
 * dispara el COACH y 'PCT' o 'LAC' es un termino de dominio sobre su propia herramienta de
 * trabajo; para el ALUMNO seria su pauta nutricional, y por eso el evento 5 va sin el.
 *
 * Por eso el payload es un tipo CERRADO y se construye aca: si el evento se despachara a mano en
 * cada superficie, tarde o temprano una de las dos le agrega `{ portions }` «para medir mejor» —
 * o declara su propia funcion con otras props y el mismo evento sale con dos formas distintas.
 */

import type { PortionSystem } from './exchange-visibility'
import type { QeTargetsScope } from './editor-state'

/** Tocar un grupo ya presente en la franja suma media porcion en vez de no hacer nada (D2-A). */
export const PORTIONS_EVENT_GROUP_BUMPED = 'nutrition_portion_group_bumped'

/** Superficie donde ocurrio la interaccion. No hay una tercera: el alumno no hace bump. */
export type PortionBumpSurface = 'rn' | 'web'

/** Desde donde se sumo: la fila del picker (D2-A) o el stepper de la franja (M3). */
export type PortionBumpFrom = 'picker' | 'stepper'

/** Lo que la superficie sabe del bump, en camelCase; el snake_case lo pone el payload. */
export type PortionGroupBumpedProps = {
  /** Codigo del grupo ('PCT', 'LAC'…). Termino de dominio del coach, JAMAS un id. */
  readonly groupCode: string
  readonly portionSystem: PortionSystem
  readonly from: PortionBumpFrom
  /** ¿El coach uso el «Deshacer» del toast? Se emite un segundo evento con `true`. */
  readonly undone: boolean
}

/** Payload del bump. Es EXHAUSTIVO: estas 5 props y ninguna mas (DATA.md §11, evento 1). */
export type PortionGroupBumpedPayload = {
  surface: PortionBumpSurface
  group_code: string
  portion_system: PortionSystem
  from: PortionBumpFrom
  undone: boolean
}

export function portionGroupBumpedPayload(
  surface: PortionBumpSurface,
  props: PortionGroupBumpedProps,
): PortionGroupBumpedPayload {
  return {
    surface,
    group_code: props.groupCode,
    portion_system: props.portionSystem,
    from: props.from,
    undone: props.undone,
  }
}

/**
 * El coach ABRE el preview de la conversion SMAE → chileno (W3). Mide cuantos lo miran y
 * cuanta friccion tiene el preview (filas que exigen revision), NUNCA que contiene el plan.
 */
export const PORTIONS_EVENT_CONVERSION_PREVIEWED = 'nutrition_portion_conversion_previewed'

/** El coach APLICA la conversion al borrador. Publicar sigue siendo un paso aparte (T-05). */
export const PORTIONS_EVENT_CONVERSION_APPLIED = 'nutrition_portion_conversion_applied'

/**
 * Payload del preview. EXHAUSTIVO: dos CONTEOS y ninguna cifra mas.
 *
 * `slots` = franjas afectadas, `rows_review` = filas marcadas «Revisar». Ni kcal, ni gramos,
 * ni porciones, ni nombres de grupo o de alimento, ni ids: el evento cuenta cuanta friccion
 * tuvo la pantalla, no que come el alumno (Ley 21.719 + SPEC §17 no-negociable 9).
 */
export type PortionConversionPreviewedPayload = {
  slots: number
  rows_review: number
}

export function conversionPreviewedPayload(
  slots: number,
  rowsReview: number,
): PortionConversionPreviewedPayload {
  return { slots, rows_review: rowsReview }
}

/** Payload del aplicado. EXHAUSTIVO: un solo conteo. */
export type PortionConversionAppliedPayload = {
  slots: number
}

export function conversionAppliedPayload(slots: number): PortionConversionAppliedPayload {
  return { slots }
}

/**
 * El coach eligio en que alcance se guarda una meta del dia (W4). Mide si el default del
 * switch acierta; JAMAS lleva la cifra de la meta — eso seria un dato de salud (§17.9).
 */
export const TARGETS_EVENT_SCOPE = 'nutrition_targets_scope'

/** Desde donde se eligio: el switch «Solo el {dia}» o el «Ir a Base» del aviso de la barra. */
export type TargetsScopeFrom = 'switch' | 'go_to_base'

/** Payload del alcance de metas. EXHAUSTIVO: estas 2 llaves y ninguna mas (DATA.md §11). */
export type TargetsScopePayload = {
  scope: QeTargetsScope
  from: TargetsScopeFrom
}

export function targetsScopePayload(scope: QeTargetsScope, from: TargetsScopeFrom): TargetsScopePayload {
  return { scope, from }
}
