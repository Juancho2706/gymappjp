import { describe, expect, it } from 'vitest'
import {
  qeDaysMissingTargets,
  qeTargetsGapBar,
  validateQuickEdit,
  type QeTargetsText,
  type QeVariant,
  type QuickEditState,
} from '@eva/nutrition-v2'

/**
 * W4.4 — METAS PARCIALES NO BLOQUEAN EL PUBLISH (caso Pame Cid, 2026-09-08).
 *
 * La coach escribió 2.040 kcal parada en Martes y el resto de la semana quedó sin objetivo. El
 * arreglo AVISA, no bloquea: el aviso vive fuera de `errors` (misma vía que
 * `qeDaysMissingBasePortions` + `PortionsDayGapNotice`), la barra lo pinta en ámbar con
 * `role="status"` y el botón primario pasa a «Publicar igual».
 *
 * Por qué es un test y no una nota: si algún día alguien "completa" la validación agregando una
 * severidad para las metas, los planes que YA están así en LIVE quedarían irrepublicables — el
 * mismo daño que reparó `ee6766ae` el 02-09. Este archivo es nuevo a propósito: los 7 tests de
 * `quick-edit-publish-guards.test.ts` cubren guards que SÍ bloquean y no se tocan.
 */

function targets(partial: Partial<QeTargetsText> = {}): QeTargetsText {
  return { calories: '', proteinG: '', carbsG: '', fatsG: '', ...partial }
}

function variant(
  key: string,
  label: string,
  dayOfWeek: number | null,
  isDefault: boolean,
  values: Partial<QeTargetsText> = {},
): QeVariant {
  return {
    key,
    id: null,
    variantKey: key,
    label,
    dayOfWeek,
    isDefault,
    targets: targets(values),
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [],
  }
}

function stateOf(variants: QeVariant[]): QuickEditState {
  return { variants, visibleNotes: '' }
}

/** El plan de Pame: base sin metas y 2.040 kcal escritas solo en Martes. */
function partialTargetsState(): QuickEditState {
  return stateOf([
    variant('default', 'Todos los días', null, true),
    variant('tue', 'Martes', 2, false, { calories: '2040', proteinG: '144', carbsG: '247', fatsG: '52' }),
  ])
}

describe('metas parciales — avisan, NO bloquean el publish', () => {
  it('un plan con meta solo en Martes sigue publicando (la validación local no lo corta)', () => {
    const validation = validateQuickEdit(partialTargetsState(), { strategy: 'flexible' })

    expect(validation.ok).toBe(true)
    // Y nada del aviso se coló en `errors`: si apareciera una clave `target.*`, la barra roja se
    // encendería y el botón «Publicar igual» estaría deshabilitado.
    expect(Object.keys(validation.errors)).toEqual([])
  })

  it('`qeTargetsGapBar` devuelve el aviso con el día CON meta como origen del arreglo', () => {
    const gap = qeTargetsGapBar(partialTargetsState())

    expect(gap).not.toBeNull()
    // `dayKey` es el `fromVariantKey` de `APPLY_BASE_TARGETS`: desde Martes se rellenan el base y
    // los días que quedaron sin objetivo.
    expect(gap?.dayKey).toBe('tue')
    expect(gap?.message).toBe(
      'Solo Martes tiene meta. Lunes, miércoles, jueves, viernes, sábado y domingo quedan sin objetivo.',
    )
    // El punto ámbar de la cápsula y del rail sale de acá: el base es el único día del estado sin
    // meta (los otros seis de la semana resuelven a él, que es lo que el aviso nombra).
    expect(qeDaysMissingTargets(partialTargetsState()).map((day) => day.key)).toEqual(['default'])
  })

  it('con TODOS los días con meta no hay aviso (`null`) y el publish sigue verde', () => {
    const completo = stateOf([
      variant('default', 'Todos los días', null, true, { calories: '2040' }),
      variant('tue', 'Martes', 2, false, { calories: '1800' }),
    ])

    expect(qeTargetsGapBar(completo)).toBeNull()
    expect(qeDaysMissingTargets(completo)).toEqual([])
    expect(validateQuickEdit(completo, { strategy: 'flexible' }).ok).toBe(true)
  })
})
