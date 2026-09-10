/**
 * Conversion de un borrador de plan del set SMAE al set chileno (D1-A, S4).
 *
 * PURO: sin IO, sin Supabase, sin React/RN. Opera sobre el estado editable del
 * editor unico (`QeVariant[]`) y devuelve un estado NUEVO mas un diff legible.
 * La escritura la hace el camino de siempre: `REPLACE_PORTION_GROUPS` aplica el
 * resultado al borrador y se publica con `persist_and_publish_nutrition_plan_v2`,
 * que re-congela los snapshots.
 *
 * NUNCA sobre una version publicada (T-05): los `snapshot_*` de
 * `nutrition_slot_exchange_targets_v2` estan congelados y un plan publicado no
 * cambia de significado porque cambie el catalogo. Jamas un
 * `UPDATE nutrition_slot_exchange_targets_v2 SET portions = …`.
 */

import { dayTotalsByVariant, type ExchangeMacroTotals } from '@eva/nutrition-engine'
import {
  parsePortionsValue,
  qeExchangeGroups,
  qeGroupRefPerPortionFromDict,
  type QeExchangeGroup,
  type QePickerGroup,
  type QePortionGroup,
  type QePortionTarget,
  type QeVariant,
} from './editor-state'
// `isClGroup` y `CL_CODES` NO se definen aca: nacen en `exchange-visibility.ts` (W1.4)
// y este archivo (W3) los IMPORTA (fix consistencia X-07). La firma canonica de
// `isClGroup` es de DOS parametros: `(group, coachSystem)`.
import { CL_CODES, isClGroup, systemOf, type PortionSystem } from './exchange-visibility'

// ---------------------------------------------------------------------------
// Mapa fijo 9 → 13 (DATA §6). El factor NO se calcula en runtime: se escribe.
// ---------------------------------------------------------------------------

export type ClDairyCode = 'LD' | 'LS' | 'LE'
export type ClKeyMacro = 'calories' | 'protein' | 'carbs' | 'fats'

export type ClConversionRule = {
  /** Codigo del grupo chileno destino. `null` ⇒ el destino lo elige el coach. */
  readonly to: string | null
  /** Macro por el que se reescala (R1). */
  readonly keyMacro: ClKeyMacro
  /** portions_dest = portions_orig × factor. */
  readonly factor: number
  /** true ⇒ la fila SIEMPRE sale marcada «Revisar» en el preview. */
  readonly alwaysReview?: boolean
}

/**
 * Factores = ref_orig[macro clave] / ref_dest[macro clave], con los valores del seed V1 y
 * del set chileno (DATA §5.1). Estan escritos como literales y verificados en los tests de
 * tabla (DATA §6.4): si alguien cambia un ref en la DB, el test rojo avisa antes que el coach.
 */
export const CL_CONVERSION_MAP: Readonly<Record<string, ClConversionRule>> = {
  //  C  70·2·15·0  →  PCT 140·3·30·1   CHO 15/30
  C: { to: 'PCT', keyMacro: 'carbs', factor: 0.5 },
  //  P  55·7·0·3   →  CB   65·11·1·2    proteina 7/11
  P: { to: 'CB', keyMacro: 'protein', factor: 7 / 11 },
  //  F  60·0·15·0  →  FR   60·0·15·0    CHO 15/15
  F: { to: 'FR', keyMacro: 'carbs', factor: 1 },
  //  V  25·2·4·0   →  VG   25·2·5·0     CHO 4/5
  V: { to: 'VG', keyMacro: 'carbs', factor: 0.8 },
  // LAC 95·9·12·2  →  LD | LS | LE      kcal; destino elegido por el coach (R3)
  LAC: { to: null, keyMacro: 'calories', factor: Number.NaN, alwaysReview: true },
  // ARL 45·0·0·5   →  AG   45·0·0·5     grasa 5/5 · colapsa con G (R2)
  ARL: { to: 'AG', keyMacro: 'fats', factor: 1 },
  //  G  45·0·0·5   →  AG   45·0·0·5     grasa 5/5 · colapsa con ARL (R2)
  G: { to: 'AG', keyMacro: 'fats', factor: 1 },
  // LEG compuesto (efectivo 125·9·15·3) → LGS 170·11·30·1   CHO 15/30
  LEG: { to: 'LGS', keyMacro: 'carbs', factor: 0.5 },
  // SP 120·24·2·1  →  SCP 120·24·2·1    proteina 24/24
  SP: { to: 'SCP', keyMacro: 'protein', factor: 1 },
} as const

/** Factores del eje lacteo por destino: kcal_LAC(95) / kcal_dest. */
export const CL_DAIRY_FACTORS: Readonly<Record<ClDairyCode, number>> = {
  LD: 95 / 70, // ≈ 1,357
  LS: 95 / 85, // ≈ 1,118
  LE: 95 / 110, // ≈ 0,864
} as const

/**
 * Macro clave POR GRUPO DESTINO (SPEC §10 regla 3), tabla explicita y jamas derivada:
 * `dominantExchangeMacro` daria `carbs` para LD y LS pero `fats` para LE, y los tres
 * subgrupos del mismo eje quedarian inconsistentes entre si. Se usa SOLO para el factor
 * derivado de un grupo PROPIO que el coach mando reemplazar (S5): los 9 origenes del
 * sistema ya traen su factor escrito en `CL_CONVERSION_MAP`.
 */
export const CL_KEY_MACRO: Readonly<Record<string, ClKeyMacro>> = {
  PCT: 'carbs',
  FR: 'carbs',
  VG: 'carbs',
  VL: 'carbs',
  LGS: 'carbs',
  AZ: 'carbs',
  CB: 'protein',
  CA: 'protein',
  SCP: 'protein',
  AG: 'fats',
  LD: 'calories',
  LS: 'calories',
  LE: 'calories',
} as const

const DAIRY_CODES: ReadonlySet<string> = new Set<string>(['LD', 'LS', 'LE'])

/** ¿El destino es del eje lacteo? Su fila SIEMPRE sale «Revisar» (R3). */
export function isDairy(code: string): code is ClDairyCode {
  return DAIRY_CODES.has(code)
}

// ---------------------------------------------------------------------------
// Redondeo
// ---------------------------------------------------------------------------

/**
 * Redondeo al paso real del dominio. El CHECK de la tabla exige
 * `portions > 0 and portions <= 99 and (portions*2) = floor(portions*2)` y el contrato Zod
 * lo espeja. Piso 0,5 (nunca 0: un 0 borraria la porcion en silencio) y techo 99.
 */
export function round05(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  const snapped = Math.round(value * 2) / 2
  return Math.min(Math.max(snapped, 0.5), 99)
}

/** Un decimal, igual que el motor: el preview no imprime 104.99999999999999 kcal. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Texto de porciones tal como lo guarda el reducer. `QePortionTarget.portions` es TEXTO
 * CRUDO del stepper y `STEP_PORTION_TARGET`/`BUMP_PORTION_TARGET` lo escriben con
 * `String(numero)` («1», «1.5»), no en es-CL: `formatPortionsEsCl` es de DISPLAY y meteria
 * una coma que `parsePortionsValue` acepta pero que ninguna otra escritura del reducer
 * produce. Se respeta el formato del reducer.
 */
function formatPortions05(portions: number): string {
  return String(portions)
}

/**
 * Nota del target destino: se CONSERVA, nunca se pierde. Con dos origenes colapsados
 * (ARL + G) las dos notas se concatenan con ' · ', en el orden de los origenes y sin
 * repetir la misma frase dos veces. Sin notas ⇒ null (lo que el contrato espera).
 */
function mergeNotes(notes: readonly (string | null)[]): string | null {
  const kept: string[] = []
  for (const note of notes) {
    const trimmed = (note ?? '').trim()
    if (trimmed === '' || kept.includes(trimmed)) continue
    kept.push(trimmed)
  }
  return kept.length === 0 ? null : kept.join(' · ')
}

// ---------------------------------------------------------------------------
// Tipos del resultado
// ---------------------------------------------------------------------------

export type ClConversionOrigin = {
  /** Codigo SMAE de origen ('ARL', 'G', …). */
  readonly code: string
  readonly name: string
  readonly portions: number
}

export type ClConversionRow = {
  readonly variantKey: string
  readonly slotKey: string
  readonly slotName: string
  /** Uno o DOS origenes: ARL + G colapsan en la misma fila destino (R2). */
  readonly from: readonly ClConversionOrigin[]
  readonly toCode: string
  readonly toName: string
  readonly toPortions: number
  readonly kcalBefore: number
  readonly kcalAfter: number
  /** true ⇒ chip «Revisar»: destino lacteo, o |Δkcal| / kcal_orig > 10 %. */
  readonly review: boolean
}

export type ClConversionUnresolvedReason =
  | 'custom_sin_match'
  | 'sin_regla'
  | 'destino_ausente_en_catalogo'

export type ClConversionUnresolved = {
  readonly variantKey: string
  readonly slotKey: string
  readonly exchangeGroupId: string
  readonly groupCode: string
  readonly groupName: string
  readonly reason: ClConversionUnresolvedReason
  /** Solo para 'custom_sin_match' cuando SI hay un unico candidato (S5). */
  readonly suggestedCode?: string
}

export type ClConversionDayDelta = {
  readonly variantKey: string
  readonly label: string
  readonly before: ExchangeMacroTotals
  readonly after: ExchangeMacroTotals
}

export type ClConversionResult = {
  /** Variantes NUEVAS (inmutable: el input no se muta). */
  readonly variants: QeVariant[]
  readonly diff: readonly ClConversionRow[]
  readonly unresolved: readonly ClConversionUnresolved[]
  readonly dayDeltas: readonly ClConversionDayDelta[]
}

export type ClConversionInput = {
  readonly variants: readonly QeVariant[]
  /** Catalogo vivo del coach, ya proyectado (`catalogToPortionGroups`). Debe traer los 13 'cl'. */
  readonly catalog: readonly QePortionGroup[]
  /**
   * `coaches.portion_system` del coach. Viaja en el contrato (el borde ya lo tiene y las
   * superficies lo pasan), pero el motor NO lo usa para decidir que grupo es chileno: para
   * DECIDIR se pregunta con el fallback conservador, ver `NO_CLAIM_SYSTEM`.
   */
  readonly coachSystem: PortionSystem
  /**
   * Eleccion del coach para el eje lacteo. Default 'LD' (R3, Q3).
   *
   * ⚠ La llave es `slot.key`, que es unica POR VARIANTE (`editor-state.ts`: `slot.id ?? gen`),
   * o sea la eleccion es por (VARIANTE, FRANJA) y NO por nombre de franja. En un plan de 7 dias
   * el coach que elige «Entero» para el Desayuno del dia base NO se lo cambia a los otros seis:
   * la superficie (W3.5/W3.6) tiene que mostrar el selector en CADA fila lactea del preview, o
   * propagar la eleccion escribiendo la llave de cada franja que le toque. El motor no adivina
   * por nombre: dos franjas se pueden llamar igual y significar cosas distintas.
   */
  readonly dairyChoiceBySlot?: Readonly<Record<string, ClDairyCode>>
  /** Reemplazos de grupos CUSTOM aceptados por el coach: exchangeGroupId → code cl (S5). */
  readonly customReplacements?: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Match de grupos custom (S5)
// ---------------------------------------------------------------------------

/**
 * Un grupo custom «calza» con un chileno si sus cuatro refs entran en ±5 kcal y ±1 g en cada
 * macro, y el match es UNICO. Con dos candidatos NO se propone nada: mejor dejar el custom
 * intacto que reemplazarlo por el equivocado. El custom NUNCA se borra.
 */
export function matchCustomGroupToCl(
  custom: QePortionGroup,
  clGroups: readonly QePortionGroup[],
): string | null {
  const hits = clGroups.filter(
    (cl) =>
      Math.abs(cl.ref.calories - custom.ref.calories) <= 5 &&
      Math.abs(cl.ref.proteinG - custom.ref.proteinG) <= 1 &&
      Math.abs(cl.ref.carbsG - custom.ref.carbsG) <= 1 &&
      Math.abs(cl.ref.fatsG - custom.ref.fatsG) <= 1,
  )
  return hits.length === 1 ? hits[0].groupCode : null
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const REVIEW_KCAL_TOLERANCE = 0.1
const DEFAULT_DAIRY: ClDairyCode = 'LD'

function macroValue(ref: ExchangeMacroTotals, macro: ClKeyMacro): number {
  switch (macro) {
    case 'calories':
      return ref.calories
    case 'protein':
      return ref.proteinG
    case 'carbs':
      return ref.carbsG
    case 'fats':
      return ref.fatsG
  }
}

/**
 * Codigo destino de un target, o la razon por la que no lo tiene.
 *
 * ORDEN, y el orden importa:
 *  1. Regla del sistema (`CL_CONVERSION_MAP`): los 9 codigos SMAE no colisionan con los 13
 *     chilenos (T-02), asi que un target con regla SIEMPRE es un origen legado. Va primero
 *     para que el fallback de `systemOf` —que ante la ausencia del dato cae al set del
 *     COACH— no marque como «ya chileno» a un 'C' de un coach con `portion_system = 'cl'`.
 *  2. Reemplazo CUSTOM aceptado por el coach: eleccion explicita, gana sobre cualquier
 *     inferencia. Solo se acepta si apunta a un codigo chileno real (`CL_CODES`).
 *  3. Grupo que YA es del set chileno ⇒ su destino es EL MISMO grupo. No es una conversion
 *     (factor 1, sin fila de diff, sin `unresolved`: convertir un plan mixto no puede
 *     inventarle un problema al coach por las filas que ya estaban bien), pero tiene que
 *     pasar por el mismo bucket que todo lo demas: en una franja con `PCT` ya prescrito y un
 *     `C` que convierte a `PCT`, dejarlo «de lado» emitiria DOS targets con el mismo
 *     `exchange_group_id` y el RPC entero se cae con el 23505 de
 *     `unique (meal_slot_id, exchange_group_id)`. Es el mismo colapso que ARL + G.
 *  4. Lo que queda es un grupo PROPIO sin reemplazo ⇒ `unresolved`.
 *
 * OJO con el fallback de `isClGroup`: ante la ausencia del dato cae al set del COACH, que es
 * lo correcto para PINTAR el picker (R18) pero seria un desastre para DECIDIR aca. Un grupo
 * PROPIO no declara set, asi que para un coach con `portion_system = 'cl'` todos sus grupos
 * propios pasarian por «ya chilenos» y la conversion no propondria ni un reemplazo — justo lo
 * que S5 existe para hacer. Por eso el paso 3 pregunta con fallback `'smae'`: sin dato
 * EXPLICITO (columna del catalogo) o codigo chileno (`CL_CODES`), nada se da por convertido.
 */
type Destination =
  | { readonly kind: 'dest'; readonly code: string }
  | { readonly kind: 'unresolved' }

/** Fallback de `isClGroup` para DECIDIR (no para pintar): sin dato, el grupo no es chileno. */
const NO_CLAIM_SYSTEM: PortionSystem = 'smae'

/**
 * ¿Este grupo del catalogo puede ser DESTINO de la conversion?
 *
 * Cuando el catalogo declara el set en alguna fila —el vivo lo hace: `catalogToPortionGroups`
 * propaga la columna— manda el DATO EXPLICITO. El fallback por codigo (`CL_CODES`) queda solo
 * para el catalogo que no declara nada, donde el codigo es el unico dato que hay.
 *
 * Por que no alcanza con `CL_CODES` (DATA §2.2: un coach PUEDE tener su propio 'FR'): un grupo
 * PROPIO prescrito en el borrador se reconstruye del snapshot congelado, que no guarda el set,
 * asi que llega SIN `portionSystem`. Con el fallback por codigo entraba a la lista de destinos
 * y (a) ensuciaba los candidatos de `matchCustomGroupToCl` —dos hits, ninguna propuesta— y
 * (b) si otro origen de la MISMA franja caia en 'FR', el target propio se absorbia con factor
 * 1 y desaparecia del borrador sin una sola fila que lo dijera. Ahora cae a `unresolved`, que
 * es el camino S5: se propone el reemplazo y el coach confirma.
 */
function makeIsClDestination(
  catalog: readonly QePortionGroup[],
): (group: QePortionGroup) => boolean {
  const declares = catalog.some(
    (group) => group.portionSystem === 'cl' || group.portionSystem === 'smae',
  )
  if (!declares) return (group) => isClGroup(group, NO_CLAIM_SYSTEM)
  return (group) => group.portionSystem === 'cl'
}

/**
 * ¿El catalogo trae destinos chilenos? Sin ninguno, TODA fila del preview sale
 * `destino_ausente_en_catalogo`, que es la verdad pero no la util: en la web el catalogo es
 * best-effort (`portionCatalog` puede venir null si la carga fallo) y el coach merece un error
 * honesto —«no pudimos cargar la lista»— en vez de un preview que le dice que su plan entero
 * no tiene equivalente. Las superficies (W3.5/W3.6) preguntan ESTO antes de abrir el preview.
 */
export function hasClDestinations(catalog: readonly QePortionGroup[]): boolean {
  const isClDestination = makeIsClDestination(catalog)
  return catalog.some(isClDestination)
}

/**
 * ¿El borrador prescribe grupos SMAE **del sistema**? Es la decision PURA del banner de
 * conversion, y vive aca para que RN y la web pregunten LO MISMO (E2 del jefe): sin este
 * helper cada superficie se escribia su propio `planUsesLegacy` y las dos mentian distinto.
 *
 * E1 (decision del jefe, 09-09): «SMAE en uso» = grupos del SISTEMA con
 * `portion_system = 'smae'` prescritos en el plan. Los grupos PROPIOS del coach NUNCA cuentan
 * como legado, aunque su fila traiga `portion_system = 'smae'` — nacen asi por el default de la
 * columna (W0.1), no porque el coach eligiera el set viejo. Es la misma regla que
 * `findUsedPortionSystemsForCoach` aplica para `legacySystems` y la misma que
 * `visibleExchangeGroupsForCoach` aplica para el chip «Legado (SMAE)»: un custom no se filtra
 * ni se marca NUNCA por set. Sin esto, un coach cuyo plan solo usa grupos propios veia el
 * banner «tu plan usa el set anterior» y al tocarlo se le abria un preview sin una sola fila.
 *
 * `groups` es la lista del picker YA con los metadatos del catalogo vivo encima
 * (`applyCatalogMetaToPickerGroups`): de ahi salen `isSystem` y `portionSystem`. Un grupo
 * AUSENTE de la lista no cuenta —no hay con que afirmar que es del sistema— y uno con
 * `isSystem === false` tampoco. El set se resuelve con `systemOf` (R18: sin dato explicito y
 * sin codigo chileno cae al set del COACH, nadie inventa 'smae').
 *
 * `isSystem` AUSENTE tampoco cuenta, y esa es la parte que hay que leer despacio: el tipo lo
 * declara opcional, asi que una lista sin el metadato —el catalogo crudo de
 * `catalogToPortionGroups`, o cualquier grupo del plan que el catalogo vivo no cubra (borrado,
 * o catalogo que no cargo)— entra sin un solo error de tipo. Interpretar esa ausencia como «del
 * sistema» era el bug: con el default 'smae' de la columna (W0.1), un plan de puros grupos
 * PROPIOS encendia el banner «tu plan usa el set anterior» y abria un sheet sin una sola fila.
 * Falla CERRADO, que es la misma regla de R18: sin evidencia de que el grupo sea del sistema,
 * el banner calla. Un banner que no aparece es un empujon que falta; uno que aparece de mas es
 * una mentira con una pantalla vacia detras.
 */
export function draftUsesLegacySmae(
  variants: readonly QeVariant[],
  groups: readonly QePickerGroup[],
  coachSystem: PortionSystem,
): boolean {
  const legacyIds = new Set<string>()
  for (const group of groups) {
    // Un grupo PROPIO del coach nunca es legado (E1) — y sin `isSystem` no hay con que afirmar
    // que sea del sistema, asi que tampoco: solo el `true` EXPLICITO entra.
    if (group.isSystem !== true) continue
    if (systemOf(group, coachSystem) === 'smae') legacyIds.add(group.exchangeGroupId)
  }
  if (legacyIds.size === 0) return false
  return variants.some((variant) =>
    variant.slots.some((slot) =>
      slot.portionTargets.some((target) => legacyIds.has(target.exchangeGroupId)),
    ),
  )
}

function resolveDestinationCode(
  target: QePortionTarget,
  slotKey: string,
  dairyChoiceBySlot: Readonly<Record<string, ClDairyCode>>,
  customReplacements: Readonly<Record<string, string>>,
  group: QePortionGroup | undefined,
  isClDestination: (group: QePortionGroup) => boolean,
): Destination {
  const rule = CL_CONVERSION_MAP[target.groupCode]
  if (rule != null) {
    // Eje lacteo: destino elegido por franja, default 'LD' (R3).
    return { kind: 'dest', code: rule.to ?? dairyChoiceBySlot[slotKey] ?? DEFAULT_DAIRY }
  }
  const replacement = customReplacements[target.exchangeGroupId]
  if (replacement != null && CL_CODES.has(replacement)) return { kind: 'dest', code: replacement }
  // Con el grupo en el catalogo manda el predicado de destino (dato explicito primero); sin el
  // grupo —target reconstruido del snapshot, que no guarda el set— solo queda el codigo.
  const alreadyCl =
    group != null ? isClDestination(group) : CL_CODES.has(target.groupCode)
  if (alreadyCl) return { kind: 'dest', code: target.groupCode }
  return { kind: 'unresolved' }
}

/** Por que un target no se pudo convertir, con la propuesta cuando el match es unico (S5). */
function describeUnresolved(
  variantKey: string,
  slotKey: string,
  target: QePortionTarget,
  group: QePortionGroup | undefined,
  clGroups: readonly QePortionGroup[],
): ClConversionUnresolved {
  const base = {
    variantKey,
    slotKey,
    exchangeGroupId: target.exchangeGroupId,
    groupCode: target.groupCode,
    groupName: target.groupName,
  }
  // Sin el grupo en el catalogo no hay refs con que medir el match: no se propone nada.
  if (group == null) return { ...base, reason: 'sin_regla' }
  const suggestedCode = matchCustomGroupToCl(group, clGroups)
  return suggestedCode == null
    ? { ...base, reason: 'custom_sin_match' }
    : { ...base, reason: 'custom_sin_match', suggestedCode }
}

/**
 * Factor de reescala origen → destino.
 *
 * Los 9 origenes del sistema traen su factor ESCRITO (`CL_CONVERSION_MAP`), y el eje lacteo
 * el suyo por destino (`CL_DAIRY_FACTORS`). El unico caso derivado es el grupo PROPIO que el
 * coach mando reemplazar: ahi se usa la macro clave del DESTINO (`CL_KEY_MACRO`). Si esa
 * razon no se puede calcular —destino sin macro clave, alguno de los dos refs en 0— el
 * factor es 1: no se inventa un reescalado, se deja la cantidad, y la fila igual sale
 * «Revisar» porque su drift no se puede medir.
 */
function factorFor(
  originCode: string,
  destCode: string,
  originRef: ExchangeMacroTotals,
  destRef: ExchangeMacroTotals,
): number {
  const rule = CL_CONVERSION_MAP[originCode]
  // EJE LACTEO: los factores de `CL_DAIRY_FACTORS` son 95 / kcal_dest, o sea el ref de `LAC`
  // en el numerador. Valen SOLO para el origen que declara el eje (`to: null`). Si esta rama
  // se pregunta nada mas por el destino, cualquier grupo PROPIO que el coach mande a LD/LS/LE
  // por el camino S5 se reescala con el ref de LAC en vez del suyo: un custom 110·5·9·6
  // —identico a LE— se multiplicaria por 0,864 y 2 porciones bajarian a 1,5 (−25 %), contra
  // SPEC §5.4, que manda `ref_orig[clave] / ref_dest[clave]`. La identidad la resuelve el
  // llamador comparando `exchange_group_id`, no el codigo.
  if (rule != null && rule.to === null && isDairy(destCode)) return CL_DAIRY_FACTORS[destCode]
  if (rule != null && rule.to === destCode && Number.isFinite(rule.factor)) return rule.factor
  const macro = CL_KEY_MACRO[destCode]
  if (macro == null) return 1
  const ratio = macroValue(originRef, macro) / macroValue(destRef, macro)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}

export function convertPortionsToCl(input: ClConversionInput): ClConversionResult {
  const { variants, catalog, dairyChoiceBySlot = {}, customReplacements = {} } = input

  // Los grupos que pueden ser DESTINO: los 13 chilenos, y solo ellos. Se pregunta con
  // `makeIsClDestination` —dato explicito, y `CL_CODES` solo si el catalogo no declara set en
  // ninguna fila— y NO con `input.coachSystem` a proposito: los
  // grupos PROPIOS del coach no declaran set, asi que con el fallback al set del coach un
  // catalogo de un coach 'cl' entregaba sus propios grupos custom como destinos validos — el
  // «Proteinapro» de josefit se proponia como reemplazo de si mismo, y el «Carbohidratos
  // 140/30» de Pame empataba consigo mismo y con PCT, o sea dos candidatos y ninguna
  // propuesta. `coachSystem` sigue en el contrato porque el borde ya lo tiene y las
  // superficies de W3.5/W3.6 lo pasan, pero el motor no decide el set con el.
  const isClDestination = makeIsClDestination(catalog)
  const clGroups = catalog.filter(isClDestination)
  const clByCode = new Map(clGroups.map((group) => [group.groupCode, group]))
  // Los 13 chilenos indexados por ID: un target sin cantidad util igual OCUPA su grupo, y si
  // ese grupo es el destino de otro origen de la franja hay que fundirlos (ver el bucle).
  const clById = new Map(clGroups.map((group) => [group.exchangeGroupId, group]))
  const catalogById = new Map(catalog.map((group) => [group.exchangeGroupId, group]))
  // Diccionario del motor armado UNA vez: `refOf` se llama por origen y por fila del diff.
  const dict = qeExchangeGroups(catalog)
  const refCache = new Map<string, ExchangeMacroTotals>()

  const diff: ClConversionRow[] = []
  const unresolved: ClConversionUnresolved[] = []

  const nextVariants = variants.map((variant) => ({
    ...variant,
    slots: variant.slots.map((slot) => {
      // 1) Acumular por grupo DESTINO: ARL + G caen en el mismo bucket (R2/T-06).
      //    `unique (meal_slot_id, exchange_group_id)` hace que emitir dos filas al mismo
      //    grupo aborte el RPC entero con un 23505 que ni siquiera nombra la franja. Se
      //    colapsa ANTES de armar el payload.
      type Bucket = {
        group: QePortionGroup
        portions: number
        /** kcal ANTES, acumuladas con el ref EFECTIVO de cada origen (compuestos expandidos). */
        kcalBefore: number
        origins: ClConversionOrigin[]
        /**
         * Los targets de origen, EN ORDEN: dan la nota y el «no tocar» del caso identidad.
         * Puede haber fuentes sin cantidad util (texto a medio tipear), que no aportan origen
         * ni kcal pero SI ocupan el grupo destino.
         */
        sources: QePortionTarget[]
        review: boolean
        /** true ⇒ el techo 99 de `round05` recorto porciones (ver el JSDoc de `round05`). */
        capped: boolean
      }
      const buckets = new Map<string, Bucket>()
      // LAYOUT: el ORDEN de la franja tal como lo va a ver el coach (R-08).
      // `QePortionTarget` no tiene `orderIndex`: el orden ES la posicion en el array. Con
      // `[...converted, ...kept]` todo lo convertido saltaba al principio y lo no
      // convertible al final, o sea la conversion REORDENABA la franja sin decirlo en el
      // preview. Cada destino se materializa en el lugar de su PRIMER origen, y los
      // targets intactos conservan su posicion.
      type Slotted =
        | { readonly kind: 'kept'; readonly target: QePortionTarget }
        | { readonly kind: 'bucket'; readonly code: string }
        // Fuente SIN cantidad que cayo en un bucket YA abierto: guarda su propio lugar. Si al
        // final el bucket no convirtio nada, ese target sale intacto ACA y no pegado al primero
        // (dos 'FR' separados por otro grupo no se vuelven adyacentes, R-08). Si el bucket si
        // convirtio, la entrada no imprime nada: la fuente ya viaja fundida en el target nuevo.
        | { readonly kind: 'source'; readonly code: string; readonly target: QePortionTarget }
      const layout: Slotted[] = []

      /** Bucket del destino, reservando su lugar en la franja si es el primero que cae ahi. */
      const bucketFor = (code: string, group: QePortionGroup): Bucket => {
        const existing = buckets.get(code)
        if (existing != null) return existing
        layout.push({ kind: 'bucket', code })
        const created: Bucket = {
          group,
          portions: 0,
          kcalBefore: 0,
          origins: [],
          sources: [],
          review: false,
          capped: false,
        }
        buckets.set(code, created)
        return created
      }

      for (const target of slot.portionTargets) {
        const portions = parsePortionsValue(target.portions) ?? 0
        if (!(portions > 0)) {
          // Texto sin cantidad util: '' mientras el coach edita (`SET_PORTION_TARGET` guarda el
          // texto CRUDO, SPEC §7.3) o 'abc'. No hay nada que convertir… salvo que ese target SEA
          // uno de los 13 chilenos: su grupo puede ser el DESTINO de otro origen de la misma
          // franja y dejarlo «de lado» emitiria DOS filas con el mismo `exchange_group_id`, o sea
          // el 23505 de `unique (meal_slot_id, exchange_group_id)` que T-06 existe para evitar.
          // Entra al bucket como fuente sin cantidad: si nadie mas cae ahi sale INTACTO (con su
          // texto a medio tipear y su `id`), y si alguien cae se funden en una sola fila.
          const clGroup = clById.get(target.exchangeGroupId)
          if (clGroup == null) {
            layout.push({ kind: 'kept', target })
          } else {
            const code = clGroup.groupCode
            // `bucketFor` reserva el lugar SOLO del primero que abre el bucket; los que caen
            // despues se guardan el suyo por si nadie convierte nada.
            const opened = buckets.has(code)
            const bucket = bucketFor(code, clGroup)
            if (opened) layout.push({ kind: 'source', code, target })
            bucket.sources.push(target)
          }
          continue
        }

        const group = catalogById.get(target.exchangeGroupId)
        const destination = resolveDestinationCode(
          target,
          slot.key,
          dairyChoiceBySlot,
          customReplacements,
          group,
          isClDestination,
        )
        if (destination.kind !== 'dest') {
          if (destination.kind === 'unresolved') {
            unresolved.push(describeUnresolved(variant.variantKey, slot.key, target, group, clGroups))
          }
          // El target original SOBREVIVE intacto y EN SU LUGAR.
          layout.push({ kind: 'kept', target })
          continue
        }

        const dest = clByCode.get(destination.code)
        if (dest == null) {
          // Grupo que ya era su propio destino y no esta en el catalogo vivo: no hay nada
          // que convertir, asi que tampoco hay nada que reportar. Se queda como estaba.
          if (destination.code === target.groupCode) {
            layout.push({ kind: 'kept', target })
            continue
          }
          unresolved.push({
            variantKey: variant.variantKey,
            slotKey: slot.key,
            exchangeGroupId: target.exchangeGroupId,
            groupCode: target.groupCode,
            groupName: target.groupName,
            reason: 'destino_ausente_en_catalogo',
          })
          layout.push({ kind: 'kept', target })
          continue
        }

        const originRef = refOf(group, dict, refCache)
        const destRef = refOf(dest, dict, refCache)
        // IDENTIDAD por `exchange_group_id`, jamas por codigo: el `code` es unico por scope,
        // asi que un grupo PROPIO puede llamarse 'PCT' con otros refs y compararlo por codigo
        // le daria factor 1 —o sea ningun reescalado— justo cuando el coach pidio reemplazarlo.
        const sameGroup = target.exchangeGroupId === dest.exchangeGroupId
        const factor = sameGroup
          ? 1
          : factorFor(target.groupCode, destination.code, originRef, destRef)
        const scaled = portions * factor
        const converted = round05(scaled)
        // Primer origen ⇒ el destino se materializa en SU lugar.
        const bucket = bucketFor(destination.code, dest)
        bucket.portions += converted
        bucket.capped ||= scaled > 99
        // `refOf` EXPANDE COMPUESTOS. Con el ref crudo, LEG da 0 kcal (sus ref_* estan en 0 y su
        // valor vive en composed_of) y el preview imprimiria «0 → 85 kcal» — el bug D5 en el
        // preview. Se acumula aca, con el grupo ya resuelto POR ID.
        bucket.kcalBefore += originRef.calories * portions
        bucket.origins.push({ code: target.groupCode, name: target.groupName, portions })
        bucket.sources.push(target)
        bucket.review ||=
          isDairy(destination.code) || CL_CONVERSION_MAP[target.groupCode]?.alwaysReview === true
      }

      // 2) Materializar los buckets como targets nuevos, indexados por code para que el
      //    layout los ponga en el lugar de su primer origen.
      const convertedByCode = new Map<string, readonly QePortionTarget[]>()
      for (const [code, bucket] of buckets) {
        // SIN ORIGENES: el bucket lo abrio un target chileno sin cantidad util. No se convirtio
        // nada, asi que los sources viajan TAL CUAL, con su texto crudo y su `id`. Viajan TODOS
        // y ninguno se pierde —el bucket se llavea por `code` y un catalogo que repite un codigo
        // chileno (un grupo PROPIO marcado 'cl' con code 'FR') mete dos targets distintos en el
        // mismo bucket—, pero cada uno EN SU LUGAR: aca sale el que abrio el bucket y el resto
        // lo imprime su propia entrada `source` del layout (R-08).
        if (bucket.origins.length === 0) {
          const opener = bucket.sources[0]
          convertedByCode.set(code, opener == null ? [] : [opener])
          continue
        }
        // IDENTIDAD: el grupo ya era chileno y nadie mas cayo en su bucket. No se convirtio
        // nada, asi que el target viaja TAL CUAL —con su `id`, su key y su nota— y no
        // ensucia el preview con una fila «PCT → PCT» que no dice nada.
        //
        // Se compara por `exchange_group_id`, JAMAS por codigo (misma regla que `sameGroup`
        // arriba): el `code` es unico por SCOPE, asi que un grupo PROPIO puede llamarse igual
        // que su destino del sistema. Comparando por codigo, el reemplazo S5 de un custom 'FR'
        // hacia el 'FR' del sistema entraba por aca y salia INTACTO — el coach aceptaba el
        // reemplazo, el sheet se cerraba y el borrador no cambiaba: un no-op silencioso.
        if (
          bucket.origins.length === 1 &&
          bucket.sources.length === 1 &&
          bucket.sources[0].exchangeGroupId === bucket.group.exchangeGroupId
        ) {
          convertedByCode.set(code, bucket.sources)
          continue
        }
        // El re-round05 despues de sumar dos origenes es un cinturon, no una correccion:
        // con dos round05 previos la suma ya es multiplo de 0,5.
        const portions = round05(bucket.portions)
        // TECHO 99 (el CHECK de la tabla): al recortar se pierden porciones en silencio. El
        // drift casi siempre lo delata, pero no siempre —99 sobre un origen de 110 da exacto
        // 10 %, que NO supera la tolerancia—, asi que la fila se marca «Revisar» por el recorte.
        const capped = bucket.capped || bucket.portions > 99
        const kcalBefore = bucket.kcalBefore
        const kcalAfter = bucket.group.ref.calories * portions
        // Sin kcal en el origen (ni crudas ni expandidas) no se puede medir drift, asi que
        // la fila sale marcada «Revisar» igual: no se muestra sin aviso una fila cuyo delta
        // no sabemos calcular.
        const driftUnknown = !(kcalBefore > 0)
        const drift = driftUnknown ? 0 : Math.abs(kcalAfter - kcalBefore) / kcalBefore

        diff.push({
          variantKey: variant.variantKey,
          slotKey: slot.key,
          slotName: slot.name,
          from: bucket.origins,
          toCode: code,
          toName: bucket.group.groupName,
          toPortions: portions,
          kcalBefore: round1(kcalBefore),
          kcalAfter: round1(kcalAfter),
          review: bucket.review || driftUnknown || capped || drift > REVIEW_KCAL_TOLERANCE,
        })

        convertedByCode.set(code, [{
          key: `cl:${slot.key}:${code}`,
          id: null, // alta nueva: el target viejo no se re-usa
          exchangeGroupId: bucket.group.exchangeGroupId,
          groupCode: code,
          groupName: bucket.group.groupName,
          color: bucket.group.color,
          macrosConfirmed: bucket.group.macrosConfirmed,
          portions: formatPortions05(portions),
          notes: mergeNotes(bucket.sources.map((source) => source.notes)),
        }])
      }

      // 3) Reconstruir la franja EN ORDEN (R-08): cada destino en el lugar de su primer
      //    origen, cada target intacto en el suyo.
      const portionTargets: QePortionTarget[] = []
      for (const entry of layout) {
        if (entry.kind === 'kept') {
          portionTargets.push(entry.target)
          continue
        }
        if (entry.kind === 'source') {
          // Sobrevive en su lugar SOLO si su bucket no convirtio nada; si convirtio, ya viaja
          // fundido en el target nuevo (emitirlo aca duplicaria el `exchange_group_id` ⇒ 23505).
          const bucket = buckets.get(entry.code)
          if (bucket != null && bucket.origins.length === 0) portionTargets.push(entry.target)
          continue
        }
        const built = convertedByCode.get(entry.code)
        if (built != null) portionTargets.push(...built)
      }

      return { ...slot, portionTargets }
    }),
  }))

  return {
    variants: nextVariants,
    diff,
    unresolved,
    dayDeltas: buildDayDeltas(variants, nextVariants, dict),
  }
}

// ---------------------------------------------------------------------------
// refOf — el ref EFECTIVO de un grupo, con los compuestos expandidos (S-06)
// ---------------------------------------------------------------------------

/**
 * Macros de UNA porcion del grupo `code`, CON los compuestos expandidos.
 *
 * NO devuelve `group.ref` crudo. `LEG` del SMAE tiene `ref_calories = 0` y su valor real
 * vive en `composed_of`: con el ref crudo, el preview imprime «0 → 85 kcal» y, peor, la
 * fila cae en la rama de `kcalBefore = 0` y sale SIN el chip «Revisar» — justo la fila que
 * mas se mueve de todo el tren (−32 % de energia). Es el bug D5 en otra pantalla.
 *
 * Reusa el MISMO helper que arregla las etiquetas «1 porcion ≈» y la cabecera del sheet del
 * alumno (`qeGroupRefPerPortion`, W2.2), en su variante que recibe el diccionario ya armado:
 * un solo helper para los tres lugares.
 *
 * Recibe el GRUPO ya resuelto por `exchange_group_id`, jamas un codigo: el `code` es unico por
 * scope pero un grupo PROPIO puede reusar el de un grupo del sistema, y buscar por codigo le
 * daria a ese target el ref —y el `kcalBefore`— del grupo equivocado. Memoizado por id porque
 * se llama por origen y por destino.
 */
function refOf(
  group: QePortionGroup | undefined,
  dict: QeExchangeGroup[],
  cache: Map<string, ExchangeMacroTotals>,
): ExchangeMacroTotals {
  if (group == null) return { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
  const cached = cache.get(group.exchangeGroupId)
  if (cached != null) return cached
  const ref = qeGroupRefPerPortionFromDict(group, dict)
  cache.set(group.exchangeGroupId, ref)
  return ref
}

// ---------------------------------------------------------------------------
// Delta del dia (antes / despues), con el motor real
// ---------------------------------------------------------------------------

/**
 * Usa `dayTotalsByVariant`, el MISMO calculo que ve el alumno. Cada variante del editor se
 * proyecta como una «variante» del motor y cada franja como una comida con `dayVariantId`
 * igual a esa variante, de modo que ninguna franja cuente en dos dias.
 *
 * El diccionario es UNO solo (el del catalogo completo, que ya trae los 9 SMAE y los 13
 * chilenos): antes y despues se miden con la misma regla, que es justamente lo que hace
 * comparable el delta.
 */
function buildDayDeltas(
  before: readonly QeVariant[],
  after: readonly QeVariant[],
  dict: QeExchangeGroup[],
): ClConversionDayDelta[] {
  const variantsRef = before.map((variant) => ({ id: variant.variantKey, name: variant.label }))
  const toMeals = (list: readonly QeVariant[]) =>
    list.flatMap((variant) =>
      variant.slots.map((slot) => ({
        dayVariantId: variant.variantKey,
        targets: slot.portionTargets
          .map((target) => ({
            exchangeGroupId: target.exchangeGroupId,
            portions: parsePortionsValue(target.portions) ?? 0,
          }))
          .filter((target) => target.portions > 0),
      })),
    )

  const totalsBefore = dayTotalsByVariant(toMeals(before), variantsRef, dict)
  const totalsAfter = dayTotalsByVariant(toMeals(after), variantsRef, dict)

  return before.map((variant, index) => ({
    variantKey: variant.variantKey,
    label: variant.label,
    before: totalsBefore[index].totals,
    after: totalsAfter[index].totals,
  }))
}
