import { describe, expect, it } from 'vitest'
import {
  CL_CODES,
  compareVisibleGroups,
  isClGroup,
  systemOf,
  visibleExchangeGroupsForCoach,
  type PortionSystem,
  type VisibilityInput,
  type VisibleExchangeGroup,
} from './exchange-visibility'

/**
 * Visibilidad del picker (W1.4, SDD «Porciones a la chilena» DATA §7.2, casos 1–14 y 16,
 * más 17 y 18: el piso defensivo que decidió el jefe el 2026-09-09).
 * El caso 15 (`comparePickerGroups`) vive en los tests de `editor-state`, porque
 * ese comparador opera sobre `QePortionGroup` y no sobre `VisibleExchangeGroup`.
 *
 * ⚠ Los fixtures SMAE traen `portionSystem: 'smae'` explícito a propósito: por el
 * fallback de R18 un grupo sin el campo cae al set del COACH, así que armarlos «a
 * mano» sin la columna probaría otra cosa (lo advierte el JSDoc de `isClGroup`).
 */

type CatalogGroup = VisibilityInput['groups'][number]

function group(
  code: string,
  name: string,
  sortOrder: number,
  portionSystem: PortionSystem | undefined,
  extra: Partial<CatalogGroup> = {},
): CatalogGroup {
  return {
    id: `grp-${code.toLowerCase()}`,
    slug: `grp-${code.toLowerCase()}`,
    code,
    name,
    coachId: null,
    teamId: null,
    isSystem: true,
    refCalories: 100,
    refProteinG: 5,
    refCarbsG: 10,
    refFatsG: 3,
    color: null,
    sortOrder,
    composedOf: null,
    macrosConfirmed: true,
    portionSystem,
    ...extra,
  }
}

// ── Los 9 grupos SMAE del sistema (sort_order 10-90, `portion_system = 'smae'`) ──
const SMAE_ROWS: readonly (readonly [string, string])[] = [
  ['C', 'Cereales'],
  ['P', 'Proteínas'],
  ['F', 'Frutas'],
  ['V', 'Verduras'],
  ['LAC', 'Lácteos'],
  ['ARL', 'Aceites ricos en lípidos'],
  ['SP', 'Suplementos'],
  ['G', 'Grasas'],
  ['LEG', 'Leguminosas'],
]
const SMAE_GROUPS: readonly CatalogGroup[] = SMAE_ROWS.map(([code, name], i) =>
  group(code, name, (i + 1) * 10, 'smae'),
)

// ── Los 13 grupos chilenos (sort_order 210-330, `portion_system = 'cl'`, DATA §0) ──
const CL_ROWS: readonly (readonly [string, string])[] = [
  ['LD', 'Lácteos descremados'],
  ['LS', 'Lácteos semidescremados'],
  ['LE', 'Lácteos enteros'],
  ['CB', 'Carnes bajas en grasa'],
  ['CA', 'Carnes altas en grasa'],
  ['LGS', 'Legumbres secas'],
  ['VG', 'Verduras generales'],
  ['VL', 'Verduras de libre consumo'],
  ['FR', 'Frutas'],
  ['PCT', 'Panes, cereales y tubérculos'],
  ['AG', 'Aceites y grasas'],
  ['AZ', 'Azúcares'],
  ['SCP', 'Scoop proteína'],
]
const CL_GROUPS: readonly CatalogGroup[] = CL_ROWS.map(([code, name], i) =>
  group(code, name, 210 + i * 10, 'cl'),
)

/** Custom del coach: la columna trae 'smae' por default y NO debe filtrarlo jamás. */
const CUSTOM_COACH = group('SHK', 'Batido del coach', 500, 'smae', {
  id: 'grp-shk',
  slug: 'grp-shk',
  coachId: 'coach-1',
  isSystem: false,
  macrosConfirmed: false,
})
/** Custom del team (`team_id` no nulo), mismo trato. */
const CUSTOM_TEAM = group('MIX', 'Mix del equipo', 510, 'smae', {
  id: 'grp-mix',
  slug: 'grp-mix',
  teamId: 'team-1',
  isSystem: false,
  macrosConfirmed: false,
})

const CATALOG: readonly CatalogGroup[] = [...SMAE_GROUPS, ...CL_GROUPS]

const codesOf = (out: readonly VisibleExchangeGroup[]): string[] => out.map((g) => g.code)
const byCode = (out: readonly VisibleExchangeGroup[], code: string): VisibleExchangeGroup => {
  const found = out.find((g) => g.code === code)
  if (!found) throw new Error(`el grupo ${code} no está en la salida`)
  return found
}

describe('visibleExchangeGroupsForCoach', () => {
  it('caso 1: coach «cl» sin targets vivos ⇒ solo los 13 chilenos, ninguno legado', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: [],
    })
    expect(out).toHaveLength(13)
    expect(out.every((g) => g.portionSystem === 'cl')).toBe(true)
    expect(out.every((g) => g.legacy === false)).toBe(true)
    expect(out.some((g) => SMAE_ROWS.some(([code]) => code === g.code))).toBe(false)
  })

  it('caso 2: coach «cl» con targets SMAE vivos ⇒ 22 grupos, los 9 SMAE marcados legado (sin backfill)', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: ['smae'],
    })
    expect(out).toHaveLength(22)
    expect(out.filter((g) => g.legacy === false)).toHaveLength(13)
    const legado = out.filter((g) => g.legacy)
    expect(legado).toHaveLength(9)
    expect(legado.every((g) => g.portionSystem === 'smae')).toBe(true)
  })

  it('caso 3: coach «smae» (preferencia futura) ⇒ los 9 propios sin marca y los 13 chilenos legado', () => {
    // La tabla de DATA §7.2 escribe `usedSystems: ['smae']` para este caso, pero con
    // ese input el algoritmo de §7 (unión: el OTRO set entra solo si está en uso)
    // devuelve 9 grupos, no 22. El input que produce el resultado que la fila
    // describe es el que incluye 'cl'; se fija el algoritmo, que es la fuente.
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'smae',
      usedSystems: ['smae', 'cl'],
    })
    expect(out).toHaveLength(22)
    expect(out.filter((g) => g.portionSystem === 'smae' && !g.legacy)).toHaveLength(9)
    expect(out.filter((g) => g.portionSystem === 'cl' && g.legacy)).toHaveLength(13)

    // Y con el input literal de la fila: solo su propio set, sin legado.
    const soloPropio = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'smae',
      usedSystems: ['smae'],
    })
    expect(soloPropio).toHaveLength(9)
    expect(soloPropio.every((g) => g.legacy === false)).toBe(true)
  })

  it('caso 4: coach «cl» que ya convirtió todo ⇒ el legado desaparece sin un solo write (S1)', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: ['cl'],
    })
    expect(out).toHaveLength(13)
    expect(out.some((g) => g.legacy)).toBe(false)
    expect(out.every((g) => CL_CODES.has(g.code))).toBe(true)
  })

  it('caso 5: el custom del coach con portionSystem «smae» se ve igual, sin marca de legado', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: [...CATALOG, CUSTOM_COACH],
      coachSystem: 'cl',
      usedSystems: [],
    })
    expect(codesOf(out)).toContain('SHK')
    expect(byCode(out, 'SHK').legacy).toBe(false)
    // El set se resuelve igual (para el chip), pero nunca lo esconde.
    expect(byCode(out, 'SHK').portionSystem).toBe('smae')
  })

  it('caso 6: el custom de team tampoco se filtra por set', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: [...CATALOG, CUSTOM_TEAM],
      coachSystem: 'cl',
      usedSystems: ['cl'],
    })
    expect(codesOf(out)).toContain('MIX')
    expect(byCode(out, 'MIX').legacy).toBe(false)
  })

  it('caso 7: coachSystem null o undefined se comporta como «cl»', () => {
    const conNull = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: null,
      usedSystems: [],
    })
    const conUndefined = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: undefined,
      usedSystems: [],
    })
    const conCl = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: [],
    })
    expect(codesOf(conNull)).toEqual(codesOf(conCl))
    expect(codesOf(conUndefined)).toEqual(codesOf(conCl))
  })

  it('caso 8: grupo del sistema sin portionSystem ⇒ código primero, set del coach después (R18)', () => {
    // ⚠ La fila 8 de DATA §7.2 dice que `code: 'C'` con `portion_system` nulo cae a
    // 'smae' y sale legado. Contradice el código de §7 (que NO tiene 'smae' como
    // default), R18 y las filas 14 y 16 del mismo cuadro. Manda el código: 'C' no
    // está en CL_CODES ⇒ cae al set del COACH y por eso NUNCA se marca legado.
    // `portionSystem` es opcional y NO admite `null` (W1.1): el «sin dato» es
    // `undefined`, que `systemOf` trata exactamente igual.
    const sinDato = group('C', 'Cereales', 10, undefined)
    const chilenoSinDato = group('PCT', 'Panes, cereales y tubérculos', 300, undefined)
    const out = visibleExchangeGroupsForCoach({
      groups: [sinDato, chilenoSinDato],
      coachSystem: 'cl',
      usedSystems: ['smae'],
    })
    expect(out).toHaveLength(2)
    expect(byCode(out, 'C').portionSystem).toBe('cl')
    expect(byCode(out, 'C').legacy).toBe(false)
    // El fallback por código sí funciona en el sentido que importa: PCT es chileno.
    expect(byCode(out, 'PCT').portionSystem).toBe('cl')
    expect(byCode(out, 'PCT').legacy).toBe(false)
    // Y con un coach 'smae', el mismo 'C' sin dato cae a 'smae' (su set), sin marca.
    const paraSmae = visibleExchangeGroupsForCoach({
      groups: [sinDato],
      coachSystem: 'smae',
      usedSystems: ['smae'],
    })
    expect(byCode(paraSmae, 'C').portionSystem).toBe('smae')
    expect(byCode(paraSmae, 'C').legacy).toBe(false)
  })

  it('caso 9: catálogo vacío ⇒ []', () => {
    expect(
      visibleExchangeGroupsForCoach({ groups: [], coachSystem: 'cl', usedSystems: ['smae'] }),
    ).toEqual([])
  })

  it('caso 12: fail-open ⇒ con usedSystems undefined se ven los 22 y ninguno queda legado', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: undefined,
    })
    expect(out).toHaveLength(22)
    expect(out.some((g) => g.legacy)).toBe(false)
  })

  it('caso 13: fail-open de las DOS lecturas ⇒ idem, tratando al coach como «cl»', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: undefined,
      usedSystems: undefined,
    })
    expect(out).toHaveLength(22)
    expect(out.some((g) => g.legacy)).toBe(false)
    expect(out.filter((g) => g.portionSystem === 'cl')).toHaveLength(13)
    expect(out.filter((g) => g.portionSystem === 'smae')).toHaveLength(9)
  })

  it('caso 17: piso defensivo ⇒ catálogo sin ningún grupo del set propio devuelve TODO sin marca', () => {
    // Entre W0 y W6.8 los 13 chilenos siguen con `deleted_at` y no llegan al catálogo:
    // un coach 'cl' sin targets SMAE vivos vería el picker VACÍO. El piso le devuelve
    // los 9 SMAE sin chip, que es lo que ve hoy en producción.
    const out = visibleExchangeGroupsForCoach({
      groups: [...SMAE_GROUPS, CUSTOM_COACH],
      coachSystem: 'cl',
      usedSystems: [],
    })
    expect(out).toHaveLength(10)
    expect(out.every((g) => g.legacy === false)).toBe(true)
    expect(codesOf(out)).toEqual([...SMAE_ROWS.map(([code]) => code), 'SHK'])
  })

  it('caso 18: el piso NO dispara si quedó algún grupo del sistema visible', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: [...SMAE_GROUPS, CUSTOM_COACH],
      coachSystem: 'cl',
      usedSystems: ['smae'],
    })
    expect(out).toHaveLength(10)
    expect(out.filter((g) => g.legacy)).toHaveLength(9)
    expect(out.every((g) => (g.isSystem ? g.legacy : !g.legacy))).toBe(true)
    expect(byCode(out, 'SHK').legacy).toBe(false)
  })
})

describe('compareVisibleGroups', () => {
  it('caso 10: propio antes que legado, system antes que custom, sortOrder asc y empate por code', () => {
    const propio = (code: string, sortOrder: number): VisibleExchangeGroup => ({
      ...group(code, code, sortOrder, 'cl'),
      portionSystem: 'cl',
      legacy: false,
    })
    const legado: VisibleExchangeGroup = {
      ...group('C', 'Cereales', 10, 'smae'),
      portionSystem: 'smae',
      legacy: true,
    }
    const custom: VisibleExchangeGroup = {
      ...CUSTOM_COACH,
      portionSystem: 'cl',
      legacy: false,
      sortOrder: 220,
    }

    // Propio antes que legado, aunque el legado tenga sortOrder mucho menor.
    expect(compareVisibleGroups(propio('PCT', 300), legado)).toBeLessThan(0)
    expect(compareVisibleGroups(legado, propio('PCT', 300))).toBeGreaterThan(0)
    // Dentro del mismo bloque, system antes que custom.
    expect(compareVisibleGroups(propio('LS', 220), custom)).toBeLessThan(0)
    // Luego sortOrder ascendente.
    expect(compareVisibleGroups(propio('LD', 210), propio('SCP', 330))).toBeLessThan(0)
    // Empate de sortOrder ⇒ code.
    expect(compareVisibleGroups(propio('AG', 240), propio('CB', 240))).toBeLessThan(0)
    expect(compareVisibleGroups(propio('CB', 240), propio('AG', 240))).toBeGreaterThan(0)
  })

  it('caso 11: orden completo del coach que ve ambos sets ⇒ chileno primero pese al sort_order mayor', () => {
    const out = visibleExchangeGroupsForCoach({
      groups: CATALOG,
      coachSystem: 'cl',
      usedSystems: ['smae'],
    }).sort(compareVisibleGroups)
    expect(codesOf(out)).toEqual([
      'LD', 'LS', 'LE', 'CB', 'CA', 'LGS', 'VG', 'VL', 'FR', 'PCT', 'AG', 'AZ', 'SCP',
      'C', 'P', 'F', 'V', 'LAC', 'ARL', 'SP', 'G', 'LEG',
    ])
  })
})

describe('systemOf e isClGroup', () => {
  it('caso 14: con el campo ausente resuelve por código y, si no, por el set del coach (R18)', () => {
    // El dato explícito manda siempre.
    expect(systemOf({ code: 'C', portionSystem: 'smae' }, 'cl')).toBe('smae')
    expect(systemOf({ code: 'PCT', portionSystem: 'cl' }, 'smae')).toBe('cl')
    // Sin dato: `groupCode` chileno ⇒ 'cl' con CUALQUIER coachSystem.
    expect(systemOf({ groupCode: 'PCT' }, 'cl')).toBe('cl')
    expect(systemOf({ groupCode: 'PCT' }, 'smae')).toBe('cl')
    // Sin dato y código SMAE ⇒ cae al set del coach, NO a 'smae'.
    expect(systemOf({ groupCode: 'C' }, 'cl')).toBe('cl')
    expect(systemOf({ groupCode: 'C' }, 'smae')).toBe('smae')
    // `portionSystem: undefined` explícito se trata igual que la llave ausente
    // (el tipo NO admite `null`: el borde normaliza la columna nula, W1.1).
    expect(systemOf({ groupCode: 'C', portionSystem: undefined }, 'cl')).toBe('cl')
    // Sin código de ningún tipo, cae al set del coach.
    expect(systemOf({}, 'cl')).toBe('cl')
    expect(systemOf({}, 'smae')).toBe('smae')
  })

  it('caso 16: isClGroup toma DOS parámetros y nunca marca legado por falta de dato', () => {
    expect(isClGroup({ groupCode: 'PCT', portionSystem: undefined }, 'smae')).toBe(true)
    expect(isClGroup({ groupCode: 'C' }, 'smae')).toBe(false)
    expect(isClGroup({ groupCode: 'C' }, 'cl')).toBe(true)
    // Coherencia con `systemOf`: son la misma regla.
    expect(isClGroup({ code: 'LEG', portionSystem: 'smae' }, 'cl')).toBe(false)
    expect(isClGroup({ code: 'AG', portionSystem: 'cl' }, 'smae')).toBe(true)
  })

  it('CL_CODES tiene exactamente los 13 códigos chilenos y ninguno de los 9 SMAE', () => {
    expect(CL_CODES.size).toBe(13)
    for (const [code] of CL_ROWS) expect(CL_CODES.has(code)).toBe(true)
    for (const [code] of SMAE_ROWS) expect(CL_CODES.has(code)).toBe(false)
  })
})
