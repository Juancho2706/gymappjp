import { describe, it, expect } from 'vitest'
import { COPY_PRESETS, daysForCopyPreset, replacedDaysOf, targetsForCopyPreset } from './editor-copy-presets'

const WEEKDAYS = COPY_PRESETS[0]
const WEEKEND = COPY_PRESETS[1]
const ALL = COPY_PRESETS[2]

/** Destinos en el orden de lectura de la pantalla: dia base + Lu→Do. */
const TARGETS = [
  { key: 'default', dayOfWeek: null },
  { key: 'lu', dayOfWeek: 1 },
  { key: 'mi', dayOfWeek: 3 },
  { key: 'vi', dayOfWeek: 5 },
  { key: 'sa', dayOfWeek: 6 },
  { key: 'do', dayOfWeek: 0 },
]

describe('targetsForCopyPreset — el preset MARCA destinos, no los inventa', () => {
  it('"Lu a Vi" toma solo los dias habiles que existen', () => {
    expect(targetsForCopyPreset(TARGETS, WEEKDAYS)).toEqual(['lu', 'mi', 'vi'])
  })

  it('"Fin de semana" toma sabado y domingo', () => {
    expect(targetsForCopyPreset(TARGETS, WEEKEND)).toEqual(['sa', 'do'])
  })

  it('"Todos" toma todos los destinos disponibles, incluido el dia base', () => {
    expect(targetsForCopyPreset(TARGETS, ALL)).toEqual(['default', 'lu', 'mi', 'vi', 'sa', 'do'])
  })

  it('el dia base NO entra en Lu-Vi ni en el fin de semana', () => {
    expect(targetsForCopyPreset(TARGETS, WEEKDAYS)).not.toContain('default')
    expect(targetsForCopyPreset(TARGETS, WEEKEND)).not.toContain('default')
  })

  it('sin destinos del preset devuelve vacio (la UI apaga el chip)', () => {
    expect(targetsForCopyPreset([{ key: 'default', dayOfWeek: null }], WEEKEND)).toEqual([])
    expect(targetsForCopyPreset([], ALL)).toEqual([])
  })

  it('conserva el orden de llegada (que ya es el de lectura)', () => {
    const shuffled = [
      { key: 'vi', dayOfWeek: 5 },
      { key: 'lu', dayOfWeek: 1 },
    ]
    expect(targetsForCopyPreset(shuffled, WEEKDAYS)).toEqual(['vi', 'lu'])
  })
})

describe('daysForCopyPreset — el dia ocupado se ELIGE y se marca "reemplaza"', () => {
  it('marca los dias que ya tienen contenido propio en vez de descartarlos', () => {
    expect(daysForCopyPreset(WEEKDAYS, { takenDays: [2, 4], sourceDayOfWeek: null })).toEqual([
      { dayOfWeek: 1, replaces: false },
      { dayOfWeek: 2, replaces: true },
      { dayOfWeek: 3, replaces: false },
      { dayOfWeek: 4, replaces: true },
      { dayOfWeek: 5, replaces: false },
    ])
  })

  it('el dia de ORIGEN nunca es destino, aunque el preset lo abarque', () => {
    const days = daysForCopyPreset(WEEKDAYS, { takenDays: [1], sourceDayOfWeek: 1 })
    expect(days.map((day) => day.dayOfWeek)).toEqual([2, 3, 4, 5])
  })

  it('"Todos" cubre la semana completa en orden Lu→Do', () => {
    const days = daysForCopyPreset(ALL, { takenDays: [], sourceDayOfWeek: null })
    expect(days.map((day) => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(days.every((day) => !day.replaces)).toBe(true)
  })

  it('con la semana entera ocupada el preset SIGUE teniendo destinos (todos reemplazan)', () => {
    const days = daysForCopyPreset(ALL, { takenDays: [0, 1, 2, 3, 4, 5, 6], sourceDayOfWeek: 6 })
    expect(days.map((day) => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 0])
    expect(days.every((day) => day.replaces)).toBe(true)
  })

  it('sin destinos fuera del origen devuelve vacio (la UI apaga la opcion)', () => {
    expect(daysForCopyPreset(WEEKEND, { takenDays: [6, 0], sourceDayOfWeek: 6 })).toHaveLength(1)
    expect(daysForCopyPreset({ id: 'weekend', label: 'x', days: [6] }, { takenDays: [], sourceDayOfWeek: 6 })).toEqual([])
  })
})

describe('replacedDaysOf — lo que el aviso de confirmacion tiene que nombrar', () => {
  it('devuelve solo los dias que se sobrescriben, en el orden recibido', () => {
    expect(
      replacedDaysOf(daysForCopyPreset(WEEKDAYS, { takenDays: [3, 1], sourceDayOfWeek: null })),
    ).toEqual([1, 3])
  })

  it('sin ocupados devuelve vacio (se copia sin preguntar)', () => {
    expect(replacedDaysOf(daysForCopyPreset(WEEKEND, { takenDays: [], sourceDayOfWeek: null }))).toEqual([])
  })
})
