import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createRawAdminClientMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createRawAdminClientMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase/admin-raw', () => ({
  createRawAdminClient: createRawAdminClientMock,
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import { registerAction } from './actions'

function buildRegisterFormData(overrides?: Partial<Record<string, string>>) {
  const base = {
    full_name: 'Coach Test',
    email: 'coach@example.com',
    password: 'super-secret-123',
    brand_name: 'Antigravity Pro',
    subscription_tier: 'starter',
    billing_cycle: 'monthly',
    ...overrides,
  }

  const formData = new FormData()
  formData.set('full_name', base.full_name)
  formData.set('email', base.email)
  formData.set('password', base.password)
  formData.set('brand_name', base.brand_name)
  formData.set('subscription_tier', base.subscription_tier)
  formData.set('billing_cycle', base.billing_cycle)
  formData.set('accept_legal', 'on')
  return formData
}

describe('registerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when slug already exists', async () => {
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing' } }),
    }

    const adminDb = {
      from: vi.fn().mockReturnValue(slugQuery),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
    }

    createRawAdminClientMock.mockResolvedValue(adminDb)

    const result = await registerAction({}, buildRegisterFormData({ brand_name: 'Mi Marca' }))

    expect(result.error).toContain('ya está en uso')
    expect(adminDb.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('requires legal terms acceptance', async () => {
    const formData = buildRegisterFormData()
    formData.delete('accept_legal')
    const result = await registerAction({}, formData)
    expect(result).toEqual({ error: 'Debes aceptar los términos para crear tu cuenta.' })
  })

  it('rejects invalid tier or billing cycle', async () => {
    const result = await registerAction(
      {},
      buildRegisterFormData({ subscription_tier: 'invalid-tier', billing_cycle: 'weekly' })
    )
    expect(result).toEqual({ error: 'Debes seleccionar un plan y una frecuencia válidos.' })
  })

  it('rejects billing cycle not allowed for selected tier', async () => {
    const result = await registerAction(
      {},
      buildRegisterFormData({ subscription_tier: 'elite', billing_cycle: 'monthly' })
    )
    expect(result).toEqual({ error: 'La frecuencia elegida no está disponible para ese plan.' })
  })

  it('rolls back auth user when coach insert fails', async () => {
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const insertQuery = {
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    }

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      return coachesCallCount === 1 ? slugQuery : insertQuery
    })

    const adminDb = {
      from: fromMock,
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u123' } }, error: null }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    }

    createRawAdminClientMock.mockResolvedValue(adminDb)

    const result = await registerAction({}, buildRegisterFormData())

    expect(result).toEqual({ error: 'insert failed' })
    expect(adminDb.auth.admin.deleteUser).toHaveBeenCalledWith('u123')
  })

  it('creates account and redirects on happy path', async () => {
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const insertQuery = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      return coachesCallCount === 1 ? slugQuery : insertQuery
    })

    const adminDb = {
      from: fromMock,
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u123' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
    }

    const userSupabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createRawAdminClientMock.mockResolvedValue(adminDb)
    createClientMock.mockResolvedValue(userSupabase)

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(
      'REDIRECT:/coach/subscription/processing?from=register&tier=starter&cycle=monthly&plan=mensual'
    )

    expect(userSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
    })
    expect(redirectMock).toHaveBeenCalledWith('/coach/subscription/processing?from=register&tier=starter&cycle=monthly&plan=mensual')
  })
})
