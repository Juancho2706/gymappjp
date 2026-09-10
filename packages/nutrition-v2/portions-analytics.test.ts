import { describe, expect, it } from 'vitest'
import {
  conversionAppliedPayload,
  conversionPreviewedPayload,
  portionGroupBumpedPayload,
  targetsScopePayload,
} from './portions-analytics'

/**
 * W3 remate — los 4 constructores de payload del tren de porciones, contra DATA.md §11.
 *
 * Este archivo prueba DOS cosas y ninguna mas:
 *
 *  1. La FORMA es exhaustiva. `toEqual` sobre un objeto literal ya falla si sobra una llave,
 *     pero igual se asserta `Object.keys(...).sort()` explicito: es la lista que un lector va a
 *     comparar contra la tabla de §11 sin tener que deducirla del literal.
 *  2. NINGUN payload lleva cifras de salud (Ley 21.719 + SPEC §17 no-negociable 9). El dia que
 *     alguien le agregue `{ kcal_before }` «para medir mejor», este test se pone rojo antes de
 *     que el evento salga a produccion.
 *
 * Por que existe: los payloads se construian a mano en cada superficie y el mismo evento salia
 * con dos formas distintas —la web sin `surface`, RN completando llaves de su cosecha—. Ahora
 * los construye el paquete y las dos superficies mandan lo mismo.
 */

// ── Guardia de privacidad ─────────────────────────────────────────────────────

/**
 * Llaves PROHIBIDAS en cualquier evento de esta capa: energia, macros, gramos, porciones,
 * alimentos, nombres e ids. `portion_system` esta explicitamente permitido (es el SET, no una
 * cantidad) y por eso el patron de `portion` lleva el lookahead.
 */
const LLAVE_PROHIBIDA =
  /kcal|calor|energ|gram|macro|protein|carb|fat|grasa|food|aliment|portion(?!_system)|porcion|nombre|name|^id$|_id$|email|student|alumno|coach/i

/** Toda llave de todo payload de la capa pasa por aca. */
function assertSinCifrasDeSalud(payload: Readonly<Record<string, unknown>>): void {
  for (const llave of Object.keys(payload)) {
    expect(llave, `llave prohibida en el payload: ${llave}`).not.toMatch(LLAVE_PROHIBIDA)
  }
}

// ── 1 · bump (DATA §11, evento 1) ─────────────────────────────────────────────

describe('portionGroupBumpedPayload — 5 llaves', () => {
  const payload = portionGroupBumpedPayload('web', {
    groupCode: 'PCT',
    portionSystem: 'cl',
    from: 'picker',
    undone: false,
  })

  it('la forma es EXACTAMENTE la de §11', () => {
    expect(payload).toEqual({
      surface: 'web',
      group_code: 'PCT',
      portion_system: 'cl',
      from: 'picker',
      undone: false,
    })
    expect(Object.keys(payload).sort()).toEqual([
      'from',
      'group_code',
      'portion_system',
      'surface',
      'undone',
    ])
  })

  it('`surface` viene por parametro: RN manda el MISMO evento con otra superficie', () => {
    const rn = portionGroupBumpedPayload('rn', {
      groupCode: 'C',
      portionSystem: 'smae',
      from: 'stepper',
      undone: true,
    })
    expect(rn.surface).toBe('rn')
    expect(Object.keys(rn).sort()).toEqual(Object.keys(payload).sort())
  })

  it('`group_code` es un termino de dominio del COACH, no una cifra de salud', () => {
    // Es la UNICA excepcion de la capa y esta escrita en §11: para el coach 'PCT' es una
    // etiqueta de su herramienta; por eso el evento del ALUMNO (5) va sin ella.
    expect(payload.group_code).toBe('PCT')
    const resto = Object.fromEntries(
      Object.entries(payload).filter(([llave]) => llave !== 'group_code'),
    )
    assertSinCifrasDeSalud(resto)
  })
})

// ── 2 · preview de la conversion (DATA §11, evento 2) ─────────────────────────

describe('conversionPreviewedPayload — 7 llaves, todas conteos o banderas', () => {
  const payload = conversionPreviewedPayload('rn', {
    slots: 3,
    rows: 5,
    rowsReview: 2,
    hasDairy: true,
    hasCollapse: false,
    hasCustomMatch: true,
  })

  it('la forma es EXACTAMENTE la de §11', () => {
    expect(payload).toEqual({
      surface: 'rn',
      slots: 3,
      rows: 5,
      rows_review: 2,
      has_dairy: true,
      has_collapse: false,
      has_custom_match: true,
    })
    expect(Object.keys(payload).sort()).toEqual([
      'has_collapse',
      'has_custom_match',
      'has_dairy',
      'rows',
      'rows_review',
      'slots',
      'surface',
    ])
  })

  it('la web manda la MISMA forma, solo cambia `surface`', () => {
    const web = conversionPreviewedPayload('web', {
      slots: 1,
      rows: 1,
      rowsReview: 0,
      hasDairy: false,
      hasCollapse: false,
      hasCustomMatch: false,
    })
    expect(web.surface).toBe('web')
    expect(Object.keys(web).sort()).toEqual(Object.keys(payload).sort())
  })

  it('sin cifras de salud: los tres numeros son CONTEOS de pantalla', () => {
    assertSinCifrasDeSalud(payload)
    expect([payload.slots, payload.rows, payload.rows_review].every(Number.isInteger)).toBe(true)
  })
})

// ── 3 · conversion aplicada (DATA §11, evento 3) ──────────────────────────────

describe('conversionAppliedPayload — 5 llaves', () => {
  const payload = conversionAppliedPayload('web', {
    slots: 4,
    rows: 7,
    dairyChoice: 'LE',
    customReplaced: 2,
  })

  it('la forma es EXACTAMENTE la de §11', () => {
    expect(payload).toEqual({
      surface: 'web',
      slots: 4,
      rows: 7,
      dairy_choice: 'LE',
      custom_replaced: 2,
    })
    expect(Object.keys(payload).sort()).toEqual([
      'custom_replaced',
      'dairy_choice',
      'rows',
      'slots',
      'surface',
    ])
  })

  it('`dairy_choice` dice QUE eligio, nunca cuanto — y admite «mixed»', () => {
    const mixto = conversionAppliedPayload('rn', {
      slots: 2,
      rows: 2,
      dairyChoice: 'mixed',
      customReplaced: 0,
    })
    expect(mixto.dairy_choice).toBe('mixed')
    expect(['LD', 'LS', 'LE', 'mixed']).toContain(mixto.dairy_choice)
    expect(Object.keys(mixto).sort()).toEqual(Object.keys(payload).sort())
  })

  it('sin cifras de salud: `custom_replaced` es CUANTOS grupos, no cuales', () => {
    assertSinCifrasDeSalud(payload)
    expect(Number.isInteger(payload.custom_replaced)).toBe(true)
  })
})

// ── 4 · alcance de metas (DATA §11, evento 4) ─────────────────────────────────

describe('targetsScopePayload — 2 llaves', () => {
  const payload = targetsScopePayload('day', 'switch')

  it('la forma es EXACTAMENTE la de §11 menos `surface`, que pega el consumidor', () => {
    // ASIMETRIA CONOCIDA (no la introduce W3): §11 declara `surface` tambien en el evento 4,
    // pero el constructor no lo toma por parametro y las DOS superficies se lo pegan con el
    // mismo spread (`{ surface: 'web', ...targetsScopePayload(…) }`). Como las dos hacen lo
    // mismo, el evento sale con una sola forma; alinearlo es trabajo de W4, no de aca.
    expect(payload).toEqual({ scope: 'day', from: 'switch' })
    expect(Object.keys(payload).sort()).toEqual(['from', 'scope'])
  })

  it('el otro alcance y el otro origen tampoco agregan llaves', () => {
    const otro = targetsScopePayload('all', 'go_to_base')
    expect(otro).toEqual({ scope: 'all', from: 'go_to_base' })
    expect(Object.keys(otro).sort()).toEqual(Object.keys(payload).sort())
  })

  it('sin cifras de salud: JAMAS viaja la meta que el coach escribio', () => {
    assertSinCifrasDeSalud(payload)
  })
})
