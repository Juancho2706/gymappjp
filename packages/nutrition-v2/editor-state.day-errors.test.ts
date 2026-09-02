import { describe, expect, it } from 'vitest'
import {
  qeDayErrorSummaries,
  qeErrorDayKeys,
  qeFirstErrorDayKey,
  qePublishBlockedBar,
  type QeItem,
  type QePortionTarget,
  type QeSlot,
  type QeVariant,
} from './editor-state'

// Errores POR DIA del editor unico (reporte JP/Alan 2026-09-02): el lienzo pinta un dia a la
// vez y la validacion revisa todos. Estos helpers mapean cada clave de error a su dia para que
// los chips lo marquen, el publish salte hasta el y la barra lo nombre — mismos resultados en
// RN y web porque viven en el paquete.

const GENERIC = 'Revisa los campos marcados antes de publicar.'

function item(key: string): QeItem {
  return { key } as unknown as QeItem
}

function portion(key: string): QePortionTarget {
  return { key } as unknown as QePortionTarget
}

function slot(key: string, items: QeItem[] = [], portionTargets: QePortionTarget[] = []): QeSlot {
  return { key, items, portionTargets } as unknown as QeSlot
}

function variant(key: string, label: string, slots: QeSlot[], isDefault = false): QeVariant {
  return { key, label, isDefault, slots } as unknown as QeVariant
}

// Orden de lectura: base → Lu → Ma → Mi (el caller ya lo ordena).
const BASE = variant('default', 'Todos los días', [slot('s-base', [item('i-base')])], true)
const MONDAY = variant('mon', 'Lunes', [slot('s-mon', [item('i-mon-1'), item('i-mon-2')], [portion('p-mon')])])
const TUESDAY = variant('tue', 'Martes', [])
const WEDNESDAY = variant('wed', 'Miércoles', [])
const VARIANTS = [BASE, MONDAY, TUESDAY, WEDNESDAY]

describe('qeDayErrorSummaries', () => {
  it('sin errores no devuelve dias', () => {
    expect(qeDayErrorSummaries(VARIANTS, {})).toEqual([])
  })

  it('mapea cada clave a su dia, en el orden de lectura recibido', () => {
    const errors = {
      'variant.wed.slots': 'Este día no tiene ninguna comida.',
      'item.i-mon-2.quantity': 'Cantidad inválida.',
      'variant.tue.slots': 'Este día no tiene ninguna comida.',
    }
    expect(qeDayErrorSummaries(VARIANTS, errors).map((s) => [s.key, s.kind, s.count])).toEqual([
      ['mon', 'quantity', 1],
      ['tue', 'empty', 1],
      ['wed', 'empty', 1],
    ])
  })

  it('ignora los errores fuera de los dias (plan.*, meta.*)', () => {
    const errors = { 'meta.name': 'El plan necesita un nombre.', 'plan.dayVariants': 'x', 'plan.visibleNotes': 'y' }
    expect(qeDayErrorSummaries(VARIANTS, errors)).toEqual([])
  })

  it('no confunde claves de dias cuyo key es prefijo de otro', () => {
    const tue2 = variant('tue-2', 'Martes bis', [])
    const errors = { 'variant.tue-2.slots': 'vacío' }
    expect(qeDayErrorSummaries([BASE, TUESDAY, tue2], errors).map((s) => s.key)).toEqual(['tue-2'])
  })

  it('un solo tipo declara el tipo; una mezcla es «fields»', () => {
    const onlyNames = { 'slot.s-mon.name': 'La franja necesita un nombre.' }
    expect(qeDayErrorSummaries(VARIANTS, onlyNames)[0]).toMatchObject({ key: 'mon', kind: 'slotName', count: 1 })
    const mixed = { 'slot.s-mon.name': 'x', 'item.i-mon-1.quantity': 'y', 'portion.p-mon.portions': 'z' }
    expect(qeDayErrorSummaries(VARIANTS, mixed)[0]).toMatchObject({ key: 'mon', kind: 'fields', count: 3 })
    const targets = { 'target.mon.calories': 'Ese valor no es razonable.', 'variant.mon.label': 'x' }
    expect(qeDayErrorSummaries(VARIANTS, targets)[0]).toMatchObject({ key: 'mon', kind: 'fields', count: 2 })
  })

  it('el dia base se nombra «El día base» y un dia sin etiqueta «Ese día»', () => {
    const unnamed = variant('x', '   ', [])
    const errors = { 'variant.default.label': 'x', 'variant.x.slots': 'vacío' }
    expect(qeDayErrorSummaries([BASE, unnamed], errors).map((s) => s.label)).toEqual(['El día base', 'Ese día'])
  })
})

describe('qeErrorDayKeys / qeFirstErrorDayKey', () => {
  const errors = { 'variant.tue.slots': 'vacío', 'variant.wed.slots': 'vacío' }

  it('devuelve el set de dias con error', () => {
    expect([...qeErrorDayKeys(VARIANTS, errors)]).toEqual(['tue', 'wed'])
  })

  it('salta al primer dia con error cuando el activo esta limpio', () => {
    expect(qeFirstErrorDayKey(VARIANTS, errors, 'default')).toBe('tue')
    expect(qeFirstErrorDayKey(VARIANTS, errors, null)).toBe('tue')
  })

  it('no salta si el dia activo ya tiene errores (sus marcas estan a la vista)', () => {
    expect(qeFirstErrorDayKey(VARIANTS, errors, 'wed')).toBeNull()
  })

  it('no salta sin errores por dia', () => {
    expect(qeFirstErrorDayKey(VARIANTS, { 'meta.name': 'x' }, 'default')).toBeNull()
    expect(qeFirstErrorDayKey(VARIANTS, {}, 'default')).toBeNull()
  })
})

describe('qePublishBlockedBar', () => {
  it('generico cuando no hay errores por dia o viven solo en el dia activo', () => {
    expect(qePublishBlockedBar(VARIANTS, { 'meta.name': 'x' }, 'default', GENERIC)).toEqual({
      message: GENERIC,
      jumpToKey: null,
      jumpLabel: null,
    })
    expect(qePublishBlockedBar(VARIANTS, { 'variant.tue.slots': 'v' }, 'tue', GENERIC)).toEqual({
      message: GENERIC,
      jumpToKey: null,
      jumpLabel: null,
    })
  })

  it('un solo dia vacio fuera del activo: lo nombra y lleva hasta el', () => {
    expect(qePublishBlockedBar(VARIANTS, { 'variant.tue.slots': 'v' }, 'default', GENERIC)).toEqual({
      message: 'Martes no tiene ninguna comida.',
      jumpToKey: 'tue',
      jumpLabel: 'Ir a Martes',
    })
  })

  it('varios dias vacios: los lista y lleva al primero que no sea el activo', () => {
    const errors = { 'variant.tue.slots': 'v', 'variant.wed.slots': 'v' }
    expect(qePublishBlockedBar(VARIANTS, errors, 'default', GENERIC)).toEqual({
      message: 'Martes y Miércoles no tienen ninguna comida.',
      jumpToKey: 'tue',
      jumpLabel: 'Ir a Martes',
    })
    // Ya parado en Martes (tras el salto): sigue nombrando a los dos y ofrece Miércoles.
    expect(qePublishBlockedBar(VARIANTS, errors, 'tue', GENERIC)).toMatchObject({
      message: 'Martes y Miércoles no tienen ninguna comida.',
      jumpToKey: 'wed',
      jumpLabel: 'Ir a Miércoles',
    })
  })

  it('tres dias se listan con comas y «y»', () => {
    const errors = { 'item.i-mon-1.quantity': 'x', 'variant.tue.slots': 'v', 'variant.wed.slots': 'v' }
    expect(qePublishBlockedBar(VARIANTS, errors, 'default', GENERIC).message).toBe(
      'Lunes, Martes y Miércoles tienen campos por revisar.',
    )
  })

  it('cantidad y nombre de franja tienen su propia frase, con plural', () => {
    expect(qePublishBlockedBar(VARIANTS, { 'item.i-mon-1.quantity': 'x' }, 'default', GENERIC).message).toBe(
      'Lunes tiene un alimento sin cantidad.',
    )
    expect(
      qePublishBlockedBar(VARIANTS, { 'item.i-mon-1.quantity': 'x', 'item.i-mon-2.quantity': 'x' }, 'default', GENERIC)
        .message,
    ).toBe('Lunes tiene alimentos sin cantidad.')
    expect(qePublishBlockedBar(VARIANTS, { 'slot.s-mon.name': 'x' }, 'default', GENERIC).message).toBe(
      'Lunes tiene una franja sin nombre.',
    )
    expect(qePublishBlockedBar(VARIANTS, { 'target.mon.calories': 'x' }, 'default', GENERIC).message).toBe(
      'Lunes tiene campos por revisar.',
    )
  })

  it('el dia base se nombra bien en la oracion y en el boton', () => {
    expect(qePublishBlockedBar(VARIANTS, { 'variant.default.slots': 'v' }, 'tue', GENERIC)).toEqual({
      message: 'El día base no tiene ninguna comida.',
      jumpToKey: 'default',
      jumpLabel: 'Ir al día base',
    })
  })
})
