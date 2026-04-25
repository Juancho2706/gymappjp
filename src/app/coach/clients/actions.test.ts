import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createRawAdminClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createRawAdminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase/admin-raw', () => ({
  createRawAdminClient: createRawAdminClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import { createClientAction } from './actions'

function buildFormData() {
  const form = new FormData()
  form.set('full_name', 'Alumno Test')
  form.set('email', 'alumno@example.com')
  form.set('phone', '+56912345678')
  form.set('temp_password', 'password-123')
  form.set('subscription_start_date', '2026-04-11')
  return form
}

describe('createClientAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks creation when max clients limit is reached', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'coach-1', slug: 'coach', subscription_tier: 'starter', max_clients: 1 },
      }),
    }
    const clientsCountQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
    }

    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsCountQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    createClientMock.mockResolvedValue(supabase)
    createRawAdminClientMock.mockResolvedValue({
      auth: { admin: { createUser: vi.fn() } },
      from: vi.fn(),
    })

    const result = await createClientAction({}, buildFormData())
    expect(result.error).toContain('Alcanzaste el límite de 1 alumnos')
  })

  it('creates client when under limit', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'coach-1', slug: 'coach', subscription_tier: 'starter', max_clients: 10 },
      }),
    }
    const clientsCountQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
    }

    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsCountQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const admin = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'client-1' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: { available: true }, error: null }),
    }

    createClientMock.mockResolvedValue(supabase)
    createRawAdminClientMock.mockResolvedValue(admin)

    const result = await createClientAction({}, buildFormData())
    expect(result.success).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
  })
})
