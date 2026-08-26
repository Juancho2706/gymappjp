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

vi.mock('@/lib/auth/send-coach-email-confirmation', () => ({
  sendCoachSignupConfirmationEmail: vi.fn().mockResolvedValue({ ok: true }),
  resendCoachSignupConfirmationEmail: vi.fn().mockResolvedValue({ ok: true }),
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
    // Pricing v2: starter salió de SALE_TIERS (registro lo rechaza) — la fixture de tier PAGO es pro.
    subscription_tier: 'pro',
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
    // Las 4 razones `taken_*` colapsan a un solo código de funnel (el copy tampoco las distingue).
    expect(result.code).toBe('email_taken')
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
    // `code` (20-08): todo rechazo viaja con su causa estable — alimenta `register_failed`.
    expect(result).toEqual({ error: 'Debes seleccionar un plan y una frecuencia válidos.', code: 'plan_invalid' })
  })

  // Plan 04 (D2): trimestral habilitado en los tiers pagos a la venta — pro+quarterly
  // no debe rechazarse por frecuencia. Pin de que la compuerta quedó abierta.
  // (Pricing v2: la fixture era starter; starter ya no está a la venta.)
  it('accepts quarterly for a sale tier (pro) — passes cycle validation', async () => {
    const result = await registerAction(
      {},
      buildRegisterFormData({ subscription_tier: 'pro', billing_cycle: 'quarterly' })
    )
    // No frena en la validación de frecuencia; cae más adelante (slug sin mocks).
    expect(result.error).not.toBe('La frecuencia elegida no está disponible para ese plan.')
  })

  // Pricing v2 (P1): starter fuera de venta — el registro lo rechaza como tier inválido.
  it('rejects starter (fuera de venta desde pricing v2)', async () => {
    const result = await registerAction(
      {},
      buildRegisterFormData({ subscription_tier: 'starter', billing_cycle: 'monthly' })
    )
    expect(result).toEqual({ error: 'Debes seleccionar un plan y una frecuencia válidos.', code: 'plan_invalid' })
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

    expect(result).toEqual({ error: 'insert failed', code: 'coach_insert_failed' })
    expect(adminDb.auth.admin.deleteUser).toHaveBeenCalledWith('u123')
  })

  // ── A1 (ola checkout 25-08) — el alta con tier PAGO ya no nace bloqueada ─────────────────────
  // Antes insertaba `subscription_status='pending_payment'` + el tier pago + su cupo ANTES de
  // cobrar un peso, y ese estado es bloqueo DURO (`lib/coach-subscription-gate.ts`): abandonar el
  // checkout dejaba al coach sin producto. Ahora la fila nace exactamente como un alta free y la
  // intención de compra viaja en el intent durable de `subscription_events`.
  function paidHappyPathMocks() {
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
    const intentUpsert = vi.fn().mockResolvedValue({ error: null })

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      // A1: el intent de compra (tier/ciclo/add-ons/cupón) vive acá, no en la fila del coach.
      if (table === 'subscription_events') return { upsert: intentUpsert }
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

    return { adminDb, userSupabase, insertQuery, intentUpsert }
  }

  it('creates account and redirects on happy path', async () => {
    const { adminDb, userSupabase } = paidHappyPathMocks()

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(
      'REDIRECT:/coach/subscription/processing?from=register&tier=pro&cycle=monthly&plan=mensual'
    )

    expect(userSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
    })
    expect(adminDb.rpc).toHaveBeenCalledWith('check_platform_email_availability', {
      p_email: 'coach@example.com',
    })
    expect(redirectMock).toHaveBeenCalledWith('/coach/subscription/processing?from=register&tier=pro&cycle=monthly&plan=mensual')
  })

  it('A1: el alta con tier PAGO nace free + active (nunca pending_payment) y con el cupo free', async () => {
    const { insertQuery } = paidHappyPathMocks()

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(/^REDIRECT:/)

    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'u123',
      // El trapdoor que este fix mata: pending_payment = bloqueo duro sin gracia.
      subscription_status: 'active',
      subscription_tier: 'free',
      billing_cycle: 'monthly',
      // 'admin' y no el gateway: un alta sin cobro no es una conversión
      // (get_platform_trial_conversion_rate cuenta 'active' + provider != admin/beta/internal).
      payment_provider: 'admin',
      max_clients: 1,
    }))
    const inserted = insertQuery.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.subscription_status).not.toBe('pending_payment')
    expect(inserted.subscription_tier).not.toBe('pro')
  })

  it('A1: la intención de compra (tier/ciclo/add-ons/cupón) se persiste en el intent durable', async () => {
    const { intentUpsert } = paidHappyPathMocks()
    const formData = buildRegisterFormData({ billing_cycle: 'quarterly' })
    formData.set('addons', 'cardio,no_existe')
    formData.set('coupon_code', 'DIEGO25')

    await expect(registerAction({}, formData)).rejects.toThrow(/^REDIRECT:/)

    expect(intentUpsert).toHaveBeenCalledTimes(1)
    const [row, opts] = intentUpsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(row.coach_id).toBe('u123')
    // Canal propio: no pisa ni es pisado por el intent del checkout (flow_/mercadopago_).
    expect(row.provider_event_id).toBe('signup_checkout_intent:u123')
    // ⚠️ nunca 'pending': ese estado lo usa el cron checkout-abandoned para detectar un checkout muerto.
    expect(row.provider_status).toBe('signup_checkout_intent')
    expect(row.payload).toMatchObject({
      tier: 'pro',
      cycle: 'quarterly',
      // add-on inexistente filtrado por la whitelist MODULE_KEYS.
      addons: ['cardio'],
      coupon: 'DIEGO25',
    })
    expect(opts).toMatchObject({ onConflict: 'provider_event_id' })
  })

  it('A1: si el intent falla, el alta NO se rompe (best-effort — el cobro no depende de esa fila)', async () => {
    const { intentUpsert, insertQuery } = paidHappyPathMocks()
    intentUpsert.mockResolvedValue({ error: { message: 'boom' } })

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(
      'REDIRECT:/coach/subscription/processing?from=register&tier=pro&cycle=monthly&plan=mensual'
    )
    // La cuenta quedó creada igual: el rastro perdido no puede costar un alta.
    expect(insertQuery.insert).toHaveBeenCalledOnce()
  })

  it('A1: el alta FREE no escribe intent de compra (no hay nada que comprar)', async () => {
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
    const insertQuery = { insert: vi.fn().mockResolvedValue({ error: null }) }
    const inviteCodeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const intentUpsert = vi.fn().mockResolvedValue({ error: null })
    let coachesCallCount = 0
    createRawAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'subscription_events') return { upsert: intentUpsert }
        if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
        coachesCallCount += 1
        if (coachesCallCount === 1) return ipLimitQuery
        if (coachesCallCount === 2) return slugQuery
        if (coachesCallCount === 3) return inviteCodeQuery
        return insertQuery
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { exists_in_auth: false, is_coach: false, is_client: false, orphan_client_email: false },
        error: null,
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-free' } }, error: null }),
          deleteUser: vi.fn(),
        },
      },
    })

    await expect(
      registerAction({}, buildRegisterFormData({ subscription_tier: 'free', billing_cycle: 'monthly' }))
    ).rejects.toThrow(/^REDIRECT:\/verify-email/)

    expect(intentUpsert).not.toHaveBeenCalled()
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
    ).rejects.toThrow(/REDIRECT:\/verify-email\?email=coach%40example\.com&eid=/)

    expect(adminDb.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
      email_confirm: false,
    })
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'u-free',
      subscription_tier: 'free',
      // PR #28 (drip fix): web free signup nace 'pending_email' hasta confirmar el correo (no 'active').
      subscription_status: 'pending_email',
      payment_provider: 'admin',
      // Pricing v3 (owner 2026-08-21): registro nuevo = catálogo nuevo (free 1, con white-label).
      // Los free existentes conservan su cupo en la columna coaches.max_clients (backfill del
      // 21-08 + escalera tierMaxClientsFor); acá siempre es un coach recién creado.
      max_clients: 1,
      trial_used_email: 'coach@example.com',
    }))
    expect(createClientMock).not.toHaveBeenCalled()
    // El `eid` (event_id de dedup Meta CAPI/pixel, commit 7df9aa6c) es aleatorio por registro.
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/verify-email\?email=coach%40example\.com&eid=.+/)
    )
  })
})
