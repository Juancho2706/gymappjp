import { describe, expect, it, vi } from 'vitest'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// plan-persistence.orphan-reuse.test.ts). mapWriteError es puro; solo necesita que el modulo cargue.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/services/auth/current-coach.service', () => ({
  getCurrentCoachSession: vi.fn(),
}))

import { mapWriteError } from './plan-persistence'

describe('mapWriteError — guard optimista del quick-edit', () => {
  it('mapea nutrition_v2_publish_stale_base => STALE_BASE', () => {
    const res = mapWriteError({ message: 'nutrition_v2_publish_stale_base', code: '22023' }, 'publicacion')
    expect(res.code).toBe('STALE_BASE')
  })

  it('sigue mapeando effective_date_must_follow_current_version => EFFECTIVE_DATE', () => {
    const res = mapWriteError(
      { message: 'nutrition_v2_effective_date_must_follow_current_version', code: '22023' },
      'publicacion',
    )
    expect(res.code).toBe('EFFECTIVE_DATE')
  })

  it('un 22023 generico (sin marcador) sigue cayendo en INVALID_DRAFT', () => {
    const res = mapWriteError({ message: 'algo_invalido', code: '22023' }, 'publicacion')
    expect(res.code).toBe('INVALID_DRAFT')
  })

  // W2 «Cantidades honestas» (R13): los CHECK de la medida casera dan un 23514 anonimo que no
  // dice NADA. Llegar aca significa que un cliente viejo mando `casera` o un gramaje imposible.
  it('el CHECK `unit <> casera` se traduce a un mensaje que dice que actualizar la app', () => {
    const res = mapWriteError(
      {
        message: 'new row violates check constraint "nutrition_prescription_items_v2_unit_not_casera"',
        code: '23514',
      },
      'publicacion',
    )
    expect(res.code).toBe('UNIT_NOT_PERSISTABLE')
    expect(res.error).toContain('medida casera')
  })

  it('el CHECK del rango de gramos se traduce al mismo copy que el corte de cliente', () => {
    const res = mapWriteError(
      {
        message: 'new row violates check constraint "nutrition_prescription_items_v2_household_grams_range"',
        code: '23514',
      },
      'publicacion',
    )
    expect(res.code).toBe('HOUSEHOLD_GRAMS_INVALID')
    expect(res.error).toContain('1 y 1.000 g')
  })
})
