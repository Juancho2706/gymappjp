import { describe, it, expect } from 'vitest'
import { COPY_PRESETS, freeDaysForCopyPreset, targetsForCopyPreset } from './copy-presets'

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

describe('freeDaysForCopyPreset — dias libres del submenu del dia', () => {
  it('descarta los dias que ya tienen contenido propio', () => {
    expect(freeDaysForCopyPreset(WEEKDAYS, [2, 4])).toEqual([1, 3, 5])
  })

  it('"Todos" cubre la semana completa en orden Lu→Do', () => {
    expect(freeDaysForCopyPreset(ALL, [])).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('con todo ocupado devuelve vacio (opcion deshabilitada)', () => {
    expect(freeDaysForCopyPreset(WEEKEND, [6, 0])).toEqual([])
    expect(freeDaysForCopyPreset(ALL, [0, 1, 2, 3, 4, 5, 6])).toEqual([])
  })
})
