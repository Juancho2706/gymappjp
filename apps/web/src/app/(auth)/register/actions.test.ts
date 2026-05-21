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

vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: createRawAdminClientMock,
}))

vi.mock('@/lib/supabase/admin-raw', () => ({
  createRawAdminClient: createRawAdminClientMock,
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.10' })),
}))

import { registerAction } from './_actions/register.actions'

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
  formData.set('accept_health_data', 'on')
  return formData
}

describe('registerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when email is already registered on the platform', async () => {
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const adminDb = {
      from: vi.fn().mockReturnValue(slugQuery),
      rpc: vi.fn().mockResolvedValue({
        data: {
          exists_in_auth: true,
          is_coach: false,
          is_client: true,
          orphan_client_email: false,
        },
        error: null,
      }),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
    }
    createRawAdminClientMock.mockReturnValue(adminDb)

    const result = await registerAction({}, buildRegisterFormData())

    expect(result.error).toMatch(/ya está registrado en la plataforma/i)
    expect(adminDb.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('returns error when slug already exists', async () => {
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing' } }),
    }

    const adminDb = {
      from: vi.fn().mockReturnValue(slugQuery),
      rpc: vi.fn().mockResolvedValue({
        data: {
          exists_in_auth: false,
          is_coach: false,
          is_client: false,
          orphan_client_email: false,
        },
        error: null,
      }),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
    }

    createRawAdminClientMock.mockReturnValue(adminDb)

    const result = await registerAction({}, buildRegisterFormData({ brand_name: 'Mi Marca' }))

    expect(result.error).toMatch(/identificador único|ya está en uso/i)
    expect(adminDb.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('requires legal terms acceptance', async () => {
    const formData = buildRegisterFormData()
    formData.delete('accept_legal')
    const result = await registerAction({}, formData)
    expect(result.error).toMatch(/servicio/)
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
      buildRegisterFormData({ subscription_tier: 'starter', billing_cycle: 'quarterly' })
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
    const inviteCodeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      if (coachesCallCount === 1) return slugQuery
      if (coachesCallCount === 2) return inviteCodeQuery
      return insertQuery
    })

    const adminDb = {
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({
        data: {
          exists_in_auth: false,
          is_coach: false,
          is_client: false,
          orphan_client_email: false,
        },
        error: null,
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u123' } }, error: null }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    }

    createRawAdminClientMock.mockReturnValue(adminDb)

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
    const inviteCodeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      if (coachesCallCount === 1) return slugQuery
      if (coachesCallCount === 2) return inviteCodeQuery
      return insertQuery
    })

    const adminDb = {
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({
        data: {
          exists_in_auth: false,
          is_coach: false,
          is_client: false,
          orphan_client_email: false,
        },
        error: null,
      }),
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

    createRawAdminClientMock.mockReturnValue(adminDb)
    createClientMock.mockResolvedValue(userSupabase)

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(
      'REDIRECT:/coach/subscription/processing?from=register&tier=starter&cycle=monthly&plan=mensual'
    )

    expect(userSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
    })
    expect(adminDb.rpc).toHaveBeenCalledWith('check_platform_email_availability', {
      p_email: 'coach@example.com',
    })
    expect(redirectMock).toHaveBeenCalledWith('/coach/subscription/processing?from=register&tier=starter&cycle=monthly&plan=mensual')
  })

  it('creates free account pending email confirmation', async () => {
    const ipLimitQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 0 }),
    }
    const slugQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const insertQuery = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const inviteCodeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      if (coachesCallCount === 1) return ipLimitQuery
      if (coachesCallCount === 2) return slugQuery
      if (coachesCallCount === 3) return inviteCodeQuery
      return insertQuery
    })

    const adminDb = {
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({
        data: {
          exists_in_auth: false,
          is_coach: false,
          is_client: false,
          orphan_client_email: false,
        },
        error: null,
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-free' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
    }

    createRawAdminClientMock.mockReturnValue(adminDb)

    await expect(
      registerAction({}, buildRegisterFormData({ subscription_tier: 'free', billing_cycle: 'monthly' }))
    ).rejects.toThrow('REDIRECT:/verify-email?email=coach%40example.com')

    expect(adminDb.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
      email_confirm: false,
    })
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'u-free',
      subscription_tier: 'free',
      subscription_status: 'pending_email',
      payment_provider: 'admin',
      max_clients: 3,
    }))
    expect(createClientMock).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith('/verify-email?email=coach%40example.com')
  })
})
