import { describe, expect, it } from 'vitest'
import {
  CL_CONVERSION_MAP,
  CL_DAIRY_FACTORS,
  convertPortionsToCl,
  draftUsesLegacySmae,
  hasClDestinations,
  matchCustomGroupToCl,
  round05,
  type ClConversionInput,
  type ClConversionResult,
  type ClKeyMacro,
} from './exchange-conversion'
import { parsePortionsValue } from './editor-state'
import type {
  QePickerGroup,
  QePortionGroup,
  QePortionTarget,
  QeSlot,
  QeVariant,
} from './editor-state'

/**
 * W3.1–W3.3 — tabla de casos de DATA §6.4 (el caso 30, `isClGroup` con el campo ausente,
 * vive en `exchange-visibility.test.ts`, porque el helper nace en W1.4).
 *
 * Las cantidades salen de STATS (porciones reales en LIVE), no de numeros inventados.
 */

// ── Catalogo: los 9 SMAE + los 13 chilenos ────────────────────────────────────
// Los SMAE llevan `portionSystem: 'smae'` EXPLICITO. Sin el, `systemOf` los cae al set del
// coach y un fixture con `coachSystem: 'cl'` estaria probando otra cosa (nota de `isClGroup`).

function group(
  groupCode: string,
  ref: readonly [number, number, number, number],
  extra: Partial<QePortionGroup> = {},
): QePortionGroup {
  const [calories, proteinG, carbsG, fatsG] = ref
  return {
    exchangeGroupId: `id-${groupCode}`,
    groupCode,
    groupName: `Grupo ${groupCode}`,
    color: null,
    ref: { calories, proteinG, carbsG, fatsG },
    composedOf: null,
    macrosConfirmed: true,
    ...extra,
  }
}

const SMAE: QePortionGroup[] = [
  group('C', [70, 2, 15, 0], { portionSystem: 'smae' }),
  group('P', [55, 7, 0, 3], { portionSystem: 'smae' }),
  group('F', [60, 0, 15, 0], { portionSystem: 'smae' }),
  group('V', [25, 2, 4, 0], { portionSystem: 'smae' }),
  group('LAC', [95, 9, 12, 2], { portionSystem: 'smae' }),
  group('ARL', [45, 0, 0, 5], { portionSystem: 'smae' }),
  group('G', [45, 0, 0, 5], { portionSystem: 'smae' }),
  // LEG: `ref_*` en CERO y su valor real en `composed_of` (1P + 1C). Es el grupo que obliga
  // a `refOf` a expandir compuestos (S-06): con el ref crudo el preview diria «0 → 85 kcal».
  group('LEG', [0, 0, 0, 0], {
    portionSystem: 'smae',
    composedOf: [
      { code: 'P', portions: 1, ref: { calories: 55, proteinG: 7, carbsG: 0, fatsG: 3 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ],
  }),
  group('SP', [120, 24, 2, 1], { portionSystem: 'smae' }),
]

const CL: QePortionGroup[] = [
  group('LD', [70, 7, 10, 0], { portionSystem: 'cl' }),
  group('LS', [85, 5, 9, 3], { portionSystem: 'cl' }),
  group('LE', [110, 5, 9, 6], { portionSystem: 'cl' }),
  group('CB', [65, 11, 1, 2], { portionSystem: 'cl' }),
  group('CA', [120, 11, 1, 8], { portionSystem: 'cl' }),
  group('LGS', [170, 11, 30, 1], { portionSystem: 'cl' }),
  group('VG', [25, 2, 5, 0], { portionSystem: 'cl' }),
  group('VL', [10, 0, 2.5, 0], { portionSystem: 'cl' }),
  group('FR', [60, 0, 15, 0], { portionSystem: 'cl' }),
  group('PCT', [140, 3, 30, 1], { portionSystem: 'cl' }),
  group('AG', [45, 0, 0, 5], { portionSystem: 'cl' }),
  group('AZ', [20, 0, 5, 0], { portionSystem: 'cl' }),
  group('SCP', [120, 24, 2, 1], { portionSystem: 'cl' }),
]

/** Grupo propio de `nutricionista-pame-cid`: 140 kcal · 3 P · 30 C · 1 G — clava con PCT. */
const CUSTOM_PAME = group('CARB', [140, 3, 30, 1], { groupName: 'Carbohidratos 140/30' })
/** Grupo propio de `josefit`: 422 kcal · 90 P · 5 C · 5 G — no calza con ninguno. */
const CUSTOM_JOSEFIT = group('PPRO', [422, 90, 5, 5], { groupName: 'Proteinapro' })
/** Grupo propio con los cuatro refs en CERO: su drift no se puede medir. */
const CUSTOM_CERO = group('CERO', [0, 0, 0, 0], { groupName: 'Sin macros' })
/** Grupo propio 110·5·9·6: clava con `LE`. Es el caso S5 del eje lacteo (no es `LAC`). */
const CUSTOM_ENTERO = group('LACT', [110, 5, 9, 6], { groupName: 'Mi lácteo entero' })
/** Grupo propio 70·7·10·0: clava con `LD`. */
const CUSTOM_DESCREMADO = group('LDES', [70, 7, 10, 0], { groupName: 'Mi lácteo descremado' })
/**
 * Grupo PROPIO con un codigo chileno (DATA §2.2: el `code` es unico por SCOPE, un coach puede
 * tener su propio 'FR'). Prescrito en el borrador ⇒ se reconstruye del snapshot congelado y
 * llega SIN `portionSystem`. Su `exchange_group_id` es otro que el del FR del sistema.
 */
const CUSTOM_FR = group('FR', [60, 0, 15, 0], {
  exchangeGroupId: 'id-FR-propio',
  groupName: 'Frutas de la casa',
})
/**
 * El mismo caso pero marcado 'cl' EXPLICITO: asi SI es destino, o sea que comparte bucket con
 * el 'FR' del sistema. Es la unica forma de meter dos targets distintos en un mismo bucket.
 */
const CUSTOM_FR_CL = group('FR', [60, 0, 15, 0], {
  exchangeGroupId: 'id-FR-propio-cl',
  groupName: 'Frutas de la casa (cl)',
  portionSystem: 'cl',
})

// `CUSTOM_FR` NO entra al catalogo compartido: repite el `code` 'FR' y los tests que lo usan
// arman su propio catalogo, para no cambiarles el diccionario a los otros 40.
const CATALOG: QePortionGroup[] = [
  ...SMAE,
  ...CL,
  CUSTOM_PAME,
  CUSTOM_JOSEFIT,
  CUSTOM_CERO,
  CUSTOM_ENTERO,
  CUSTOM_DESCREMADO,
]

function byCode(code: string): QePortionGroup {
  const found = CATALOG.find((candidate) => candidate.groupCode === code)
  if (found == null) throw new Error(`fixture sin grupo ${code}`)
  return found
}

/** Ref EFECTIVO de UNA porcion del fixture: un compuesto (LEG) vale lo que suman sus partes. */
function effectiveRef(code: string): QePortionGroup['ref'] {
  const found = byCode(code)
  if (found.composedOf == null) return found.ref
  return found.composedOf.reduce(
    (acc, part) => ({
      calories: acc.calories + part.ref.calories * part.portions,
      proteinG: acc.proteinG + part.ref.proteinG * part.portions,
      carbsG: acc.carbsG + part.ref.carbsG * part.portions,
      fatsG: acc.fatsG + part.ref.fatsG * part.portions,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
  )
}

function macroOf(ref: QePortionGroup['ref'], macro: ClKeyMacro): number {
  if (macro === 'calories') return ref.calories
  if (macro === 'protein') return ref.proteinG
  if (macro === 'carbs') return ref.carbsG
  return ref.fatsG
}

// ── Borrador ──────────────────────────────────────────────────────────────────

function target(code: string, portions: string, notes: string | null = null): QePortionTarget {
  const source = byCode(code)
  return {
    key: `t-${code}`,
    id: `row-${code}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes,
  }
}

/** Target sobre un grupo que NO esta en el catalogo compartido (se resuelve por id, no por code). */
function targetOf(source: QePortionGroup, portions: string): QePortionTarget {
  return {
    key: `t-${source.exchangeGroupId}`,
    id: `row-${source.exchangeGroupId}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes: null,
  }
}

function slotWith(portionTargets: QePortionTarget[]): QeSlot {
  return {
    key: 's1',
    id: null,
    code: 'BREAKFAST',
    name: 'Desayuno',
    startTime: '',
    endTime: null,
    mode: 'flexible',
    required: false,
    instructions: null,
    targets: {},
    items: [],
    portionTargets,
  }
}

function variantWith(portionTargets: QePortionTarget[]): QeVariant {
  return {
    key: 'v1',
    id: null,
    variantKey: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [slotWith(portionTargets)],
  }
}

function convert(
  portionTargets: QePortionTarget[],
  extra: Partial<Omit<ClConversionInput, 'variants'>> = {},
): ClConversionResult {
  return convertPortionsToCl({
    variants: [variantWith(portionTargets)],
    catalog: CATALOG,
    coachSystem: 'cl',
    ...extra,
  })
}

/** Los targets de la unica franja del borrador resultante. */
function outTargets(result: ClConversionResult): QePortionTarget[] {
  return result.variants[0].slots[0].portionTargets
}

// ── 1-4 · round05 ─────────────────────────────────────────────────────────────

describe('round05 — paso del dominio, piso 0,5 y techo 99', () => {
  it('caso 1 · piso: nunca 0 (el CHECK exige portions > 0)', () => {
    expect(round05(0.2)).toBe(0.5)
  })

  it('caso 2 · medio exacto: 1,25 sube a 1,5 (Math.round(2.5) = 3)', () => {
    expect(round05(1.25)).toBe(1.5)
  })

  it('caso 3 · techo 99', () => {
    expect(round05(140)).toBe(99)
  })

  it('caso 4 · no finito ⇒ piso', () => {
    expect(round05(Number.NaN)).toBe(0.5)
  })
})

// ── 5-18 · la tabla de conversion ─────────────────────────────────────────────

describe('convertPortionsToCl — tabla SMAE → chileno (DATA §6.4)', () => {
  it('caso 5 · cereales tipico: 2 C ⇒ 1 PCT, sin drift', () => {
    const { diff } = convert([target('C', '2')])
    expect(diff).toHaveLength(1)
    expect(diff[0].toCode).toBe('PCT')
    expect(diff[0].toPortions).toBe(1)
    expect(diff[0].kcalBefore).toBe(140)
    expect(diff[0].kcalAfter).toBe(140)
    expect(diff[0].review).toBe(false)
  })

  it('caso 6 · cereales maximo real: 4 C ⇒ 2 PCT', () => {
    const { diff } = convert([target('C', '4')])
    expect(diff[0].toPortions).toBe(2)
    expect(diff[0].kcalBefore).toBe(280)
    expect(diff[0].kcalAfter).toBe(280)
  })

  it('caso 7 · proteinas maximo real: 25 P ⇒ 16 CB y la fila sale «Revisar» (drift 24 %)', () => {
    const { diff } = convert([target('P', '25')])
    expect(diff[0].toCode).toBe('CB')
    expect(diff[0].toPortions).toBe(16)
    expect(diff[0].kcalBefore).toBe(1375)
    expect(diff[0].kcalAfter).toBe(1040)
    expect(diff[0].review).toBe(true)
  })

  it('caso 8 · 1 P ⇒ 0,5 CB (0,636 baja a 0,5) y «Revisar»', () => {
    const { diff } = convert([target('P', '1')])
    expect(diff[0].toPortions).toBe(0.5)
    expect(diff[0].kcalBefore).toBe(55)
    expect(diff[0].kcalAfter).toBe(32.5)
    expect(diff[0].review).toBe(true)
  })

  it('caso 8b · 3 P ⇒ 2 CB (1,909 sube a 2) y «Revisar» (drift 21 %)', () => {
    const { diff } = convert([target('P', '3')])
    expect(diff[0].toCode).toBe('CB')
    expect(diff[0].toPortions).toBe(2)
    expect(diff[0].kcalBefore).toBe(165)
    expect(diff[0].kcalAfter).toBe(130)
    expect(diff[0].review).toBe(true)
  })

  it('caso 9 · frutas maximo real: 8,5 F ⇒ 8,5 FR, sin drift', () => {
    const { diff } = convert([target('F', '8.5')])
    expect(diff[0].toCode).toBe('FR')
    expect(diff[0].toPortions).toBe(8.5)
    expect(diff[0].kcalBefore).toBe(510)
    expect(diff[0].kcalAfter).toBe(510)
    expect(diff[0].review).toBe(false)
  })

  it('caso 9b · frutas 1 a 1: 1 F ⇒ 1 FR, sin drift (mismo ref 60·0·15·0)', () => {
    const { diff } = convert([target('F', '1')])
    expect(diff[0].toCode).toBe('FR')
    expect(diff[0].toPortions).toBe(1)
    expect(diff[0].kcalBefore).toBe(60)
    expect(diff[0].kcalAfter).toBe(60)
    expect(diff[0].review).toBe(false)
  })

  it('caso 10 · verduras maximo real: 7,5 V ⇒ 6 VG y «Revisar» (drift 20 %)', () => {
    const { diff } = convert([target('V', '7.5')])
    expect(diff[0].toCode).toBe('VG')
    expect(diff[0].toPortions).toBe(6)
    expect(diff[0].kcalBefore).toBe(187.5)
    expect(diff[0].kcalAfter).toBe(150)
    expect(diff[0].review).toBe(true)
  })

  it('caso 11 · lacteo sin eleccion ⇒ LD por defecto, y SIEMPRE «Revisar» (R3)', () => {
    const { diff } = convert([target('LAC', '1')])
    expect(diff[0].toCode).toBe('LD')
    expect(diff[0].toPortions).toBe(1.5)
    expect(diff[0].kcalBefore).toBe(95)
    expect(diff[0].kcalAfter).toBe(105)
    expect(diff[0].review).toBe(true)
  })

  it('caso 12 · lacteo maximo real entero: 5,5 LAC con LE ⇒ 5 LE', () => {
    const { diff } = convert([target('LAC', '5.5')], { dairyChoiceBySlot: { s1: 'LE' } })
    expect(diff[0].toCode).toBe('LE')
    expect(diff[0].toPortions).toBe(5)
    expect(diff[0].kcalBefore).toBe(522.5)
    expect(diff[0].kcalAfter).toBe(550)
    expect(diff[0].review).toBe(true)
  })

  it('caso 13 · lacteo semi: 2 LAC con LS ⇒ 2 LS', () => {
    const { diff } = convert([target('LAC', '2')], { dairyChoiceBySlot: { s1: 'LS' } })
    expect(diff[0].toCode).toBe('LS')
    expect(diff[0].toPortions).toBe(2)
    expect(diff[0].kcalBefore).toBe(190)
    expect(diff[0].kcalAfter).toBe(170)
    expect(diff[0].review).toBe(true)
  })

  it('caso 13b · lacteo maximo real descremado: 5,5 LAC con LD ⇒ 7,5 LD', () => {
    const { diff } = convert([target('LAC', '5.5')], { dairyChoiceBySlot: { s1: 'LD' } })
    expect(diff[0].toCode).toBe('LD')
    expect(diff[0].toPortions).toBe(7.5)
    expect(diff[0].kcalBefore).toBe(522.5)
    expect(diff[0].kcalAfter).toBe(525)
    expect(diff[0].review).toBe(true)
  })

  it('los tres factores lacteos salen de kcal_LAC / kcal_dest', () => {
    expect(CL_DAIRY_FACTORS.LD).toBeCloseTo(95 / 70, 10)
    expect(CL_DAIRY_FACTORS.LS).toBeCloseTo(95 / 85, 10)
    expect(CL_DAIRY_FACTORS.LE).toBeCloseTo(95 / 110, 10)
  })

  it('caso 14 · colapso ARL + G ⇒ UNA sola fila AG (T-06: unique(meal_slot_id, group_id))', () => {
    const result = convert([target('ARL', '1'), target('G', '1')])
    expect(result.diff).toHaveLength(1)
    expect(result.diff[0].toCode).toBe('AG')
    expect(result.diff[0].from).toHaveLength(2)
    expect(result.diff[0].from.map((origin) => origin.code)).toEqual(['ARL', 'G'])
    expect(result.diff[0].toPortions).toBe(2)
    expect(result.diff[0].kcalBefore).toBe(90)
    expect(result.diff[0].kcalAfter).toBe(90)
    // Y sobre todo: UN solo target de AG en la franja.
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].groupCode).toBe('AG')
    expect(outTargets(result)[0].portions).toBe('2')
  })

  it('caso 15 · colapso con decimales: 1,5 ARL + 0,5 G ⇒ 2 AG', () => {
    const { diff } = convert([target('ARL', '1.5'), target('G', '0.5')])
    expect(diff).toHaveLength(1)
    expect(diff[0].toPortions).toBe(2)
    expect(diff[0].kcalBefore).toBe(90)
    expect(diff[0].kcalAfter).toBe(90)
  })

  it('caso 16 · legumbres: 1 LEG ⇒ 0,5 LGS, con «Revisar» (drift 32 %)', () => {
    const { diff } = convert([target('LEG', '1')])
    expect(diff[0].toCode).toBe('LGS')
    expect(diff[0].toPortions).toBe(0.5)
    expect(diff[0].kcalAfter).toBe(85)
    expect(diff[0].review).toBe(true)
  })

  it('caso 16b · el kcalBefore de un origen COMPUESTO es 125, no 0 (S-06)', () => {
    // Guardian del fix: si alguien «simplifica» refOf a `group.ref`, LEG vuelve a valer 0,
    // el preview imprime «0 → 85 kcal» y la fila que mas se mueve del tren pierde el chip.
    expect(byCode('LEG').ref.calories).toBe(0)
    const { diff } = convert([target('LEG', '1')])
    expect(diff[0].kcalBefore).toBe(125)
    expect(diff[0].review).toBe(true)
  })

  it('caso 16c · origen sin kcal ni expandidas ⇒ «Revisar» igual (drift no calculable)', () => {
    const { diff } = convert([target('CERO', '1')], {
      customReplacements: { [CUSTOM_CERO.exchangeGroupId]: 'PCT' },
    })
    expect(diff).toHaveLength(1)
    expect(diff[0].kcalBefore).toBe(0)
    expect(diff[0].review).toBe(true)
  })

  it('caso 17 · 2 LEG ⇒ 1 LGS', () => {
    const { diff } = convert([target('LEG', '2')])
    expect(diff[0].toPortions).toBe(1)
    expect(diff[0].kcalBefore).toBe(250)
    expect(diff[0].kcalAfter).toBe(170)
    expect(diff[0].review).toBe(true)
  })

  it('caso 18 · scoop: 4,5 SP ⇒ 4,5 SCP, sin drift', () => {
    const { diff } = convert([target('SP', '4.5')])
    expect(diff[0].toCode).toBe('SCP')
    expect(diff[0].toPortions).toBe(4.5)
    expect(diff[0].kcalBefore).toBe(540)
    expect(diff[0].kcalAfter).toBe(540)
    expect(diff[0].review).toBe(false)
  })

  it('caso 18b · scoop 1 a 1: 1 SP ⇒ 1 SCP, sin drift (mismo ref 120·24·2·1)', () => {
    const { diff } = convert([target('SP', '1')])
    expect(diff[0].toCode).toBe('SCP')
    expect(diff[0].toPortions).toBe(1)
    expect(diff[0].kcalBefore).toBe(120)
    expect(diff[0].kcalAfter).toBe(120)
    expect(diff[0].review).toBe(false)
  })

  it('cada factor escrito ES ref_orig[keyMacro] / ref_dest[keyMacro] (la tabla se verifica, no se calcula)', () => {
    // `keyMacro` y `alwaysReview` no son decoracion: este test los LEE. Si alguien cambia un ref
    // del seed o un factor a mano, la fila roja aparece aca y no en el plan de un coach.
    for (const [from, rule] of Object.entries(CL_CONVERSION_MAP)) {
      if (rule.to == null) {
        // Eje lacteo: el destino lo elige el coach, asi que el factor vive en CL_DAIRY_FACTORS.
        expect(rule.keyMacro).toBe('calories')
        expect(rule.alwaysReview).toBe(true)
        for (const dest of ['LD', 'LS', 'LE'] as const) {
          expect(CL_DAIRY_FACTORS[dest]).toBeCloseTo(
            effectiveRef(from).calories / effectiveRef(dest).calories,
            10,
          )
        }
        continue
      }
      expect(rule.alwaysReview).toBeUndefined()
      expect(rule.factor).toBeCloseTo(
        macroOf(effectiveRef(from), rule.keyMacro) / macroOf(effectiveRef(rule.to), rule.keyMacro),
        10,
      )
    }
  })
})

// ── 19-21 · grupos propios (S5) ───────────────────────────────────────────────

describe('grupos propios del coach — propuesta con match unico, y el custom jamas se borra', () => {
  it('caso 19 · el «Carbohidratos 140/30» de Pame matchea PCT y se reemplaza sin reescalar', () => {
    expect(matchCustomGroupToCl(CUSTOM_PAME, CL)).toBe('PCT')
    const result = convert([target('CARB', '2')], {
      customReplacements: { [CUSTOM_PAME.exchangeGroupId]: 'PCT' },
    })
    expect(result.unresolved).toHaveLength(0)
    expect(result.diff[0].toCode).toBe('PCT')
    expect(result.diff[0].toPortions).toBe(2)
    expect(result.diff[0].review).toBe(false)
  })

  it('caso 20 · el «Proteinapro» de josefit no matchea nada y el target sobrevive intacto', () => {
    expect(matchCustomGroupToCl(CUSTOM_JOSEFIT, CL)).toBeNull()
    const result = convert([target('PPRO', '1')])
    expect(result.diff).toHaveLength(0)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toBe('custom_sin_match')
    expect(result.unresolved[0].suggestedCode).toBeUndefined()
    expect(result.unresolved[0].groupCode).toBe('PPRO')
    // El custom NUNCA se borra: sigue en la franja, con su cantidad.
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].groupCode).toBe('PPRO')
    expect(outTargets(result)[0].portions).toBe('1')
  })

  it('caso 21 · con DOS candidatos no se propone nada (mejor intacto que equivocado)', () => {
    const gemelo = group('FR2', [60, 0, 15, 0], { portionSystem: 'cl' })
    expect(matchCustomGroupToCl(group('MIO', [60, 0, 15, 0]), [...CL, gemelo])).toBeNull()
  })

  it('un grupo PROPIO mandado a LE se reescala por SU ref, no por el factor de LAC', () => {
    // El factor lacteo es 95 / kcal_dest: el 95 es el ref de LAC. Aplicarlo a cualquier origen
    // que caiga en LD/LS/LE reescala con el ref del grupo EQUIVOCADO. Este custom es identico a
    // LE (110·5·9·6): el factor correcto es 110/110 = 1, y el de LAC seria 0,864, o sea 2
    // porciones bajarian a 1,5 sin que el coach lo pidiera (SPEC §5.4).
    expect(matchCustomGroupToCl(CUSTOM_ENTERO, CL)).toBe('LE')
    const result = convert([target('LACT', '2')], {
      customReplacements: { [CUSTOM_ENTERO.exchangeGroupId]: 'LE' },
    })
    expect(result.diff[0].toCode).toBe('LE')
    expect(result.diff[0].toPortions).toBe(2)
    expect(result.diff[0].kcalBefore).toBe(220)
    expect(result.diff[0].kcalAfter).toBe(220)
    // Destino lacteo ⇒ la fila SIEMPRE sale «Revisar» (R3), aunque el delta sea cero.
    expect(result.diff[0].review).toBe(true)
  })

  it('… y lo mismo mandado a LD: 3 porciones siguen siendo 3, no 4', () => {
    expect(matchCustomGroupToCl(CUSTOM_DESCREMADO, CL)).toBe('LD')
    const result = convert([target('LDES', '3')], {
      customReplacements: { [CUSTOM_DESCREMADO.exchangeGroupId]: 'LD' },
    })
    expect(result.diff[0].toCode).toBe('LD')
    expect(result.diff[0].toPortions).toBe(3)
    expect(result.diff[0].kcalBefore).toBe(210)
    expect(result.diff[0].kcalAfter).toBe(210)
  })

  it('un LAC de verdad SI usa el factor lacteo (la rama sigue viva)', () => {
    const { diff } = convert([target('LAC', '2')], { dairyChoiceBySlot: { s1: 'LE' } })
    expect(diff[0].toCode).toBe('LE')
    expect(diff[0].toPortions).toBe(1.5) // 2 × 95/110 = 1,727
  })

  it('un grupo PROPIO con codigo chileno NO es destino: se propone, no se absorbe', () => {
    // DATA §2.2: el `code` es unico por SCOPE, asi que un coach puede tener su propio 'FR'.
    // Prescrito en el borrador llega sin `portionSystem`, y por codigo se colaba en la lista de
    // destinos: ensuciaba los candidatos del match y podia tragarse el target del coach.
    const catalog = [...CATALOG, CUSTOM_FR]
    const result = convertPortionsToCl({
      variants: [variantWith([targetOf(CUSTOM_FR, '2')])],
      catalog,
      coachSystem: 'cl',
    })
    expect(result.diff).toHaveLength(0)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toBe('custom_sin_match')
    // Un solo candidato (el FR del SISTEMA): el propio ya no compite consigo mismo.
    expect(result.unresolved[0].suggestedCode).toBe('FR')
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].exchangeGroupId).toBe(CUSTOM_FR.exchangeGroupId)
    expect(outTargets(result)[0].portions).toBe('2')
  })

  it('… y con un F del sistema al lado, el propio sobrevive en su lugar (no lo absorbe el FR)', () => {
    const catalog = [...CATALOG, CUSTOM_FR]
    const result = convertPortionsToCl({
      variants: [variantWith([targetOf(CUSTOM_FR, '2'), target('F', '1')])],
      catalog,
      coachSystem: 'cl',
    })
    expect(outTargets(result).map((row) => row.exchangeGroupId)).toEqual([
      CUSTOM_FR.exchangeGroupId,
      byCode('FR').exchangeGroupId,
    ])
    expect(outTargets(result)[0].portions).toBe('2')
    expect(outTargets(result)[1].portions).toBe('1')
    expect(result.diff.map((row) => row.toCode)).toEqual(['FR'])
    expect(result.diff[0].from.map((origin) => origin.code)).toEqual(['F'])
  })

  it('el reemplazo S5 de un propio que REPITE el codigo del destino SI se aplica (identidad por id)', () => {
    // El bug: la guarda de identidad comparaba `origins[0].code === code`, o sea por CODIGO. Un
    // grupo PROPIO 'FR' mandado al 'FR' del sistema entraba por ahi y salia INTACTO: el coach
    // aceptaba el reemplazo, el sheet se cerraba y el borrador no cambiaba. La identidad se
    // decide por `exchange_group_id`, igual que `sameGroup` unas lineas mas arriba.
    const catalog = [...CATALOG, CUSTOM_FR]
    const result = convertPortionsToCl({
      variants: [variantWith([targetOf(CUSTOM_FR, '2')])],
      catalog,
      coachSystem: 'cl',
      customReplacements: { [CUSTOM_FR.exchangeGroupId]: 'FR' },
    })
    expect(result.unresolved).toHaveLength(0)
    expect(result.diff).toHaveLength(1)
    expect(result.diff[0].toCode).toBe('FR')
    expect(result.diff[0].from.map((origin) => origin.code)).toEqual(['FR'])
    expect(result.diff[0].toPortions).toBe(2) // refs identicos ⇒ factor 1
    // El target del borrador quedo apuntando al FR del SISTEMA, no al propio.
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].exchangeGroupId).toBe(byCode('FR').exchangeGroupId)
    expect(outTargets(result)[0].exchangeGroupId).not.toBe(CUSTOM_FR.exchangeGroupId)
    expect(outTargets(result)[0].portions).toBe('2')
  })

  it('… y con el FR del SISTEMA tambien en la franja, los dos se funden en una sola fila', () => {
    // Los dos caen en el mismo bucket: emitir dos targets con el mismo `exchange_group_id`
    // reventaria el RPC con el 23505 de `unique (meal_slot_id, exchange_group_id)`.
    const catalog = [...CATALOG, CUSTOM_FR]
    const result = convertPortionsToCl({
      variants: [variantWith([targetOf(CUSTOM_FR, '2'), target('FR', '1')])],
      catalog,
      coachSystem: 'cl',
      customReplacements: { [CUSTOM_FR.exchangeGroupId]: 'FR' },
    })
    expect(result.diff).toHaveLength(1)
    expect(result.diff[0].from.map((origin) => origin.portions)).toEqual([2, 1])
    expect(result.diff[0].toPortions).toBe(3)
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].exchangeGroupId).toBe(byCode('FR').exchangeGroupId)
    expect(outTargets(result)[0].portions).toBe('3')
  })

  it('dos chilenos del MISMO code sin cantidad NO se vuelven adyacentes (R-08)', () => {
    // El bucket se llavea por `code`, asi que un grupo PROPIO marcado 'cl' con code 'FR' cae en
    // el mismo bucket que el FR del sistema. Si ninguno de los dos convierte nada, los dos
    // sobreviven —eso ya estaba— pero cada uno tiene que salir EN SU LUGAR: emitirlos juntos en
    // la posicion del primero reordena la franja sin que el preview diga una palabra.
    const catalog = [...CATALOG, CUSTOM_FR_CL]
    const result = convertPortionsToCl({
      variants: [
        variantWith([targetOf(CUSTOM_FR_CL, ''), target('PPRO', '1'), target('FR', 'abc')]),
      ],
      catalog,
      coachSystem: 'cl',
    })
    expect(result.diff).toHaveLength(0)
    expect(outTargets(result).map((row) => row.exchangeGroupId)).toEqual([
      CUSTOM_FR_CL.exchangeGroupId,
      CUSTOM_JOSEFIT.exchangeGroupId,
      byCode('FR').exchangeGroupId,
    ])
    expect(outTargets(result).map((row) => row.portions)).toEqual(['', '1', 'abc'])
  })

  it('… y si alguien SI convierte a ese code, las dos fuentes se funden en una sola fila', () => {
    // La contracara: con un origen real en el bucket no puede sobrevivir ninguna de las dos
    // fuentes por su cuenta, o la franja terminaria con dos targets del mismo grupo ⇒ 23505.
    const catalog = [...CATALOG, CUSTOM_FR_CL]
    const result = convertPortionsToCl({
      variants: [
        variantWith([
          targetOf(CUSTOM_FR_CL, ''),
          target('PPRO', '1'),
          target('FR', 'abc'),
          target('F', '1'),
        ]),
      ],
      catalog,
      coachSystem: 'cl',
    })
    expect(result.diff).toHaveLength(1)
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['FR', 'PPRO'])
    expect(outTargets(result)[0].portions).toBe('1')
  })

  it('un PCT del sistema ya prescrito sigue saliendo INTACTO (la identidad real no se toco)', () => {
    const result = convert([target('PCT', '2', 'Arroz')])
    expect(result.diff).toHaveLength(0)
    expect(result.unresolved).toHaveLength(0)
    const salida = outTargets(result)[0]
    expect(salida.id).toBe('row-PCT') // no es un alta nueva: es el MISMO target
    expect(salida.notes).toBe('Arroz')
    expect(salida.portions).toBe('2')
  })

  it('un unresolved con match unico viaja con `suggestedCode`, sin aplicar nada', () => {
    const result = convert([target('CARB', '1')])
    expect(result.unresolved[0].reason).toBe('custom_sin_match')
    expect(result.unresolved[0].suggestedCode).toBe('PCT')
    expect(outTargets(result)[0].groupCode).toBe('CARB')
  })
})

// ── 22-29 · catalogo, inmutabilidad, dia y ORDEN ──────────────────────────────

describe('bordes del conversor', () => {
  it('caso 22 · catalogo sin el set chileno ⇒ todo unresolved y el borrador no cambia', () => {
    const variants = [variantWith([target('C', '2'), target('LAC', '1')])]
    const result = convertPortionsToCl({ variants, catalog: SMAE, coachSystem: 'smae' })
    expect(result.diff).toHaveLength(0)
    expect(result.unresolved.map((row) => row.reason)).toEqual([
      'destino_ausente_en_catalogo',
      'destino_ausente_en_catalogo',
    ])
    expect(result.variants).toEqual(variants)
  })

  it('caso 23 · el input NO se muta', () => {
    const variants = [variantWith([target('C', '2'), target('ARL', '1'), target('G', '1')])]
    const copiaProfunda = structuredClone(variants)
    convertPortionsToCl({ variants, catalog: CATALOG, coachSystem: 'cl' })
    expect(variants).toEqual(copiaProfunda)
  })

  it('caso 24 · delta del dia con el motor real: 235 kcal antes, 245 despues', () => {
    const { dayDeltas } = convert([target('C', '2'), target('LAC', '1')])
    expect(dayDeltas).toHaveLength(1)
    expect(dayDeltas[0].variantKey).toBe('default')
    expect(dayDeltas[0].before.calories).toBe(235)
    expect(dayDeltas[0].after.calories).toBe(245)
  })

  it('caso 25 · dia sin porciones ⇒ diff vacio y delta plano', () => {
    const { diff, unresolved, dayDeltas } = convert([])
    expect(diff).toHaveLength(0)
    expect(unresolved).toHaveLength(0)
    expect(dayDeltas[0].before).toEqual(dayDeltas[0].after)
  })

  it('caso 26 · franja mixta ⇒ 3 destinos distintos, en ese mismo orden (R-08)', () => {
    const result = convert([target('C', '2'), target('P', '1'), target('G', '1')])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['PCT', 'CB', 'AG'])
    expect(result.diff.map((row) => row.toCode)).toEqual(['PCT', 'CB', 'AG'])
  })

  it('caso 27 · texto de porciones invalido ⇒ el target sobrevive en su posicion, sin ruido', () => {
    const result = convert([target('C', 'abc'), target('F', '1')])
    expect(result.diff).toHaveLength(1)
    expect(result.unresolved).toHaveLength(0)
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['C', 'FR'])
    expect(outTargets(result)[0].portions).toBe('abc')
  })

  it('caso 28 · orden relativo: lo no convertible NO se va al final', () => {
    const result = convert([target('PPRO', '1'), target('C', '2'), target('P', '1')])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['PPRO', 'PCT', 'CB'])
  })

  it('caso 29 · el colapso se materializa en la posicion de su PRIMER origen', () => {
    const result = convert([target('ARL', '1'), target('C', '2'), target('G', '1')])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['AG', 'PCT'])
  })

  it('un grupo que YA es chileno viaja intacto: ni diff, ni unresolved, ni fila nueva', () => {
    const result = convert([target('PCT', '2'), target('F', '1')])
    expect(result.unresolved).toHaveLength(0)
    expect(result.diff.map((row) => row.toCode)).toEqual(['FR'])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['PCT', 'FR'])
    // El target original, no uno nuevo: conserva su `id` de fila y su key.
    expect(outTargets(result)[0].id).toBe('row-PCT')
    expect(outTargets(result)[0].key).toBe('t-PCT')
  })

  it('el chileno YA prescrito y el SMAE que cae en su mismo grupo colapsan (T-06)', () => {
    // Sin esto salian DOS targets con el mismo `exchange_group_id` y el RPC entero se caia
    // con el 23505 de `unique (meal_slot_id, exchange_group_id)`.
    const result = convert([target('PCT', '2'), target('C', '2')])
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].groupCode).toBe('PCT')
    expect(outTargets(result)[0].portions).toBe('3')
    expect(result.diff).toHaveLength(1)
    expect(result.diff[0].from.map((origin) => origin.code)).toEqual(['PCT', 'C'])
    expect(result.diff[0].kcalBefore).toBe(420)
    expect(result.diff[0].kcalAfter).toBe(420)
  })

  it('el chileno prescrito SIN cantidad util tampoco duplica la fila del destino (T-06)', () => {
    // El texto vacio es estado REAL del tap-to-edit: `SET_PORTION_TARGET` guarda el texto crudo
    // (SPEC §7.3). Si ese PCT saliera «de lado» como intacto, el C caeria igual en su bucket y
    // la franja terminaria con DOS targets `id-PCT` ⇒ 23505 al publicar.
    const result = convert([target('PCT', ''), target('C', '2')])
    expect(outTargets(result)).toHaveLength(1)
    expect(outTargets(result)[0].groupCode).toBe('PCT')
    expect(outTargets(result)[0].portions).toBe('1')
    expect(result.diff).toHaveLength(1)
    expect(result.diff[0].from.map((origin) => origin.code)).toEqual(['C'])
    expect(result.diff[0].kcalBefore).toBe(140)
    expect(result.diff[0].kcalAfter).toBe(140)
  })

  it('… y si nadie cae en su grupo, ese target sobrevive INTACTO en su lugar', () => {
    const result = convert([target('PCT', ''), target('F', '1')])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['PCT', 'FR'])
    expect(outTargets(result)[0].portions).toBe('')
    expect(outTargets(result)[0].id).toBe('row-PCT')
    expect(result.diff.map((row) => row.toCode)).toEqual(['FR'])
    expect(result.unresolved).toHaveLength(0)
  })

  it('el destino se materializa en el lugar del chileno sin cantidad, no al final (R-08)', () => {
    const result = convert([target('PPRO', '1'), target('PCT', 'abc'), target('C', '2')])
    expect(outTargets(result).map((row) => row.groupCode)).toEqual(['PPRO', 'PCT'])
    expect(outTargets(result)[1].portions).toBe('1')
  })

  it('un LD ya prescrito no se reescala por el factor lacteo al colapsar con un LAC', () => {
    const result = convert([target('LD', '2'), target('LAC', '1')])
    expect(outTargets(result)).toHaveLength(1)
    // 2 (identidad, factor 1) + 1,5 (LAC × 95/70 redondeado) = 3,5
    expect(outTargets(result)[0].portions).toBe('3.5')
    expect(result.diff[0].review).toBe(true)
  })

  it('el target destino nace SIN id (alta nueva) y con la nota del origen conservada', () => {
    const result = convert([target('C', '2', 'Pan integral')])
    expect(outTargets(result)[0].id).toBeNull()
    expect(outTargets(result)[0].notes).toBe('Pan integral')
    expect(outTargets(result)[0].exchangeGroupId).toBe(byCode('PCT').exchangeGroupId)
  })

  it('el techo 99 recorta porciones, y por eso la fila sale «Revisar» aunque el drift no lo delate', () => {
    // 110 F × factor 1 = 110 ⇒ el CHECK de la tabla (portions <= 99) obliga a recortar y se
    // pierden 11 porciones. El drift da EXACTAMENTE 10 %, que no supera la tolerancia: sin la
    // marca por recorte, la fila salia limpia y el coach no se enteraba.
    const { diff } = convert([target('F', '110')])
    expect(diff[0].toPortions).toBe(99)
    expect(diff[0].kcalBefore).toBe(6600)
    expect(diff[0].kcalAfter).toBe(5940)
    expect(diff[0].review).toBe(true)
  })

  it('el texto del target destino lo entiende `parsePortionsValue` (contrato con el reducer)', () => {
    // `formatPortions05` escribe como el reducer (`String(n)`), NO en es-CL: una coma la
    // aceptaria el parser pero ninguna otra escritura del reducer la produce.
    const casos: readonly (readonly [string, string, number])[] = [
      ['C', '2', 1],
      ['P', '3', 2],
      ['F', '8.5', 8.5],
    ]
    for (const [code, cantidad, esperado] of casos) {
      const salida = outTargets(convert([target(code, cantidad)]))[0]
      expect(salida.portions).not.toContain(',')
      expect(parsePortionsValue(salida.portions)).toBe(esperado)
    }
  })

  it('`hasClDestinations` distingue «no hay set chileno» de «no cargo el catalogo»', () => {
    // Sin esto, un catalogo que no cargo (la web lo trae best-effort) produce un preview donde
    // TODAS las filas dicen «su equivalente todavia no esta disponible», que es mentira.
    expect(hasClDestinations(CATALOG)).toBe(true)
    expect(hasClDestinations(SMAE)).toBe(false)
    expect(hasClDestinations([])).toBe(false)
  })

  it('la eleccion del eje lacteo es por (VARIANTE, franja): la otra variante cae al default', () => {
    // `slot.key` es unico POR VARIANTE, asi que `dairyChoiceBySlot` NO se propaga sola entre los
    // 7 dias. Es el contrato que la superficie (W3.5/W3.6) tiene que respetar mostrando el
    // selector en cada fila lactea o escribiendo la llave de cada franja.
    const base = variantWith([target('LAC', '2')])
    const martes: QeVariant = {
      ...base,
      key: 'v2',
      variantKey: 'martes',
      label: 'Martes',
      isDefault: false,
      slots: [{ ...base.slots[0], key: 's2' }],
    }
    const result = convertPortionsToCl({
      variants: [base, martes],
      catalog: CATALOG,
      coachSystem: 'cl',
      dairyChoiceBySlot: { s1: 'LE' },
    })
    expect(result.diff.map((row) => row.toCode)).toEqual(['LE', 'LD'])
    expect(result.diff.map((row) => row.toPortions)).toEqual([1.5, 2.5])
  })

  it('dos origenes colapsados ⇒ las dos notas se concatenan, sin repetir', () => {
    const result = convert([
      target('ARL', '1', 'Palta'),
      target('G', '1', 'Aceite de oliva'),
    ])
    expect(outTargets(result)[0].notes).toBe('Palta · Aceite de oliva')
  })
})

// ── 31-35 · `draftUsesLegacySmae` — la decision del banner (E1/E2 del jefe) ────

describe('draftUsesLegacySmae — «SMAE en uso» es SOLO el set del sistema (E1)', () => {
  /**
   * Grupo del picker: el del catalogo mas los metadatos que solo trae el catalogo vivo.
   * `isSystem` va OBLIGATORIO en el fixture —aunque el tipo lo declare opcional— para que
   * ningun caso pruebe sin querer la rama de la ausencia: esa tiene su propio caso (37).
   */
  function picker(
    source: QePortionGroup,
    meta: Partial<QePickerGroup> & { isSystem: boolean },
  ): QePickerGroup {
    return { ...source, ...meta }
  }

  it('caso 31 · plan SOLO con grupos propios (portionSystem smae por default) ⇒ false', () => {
    // El default de la columna (W0.1) deja a todo grupo propio en 'smae'. Contarlo como legado
    // le pintaba el banner «tu plan usa el set anterior» a un coach que no usa un solo grupo
    // SMAE del sistema, y al tocarlo se le abria un preview sin una sola fila.
    const groups = [picker(CUSTOM_JOSEFIT, { isSystem: false, portionSystem: 'smae' })]
    const variants = [variantWith([targetOf(CUSTOM_JOSEFIT, '2')])]
    expect(draftUsesLegacySmae(variants, groups, 'cl')).toBe(false)
  })

  it('caso 32 · plan con un C del SISTEMA ⇒ true', () => {
    const groups = [picker(byCode('C'), { isSystem: true })]
    const variants = [variantWith([target('C', '2')])]
    expect(draftUsesLegacySmae(variants, groups, 'cl')).toBe(true)
  })

  it('caso 33 · plan solo chileno ⇒ false', () => {
    const groups = [
      picker(byCode('PCT'), { isSystem: true }),
      picker(byCode('FR'), { isSystem: true }),
    ]
    const variants = [variantWith([target('PCT', '2'), target('FR', '1')])]
    expect(draftUsesLegacySmae(variants, groups, 'cl')).toBe(false)
  })

  it('caso 34 · un target cuyo grupo NO esta en la lista no cuenta', () => {
    // Sin el grupo no hay con que afirmar que es del sistema: no se inventa.
    const variants = [variantWith([target('C', '2')])]
    expect(draftUsesLegacySmae(variants, [], 'cl')).toBe(false)
    const otros = [picker(byCode('PCT'), { isSystem: true })]
    expect(draftUsesLegacySmae(variants, otros, 'cl')).toBe(false)
  })

  it('caso 35 · grupo del sistema SIN portionSystem y coach cl ⇒ false (R18: nadie inventa smae)', () => {
    const sinSet = group('C', [70, 2, 15, 0], { exchangeGroupId: 'id-C-sin-set' })
    const groups = [picker(sinSet, { isSystem: true })]
    const variants = [variantWith([targetOf(sinSet, '2')])]
    expect(draftUsesLegacySmae(variants, groups, 'cl')).toBe(false)
    // … y con el coach en 'smae' el MISMO grupo si cae al set viejo: el fallback es el del coach.
    expect(draftUsesLegacySmae(variants, groups, 'smae')).toBe(true)
  })

  it('caso 36 · plan MIXTO (propios smae + un C del sistema) ⇒ true por el del sistema', () => {
    // La forma real de un coach de Pame: sus grupos propios (todos 'smae' por el default de la
    // columna) mas uno o dos del set viejo del sistema. El banner tiene que encenderse por los
    // del SISTEMA y por nada mas: si mañana el coach borra el C, se apaga.
    const groups = [
      picker(CUSTOM_JOSEFIT, { isSystem: false, portionSystem: 'smae' }),
      picker(CUSTOM_PAME, { isSystem: false, portionSystem: 'smae' }),
      picker(byCode('C'), { isSystem: true }),
    ]
    const conC = [
      variantWith([targetOf(CUSTOM_JOSEFIT, '1'), targetOf(CUSTOM_PAME, '2'), target('C', '1')]),
    ]
    expect(draftUsesLegacySmae(conC, groups, 'cl')).toBe(true)
    const sinC = [variantWith([targetOf(CUSTOM_JOSEFIT, '1'), targetOf(CUSTOM_PAME, '2')])]
    expect(draftUsesLegacySmae(sinC, groups, 'cl')).toBe(false)
  })

  it('caso 37 · la lista SIN el metadato (la forma real que pasaba RN) falla CERRADA', () => {
    // ESTA es la forma que el tipo deja entrar sin un error: `QePickerGroup` declara `isSystem`
    // opcional, asi que el catalogo crudo de `catalogToPortionGroups` —que no lo propaga—
    // llegaba con TODO en `undefined`. Contando la ausencia como «del sistema», un plan de puros
    // grupos propios (todos 'smae' por el default de la columna) encendia el banner y abria un
    // sheet vacio. Sin evidencia no se afirma: el banner calla.
    const crudo: QePortionGroup[] = [
      { ...CUSTOM_JOSEFIT, portionSystem: 'smae' },
      { ...byCode('C'), portionSystem: 'smae' },
    ]
    const variants = [variantWith([targetOf(CUSTOM_JOSEFIT, '2'), target('C', '1')])]
    expect(draftUsesLegacySmae(variants, crudo, 'cl')).toBe(false)
    // Con el metadato encima —la lista que da `applyCatalogMetaToPickerGroups`— el mismo plan
    // enciende el banner por el C del SISTEMA, y solo por el.
    const conMeta = [
      picker(CUSTOM_JOSEFIT, { isSystem: false, portionSystem: 'smae' }),
      picker(byCode('C'), { isSystem: true }),
    ]
    expect(draftUsesLegacySmae(variants, conMeta, 'cl')).toBe(true)
  })
})
