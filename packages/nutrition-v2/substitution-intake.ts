/**
 * substitution-intake — logica COMPARTIDA (web + RN, cliente y servidor) del registro de un
 * reemplazo autorizado por el coach. T2.4, SPEC `docs/specs/nutrition-substitution-intake/`.
 *
 * Por que existe: la fila de `nutrition_item_substitutions_v2` NO dice cuanto comer. En LIVE el
 * 100% de las filas tiene `quantity` NULL, y el snapshot congelado del reemplazo corresponde a UNA
 * PORCION DEL SUSTITUTO, no a lo prescrito: el item "Lomo liso 120 g / 240 kcal" ofrece
 * "Posta de vacuno cocida / 17 kcal". Registrar ese numero meteria el error en la adherencia.
 *
 * Este modulo calcula la cantidad equivalente en UN solo lugar, para que el numero que el alumno
 * ve antes de confirmar y el que se persiste sean el mismo por construccion — no por disciplina.
 *
 * Modulo puro: sin React, sin red, sin IO. Depende de `intake-normalize` (el factor de escala es
 * el espejo byte a byte del que aplica el servidor), de `intake-units` y de `zod` para el contrato
 * de lo UNICO que el cliente puede mandar.
 */

import { z } from 'zod'
import {
  intakeEntryFactor,
  scaleSnapshotMacros,
  type NutritionMacroTotalsLike,
  type NutritionMacrosBasis,
} from './intake-normalize'
import { normalizeIntakeUnit, isMassIntakeUnit, type NutritionIntakeUnit } from './intake-units'

/**
 * Topes de plausibilidad de la equivalencia calorica. Con datos reales de LIVE,
 * "Pechuga 100 g / 165 kcal → Espinaca (23 kcal/100 g)" da ~715 g de espinaca: aritmeticamente
 * correcto y humanamente absurdo. Pasados estos topes la opcion NO se registra de un tap: exige
 * que el alumno confirme la cantidad.
 *
 * Son topes ABSOLUTOS, no un factor sobre la porcion del sustituto. La razon la dio el propio
 * catalogo: "Posta de vacuno cocida" declara `serving_size = 30 g`, asi que un factor sobre la
 * porcion habria marcado como absurdos 130 g de carne — que es exactamente la equivalencia
 * correcta del item "Lomo liso 120 g". El limite util es cuanto alimento se come de una sentada,
 * no cuantas porciones nominales son.
 *
 * Son los unicos numeros magicos de la feature y por eso viven aca, con nombre.
 */
export const SUBSTITUTION_MAX_MASS_QUANTITY = 600
export const SUBSTITUTION_MAX_COUNTED_QUANTITY = 6

/** Escalon de redondeo de la cantidad calculada, por familia de unidad. */
const MASS_STEP = 5
const COUNTED_STEP = 0.5

/** Item prescrito que se esta sustituyendo, tal como lo expone el read-model del Today. */
export interface SubstitutionPrescribedItem {
  quantity: number
  unit: string
  /**
   * kcal TOTALES de la cantidad prescrita (el read-model congela totales, ver
   * `intake-normalize`). Es el objetivo que la equivalencia intenta igualar.
   */
  calories: number | null
  /**
   * Macros TOTALES de la cantidad prescrita. Opcionales: la RPC de opciones de T2.4 solo expone
   * `calories`, asi que hasta que F2 los agregue el delta degrada a comparar kcal (ver
   * `describeSubstitutionDelta`).
   */
  proteinG?: number | null
  carbsG?: number | null
  fatsG?: number | null
}

/**
 * Reemplazo autorizado, ya resuelto contra el catalogo VIGENTE con el override del coach aplicado
 * (`resolveFoodMacros` de `./food-overrides`). Nunca se usan los `snapshot_*` congelados de la
 * fila para decidir cantidades: son los que producen el "17 kcal".
 */
export interface SubstitutionSubstitute {
  foodId: string | null
  customName: string | null
  name: string
  brand: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  fiberG: number | null
  macrosBasis: NutritionMacrosBasis | null
  servingSize: number | null
  servingUnit: string | null
  /** Instruccion explicita del coach en la fila (`quantity`/`unit`). NULL = "resolvelo vos". */
  quantity: number | null
  unit: string | null
}

/**
 * Como se llego a la cantidad:
 *
 *  - `explicit`            → el coach la escribio en la fila. Gana siempre, sin tope ni calculo.
 *  - `calorie-equivalent`  → calculada para igualar las kcal prescritas. Registra de un tap.
 *  - `needs-confirmation`  → calculada, pero supera el tope absoluto de su familia de unidad. NO
 *                            registra de un tap: la UI abre el stepper con este valor.
 *  - `unavailable`         → no hay con que calcular (sustituto sin kcal vigentes, item sin kcal
 *                            congeladas, unidad no escalable). La cantidad es la PORCION DEL
 *                            SUSTITUTO en su propia unidad — nunca la del item, que en otra
 *                            unidad no significa nada ("1 un de yogurt" ⇒ gramos de leche).
 */
export type SubstitutionEquivalenceKind =
  | 'explicit'
  | 'calorie-equivalent'
  | 'needs-confirmation'
  | 'unavailable'

/** Snapshot per-base listo para el RPC: misma forma que el payload de un intake de catalogo. */
export interface SubstitutionSnapshot {
  name: string
  brand: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  fiberG: number | null
  servingSize: number | null
  servingUnit: string | null
  macrosBasis?: NutritionMacrosBasis
}

export interface SubstitutionEquivalence {
  kind: SubstitutionEquivalenceKind
  /** Cantidad a registrar, ya redondeada al escalon de su unidad. Siempre > 0. */
  quantity: number
  unit: NutritionIntakeUnit
  /** Macros TOTALES de esa cantidad (lo que la UI muestra y el servidor va a reconstruir). */
  totals: NutritionMacroTotalsLike
  /** Snapshot per-base que viaja al RPC. */
  snapshot: SubstitutionSnapshot
  /** kcal que se intentaba igualar; `null` cuando el item no las tiene congeladas. */
  targetCalories: number | null
  /** `true` ⇒ la UI NO puede registrar de un tap (SPEC criterio 11). */
  requiresConfirmation: boolean
}

/**
 * Unidad natural del sustituto: la suya declarada si es una unidad de intake conocida, y `g` como
 * ultimo recurso. Nunca se hereda la unidad del ITEM: son alimentos distintos.
 */
export function substituteNaturalUnit(substitute: {
  servingUnit: string | null
}): NutritionIntakeUnit {
  return normalizeIntakeUnit(substitute.servingUnit) ?? 'g'
}

/**
 * Porcion de referencia del sustituto en su unidad natural: su `servingSize` para g/ml, 1 para
 * unidades contadas. Es el prellenado del caso `unavailable` (NO el tope de plausibilidad: ver
 * `SUBSTITUTION_MAX_MASS_QUANTITY`).
 */
export function substituteReferencePortion(substitute: {
  servingSize: number | null
  servingUnit: string | null
}): number {
  const unit = substituteNaturalUnit(substitute)
  if (!isMassIntakeUnit(unit)) return 1
  const size = substitute.servingSize
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 100
}

/** Redondea al escalon de la unidad, con piso en un escalon (nunca 0). */
export function roundSubstitutionQuantity(quantity: number, unit: NutritionIntakeUnit): number {
  const step = isMassIntakeUnit(unit) ? MASS_STEP : COUNTED_STEP
  if (!Number.isFinite(quantity) || quantity <= 0) return step
  const rounded = Math.round(quantity / step) * step
  const safe = rounded > 0 ? rounded : step
  // El escalon de 0,5 arrastra error binario (0.1+0.2): se normaliza a 2 decimales.
  return Math.round(safe * 100) / 100
}

function snapshotFor(substitute: SubstitutionSubstitute): SubstitutionSnapshot {
  const snapshot: SubstitutionSnapshot = {
    name: substitute.name,
    brand: substitute.brand,
    calories: substitute.calories,
    proteinG: substitute.proteinG,
    carbsG: substitute.carbsG,
    fatsG: substitute.fatsG,
    fiberG: substitute.fiberG,
    servingSize: substitute.servingSize,
    servingUnit: substitute.servingUnit,
  }
  // `.optional()` SIN default en el contrato: una base ausente conserva la formula LEGADA en el
  // servidor. No se inventa `per_100` aca (mismo criterio que el resto del intake, NUT-001).
  if (substitute.macrosBasis != null) snapshot.macrosBasis = substitute.macrosBasis
  return snapshot
}

function totalsFor(
  substitute: SubstitutionSubstitute,
  quantity: number,
  unit: NutritionIntakeUnit,
): NutritionMacroTotalsLike {
  return scaleSnapshotMacros(
    {
      calories: substitute.calories,
      proteinG: substitute.proteinG,
      carbsG: substitute.carbsG,
      fatsG: substitute.fatsG,
      fiberG: substitute.fiberG,
      servingSize: substitute.servingSize,
    },
    {
      quantity,
      unit,
      servingSize: substitute.servingSize,
      basis: substitute.macrosBasis,
    },
  )
}

/**
 * kcal de UNA unidad del sustituto en la unidad dada. El factor del servidor es lineal en la
 * cantidad en sus tres regimenes (`per_100`, `per_serving`, legado), asi que evaluarlo en 1 y
 * multiplicar reproduce exactamente lo que va a persistir.
 */
function caloriesPerUnit(
  substitute: SubstitutionSubstitute,
  unit: NutritionIntakeUnit,
): number | null {
  const calories = substitute.calories
  if (calories === null || !Number.isFinite(calories) || calories <= 0) return null
  const factor = intakeEntryFactor({
    quantity: 1,
    unit,
    servingSize: substitute.servingSize,
    basis: substitute.macrosBasis,
  })
  if (!Number.isFinite(factor) || factor <= 0) return null
  const perUnit = calories * factor
  return Number.isFinite(perUnit) && perUnit > 0 ? perUnit : null
}

/**
 * Cantidad y macros con los que se registra un reemplazo autorizado (SPEC "Equivalencia").
 *
 * El orden de las reglas es deliberado: una instruccion explicita del coach gana antes de que se
 * calcule nada, y el tope de plausibilidad solo se aplica a lo CALCULADO — al coach no se le
 * discute la cantidad que escribio.
 */
export function computeSubstitutionEquivalence(input: {
  item: SubstitutionPrescribedItem
  substitute: SubstitutionSubstitute
}): SubstitutionEquivalence {
  const { item, substitute } = input
  const naturalUnit = substituteNaturalUnit(substitute)
  const snapshot = snapshotFor(substitute)
  const targetCalories =
    item.calories !== null && Number.isFinite(item.calories) && item.calories > 0
      ? item.calories
      : null

  // (1) Instruccion explicita del coach. `unit` puede venir NULL con `quantity` no nula (la tabla
  //     lo permite): cae a la unidad natural del sustituto, nunca a la del item.
  if (
    substitute.quantity !== null &&
    Number.isFinite(substitute.quantity) &&
    substitute.quantity > 0
  ) {
    const unit = normalizeIntakeUnit(substitute.unit) ?? naturalUnit
    const quantity = substitute.quantity
    return {
      kind: 'explicit',
      quantity,
      unit,
      totals: totalsFor(substitute, quantity, unit),
      snapshot,
      targetCalories,
      requiresConfirmation: false,
    }
  }

  const perUnit = caloriesPerUnit(substitute, naturalUnit)

  // (2) Sin con que calcular ⇒ porcion del SUSTITUTO y confirmacion obligatoria.
  if (perUnit === null || targetCalories === null) {
    const quantity = roundSubstitutionQuantity(
      substituteReferencePortion(substitute),
      naturalUnit,
    )
    return {
      kind: 'unavailable',
      quantity,
      unit: naturalUnit,
      totals: totalsFor(substitute, quantity, naturalUnit),
      snapshot,
      targetCalories,
      requiresConfirmation: true,
    }
  }

  // (3) Equivalencia calorica + tope de plausibilidad.
  const quantity = roundSubstitutionQuantity(targetCalories / perUnit, naturalUnit)
  const ceiling = isMassIntakeUnit(naturalUnit)
    ? SUBSTITUTION_MAX_MASS_QUANTITY
    : SUBSTITUTION_MAX_COUNTED_QUANTITY
  const implausible = quantity > ceiling

  return {
    kind: implausible ? 'needs-confirmation' : 'calorie-equivalent',
    quantity,
    unit: naturalUnit,
    totals: totalsFor(substitute, quantity, naturalUnit),
    snapshot,
    targetCalories,
    requiresConfirmation: implausible,
  }
}

// ---------------------------------------------------------------------------
// Delta legible de la opcion (T2.5, SPEC `nutrition-exchange-swap` — pin 3 del sheet)
// ---------------------------------------------------------------------------

/**
 * Umbral bajo el cual dos opciones se consideran caloricamente iguales. Por construccion la
 * equivalencia IGUALA las kcal, asi que la diferencia que queda es puro redondeo al escalon; se
 * separa del 4% del microcopy a proposito: el texto dice "mismas kcal" sin numero.
 */
const DELTA_CALORIE_TOLERANCE = 0.05
/** Gramos por debajo de los cuales un macro no merece renglon (ruido de redondeo). */
const DELTA_MACRO_MIN_GRAMS = 2

const DELTA_MACRO_LABELS = [
  ['proteinG', 'proteina'],
  ['carbsG', 'carbohidratos'],
  ['fatsG', 'grasas'],
] as const

function signed(value: number, suffix: string): string {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} ${suffix}`
}

/**
 * Texto de una linea que explica en que se diferencia la opcion del item prescrito.
 *
 * El orden de las reglas sigue lo que el alumno necesita saber, no lo que es facil de calcular:
 * si las kcal NO cuadran (cantidad explicita del coach, o redondeo grande en cantidades chicas),
 * eso es lo primero; si cuadran, lo informativo es el macro que se mueve; y si no se mueve nada,
 * "mismas kcal".
 *
 * Devuelve `null` cuando no hay con que comparar (item sin kcal congeladas): la UI no pinta pin.
 */
export function describeSubstitutionDelta(input: {
  item: SubstitutionPrescribedItem
  equivalence: SubstitutionEquivalence
}): string | null {
  const { item, equivalence } = input
  const target = equivalence.targetCalories
  if (target === null || !Number.isFinite(target) || target <= 0) return null

  const calories = equivalence.totals.calories
  if (calories === null || !Number.isFinite(calories)) return null

  const deltaCalories = calories - target
  if (Math.abs(deltaCalories) / target >= DELTA_CALORIE_TOLERANCE) {
    return signed(deltaCalories, 'kcal')
  }

  let worst: { delta: number; label: string } | null = null
  for (const [key, label] of DELTA_MACRO_LABELS) {
    const itemValue = item[key]
    const optionValue = equivalence.totals[key]
    if (typeof itemValue !== 'number' || !Number.isFinite(itemValue)) continue
    if (typeof optionValue !== 'number' || !Number.isFinite(optionValue)) continue
    const delta = optionValue - itemValue
    if (Math.abs(delta) < DELTA_MACRO_MIN_GRAMS) continue
    if (worst === null || Math.abs(delta) > Math.abs(worst.delta)) worst = { delta, label }
  }

  return worst === null ? 'mismas kcal' : signed(worst.delta, `g ${worst.label}`)
}

// ---------------------------------------------------------------------------
// Idempotencia por intencion (SPEC "Idempotencia por intencion")
// ---------------------------------------------------------------------------

/** Forma minima del read-model del Today que hace falta para contar la cadena de un item. */
export interface SubstitutionAttemptTodayLike {
  mealSlots: ReadonlyArray<{
    intakeItems: ReadonlyArray<{ prescriptionItemId: string | null }>
  }>
  unassignedIntake: ReadonlyArray<{ prescriptionItemId: string | null }>
}

/**
 * `attempt` de la clave de idempotencia: cuantas entries de HOY existen para ese item prescrito,
 * **en cualquier estado** (activa, corregida o retirada).
 *
 * Contar tambien las retiradas y las corregidas no es un detalle: el short-circuit de
 * `record_nutrition_intake_v2` NO filtra `entry_status`, asi que si la clave se repitiera despues
 * de un "deshacer" el servidor devolveria el id de la entry retirada sin escribir nada y el item
 * quedaria inconsumible el resto del dia. Y en un ciclo A→B→A la tercera intencion reusaria la
 * clave de la primera, con lo que la cadena de correcciones terminaria apuntandose a si misma.
 *
 * Se deriva del read-model que las dos UIs ya tienen en pantalla ⇒ es identico en web y RN, y un
 * reintento del MISMO gesto (sin refetch) produce la misma clave.
 */
export function substitutionAttemptFromToday(
  today: SubstitutionAttemptTodayLike,
  prescriptionItemId: string,
): number {
  let count = 0
  for (const slot of today.mealSlots) {
    for (const entry of slot.intakeItems) {
      if (entry.prescriptionItemId === prescriptionItemId) count += 1
    }
  }
  for (const entry of today.unassignedIntake) {
    if (entry.prescriptionItemId === prescriptionItemId) count += 1
  }
  return count
}

/**
 * Clave de idempotencia de la intencion "sustituir este item por este reemplazo, en este intento".
 *
 * A diferencia del resto de las claves de RN, **no lleva `deviceId`**: la intencion es la misma la
 * toque el alumno donde la toque, y con `deviceId` dos dispositivos escribirian dos veces el mismo
 * gesto. Es una excepcion deliberada a `buildNutritionIdempotencyKey`.
 */
export function substitutionIntakeIdempotencyKey(input: {
  localDate: string
  prescriptionItemId: string
  /** Fila autorizada por el coach. Excluyente con `groupFoodId`. */
  substitutionId?: string
  /** Alimento elegido del grupo de intercambio (T2.5). Excluyente con `substitutionId`. */
  groupFoodId?: string
  attempt: number
  /**
   * Gestos del MISMO item ya encolados sin red y todavia sin drenar. Se suma al `attempt`
   * porque offline no hay refetch del read-model: sin esto, el tercer gesto de un ciclo A→B→A
   * reusa la clave del primero y la cadena de correcciones termina apuntandose a si misma.
   */
  queuedAhead?: number
}): string {
  const { attempt, substitutionId, groupFoodId, queuedAhead = 0 } = input
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('substitutionIntakeIdempotencyKey: attempt debe ser entero >= 0')
  }
  if (!Number.isInteger(queuedAhead) || queuedAhead < 0) {
    throw new Error('substitutionIntakeIdempotencyKey: queuedAhead debe ser entero >= 0')
  }
  const token = substitutionIntentToken({ substitutionId, groupFoodId })
  return `subst-${input.localDate}-${input.prescriptionItemId}-${token}-a${attempt + queuedAhead}`
}

/**
 * Prefijo del alimento de grupo dentro de la clave. Existe para que los dos bloques del sheet
 * vivan en NAMESPACES DISJUNTOS: el mismo alimento elegido como reemplazo autorizado o como
 * equivalente del grupo son intenciones distintas y no deben compartir historial de intentos.
 */
export const SUBSTITUTION_GROUP_KEY_PREFIX = 'gf-'

/** Token que ocupa el slot de la intencion en la clave. Exactamente uno de los dos ids. */
export function substitutionIntentToken(input: {
  substitutionId?: string
  groupFoodId?: string
}): string {
  const hasSubstitution = typeof input.substitutionId === 'string' && input.substitutionId.length > 0
  const hasGroupFood = typeof input.groupFoodId === 'string' && input.groupFoodId.length > 0
  if (hasSubstitution === hasGroupFood) {
    throw new Error(
      'substitutionIntentToken: se requiere exactamente uno de substitutionId | groupFoodId',
    )
  }
  return hasSubstitution
    ? (input.substitutionId as string)
    : `${SUBSTITUTION_GROUP_KEY_PREFIX}${input.groupFoodId as string}`
}

// ---------------------------------------------------------------------------
// Contrato del gesto (SPEC "Autorizacion" — capa boundary)
// ---------------------------------------------------------------------------

/**
 * Lo UNICO que el cliente puede mandar para sustituir. Deliberadamente NO incluye `foodId`,
 * macros ni snapshot: el servidor los resuelve desde la fila autorizada. Si el cliente pudiera
 * elegir el alimento, la validacion server-side no significaria nada.
 *
 * `quantity` es opcional y solo se honra dentro de `canAdjustPrescribedQuantity` +
 * `quantityAdjustmentPercent`, medido contra la cantidad EQUIVALENTE (no contra la prescrita del
 * otro alimento, que puede estar en otra unidad).
 */
export const SubstitutionIntakeRequestSchema = z.object({
  clientId: z.string().uuid(),
  localDate: z.string().date(),
  occurredAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(80),
  prescriptionItemId: z.string().uuid(),
  substitutionId: z.string().uuid(),
  /** Ver `substitutionAttemptFromToday`: se deriva del read-model, no de un contador local. */
  attempt: z.number().int().min(0).max(999),
  quantity: z.number().positive().nullable().default(null),
})

export type SubstitutionIntakeRequest = z.infer<typeof SubstitutionIntakeRequestSchema>

/**
 * Contrato de lo que devuelve `get_nutrition_substitution_options_v2` (migracion
 * `20260809222811`). Vive aca y no en `read-models.ts` porque solo lo consume este flujo.
 *
 * Tolerante a propositos: `food` es `null` cuando el reemplazo es texto libre o receta (no hay
 * catalogo que leer) y el flujo degrada a "confirma la cantidad" en vez de inventar una.
 */
export const SubstitutionOptionFoodSchema = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  calories: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatsG: z.number().nullable(),
  fiberG: z.number().nullable(),
  macrosBasis: z.enum(['per_100', 'per_serving']).nullable(),
  servingSize: z.number().nullable(),
  servingUnit: z.string().nullable(),
  hasOverride: z.boolean(),
})

export const SubstitutionOptionSchema = z.object({
  /**
   * En que bloque del sheet va la opcion (T2.5). `.default('coach')` NO es decoracion: F0 viaja
   * antes que F2, asi que durante esa ventana la RPC desplegada no emite el campo y el contrato
   * tiene que seguir parseando. Por la misma razon `schemaVersion` sigue en 1.
   */
  origin: z.enum(['coach', 'group']).default('coach'),
  substitutionId: z.string().uuid(),
  foodId: z.string().uuid().nullable(),
  recipeId: z.string().uuid().nullable(),
  customName: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  food: SubstitutionOptionFoodSchema.nullable(),
  frozen: z.object({
    name: z.string().nullable(),
    brand: z.string().nullable(),
    calories: z.number().nullable(),
  }),
})

/**
 * Opcion del bloque grupo (T2.5). Misma forma que la del coach salvo por `substitutionId`, que
 * es `null` porque no hay fila que la respalde: la autoriza la pertenencia al grupo, validada en
 * el servidor. Se mantiene estructuralmente compatible a proposito, para que
 * `substituteFromOption` y la equivalencia funcionen sobre las dos sin ramas.
 */
export const SubstitutionGroupOptionSchema = SubstitutionOptionSchema.extend({
  origin: z.literal('group').default('group'),
  substitutionId: z.string().uuid().nullable(),
  foodId: z.string().uuid(),
})

export const SubstitutionGroupSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
})

export const SubstitutionOptionsItemSchema = z.object({
  prescriptionItemId: z.string().uuid(),
  mealSlotCode: z.string().nullable(),
  item: z.object({
    quantity: z.number(),
    unit: z.string(),
    name: z.string().nullable(),
    calories: z.number().nullable(),
    // Opcionales por la misma ventana F0→F2 que `origin`: sin ellos el delta compara solo kcal.
    proteinG: z.number().nullable().optional(),
    carbsG: z.number().nullable().optional(),
    fatsG: z.number().nullable().optional(),
  }),
  options: z.array(SubstitutionOptionSchema),
  /**
   * Grupo de intercambio del alimento prescrito. `null` ⇒ el item no tiene equivalentes y la UI
   * no ofrece ⇄ (D2). Los tres campos llevan default para que los fixtures y las respuestas de
   * T2.4 sigan parseando.
   */
  group: SubstitutionGroupSchema.nullable().default(null),
  /** Cuantos equivalentes hay en total, para el "de N" del sheet. */
  groupTotal: z.number().int().nonnegative().default(0),
  /** Pagina del bloque grupo. Solo viaja para el item que el sheet abrio. */
  groupOptions: z.array(SubstitutionGroupOptionSchema).default([]),
})

export const SubstitutionOptionsReadModelSchema = z.object({
  schemaVersion: z.literal(1),
  localDate: z.string().date(),
  versionId: z.string().uuid().nullable(),
  items: z.array(SubstitutionOptionsItemSchema),
})

export type SubstitutionOptionFood = z.infer<typeof SubstitutionOptionFoodSchema>
export type SubstitutionOption = z.infer<typeof SubstitutionOptionSchema>
export type SubstitutionGroupOption = z.infer<typeof SubstitutionGroupOptionSchema>
export type SubstitutionGroup = z.infer<typeof SubstitutionGroupSchema>
/** Lo que el sheet puede ofrecer: una fila del coach o un equivalente del grupo. */
export type SubstitutionAnyOption = SubstitutionOption | SubstitutionGroupOption
export type SubstitutionOptionsItem = z.infer<typeof SubstitutionOptionsItemSchema>
export type SubstitutionOptionsReadModel = z.infer<typeof SubstitutionOptionsReadModelSchema>

/**
 * Adapta una opcion del read model a la forma que consume `computeSubstitutionEquivalence`.
 * Un reemplazo sin `food` (texto libre / receta) queda sin macros ⇒ la equivalencia devuelve
 * `unavailable` y la UI pide confirmar la cantidad.
 */
export function substituteFromOption(option: SubstitutionAnyOption): SubstitutionSubstitute {
  const food = option.food
  return {
    foodId: option.foodId,
    customName: option.customName,
    name: food?.name ?? option.customName ?? option.frozen.name ?? 'Reemplazo',
    brand: food?.brand ?? option.frozen.brand ?? null,
    calories: food?.calories ?? null,
    proteinG: food?.proteinG ?? null,
    carbsG: food?.carbsG ?? null,
    fatsG: food?.fatsG ?? null,
    fiberG: food?.fiberG ?? null,
    macrosBasis: food?.macrosBasis ?? null,
    servingSize: food?.servingSize ?? null,
    servingUnit: food?.servingUnit ?? null,
    quantity: option.quantity,
    unit: option.unit,
  }
}
