import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createServiceRoleClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServiceRoleClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

// R3 (auditoria 2026-06-11): PostgREST va user-scoped; solo GoTrue Admin usa el service role.
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
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
    createServiceRoleClientMock.mockReturnValue({
      auth: { admin: { createUser: vi.fn() } },
    })

    const result = await createClientAction({}, buildFormData())
    expect(result.error).toContain('Alcanzaste el límite de 1 alumno de tu plan')
    // El rechazo lleva el contexto del gate para `upgrade_gate_hit` (sin PII).
    expect(result.upgradeRequired).toBe(true)
    expect(result.currentLimit).toBe(1)
    expect(result.currentTier).toBe('starter')
    expect(result.activeCount).toBe(1)
  })

  // Pricing v3 (owner 2026-08-21): Free = 1 alumno. Este es el muro que empieza a chocar el 99% de
  // las altas nuevas, y el que alimenta el embudo `upgrade_gate_hit { gate: 'client_limit' }`.
  it('bloquea el 2º alumno de un Free con cupo 1 y devuelve tier + conteo del rechazo', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'coach-1',
          slug: 'coach',
          subscription_tier: 'free',
          // Columna del coach nuevo tras el corte v3. Manda sobre cualquier catálogo.
          max_clients: 1,
          created_at: '2026-08-21T10:00:00.000Z',
        },
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
    createServiceRoleClientMock.mockReturnValue({ auth: { admin: { createUser: vi.fn() } } })

    const result = await createClientAction({}, buildFormData())
    expect(result.upgradeRequired).toBe(true)
    expect(result.error).toContain('Alcanzaste el límite de 1 alumno de tu plan')
    expect(result.currentLimit).toBe(1)
    expect(result.currentTier).toBe('free')
    expect(result.activeCount).toBe(1)
  })

  it('creates client when under limit', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'coach-1', slug: 'coach', subscription_tier: 'starter', max_clients: 10 },
      }),
    }
    // from('clients') sirve el count (select→eq→is) Y el insert user-scoped (R3).
    const clientsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 2, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc: vi.fn().mockResolvedValue({ data: { available: true }, error: null }),
    }

    const authAdmin = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'client-1' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
    }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue(authAdmin)

    const result = await createClientAction({}, buildFormData())
    expect(result.success).toBe(true)
    expect(authAdmin.auth.admin.createUser).toHaveBeenCalled()
    expect(clientsQuery.insert).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
  })

  // SPEC «Vive tu app» directo §5 (caso Job Palacios 23-08): agregarse a uno mismo gastaba el
  // cupo y el rechazo —cuando llegaba— era el 409 opaco anti-enumeración. Con SU propio correo no
  // hay nada que filtrar: se devuelve el camino real y NO se crea ninguna cuenta.
  it('rechaza el alta cuando el correo es el del propio coach, sin tocar GoTrue', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'coach-1', slug: 'coach', subscription_tier: 'free', max_clients: 1 },
      }),
    }
    const clientsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 0, error: null }),
      insert: vi.fn(),
    }

    const supabase = {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'coach-1', email: ' Alumno@Example.com ' } } }),
      },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
      // Si la RPC de disponibilidad llegara a correr, el test lo delataría: el rechazo tiene que
      // pasar ANTES (el 409 genérico no puede tapar este caso).
      rpc: vi.fn().mockRejectedValue(new Error('no debería consultarse')),
    }

    const authAdmin = { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue(authAdmin)

    const result = await createClientAction({}, buildFormData())
    expect(result.code).toBe('own_email')
    expect(result.error).toContain('Vive tu app')
    expect(result.success).toBeUndefined()
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(authAdmin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(clientsQuery.insert).not.toHaveBeenCalled()
  })
})
