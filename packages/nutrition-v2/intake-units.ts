/**
 * intake-units — vocabulario CANONICO de unidades de un registro de consumo V2, compartido por
 * web y RN (y espejado por el factor SQL `private.nutrition_v2_entry_factor`).
 *
 * Por que existe (NUT-017): las 4 superficies de registro ofrecian
 * `[servingUnit, 'g', 'ml', 'porción', 'unidad']` y el `<select>`/chip de unidad solo llamaba
 * `setUnit(...)`, sin tocar la cantidad. Con un alimento de 155 kcal/100 g y porcion 60 g, dejar
 * "100" en el campo y cambiar la unidad a `unidad` persistia `100 x macros` — 15.500 kcal en un
 * solo registro, sin preview ni tope server-side. Ademas el vocabulario driftaba: la UI mandaba
 * `'unidad'` y el motor canonico entiende `'un'` (packages/nutrition-engine/macros.ts:111,124),
 * asi que la MISMA fila se leia con una formula en V2 y con otra en las superficies V1.
 *
 * Reglas del modulo:
 *  - `un` es el codigo canonico de la unidad contable; "unidad" es SOLO una etiqueta de UI.
 *  - `porción` pertenece al sintetico de porciones/intercambios (p_unit = 'porción' con
 *    servingSize null a proposito, ver intake.actions.ts:495-560). NO se ofrece al registrar un
 *    alimento del catalogo: ahi duplicaria a `un` y no tiene semantica propia.
 *  - `serving_size` de `public.foods` SIEMPRE esta en g/ml (el `serving_unit` es una etiqueta),
 *    por eso la conversion contable es `qty / servingSize` y su inversa.
 *
 * Modulo PURO: sin React, sin Zod, sin red. Evita `String.prototype.normalize` a proposito
 * (soporte debil en Hermes, misma razon por la que `./conversion` no entra al barrel).
 */

/** Unidades aceptadas en una escritura de intake V2 (codigos canonicos, 1:1 con el factor SQL). */
export const NUTRITION_INTAKE_UNITS = ['g', 'ml', 'un', 'porción'] as const
export type NutritionIntakeUnit = (typeof NUTRITION_INTAKE_UNITS)[number]

/**
 * Vocabulario PERSISTIBLE de un registro libre sobre un alimento del catalogo. `porción` queda
 * fuera: es la unidad del intake sintetico de intercambios, no una eleccion del alumno sobre un
 * alimento del catalogo. Que unidades se OFRECEN en pantalla ya no sale de aqui sino de
 * `foodUnitOptions(food)` (W2.1): depende del alimento, no del vocabulario.
 */
export const NUTRITION_CATALOG_UNITS = ['g', 'ml', 'un'] as const
export type NutritionCatalogUnit = (typeof NUTRITION_CATALOG_UNITS)[number]

/**
 * Codigo de la MEDIDA CASERA ("2 huevos", "1 taza") dentro del editor y del borrador
 * (tren «Cantidades honestas», SPEC §5.1). Vive FUERA de `NUTRITION_INTAKE_UNITS` a proposito:
 * jamas se persiste en `unit` ni viaja a una escritura de intake — al publicar se traduce a
 * `quantity = count x household_grams` con `unit = 'g' | 'ml'` y la medida congelada aparte.
 * Por eso tampoco entra en `UNIT_SYNONYMS`: `normalizeIntakeUnit('casera')` es `null`, y quien
 * necesite reconocerla compara contra ESTA constante (hoy `itemResultingGrams`, ./plausibility).
 * Se declara en W1 aunque el modelo casero llegue en W2: un solo literal, una sola casa.
 */
export const HOUSEHOLD_UNIT = 'casera'

/**
 * Sinonimos aceptados en la entrada (UI historica, planes convertidos de V1, unidades tipeadas
 * por el coach). Todo lo que no este aqui NO es una unidad valida para una escritura nueva.
 */
const UNIT_SYNONYMS: Readonly<Record<string, NutritionIntakeUnit>> = {
  g: 'g',
  gr: 'g',
  grs: 'g',
  grm: 'g',
  gramo: 'g',
  gramos: 'g',
  ml: 'ml',
  mls: 'ml',
  cc: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  un: 'un',
  u: 'un',
  ud: 'un',
  uds: 'un',
  und: 'un',
  unid: 'un',
  unit: 'un',
  units: 'un',
  unidad: 'un',
  unidades: 'un',
  pieza: 'un',
  piezas: 'un',
  'porción': 'porción',
  'porciónes': 'porción',
  porcion: 'porción',
  porciones: 'porción',
  serving: 'porción',
  servings: 'porción',
}

/** Minusculas + sin tildes, sin usar `String.prototype.normalize` (Hermes). */
function foldUnit(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/\./g, '')
}

/**
 * Codigo canonico de una unidad escrita libremente, o `null` si no es una unidad soportada.
 * Es la UNICA puerta: contrato Zod, UI y conversiones la usan para no driftar.
 */
export function normalizeIntakeUnit(raw: string | null | undefined): NutritionIntakeUnit | null {
  if (raw === null || raw === undefined) return null
  const folded = foldUnit(String(raw))
  if (folded.length === 0) return null
  return UNIT_SYNONYMS[folded] ?? null
}

/** Etiqueta que ve el alumno para un codigo canonico ("un" se muestra como "unidad"). */
export function intakeUnitLabel(unit: NutritionIntakeUnit): string {
  if (unit === 'un') return 'unidad'
  return unit
}

/** True si la unidad escala proporcionalmente a la base per-100 (g y ml son intercambiables ahi). */
export function isMassIntakeUnit(unit: NutritionIntakeUnit): boolean {
  return unit === 'g' || unit === 'ml'
}

/**
 * Magnitud REAL de un alimento a partir de su `serving_unit`: un liquido se mide en ml y todo
 * lo demas en g. Un `serving_unit` contable (`un`) no es una magnitud — su `serving_size` igual
 * esta en gramos —, asi que cae al lado solido, mismo criterio que `foodUnitOptions`.
 * La usan el rotulo «1 un = 100 g» y el aviso de plausibilidad (./plausibility.ts).
 */
export function foodMagnitudeUnit(servingUnit: string | null | undefined): 'g' | 'ml' {
  return normalizeIntakeUnit(servingUnit) === 'ml' ? 'ml' : 'g'
}

// ---------------------------------------------------------------------------
// Unidades POR ALIMENTO con medida casera (W2.1, tren «Cantidades honestas»)
// ---------------------------------------------------------------------------

/** Rango aceptable de gramos de una medida casera. Espeja los CHECK SQL (SPEC §5.4, R4). */
export const HOUSEHOLD_GRAMS_MIN = 1
export const HOUSEHOLD_GRAMS_MAX = 1000

/**
 * Una opcion del selector de unidad de un alimento. `label` es lo UNICO que se pinta («huevo ·
 * 61 g»); `code` es lo que viaja al estado. `grams` son los gramos que vale UNA de esas unidades
 * (la porcion en `un`, la medida en `casera`) o `null` para las magnitudes, que ya son gramos.
 */
export interface FoodUnitOption {
  code: 'g' | 'ml' | 'un' | 'casera'
  label: string
  grams: number | null
}

/**
 * Lo minimo que hace falta del alimento para armar sus unidades. Estructural (y no `BuilderFood`)
 * porque los llamadores traen tipos distintos: `QeItem.food` del paquete, el `BuilderFood` del
 * wizard web, su espejo RN y el `FoodCatalogItem` del buscador del alumno.
 */
export interface FoodUnitOptionsFood {
  servingUnit: string | null | undefined
  /** `serving_size` del catalogo: SIEMPRE en g/ml (el `serving_unit` es solo una etiqueta). */
  servingSize?: number | null
  householdGrams?: number | null
  householdLabel?: string | null
}

function usablePositive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Gramos de la medida casera SOLO si son ofrecibles: dentro del rango del CHECK (R4). */
function usableHouseholdGrams(value: number | null | undefined): number | null {
  const grams = usablePositive(value)
  if (grams === null) return null
  return grams >= HOUSEHOLD_GRAMS_MIN && grams <= HOUSEHOLD_GRAMS_MAX ? grams : null
}

/** Numero corto para una etiqueta: «61», «0,5» — sin `Intl` (Hermes con ICU recortado). */
function shortAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

/**
 * Unidades ofrecibles para UN alimento concreto (W2.1, SPEC §5.2). Reemplazo (y unica casa desde
 * W2.1) del viejo `catalogUnitOptions`, que ofrecia `un` a TODO el catalogo: en el 96 % de las
 * filas «1 un» es una porcion de 100 g y nadie lo decia — la causa 1 del tren (SPEC §1).
 *
 *   magnitud (`g`/`ml`) : siempre. Es la verdad persistida.
 *   `casera`            : solo con el PAR completo y el gramaje dentro del CHECK [1, 1000] (R4).
 *   `un`                : solo si el alimento es REALMENTE contable (`serving_unit = 'un'`).
 *
 * El orden es el del selector: primero la magnitud, despues la medida casera (la que queremos
 * que el coach elija) y al final la contable. Un alimento `per_serving` + `un` con medida ofrece
 * las dos, cada una rotulada con SUS gramos («huevo · 61 g» vs «un · 58 g»), que es justo lo que
 * pide R7 — no hay forma de confundirlas si las dos dicen cuanto pesan.
 */
export function foodUnitOptions(food: FoodUnitOptionsFood): readonly FoodUnitOption[] {
  const magnitude = foodMagnitudeUnit(food.servingUnit)
  const options: FoodUnitOption[] = [{ code: magnitude, label: magnitude, grams: null }]

  const householdGrams = usableHouseholdGrams(food.householdGrams)
  const householdLabel = (food.householdLabel ?? '').trim()
  if (householdGrams !== null && householdLabel.length > 0) {
    options.push({
      code: HOUSEHOLD_UNIT,
      label: `${householdLabel} · ${shortAmount(householdGrams)} ${magnitude}`,
      grams: householdGrams,
    })
  }

  if (normalizeIntakeUnit(food.servingUnit) === 'un') {
    const servingSize = usablePositive(food.servingSize)
    options.push({
      code: 'un',
      label: servingSize === null ? 'un' : `un · ${shortAmount(servingSize)} ${magnitude}`,
      grams: servingSize,
    })
  }

  return options
}

/**
 * Unidad inicial de un alimento (W2.1). La medida casera GANA siempre que exista, incluso en un
 * alimento nativo `un` (R7): «2 huevos» es lo que el coach quiere escribir, y «2 un» es
 * exactamente el numero que nadie sabia leer.
 */
export function defaultFoodUnit(food: FoodUnitOptionsFood): FoodUnitOption['code'] {
  const options = foodUnitOptions(food)
  return (
    options.find((option) => option.code === HOUSEHOLD_UNIT)?.code ??
    options.find((option) => option.code === 'un')?.code ??
    options[0]!.code
  )
}

/**
 * Una opcion del selector tal como la pinta la UI. Igual que `FoodUnitOption` pero con `code`
 * abierto: el selector tiene que poder mostrar la unidad VIGENTE de un item aunque ya no sea
 * ofrecible (una `porción` heredada de la conversion V1→V2, o un `un` de un alimento que hoy no
 * es contable). Quitarsela dejaria al coach atrapado fuera de su propia unidad.
 */
export interface UnitSelectOption {
  code: string
  label: string
  grams: number | null
}

/**
 * Opciones del selector de un item: las del alimento (`foodUnitOptions`) mas la unidad VIGENTE
 * si quedo fuera del set. Una sola casa para las cuatro superficies de autoria (editor y wizard,
 * web y RN), que antes resolvian este mismo detalle cada una a su manera.
 */
export function foodUnitOptionsWithCurrent(
  food: FoodUnitOptionsFood,
  currentUnit: string | null | undefined,
): readonly UnitSelectOption[] {
  const options: UnitSelectOption[] = [...foodUnitOptions(food)]
  const current = String(currentUnit ?? '').trim()
  if (current.length === 0) return options
  if (options.some((option) => option.code === current)) return options
  return [...options, { code: current, label: current, grams: null }]
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Conversion de cantidad ENTRE cualquier par de unidades del editor, incluida `casera` (W2.1).
 * Envuelve a `convertIntakeQuantity` (que solo conoce el vocabulario persistible) y agrega:
 *
 *   g|ml ↔ casera : `qty / householdGrams` y su inversa (2 huevos ⇔ 122 g con hg = 61)
 *   un   ↔ casera : via gramos, `qty × servingSize / householdGrams` y su inversa
 *   porción ↔ casera : `null` — las macros de una porcion son las del grupo, no hay gramaje
 *
 * `null` = la conversion NO es representable (falta el gramaje con que multiplicar, o hay una
 * `porción` de por medio). El llamador conserva el numero escrito (SPEC §4.1); nunca inventa.
 */
export function convertQuantityBetweenUnits(input: {
  quantity: number
  from: string
  to: string
  servingSize: number | null | undefined
  householdGrams?: number | null
}): number | null {
  const { quantity } = input
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  // `casera` no es un codigo de intake (nunca se persiste): se compara literal contra la
  // constante, JAMAS derivandola de `householdLabel` — una etiqueta «unidad» es solo display (R8).
  const fromHousehold = isHouseholdUnit(input.from)
  const toHousehold = isHouseholdUnit(input.to)
  if (fromHousehold && toHousehold) return quantity

  if (fromHousehold || toHousehold) {
    const householdGrams = usablePositive(input.householdGrams)
    if (householdGrams === null) return null
    const other = normalizeIntakeUnit(fromHousehold ? input.to : input.from)
    if (other === null || other === 'porción') return null

    // Todo pasa por gramos: la medida casera SIEMPRE se define en la magnitud del alimento.
    if (isMassIntakeUnit(other)) {
      return round1(fromHousehold ? quantity * householdGrams : quantity / householdGrams)
    }
    const servingSize = usablePositive(input.servingSize)
    if (servingSize === null) return null
    return round1(
      fromHousehold ? (quantity * householdGrams) / servingSize : (quantity * servingSize) / householdGrams,
    )
  }

  const from = normalizeIntakeUnit(input.from)
  const to = normalizeIntakeUnit(input.to)
  if (from === null || to === null) return null
  return convertIntakeQuantity({ quantity, from, to, servingSize: input.servingSize })
}

/** ¿Este texto de unidad es la medida casera? Comparacion literal (ver `HOUSEHOLD_UNIT`). */
export function isHouseholdUnit(unit: string | null | undefined): boolean {
  return String(unit ?? '').trim().toLowerCase() === HOUSEHOLD_UNIT
}

/**
 * Convierte la cantidad al cambiar de unidad, para que el alumno no persista "100 unidades"
 * donde queria decir "100 g" (NUT-017). `serving_size` esta en g/ml, asi que:
 *
 *   g|ml → un : `quantity / servingSize`   (100 g con porcion 60 g ⇒ 1,7 un)
 *   un → g|ml : `quantity * servingSize`   (1 un con porcion 60 g ⇒ 60 g)
 *   g ↔ ml    : el mismo numero (misma base per-100; el alimento es solido O liquido)
 *
 * Devuelve `null` cuando la conversion NO es representable (sin `servingSize` positivo, o
 * involucrando `porción`): el llamador debe entonces pedir la cantidad de nuevo en vez de
 * arrastrar un numero que ya no significa lo mismo.
 */
export function convertIntakeQuantity(input: {
  quantity: number
  from: NutritionIntakeUnit
  to: NutritionIntakeUnit
  servingSize: number | null | undefined
}): number | null {
  const { quantity, from, to } = input
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (from === to) return quantity
  if (isMassIntakeUnit(from) && isMassIntakeUnit(to)) return quantity

  const servingSize = input.servingSize
  const usableServing =
    typeof servingSize === 'number' && Number.isFinite(servingSize) && servingSize > 0
      ? servingSize
      : null
  if (usableServing === null) return null

  if (isMassIntakeUnit(from) && to === 'un') return round1(quantity / usableServing)
  if (from === 'un' && isMassIntakeUnit(to)) return round1(quantity * usableServing)
  // 'porción' no tiene equivalencia en g/ml/un: sus macros son las ref congeladas del grupo.
  return null
}
