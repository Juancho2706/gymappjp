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

// Bypass workspace resolution — coach standalone scope (orgId null).
vi.mock('@/services/auth/workspace.service', () => ({
  resolvePreferredWorkspace: vi.fn().mockResolvedValue({ type: 'coach_standalone', userId: 'coach-1', coachId: 'coach-1' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

// F1: identity write is a non-fatal side effect (own service-role client) — stub it so the
// action test doesn't reach a real Supabase client.
vi.mock('@/infrastructure/db/client-membership.repository', () => ({
  createClientIdentity: vi.fn().mockResolvedValue({ ok: true }),
}))

import { createClientAction } from './_actions/clients.actions'

function buildFormData() {
  const form = new FormData()
  form.set('full_name', 'Alumno Test')
  form.set('email', 'alumno@example.com')
  form.set('phone', '+56912345678')
  form.set('temp_password', 'password-123')
  form.set('subscription_start_date', '2026-04-11')
  form.set('age_confirmed', 'on')
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
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 1, error: null }),
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
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 2, error: null }),
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
