import { describe, expect, it } from 'vitest'
import {
  qeExchangeGroups,
  qeGroupRefLabel,
  qeGroupRefPerPortion,
  qeGroupRefPerPortionFromDict,
  type QePortionGroup,
} from './editor-state'

// W2.2 — «1 porción ≈ 0 kcal · 0 C · 0 P» en Legumbres (D5/R11). `LEG` es COMPUESTO: sus
// `ref_*` valen 0 en la DB —correcto— y su `composed_of` dice 1P + 1C. Las etiquetas imprimian
// el ref crudo en vez de pedirle al motor que expanda. Valores del seed SMAE
// (`_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql:22-31`): P = 55 kcal / 7 P / 0 C /
// 3 G y C = 70 kcal / 2 P / 15 C / 0 G, o sea LEG = 125 kcal · 15 C · 9 P · 3 G.

const REF_P = { calories: 55, proteinG: 7, carbsG: 0, fatsG: 3 }
const REF_C = { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }
const CERO = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }

function simple(
  exchangeGroupId: string,
  groupCode: string,
  ref: { calories: number; proteinG: number; carbsG: number; fatsG: number },
): QePortionGroup {
  return {
    exchangeGroupId,
    groupCode,
    groupName: groupCode,
    color: null,
    ref,
    composedOf: null,
    macrosConfirmed: false,
  }
}

/** `LEG` tal como llega del read-model: ref en cero y las bases con su ref congelado. */
const LEG: QePortionGroup = {
  ...simple('g-leg', 'LEG', CERO),
  composedOf: [
    { code: 'P', portions: 1, ref: REF_P },
    { code: 'C', portions: 1, ref: REF_C },
  ],
}

const P = simple('g-p', 'P', REF_P)
const C = simple('g-c', 'C', REF_C)

describe('qeGroupRefPerPortion', () => {
  it('expande el compuesto con el diccionario completo (LEG = 1P + 1C, no 0)', () => {
    expect(qeGroupRefPerPortion(LEG, [LEG, P, C])).toEqual({
      calories: 125,
      carbsG: 15,
      proteinG: 9,
      fatsG: 3,
    })
  })

  it('expande igual con el ref congelado de `composed_of`, sin las bases sueltas en la lista', () => {
    // Es el caso REAL del quick-edit: el dict sale de los targets del plan y las bases se
    // sintetizan desde `composed_of`, que ya trae el ref de cada una.
    expect(qeGroupRefPerPortion(LEG, [LEG]).calories).toBe(125)
  })

  it('diccionario vacio ⇒ ref crudo (fallback honesto, jamas NaN)', () => {
    expect(qeGroupRefPerPortion(LEG, [])).toEqual(CERO)
    expect(qeGroupRefPerPortion(C, [])).toEqual(REF_C)
  })

  it('grupo ausente del diccionario ⇒ ref crudo', () => {
    expect(qeGroupRefPerPortion(C, [P])).toEqual(REF_C)
  })

  it('base ausente (el catalogo mando el compuesto como simple) ⇒ ref crudo', () => {
    const legSinBases: QePortionGroup = { ...LEG, composedOf: null }
    expect(qeGroupRefPerPortion(legSinBases, [legSinBases])).toEqual(CERO)
  })

  it('grupo simple ⇒ su propio ref', () => {
    expect(qeGroupRefPerPortion(C, [LEG, P, C])).toEqual(REF_C)
  })
})

describe('qeGroupRefPerPortionFromDict', () => {
  // La etiqueta se pinta POR FILA del picker: la variante que recibe el catalogo reconstruia el
  // diccionario en cada fila (22 veces con el set chileno completo). Esta recibe el dict ya
  // armado y tiene que dar EXACTAMENTE lo mismo, fallbacks incluidos.
  it('da el mismo resultado que la variante que arma el diccionario', () => {
    const catalogo = [LEG, P, C]
    const dict = qeExchangeGroups(catalogo)
    for (const grupo of catalogo) {
      expect(qeGroupRefPerPortionFromDict(grupo, dict)).toEqual(qeGroupRefPerPortion(grupo, catalogo))
    }
  })

  it('dict vacio y grupo ausente ⇒ ref crudo, igual que la otra', () => {
    expect(qeGroupRefPerPortionFromDict(LEG, [])).toEqual(CERO)
    expect(qeGroupRefPerPortionFromDict(C, qeExchangeGroups([P]))).toEqual(REF_C)
  })
})

describe('qeGroupRefLabel', () => {
  it('usa «=» con macros confirmadas (set chileno) y el orden kcal · C · P · G', () => {
    const label = qeGroupRefLabel({ calories: 140, carbsG: 30, proteinG: 3, fatsG: 1 }, { confirmed: true })
    expect(label).toBe('1 porción = 140 kcal · 30 C · 3 P · 1 G')
  })

  it('usa «≈» cuando las macros son referenciales (los 9 SMAE)', () => {
    const label = qeGroupRefLabel(qeGroupRefPerPortion(LEG, [LEG]), { confirmed: false })
    expect(label).toBe('1 porción ≈ 125 kcal · 15 C · 9 P · 3 G')
  })

  it('imprime los decimales con coma es-CL', () => {
    const label = qeGroupRefLabel({ calories: 95, carbsG: 2.5, proteinG: 9, fatsG: 0.5 }, { confirmed: true })
    expect(label).toBe('1 porción = 95 kcal · 2,5 C · 9 P · 0,5 G')
  })
})
