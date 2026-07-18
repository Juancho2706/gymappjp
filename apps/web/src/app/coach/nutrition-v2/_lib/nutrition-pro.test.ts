import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'
import type { WorkspaceSummary } from '@/domain/auth/types'

// El helper importa `assertModule`/`hasModule` del motor de entitlements V1. Lo mockeamos para
// aislar el cableado del gate (sin tocar DB); las funciones puras se prueban directo.
vi.mock('@/services/entitlements.service', () => ({
  hasModule: vi.fn(),
  assertModule: vi.fn(),
}))

import { assertModule, hasModule } from '@/services/entitlements.service'
import {
  NUTRITION_PRO_HISTORY_DAYS_BASE,
  NUTRITION_PRO_MODULE_KEY,
  assertNutritionProV2,
  filterHistoryDaysToBaseWindow,
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
  requiredNutritionProFeature,
} from './nutrition-pro'

function draft(overrides: Record<string, unknown> = {}): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    clientId: '11111111-1111-4111-8111-111111111111',
    name: 'Plan',
    strategy: 'flexible',
    timezone: 'America/Santiago',
    permissions: {},
    dayVariants: [{ key: 'default', label: 'Todos los dias', targets: {}, mealSlots: [] }],
    ...overrides,
  })
}

const variant = (key: string) => ({ key, label: key, targets: {}, mealSlots: [] })

describe('requiredNutritionProFeature (frontera CEO Base/Pro)', () => {
  it('BASE: flexible con 1 variante y sin notas no requiere Pro', () => {
    expect(requiredNutritionProFeature(draft({ strategy: 'flexible' }))).toBeNull()
  })

  it('BASE: structured con 1 variante NO es Pro (CEO)', () => {
    expect(requiredNutritionProFeature(draft({ strategy: 'structured' }))).toBeNull()
  })

  it('PRO: estrategia hibrida', () => {
    expect(requiredNutritionProFeature(draft({ strategy: 'hybrid' }))).toBe('hybrid_strategy')
  })

  it('PRO: mas de una variante de dia', () => {
    expect(
      requiredNutritionProFeature(draft({ dayVariants: [variant('a'), variant('b')] })),
    ).toBe('multi_variant')
  })

  it('PRO: notas privadas con contenido', () => {
    expect(requiredNutritionProFeature(draft({ privateNotes: 'nota clinica' }))).toBe('private_notes')
  })

  it('PRO: protocolo con contenido', () => {
    expect(requiredNutritionProFeature(draft({ protocolNotes: 'protocolo' }))).toBe('protocol_notes')
  })

  it('notas en blanco (solo espacios) NO disparan Pro', () => {
    expect(requiredNutritionProFeature(draft({ privateNotes: '   ', protocolNotes: '  ' }))).toBeNull()
  })

  it('precedencia: hibrida gana sobre otras capacidades Pro', () => {
    expect(
      requiredNutritionProFeature(
        draft({ strategy: 'hybrid', dayVariants: [variant('a'), variant('b')], privateNotes: 'x' }),
      ),
    ).toBe('hybrid_strategy')
  })
})

describe('filterHistoryDaysToBaseWindow (corte 30 dias sin addon)', () => {
  const days = [
    { localDate: '2026-07-15' },
    { localDate: '2026-06-15' }, // hoy - 30, inclusivo
    { localDate: '2026-06-14' }, // fuera de ventana
    { localDate: '2026-05-01' },
  ]

  it('mantiene solo los dias dentro de la ventana (cutoff inclusivo)', () => {
    const kept = filterHistoryDaysToBaseWindow(days, '2026-07-15')
    expect(kept.map((d) => d.localDate)).toEqual(['2026-07-15', '2026-06-15'])
  })

  it('ventana por defecto = 30 dias', () => {
    expect(NUTRITION_PRO_HISTORY_DAYS_BASE).toBe(30)
  })

  it('ventana configurable', () => {
    const kept = filterHistoryDaysToBaseWindow(days, '2026-07-15', 400)
    expect(kept).toHaveLength(4)
  })
})

describe('nutritionProCtxFromWorkspace (pool manda / si no, el coach)', () => {
  it('coach_team => el team decide', () => {
    const ws = { type: 'coach_team', teamId: 'team-9' } as unknown as WorkspaceSummary
    expect(nutritionProCtxFromWorkspace('coach-1', ws)).toEqual({ coachId: 'coach-1', teamId: 'team-9' })
  })

  it('standalone => modulos del propio coach (teamId null)', () => {
    const ws = { type: 'coach_standalone' } as unknown as WorkspaceSummary
    expect(nutritionProCtxFromWorkspace('coach-1', ws)).toEqual({ coachId: 'coach-1', teamId: null })
  })

  it('enterprise_coach => resuelve por el coach (paridad V1 guidance)', () => {
    const ws = { type: 'enterprise_coach', orgId: 'org-1' } as unknown as WorkspaceSummary
    expect(nutritionProCtxFromWorkspace('coach-1', ws)).toEqual({ coachId: 'coach-1', teamId: null })
  })

  it('sin workspace => coach solo', () => {
    expect(nutritionProCtxFromWorkspace('coach-1', null)).toEqual({ coachId: 'coach-1', teamId: null })
  })
})

describe('delegacion al motor de entitlements V1', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hasNutritionProV2 delega en hasModule con el key nutrition_exchanges', async () => {
    vi.mocked(hasModule).mockResolvedValue(true)
    const db = {} as never
    const ok = await hasNutritionProV2(db, { coachId: 'c1', teamId: null })
    expect(ok).toBe(true)
    expect(hasModule).toHaveBeenCalledWith(db, NUTRITION_PRO_MODULE_KEY, { coachId: 'c1', teamId: null })
  })

  it('hasNutritionProV2 es fail-closed (propaga false)', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    expect(await hasNutritionProV2({} as never, { coachId: 'c1', teamId: 't1' })).toBe(false)
  })

  it('assertNutritionProV2 delega en assertModule (throwing guard)', async () => {
    vi.mocked(assertModule).mockResolvedValue(undefined)
    await assertNutritionProV2({} as never, { coachId: 'c1', teamId: null })
    expect(assertModule).toHaveBeenCalledWith(expect.anything(), NUTRITION_PRO_MODULE_KEY, {
      coachId: 'c1',
      teamId: null,
    })
  })
})
