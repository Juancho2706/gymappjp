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
