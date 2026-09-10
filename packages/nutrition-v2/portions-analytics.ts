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
// El eje lacteo se declara UNA vez, en el conversor: `dairy_choice` no puede aceptar un
// codigo que `dairyChoiceBySlot` no acepta.
import type { ClDairyCode } from './exchange-conversion'

/** Tocar un grupo ya presente en la franja suma media porcion en vez de no hacer nada (D2-A). */
export const PORTIONS_EVENT_GROUP_BUMPED = 'nutrition_portion_group_bumped'

/**
 * Superficie donde ocurrio la interaccion. No hay una tercera. Es la MISMA en los cinco
 * eventos de DATA §11, asi que se declara una sola vez.
 */
export type PortionSurface = 'rn' | 'web'

/** Alias historico del evento 1 (`portionGroupBumpedPayload`); es el mismo tipo. */
export type PortionBumpSurface = PortionSurface

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

/** Lo que la superficie sabe del preview, en camelCase; el snake_case lo pone el payload. */
export type PortionConversionPreviewedProps = {
  /** Franjas afectadas. CONTEO, jamas contenido. */
  readonly slots: number
  /** Filas del diff. */
  readonly rows: number
  /** Filas marcadas «Revisar»: cuanta friccion tiene el preview. */
  readonly rowsReview: number
  /** ¿Hay eje lacteo (el selector de 3)? */
  readonly hasDairy: boolean
  /** ¿Alguna fila colapso ARL + G (R2)? */
  readonly hasCollapse: boolean
  /** ¿Se propuso reemplazar un grupo propio del coach (S5)? */
  readonly hasCustomMatch: boolean
}

/**
 * Payload del preview. EXHAUSTIVO: estas 7 llaves y ninguna mas (DATA.md §11, evento 2).
 *
 * Son CONTEOS y BANDERAS. Ni kcal, ni gramos, ni porciones, ni nombres de grupo o de
 * alimento, ni ids: el evento cuenta cuanta friccion tuvo la pantalla, no que come el
 * alumno (Ley 21.719 + SPEC §17 no-negociable 9).
 *
 * `surface` viaja por PARAMETRO, igual que en `portionGroupBumpedPayload`: cuando cada
 * superficie lo pegaba por su cuenta con un spread, RN y la web mandaban el mismo evento con
 * dos formas distintas —y la web lo mandaba sin `surface`, o sea el embudo no sabia de donde
 * venia—. Se construye ACA o no se construye.
 */
export type PortionConversionPreviewedPayload = {
  surface: PortionSurface
  slots: number
  rows: number
  rows_review: number
  has_dairy: boolean
  has_collapse: boolean
  has_custom_match: boolean
}

/**
 * CUANDO se emite (decision W3.5, ratificada 09-09): UNA vez por apertura y SOLO si el `diff`
 * trae algo. Con `diff` vacio no sale: abrir un dialogo que dice «no hay nada que convertir» no
 * es un preview, y hasta W6.8 ese seria el caso mayoritario. El guard es de la superficie (un
 * ref que sube cuando el evento sale), pero se escribe aca para que nadie lo reinvente al reves.
 */
export function conversionPreviewedPayload(
  surface: PortionSurface,
  props: PortionConversionPreviewedProps,
): PortionConversionPreviewedPayload {
  return {
    surface,
    slots: props.slots,
    rows: props.rows,
    rows_review: props.rowsReview,
    has_dairy: props.hasDairy,
    has_collapse: props.hasCollapse,
    has_custom_match: props.hasCustomMatch,
  }
}

/**
 * Que eligio el coach en el eje lacteo. 'mixed' = eligio distinto en distintas franjas
 * (la eleccion es por (VARIANTE, franja), ver `ClConversionInput.dairyChoiceBySlot`).
 */
export type PortionDairyChoice = ClDairyCode | 'mixed'

/** Lo que la superficie sabe del aplicado, en camelCase. */
export type PortionConversionAppliedProps = {
  readonly slots: number
  readonly rows: number
  /** QUE eligio, nunca cuanto. */
  readonly dairyChoice: PortionDairyChoice
  /** Cuantos grupos PROPIOS reemplazo (S5). Conteo, sin ids ni nombres. */
  readonly customReplaced: number
}

/** Payload del aplicado. EXHAUSTIVO: estas 5 llaves y ninguna mas (DATA.md §11, evento 3). */
export type PortionConversionAppliedPayload = {
  surface: PortionSurface
  slots: number
  rows: number
  dairy_choice: PortionDairyChoice
  custom_replaced: number
}

export function conversionAppliedPayload(
  surface: PortionSurface,
  props: PortionConversionAppliedProps,
): PortionConversionAppliedPayload {
  return {
    surface,
    slots: props.slots,
    rows: props.rows,
    dairy_choice: props.dairyChoice,
    custom_replaced: props.customReplaced,
  }
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

/**
 * 5. El ALUMNO abre el sheet «1 porcion equivale a» (D4-A, W5.9).
 *
 * SIN `group_code`, y es el unico de los cinco al que le falta (DATA §11, fix S-07): los otros
 * cuatro los dispara el COACH sobre su herramienta de trabajo, donde 'PCT' es jerga de dominio;
 * este lo dispara el cliente del ALUMNO, y ahi el codigo del grupo es su PAUTA NUTRICIONAL atada
 * a su `distinct_id`. Si mañana hace falta saber en que grupo se abre mas el sheet, se mide desde
 * el lado del coach, no agregandole `group_code` a este evento.
 *
 * Se emite UNA vez por APERTURA, no por cambio de tab de grupo dentro del sheet: sin `group_code`
 * el segundo evento no aportaria nada y solo multiplicaria el ruido. El guard es de la superficie.
 */
export const PORTIONS_EVENT_EQUIVALENCES_OPENED = 'nutrition_equivalences_opened'

/**
 * TRAMO de filas de la lista, jamas el numero: «cuantas equivalencias vio» con precision de a uno
 * es, sumado al `distinct_id`, una huella de la pauta del alumno. El tope es 31-60 porque el RPC
 * corta en 60 (`where ranked.rn <= 60`).
 */
export type PortionRowsBucket = '0' | '1-10' | '11-30' | '31-60'

/**
 * Los tramos se calculan ACA y no en cada componente (DATA §11, «reglas de implementacion»): con
 * un helper por superficie, web y RN terminan con cortes distintos y el embudo compara peras con
 * manzanas. Negativos y no-finitos caen en '0'; > 60 se clampea al ultimo tramo.
 */
export function portionRowsBucket(rows: number): PortionRowsBucket {
  if (!Number.isFinite(rows) || rows <= 0) return '0'
  if (rows <= 10) return '1-10'
  if (rows <= 30) return '11-30'
  return '31-60'
}

/** Lo que la superficie sabe de la apertura, en camelCase; el snake_case lo pone el payload. */
export type PortionEquivalencesOpenedProps = {
  /** Set de porciones del grupo abierto: chileno o SMAE. NO es el codigo del grupo. */
  readonly set: PortionSystem
  /** ¿La lista trae al menos un generico? Es la metrica de D4-A. */
  readonly hasGeneric: boolean
  /** CONTEO crudo de filas; el payload lo convierte en TRAMO y el numero no sale de aca. */
  readonly rows: number
}

/**
 * Payload de la apertura. EXHAUSTIVO: estas 4 llaves y ninguna mas (TASKS W5.9 + instruccion del
 * jefe en W5). DATA §11 dibuja ademas `has_photos` y `searched`; quedaron FUERA del contrato de
 * esta wave — si se agregan, se agregan aca y en las dos superficies a la vez, nunca con un spread
 * en el componente.
 */
export type PortionEquivalencesOpenedPayload = {
  surface: PortionSurface
  set: PortionSystem
  has_generic: boolean
  rows_bucket: PortionRowsBucket
}

export function equivalencesOpenedPayload(
  surface: PortionSurface,
  props: PortionEquivalencesOpenedProps,
): PortionEquivalencesOpenedPayload {
  return {
    surface,
    set: props.set,
    has_generic: props.hasGeneric,
    rows_bucket: portionRowsBucket(props.rows),
  }
}
