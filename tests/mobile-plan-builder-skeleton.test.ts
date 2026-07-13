import { describe, expect, it } from 'vitest'
import { buildDaySkeleton } from '../apps/mobile/lib/plan-builder/skeleton'
import type { BuilderBlock, DayState } from '../apps/mobile/lib/plan-builder/types'

function block(uid: string): BuilderBlock {
  return {
    uid,
    exercise_id: `exercise-${uid}`,
    exercise_name: `Ejercicio ${uid}`,
    muscle_group: 'General',
  }
}

describe('mobile plan builder day skeleton', () => {
  it('limita ciclos al contrato 1..14', () => {
    expect(buildDaySkeleton('cycle', 0, [])).toHaveLength(1)
    expect(buildDaySkeleton('cycle', 14, [])).toHaveLength(14)
    expect(buildDaySkeleton('cycle', 31, [])).toHaveLength(14)
  })

  it('conserva contenido por id dentro del ciclo limitado', () => {
    const existing = [{ id: 2, name: 'Día 2', title: 'Piernas', blocks: [], is_rest: true }]
    const days = buildDaySkeleton('cycle', 20, existing)
    expect(days[1]).toMatchObject({ id: 2, title: 'Piernas', is_rest: true })
    expect(days.at(-1)?.id).toBe(14)
  })

  it('al reducir un ciclo agrega los bloques huérfanos al último día sin reordenarlos', () => {
    const existing: DayState[] = [
      { id: 4, name: 'Día 4', title: 'Base', blocks: [block('base')] },
      { id: 8, name: 'Día 8', title: 'Ocho', blocks: [block('ocho-1'), block('ocho-2')] },
      { id: 14, name: 'Día 14', title: 'Catorce', blocks: [block('catorce')] },
    ]

    const days = buildDaySkeleton('cycle', 4, existing)

    expect(days).toHaveLength(4)
    expect(days[3]?.blocks.map((item) => item.uid)).toEqual(['base', 'ocho-1', 'ocho-2', 'catorce'])
  })

  it('al pasar de ciclo a semanal conserva en domingo los bloques de días 8+', () => {
    const existing: DayState[] = [
      { id: 7, name: 'Día 7', title: 'Domingo', blocks: [block('domingo')] },
      { id: 8, name: 'Día 8', title: 'Ocho', blocks: [block('ocho')] },
      { id: 10, name: 'Día 10', title: 'Diez', blocks: [block('diez')] },
    ]

    const days = buildDaySkeleton('weekly', 14, existing)

    expect(days).toHaveLength(7)
    expect(days[6]?.blocks.map((item) => item.uid)).toEqual(['domingo', 'ocho', 'diez'])
  })
})
