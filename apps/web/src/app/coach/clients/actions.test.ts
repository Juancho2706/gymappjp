import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  createServiceRoleClientMock,
  revalidatePathMock,
  sendTransactionalEmailMock,
  captureAddStudentEmailTakenMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServiceRoleClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  sendTransactionalEmailMock: vi.fn(),
  captureAddStudentEmailTakenMock: vi.fn(),
}))

// W2.6: el correo de bienvenida se manda desde el action; acá se pinnea que lleve `replyTo`.
vi.mock('@/lib/email/send-email', () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}))

// W2.12 (a): la razón granular del rechazo sale SOLO por acá, nunca en la respuesta.
vi.mock('@/lib/posthog/add-student-events', () => ({
  captureAddStudentEmailTaken: captureAddStudentEmailTakenMock,
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

import { createClientAction, resetClientPasswordAction } from './_actions/clients.actions'
import { EMAIL_TAKEN_CLIENT_CREATE_ES } from '@/lib/auth/platform-email'

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
    sendTransactionalEmailMock.mockResolvedValue({ ok: true, providerMessageId: 'msg-1' })
    captureAddStudentEmailTakenMock.mockResolvedValue(undefined)
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

  // W2.6: hasta hoy el correo del alumno decía «responde este correo» y la respuesta llegaba a
  // EVA. `send-email.ts:27` soportaba `reply_to` desde siempre y ningún call site lo pasaba.
  it('el correo de bienvenida sale con reply_to = correo del coach', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'coach-1',
          slug: 'coach',
          invite_code: 'ABC123',
          brand_name: 'Studio Fuerza',
          full_name: 'Josefa',
          subscription_tier: 'starter',
          max_clients: 10,
        },
      }),
    }
    const clientsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 0, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    const supabase = {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'coach-1', email: 'josefa@example.com' } } }),
      },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc: vi.fn().mockResolvedValue({ data: { available: true }, error: null }),
    }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'client-1' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
    })

    const result = await createClientAction({}, buildFormData())
    expect(result.success).toBe(true)
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alumno@example.com', replyTo: 'josefa@example.com' })
    )
  })

  // W2.12 (a): medir el callejón 16 antes de decidir cuánto vale la salida. La razón granular sale
  // por el evento del servidor; la respuesta al coach NO la revela (anti-sondeo de correos ajenos).
  it('emite add_student_email_taken con la razón y NO la revela en la respuesta', async () => {
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'coach-1', slug: 'coach', subscription_tier: 'starter', max_clients: 10 },
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
          .mockResolvedValue({ data: { user: { id: 'coach-1', email: 'josefa@example.com' } } }),
      },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachesQuery
        if (table === 'clients') return clientsQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
      // El correo tipeado pertenece a una cuenta de COACH ⇒ reason `taken_coach`.
      rpc: vi.fn().mockResolvedValue({
        data: { exists_in_auth: true, is_coach: true, is_client: false, orphan_client_email: false },
        error: null,
      }),
    }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue({
      auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } },
    })

    const result = await createClientAction({}, buildFormData())
    expect(result.code).toBe('email_taken')
    expect(result.error).toBe(EMAIL_TAKEN_CLIENT_CREATE_ES)
    expect(result.error?.toLowerCase()).not.toContain('coach')
    expect(captureAddStudentEmailTakenMock).toHaveBeenCalledWith({
      coachId: 'coach-1',
      reason: 'taken_coach',
      source: 'web_create',
    })
    expect(clientsQuery.insert).not.toHaveBeenCalled()
  })
})

/**
 * W2.11 — el reenvío del acceso ofrece el MISMO mensaje del alta con la clave nueva adentro, y
 * solo cuando hay teléfono: sin teléfono `wa.me` abre el selector de contactos (regla 4) y además
 * la variante «sin clave» diría «te mandé tu clave al correo», que en un reset es falso.
 */
describe('resetClientPasswordAction — reenvío del acceso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function buildSupabase(client: Record<string, unknown>, coach: Record<string, unknown> | null) {
    const clientsSelect = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: client }),
    }
    const clientsUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ error: null }),
    }
    const coachesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: coach }),
    }

    let clientsCalls = 0
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          clientsCalls += 1
          return clientsCalls === 1 ? clientsSelect : clientsUpdate
        }
        if (table === 'coaches') return coachesQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    return { supabase, coachesQuery, clientsUpdate }
  }

  it('con teléfono devuelve los datos del mensaje (persona, correo, link)', async () => {
    const { supabase } = buildSupabase(
      { id: 'client-1', full_name: 'Ana Pérez', email: 'ana@example.com', phone: '+56 9 1111 2222' },
      { slug: 'studio', invite_code: 'ABC123', brand_name: 'Studio Fuerza', persona: 'nutrition' }
    )
    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })

    const result = await resetClientPasswordAction('client-1')
    expect(result.error).toBeUndefined()
    expect(result.tempPassword).toBeTruthy()
    expect(result.resend).toEqual({
      persona: 'nutrition',
      clientName: 'Ana Pérez',
      clientEmail: 'ana@example.com',
      clientPhone: '+56 9 1111 2222',
      loginUrl: expect.stringContaining('/c/ABC123/login'),
    })
    // La clave NO se duplica en el payload del reenvío: ya viaja una vez en `tempPassword`.
    expect(JSON.stringify(result.resend)).not.toContain(result.tempPassword!)
  })

  it('sin teléfono NO ofrece el reenvío y ni siquiera consulta al coach', async () => {
    const { supabase, coachesQuery } = buildSupabase(
      { id: 'client-1', full_name: 'Ana Pérez', email: 'ana@example.com', phone: null },
      { slug: 'studio', invite_code: 'ABC123', brand_name: 'Studio Fuerza', persona: 'nutrition' }
    )
    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })

    const result = await resetClientPasswordAction('client-1')
    expect(result.tempPassword).toBeTruthy()
    expect(result.resend).toBeUndefined()
    expect(coachesQuery.maybeSingle).not.toHaveBeenCalled()
  })

  it('un coach sin persona cae al vocabulario de respaldo, no rompe el reenvío', async () => {
    const { supabase } = buildSupabase(
      { id: 'client-1', full_name: 'Ana', email: 'ana@example.com', phone: '+56911112222' },
      { slug: 'studio', invite_code: 'ABC123', brand_name: 'Studio Fuerza', persona: null }
    )
    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })

    expect((await resetClientPasswordAction('client-1')).resend?.persona).toBe('strength')
  })
})
