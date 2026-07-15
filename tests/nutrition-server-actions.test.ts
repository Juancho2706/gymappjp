import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Units de las server actions tocadas en Tanda 6 (fixes P1/P2 backlog):
 *  - resolveMissingFoodCodeAction (curacion PostgREST -> server action con auth de coach + Zod).
 *  - upsertDailyHabits / getDailyHabits (getUser -> getClaims; Zod rechaza inputs invalidos).
 * Foco: la validacion Zod rechaza inputs invalidos ANTES de tocar la DB, y el gate de auth.
 */

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { resolveMissingFoodCodeAction } from '@/app/coach/nutrition-plans/_actions/curation.actions'
import { upsertDailyHabits, getDailyHabits } from '@/app/c/[coach_slug]/nutrition/_actions/habits.actions'

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'
// clientId en UpsertHabitsSchema exige uuid RFC v4 (z.string().uuid()).
const UUID_V4 = '33333333-3333-4333-8333-333333333333'

function makeSupabase(opts: {
  sub?: string | null
  coachRow?: { id: string } | null
  updateError?: { message: string } | null
  upsertError?: { message: string } | null
  getData?: Record<string, unknown> | null
} = {}) {
  const calls = { update: [] as unknown[], upsert: [] as unknown[] }
  const auth = {
    getClaims: vi.fn(async () => ({
      data: opts.sub ? { claims: { sub: opts.sub } } : { claims: null },
    })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'coaches') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.coachRow ?? null }) }) }),
      }
    }
    if (table === 'food_catalog_missing_codes') {
      return {
        update: (payload: unknown) => {
          calls.update.push(payload)
          return { eq: async () => ({ error: opts.updateError ?? null }) }
        },
      }
    }
    if (table === 'daily_habits') {
      return {
        upsert: (payload: unknown) => {
          calls.upsert.push(payload)
          return Promise.resolve({ error: opts.upsertError ?? null })
        },
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.getData ?? null }) }) }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { auth, from, _calls: calls }
}

beforeEach(() => {
  createClientMock.mockReset()
  revalidatePathMock.mockReset()
})

describe('resolveMissingFoodCodeAction', () => {
  it('rechaza missingCodeId no-uuid sin tocar la DB', async () => {
    const res = await resolveMissingFoodCodeAction({ missingCodeId: 'nope', resolvedFoodId: UUID_B })
    expect(res.success).toBe(false)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rechaza resolvedFoodId no-uuid sin tocar la DB', async () => {
    const res = await resolveMissingFoodCodeAction({ missingCodeId: UUID_A, resolvedFoodId: 'x' })
    expect(res.success).toBe(false)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rechaza sesion sin coach (sub ausente)', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ sub: null }))
    const res = await resolveMissingFoodCodeAction({ missingCodeId: UUID_A, resolvedFoodId: UUID_B })
    expect(res).toEqual({ success: false, error: 'No autorizado' })
  })

  it('rechaza cuando el sub no es un coach', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ sub: UUID_A, coachRow: null }))
    const res = await resolveMissingFoodCodeAction({ missingCodeId: UUID_A, resolvedFoodId: UUID_B })
    expect(res).toEqual({ success: false, error: 'No autorizado' })
  })

  it('vincula y revalida con coach valido', async () => {
    const sb = makeSupabase({ sub: UUID_A, coachRow: { id: UUID_A } })
    createClientMock.mockResolvedValue(sb)
    const res = await resolveMissingFoodCodeAction({ missingCodeId: UUID_A, resolvedFoodId: UUID_B })
    expect(res.success).toBe(true)
    expect(sb._calls.update).toHaveLength(1)
    expect(sb._calls.update[0]).toMatchObject({ resolved_food_id: UUID_B })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/nutrition-plans')
  })
})

describe('upsertDailyHabits', () => {
  const validInput = {
    clientId: UUID_V4,
    logDate: '2026-07-15',
    coachSlug: 'josefit',
    waterMl: 1500,
    steps: 8000,
    sleepHours: 7,
    fastingHours: 12,
    supplements: ['creatina'],
    notes: null,
  }

  it('rechaza logDate invalido sin tocar la DB', async () => {
    const res = await upsertDailyHabits({ ...validInput, logDate: '15-07-2026' } as never)
    expect(res.success).toBe(false)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rechaza waterMl fuera de rango sin tocar la DB', async () => {
    const res = await upsertDailyHabits({ ...validInput, waterMl: 999999 } as never)
    expect(res.success).toBe(false)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rechaza cuando el sub del JWT no coincide con clientId', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ sub: UUID_B }))
    const res = await upsertDailyHabits(validInput)
    expect(res).toEqual({ success: false, error: 'No autorizado' })
  })

  it('persiste y revalida cuando el sub coincide', async () => {
    const sb = makeSupabase({ sub: UUID_V4 })
    createClientMock.mockResolvedValue(sb)
    const res = await upsertDailyHabits(validInput)
    expect(res.success).toBe(true)
    expect(sb._calls.upsert).toHaveLength(1)
    expect(revalidatePathMock).toHaveBeenCalledWith('/c/josefit/nutrition')
  })
})

describe('getDailyHabits', () => {
  it('devuelve null cuando el sub no coincide con clientId', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ sub: UUID_B }))
    const res = await getDailyHabits(UUID_A, '2026-07-15')
    expect(res).toBeNull()
  })

  it('devuelve la fila cuando el sub coincide', async () => {
    const row = { water_ml: 1500, steps: null, sleep_hours: null, fasting_hours: null, supplements: null, notes: null }
    createClientMock.mockResolvedValue(makeSupabase({ sub: UUID_A, getData: row }))
    const res = await getDailyHabits(UUID_A, '2026-07-15')
    expect(res).toEqual(row)
  })
})
