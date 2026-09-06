/**
 * plausibility — «¿seguro que son 30 unidades?»: umbrales y copys del aviso de cantidad poco
 * plausible (W1.3 del tren «Cantidades honestas», decision D7 del owner del 06-09).
 *
 * Por que existe: hasta hoy los unicos topes eran la meta del dia (12.000 kcal) y los
 * reemplazos (`SUBSTITUTION_MAX_*`, ./substitution-intake.ts:41). Un ITEM podia salir
 * publicado con 4.470 kcal («Huevo revuelto 30 un» = 30 porciones de 100 g) sin que nada lo
 * mirara. Este modulo es la UNICA casa de esos numeros magicos — mismo criterio que
 * `substitution-intake` — para que web y RN, editor y wizard, avisen con el MISMO umbral.
 *
 * Regla dura del tren (SPEC §2): esto AVISA, no bloquea, y no reinterpreta nada publicado.
 * Ningun consumidor puede cambiar la cantidad ni las kcal a partir de lo que devuelve.
 *
 * Base empirica de los umbrales (LIVE 06-09): p99 de kcal por item activo = 395 kcal; el mayor
 * item legitimo del catalogo de planes es «Comida libre» con 600 kcal.
 *
 * Modulo PURO: sin React, sin Zod, sin red.
 */

import { formatNutritionAmount, formatNutritionCalories } from './design'
import { HOUSEHOLD_UNIT, foodMagnitudeUnit, isMassIntakeUnit, normalizeIntakeUnit } from './intake-units'

/** Un item que resuelve a mas de esto en gramos/ml es sospechoso (D7 a). */
export const IMPLAUSIBLE_ITEM_MAX_GRAMS = 600
/** Un item que suma mas de esto en kcal es sospechoso (D7 a). */
export const IMPLAUSIBLE_ITEM_MAX_KCAL = 700
/** El dia prescrito por encima de esta proporcion de su meta es sospechoso (D7 a). */
export const IMPLAUSIBLE_DAY_TARGET_RATIO = 1.5
/** Lo CONSUMIDO por encima de esta proporcion de la meta dispara alerta al coach (D7 a, W4.2). */
export const COACH_ALERT_CONSUMED_RATIO = 2

/** Por que un item se marco como poco plausible. Los dos motivos son independientes. */
export type ImplausibleReason = 'grams' | 'kcal'

/**
 * Superficie donde se mostro el aviso. Vocabulario del evento PostHog
 * `nutrition_item_implausible` (SPEC §4.6); vive aca para que web y RN no lo escriban dos veces.
 */
export type ImplausibleSurface = 'editor' | 'wizard' | 'publish' | 'today'

/** Motivo tal como viaja al evento: los del item mas `day` (aviso del dia completo). */
export type ImplausibleEventReason = ImplausibleReason | 'day'

/**
 * Tramo de kcal reportado al evento. Se manda el TRAMO y nunca la cifra exacta: las kcal de un
 * plan son dato de salud (Ley 21.719) y el bucket alcanza para decidir W2.
 */
export type KcalBucket = '700-1000' | '1000-2000' | '2000-5000' | '5000+'

export interface ItemGramsInput {
  quantity: number
  unit: string | null | undefined
  /** `serving_size` del catalogo, SIEMPRE en g/ml. */
  servingSize: number | null | undefined
  /** Gramos de la medida casera del alimento (W2). Ausente = el alimento no tiene. */
  householdGrams?: number | null
}

export interface ItemPlausibility {
  implausible: boolean
  reasons: ImplausibleReason[]
  /** Gramos/ml resultantes, o `null` cuando la unidad no permite calcularlos. */
  grams: number | null
  calories: number
}

export interface DayPlausibility {
  implausible: boolean
  /** prescrito / meta, o `null` cuando el dia no tiene meta con que comparar. */
  ratio: number | null
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Cuantos gramos (o ml) termina siendo el item.
 *
 *   g | ml  ⇒ la cantidad misma
 *   un      ⇒ cantidad x `servingSize` (es la trampa del tren: "1 un" son 100 g, no 1 g)
 *   casera  ⇒ cantidad x `householdGrams` (W2)
 *   porción ⇒ `null`: sus macros son las del grupo de intercambio, no hay gramaje que mirar
 *
 * `null` tambien cuando falta el dato con que multiplicar: mejor sin numero que con uno
 * inventado — el motivo `kcal` sigue cubriendo el caso absurdo.
 */
export function itemResultingGrams(input: ItemGramsInput): number | null {
  const { quantity } = input
  if (!Number.isFinite(quantity)) return null

  // `casera` no es un codigo de intake (nunca se persiste): se compara literal, ver intake-units.
  if (String(input.unit ?? '').trim().toLowerCase() === HOUSEHOLD_UNIT) {
    const householdGrams = positiveOrNull(input.householdGrams)
    return householdGrams === null ? null : quantity * householdGrams
  }

  const unit = normalizeIntakeUnit(input.unit)
  if (unit === null) return null
  if (isMassIntakeUnit(unit)) return quantity
  if (unit === 'un') {
    const servingSize = positiveOrNull(input.servingSize)
    return servingSize === null ? null : quantity * servingSize
  }
  return null
}

/**
 * Diagnostico de un item. `implausible` es la OR de los dos motivos, y los umbrales son
 * estrictos: 600 g y 700 kcal exactos siguen siendo plausibles (el «Comida libre» de 600 kcal
 * del catalogo real no puede quedar marcado).
 */
export function assessItemPlausibility(
  input: ItemGramsInput & { calories: number | null | undefined },
): ItemPlausibility {
  const grams = itemResultingGrams(input)
  const calories = finiteOrZero(input.calories)
  const reasons: ImplausibleReason[] = []
  if (grams !== null && grams > IMPLAUSIBLE_ITEM_MAX_GRAMS) reasons.push('grams')
  if (calories > IMPLAUSIBLE_ITEM_MAX_KCAL) reasons.push('kcal')
  return { implausible: reasons.length > 0, reasons, grams, calories }
}

/**
 * Diagnostico del dia completo: lo PRESCRITO contra la meta del dia. Sin meta utilizable no hay
 * proporcion que calcular y el dia no se marca (un plan sin metas no es un plan sospechoso).
 */
export function assessDayPlausibility(input: {
  prescribedCalories: number
  targetCalories: number | null | undefined
}): DayPlausibility {
  const target = positiveOrNull(input.targetCalories)
  if (target === null) return { implausible: false, ratio: null }
  const ratio = finiteOrZero(input.prescribedCalories) / target
  return { implausible: ratio > IMPLAUSIBLE_DAY_TARGET_RATIO, ratio }
}

// ---------------------------------------------------------------------------
// Copys (es-CL: miles con punto, decimales con coma)
// ---------------------------------------------------------------------------

/**
 * Las magnitudes con unidad («650 g», «1,5 kg», «4.470 kcal») salen de los formateadores es-CL
 * que el paquete YA comparte con RN (`formatNutritionAmount` / `formatNutritionCalories`,
 * ./design.ts): una sola convencion de miles y decimales en todo Nutricion V2.
 *
 * Este helper cubre lo unico que no tiene casa: el numero SUELTO (la cantidad escrita, el
 * multiplicador «3,2×», la meta «1.556» sin unidad). Va envuelto igual que `formatIntakeClock`
 * (./today-entries.ts) porque es el unico call site NUEVO de `Intl` y se ejecuta justo en el
 * render de un AVISO: un runtime sin datos de locale (Hermes con ICU recortado en un binario
 * viejo) tumbaria la fila del item en vez de mostrar la advertencia. El fallback castellaniza a
 * mano (miles con punto, coma decimal) y nunca usa `String.prototype.normalize`.
 */
function formatEsClNumber(value: number, maximumFractionDigits: number): string {
  const safe = finiteOrZero(value)
  try {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits }).format(safe)
  } catch {
    const [whole, decimals] = safe.toFixed(maximumFractionDigits).split('.')
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const trimmed = (decimals ?? '').replace(/0+$/, '')
    return trimmed === '' ? grouped : `${grouped},${trimmed}`
  }
}

/** Magnitud real del alimento: un liquido se rotula en ml/l, todo lo demas en g/kg. */
function magnitudeLabels(servingUnit: string | null | undefined): { small: 'g' | 'ml'; big: string } {
  const small = foodMagnitudeUnit(servingUnit)
  return { small, big: small === 'ml' ? 'l' : 'kg' }
}

/** «650 g» hasta el kilo; de ahi «1,5 kg» — "3.000 g" no le dice nada a nadie. */
function formatResultingAmount(grams: number, servingUnit: string | null | undefined): string {
  const { small, big } = magnitudeLabels(servingUnit)
  if (Math.abs(grams) >= 1000) return formatNutritionAmount(grams / 1000, big, 1)
  return formatNutritionAmount(grams, small, 0)
}

/**
 * Una linea que le explica al coach POR QUE le estamos preguntando:
 *
 *   «¿Seguro? 30 un = 3 kg de huevo revuelto (1 un = 100 g)»
 *   «¿Seguro? 10 un = 2,5 l de leche (1 un = 250 ml)»   (la magnitud sale del alimento)
 *   «¿Seguro? 2 huevos = 122 g de huevo»                (medida casera: se rotula con SU etiqueta)
 *   «¿Seguro? 900 g de arroz cocido»                    (unidad de masa: el "=" seria redundante)
 *   «¿Seguro? Este ítem suma 4.470 kcal»                (sin gramaje: `porción` o alimento libre)
 *
 * La equivalencia entre parentesis solo aparece con unidad contable y porcion utilizable: es
 * justamente el dato que nadie decia (SPEC §1, causa 1).
 */
export function implausibleItemCopy(input: {
  quantity: number
  unit: string
  foodName: string
  grams: number | null
  calories: number
  servingSize: number | null
  /** `serving_unit` del alimento: decide si se rotula en g/kg o en ml/l. Ausente ⇒ solido. */
  servingUnit?: string | null
  /** Etiqueta de la medida casera ("huevos", "taza"). La alimenta W2; sin ella no se nombra. */
  householdLabel?: string | null
}): string {
  const { grams, unit, foodName } = input
  // Sin gramaje resoluble solo se puede hablar de kcal — y es justo el caso del item libre.
  const kcalOnly = `¿Seguro? Este ítem suma ${formatNutritionCalories(finiteOrZero(input.calories))}`
  if (grams === null) return kcalOnly

  const quantity = formatEsClNumber(input.quantity, 1)
  const amount = formatResultingAmount(grams, input.servingUnit)

  if (String(unit ?? '').trim().toLowerCase() === HOUSEHOLD_UNIT) {
    // `casera` es un codigo interno: mostrarlo ("2 casera") seria peor que no decir nada.
    const label = input.householdLabel?.trim()
    if (!label) return kcalOnly
    return `¿Seguro? ${quantity} ${label} = ${amount} de ${foodName}`
  }

  const normalized = normalizeIntakeUnit(unit)
  if (normalized !== null && isMassIntakeUnit(normalized)) return `¿Seguro? ${quantity} ${unit} de ${foodName}`

  const servingSize = positiveOrNull(input.servingSize)
  const equivalence =
    normalized === 'un' && servingSize !== null
      ? ` (1 un = ${formatNutritionAmount(servingSize, magnitudeLabels(input.servingUnit).small, 0)})`
      : ''
  return `¿Seguro? ${quantity} ${unit} = ${amount} de ${foodName}${equivalence}`
}

/** «El día suma 4.906 kcal, 3,2× la meta de 1.556». */
export function implausibleDayCopy(input: {
  prescribedCalories: number
  targetCalories: number
  ratio: number
}): string {
  const prescribed = formatNutritionCalories(finiteOrZero(input.prescribedCalories))
  const target = formatEsClNumber(input.targetCalories, 0)
  const ratio = formatEsClNumber(input.ratio, 1)
  return `El día suma ${prescribed}, ${ratio}× la meta de ${target}`
}

/**
 * Rotulo honesto de la unidad contable bajo el selector: «1 un = 100 g» (W1.2, SPEC §4.2).
 * `null` cuando no hay nada que aclarar (la unidad no es `un`, o el alimento no tiene porcion).
 * Es LO que nadie decia: en el 96 % del catalogo «1 un» son 100 g, no una pieza.
 */
export function unitEquivalenceCaption(input: {
  unit: string
  servingSize: number | null | undefined
  servingUnit?: string | null
}): string | null {
  if (normalizeIntakeUnit(input.unit) !== 'un') return null
  const servingSize = positiveOrNull(input.servingSize)
  if (servingSize === null) return null
  return `1 un = ${formatNutritionAmount(servingSize, magnitudeLabels(input.servingUnit).small, 0)}`
}

/**
 * Etiqueta de la accion «keep the number» del aviso: «Cambiar a 30 g» (mockup M1). La premisa es
 * que el numero estaba bien y la unidad no, asi que la cifra se repite TAL CUAL y solo cambia la
 * magnitud — por eso despacha `REINTERPRET_ITEM_UNIT` y no `SET_ITEM_UNIT`.
 */
export function reinterpretUnitActionLabel(input: {
  quantity: number
  servingUnit?: string | null
}): string {
  return `Cambiar a ${formatEsClNumber(input.quantity, 1)} ${foodMagnitudeUnit(input.servingUnit)}`
}

/**
 * Etiqueta de la SEGUNDA accion del aviso, la de W2.5: «Usar huevos». La premisa es la opuesta a
 * `reinterpretUnitActionLabel` — no es que la unidad estuviera mal escrita, es que el coach
 * queria hablar en medidas caseras y el catalogo por fin sabe cuanto pesa una.
 *
 * `null` cuando el alimento no tiene etiqueta casera: sin nombre no hay boton que ofrecer.
 *
 * ⚠️ Se llama `householdUnitActionLabel` y no `useHousehold…` (que seria el nombre natural del
 * copy «Usar…»): el prefijo `use` lo convierte en un HOOK para `react-hooks/rules-of-hooks`, y
 * las filas del editor lo invocan dentro de condicionales.
 */
export function householdUnitActionLabel(householdLabel: string | null | undefined): string | null {
  const label = (householdLabel ?? '').trim()
  return label.length === 0 ? null : `Usar ${label}`
}

/**
 * Diferencia relativa a partir de la cual «1 un» y la medida casera cuentan como DOS cosas
 * distintas (SPEC §5.5, decision D3 a). 30 %: «1 un = 100 g» contra «1 huevo = 61 g» entra;
 * «1 un = 100 g» contra «1 taza = 90 g» no vale la pena marcarla.
 */
export const UNIT_REVIEW_DRIFT_RATIO = 0.3

export interface UnitReviewInput {
  /** Unidad VIGENTE del item del plan. */
  unit: string | null | undefined
  /** `serving_unit` del alimento: decide si el alimento es REALMENTE contable. */
  servingUnit: string | null | undefined
  /** `serving_size` del catalogo, SIEMPRE en g/ml: cuanto pesa «1 un» aca. */
  servingSize: number | null | undefined
  /** Gramos de la medida casera del alimento (o del par congelado en el item). */
  householdGrams: number | null | undefined
}

/**
 * ¿Este item merece el badge «Revisar unidad»? (W2.5, SPEC §5.5). Marca el caso exacto del tren:
 * el coach escribio `un` creyendo «una pieza», el alimento NO es contable (su «1 un» son en
 * realidad `servingSize` gramos) y el catalogo sabe que una pieza de verdad pesa bastante otra
 * cosa. Es el «pan pita 60 un = 9.576 kcal» y el «huevo revuelto 30 un».
 *
 * AVISA, no reescribe: ningun plan se toca por esto (regla dura del tren, SPEC §2). Lo que
 * ofrece la fila al lado del badge es la accion «Usar {medida}», que decide el coach.
 */
export function shouldFlagUnitReview(input: UnitReviewInput): boolean {
  if (normalizeIntakeUnit(input.unit) !== 'un') return false
  // Alimento nativo `un` (huevo vendido por pieza): ahi «1 un» YA es una pieza y no hay nada raro.
  if (normalizeIntakeUnit(input.servingUnit) === 'un') return false
  const servingSize = positiveOrNull(input.servingSize)
  const householdGrams = positiveOrNull(input.householdGrams)
  if (servingSize === null || householdGrams === null) return false
  return Math.abs(householdGrams - servingSize) / servingSize > UNIT_REVIEW_DRIFT_RATIO
}

/**
 * Tooltip del badge: «Acá 1 un = 100 g; 1 huevo del catálogo = 61 g». Dice las DOS cifras porque
 * el punto es que no coinciden — nombrar solo una deja al coach adivinando cual es cual.
 */
export function unitReviewHint(input: {
  servingSize: number
  householdGrams: number
  householdLabel: string
  servingUnit?: string | null
}): string {
  const { small } = magnitudeLabels(input.servingUnit)
  const here = formatNutritionAmount(input.servingSize, small, 0)
  const catalog = formatNutritionAmount(input.householdGrams, small, 0)
  return `Acá 1 un = ${here}; 1 ${input.householdLabel.trim()} del catálogo = ${catalog}`
}

/** Texto del badge de W2.5, en una sola casa para que web y RN digan lo mismo. */
export const UNIT_REVIEW_BADGE_LABEL = 'Revisar unidad'

/** «2 ítems con cantidades poco plausibles» — el resumen del dia en la barra de publicar. */
export function implausibleItemCountCopy(count: number): string {
  return count === 1 ? '1 ítem con una cantidad poco plausible' : `${count} ítems con cantidades poco plausibles`
}

/**
 * El aviso del DIA, ya armado, para la barra de publicar y las barras de totales (editor unico y
 * los dos wizards). `null` = no hay nada que decir y no se pinta nada.
 *
 * Une las dos senales con « · » porque son independientes: el dia puede pasarse de la meta sin
 * ningun item raro (muchas porciones chicas) y puede tener un item absurdo sin pasarse (dia sin
 * meta). Vive aca y no en cada barra para que las cuatro superficies digan LO MISMO.
 */
export function dayWarningCopy(input: {
  prescribedCalories: number
  targetCalories: number | null | undefined
  implausibleItemCount: number
}): string | null {
  const parts: string[] = []
  const day = assessDayPlausibility(input)
  if (day.implausible && day.ratio !== null) {
    parts.push(
      implausibleDayCopy({
        prescribedCalories: input.prescribedCalories,
        targetCalories: finiteOrZero(input.targetCalories),
        ratio: day.ratio,
      }),
    )
  }
  if (input.implausibleItemCount > 0) parts.push(implausibleItemCountCopy(input.implausibleItemCount))
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * Tramo de kcal para el evento. Los cortes son inclusivos por abajo (1.000 kcal cae en
 * `'1000-2000'`). Por debajo de 700 kcal el evento no se emite —no hay aviso que medir—, pero
 * la funcion es total y devuelve el tramo del piso.
 */
export function kcalBucket(calories: number): KcalBucket {
  const value = finiteOrZero(calories)
  if (value < 1000) return '700-1000'
  if (value < 2000) return '1000-2000'
  if (value < 5000) return '2000-5000'
  return '5000+'
}
