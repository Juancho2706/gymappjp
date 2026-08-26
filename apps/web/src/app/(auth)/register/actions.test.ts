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

// W3.1 (f): la bienvenida + el drip pasaron a dispararse DENTRO del alta free. Se mockea el helper
// entero (no sus dependencias) porque acá lo que se pinnea es el contrato de la llamada; el
// contenido de los correos y el ledger tienen su propia suite en `lib/email`.
vi.mock('@/lib/email/free-coach-onboarding', () => ({
  sendFreeCoachOnboardingEmails: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.10' })),
}))

import {
  resendCoachSignupConfirmationEmail,
  sendCoachSignupConfirmationEmail,
} from '@/lib/auth/send-coach-email-confirmation'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'
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

  // ── W3.1 (flujo-coach-nuevo, D1 = A autorizada por el owner el 26-08) ────────────────────────
  // El alta FREE ya no tiene muro de correo: nace confirmada y `active`, entra sola al panel y el
  // correo pasa a ser un recordatorio que no bloquea ni revierte nada.
  function freeHappyPathMocks() {
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
    const deleteQuery = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    const inviteCodeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    const intentUpsert = vi.fn().mockResolvedValue({ error: null })

    let coachesCallCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'subscription_events') return { upsert: intentUpsert }
      if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
      coachesCallCount += 1
      if (coachesCallCount === 1) return ipLimitQuery
      if (coachesCallCount === 2) return slugQuery
      if (coachesCallCount === 3) return inviteCodeQuery
      if (coachesCallCount === 4) return insertQuery
      // Quinta llamada en adelante: SOLO puede ser el borrado que W3.1 (c) sacó del camino free.
      // Si alguien lo devuelve, este stub lo deja visible en vez de romper con "Unexpected table".
      return deleteQuery
    })

    const adminDb = {
      from: fromMock,
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
    }

    const userSupabase = { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } }

    createRawAdminClientMock.mockReturnValue(adminDb)
    createClientMock.mockResolvedValue(userSupabase)

    return { adminDb, userSupabase, insertQuery, deleteQuery, intentUpsert }
  }

  const freeForm = () => buildRegisterFormData({ subscription_tier: 'free', billing_cycle: 'monthly' })

  it('A1: el alta FREE no escribe intent de compra (no hay nada que comprar)', async () => {
    const { intentUpsert } = freeHappyPathMocks()

    await expect(registerAction({}, freeForm())).rejects.toThrow(/^REDIRECT:\/coach\/onboarding\/persona/)

    expect(intentUpsert).not.toHaveBeenCalled()
  })

  it('W3.1: el alta free nace confirmada y ACTIVA, y entra al panel sin abrir el correo', async () => {
    const { adminDb, userSupabase, insertQuery } = freeHappyPathMocks()

    // El destino ya NO es /verify-email: esa pantalla queda solo para las filas `pending_email`
    // viejas, que siguen su camino por el proxy (nada retroactivo). Y tampoco es /coach/dashboard:
    // el alta nace sin persona, así que se entra DERECHO a la pantalla que el gate mostraría igual
    // (sin eso la barra del navegador queda desfasada de la pantalla).
    await expect(registerAction({}, freeForm())).rejects.toThrow(
      /^REDIRECT:\/coach\/onboarding\/persona\?welcome=free&eid=.+/
    )

    // (a) el muro del correo: `email_confirm` pasa a `true` TAMBIÉN en free.
    expect(adminDb.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
      email_confirm: true,
    })
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'u-free',
      subscription_tier: 'free',
      // W3.3: la marca nace PRENDIDA. Se pinnea el VALOR escrito, no el DEFAULT de la columna —
      // que sigue en `false` a propósito, para que esto sea testeable sin la base.
      use_brand_colors_coach: true,
      // (b) W3.1: ya no nace 'pending_email' — la transición que activaba al coach dejó de existir.
      subscription_status: 'active',
      payment_provider: 'admin',
      // Pricing v3 (owner 2026-08-21): registro nuevo = catálogo nuevo (free 1, con white-label).
      max_clients: 1,
      trial_used_email: 'coach@example.com',
    }))
    // La señal de «abrió su casilla» NO se escribe acá: nace NULL y la llena `/auth/confirm`
    // (W3.0 c). Si esto naciera lleno, el banner de W3.11 y la higiene del drip quedarían ciegos.
    const inserted = insertQuery.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted).not.toHaveProperty('email_verified_at')
    // (e) sesión inmediata con las credenciales del alta.
    expect(userSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'super-secret-123',
    })
    // W3.9: sin campaña en la URL, la atribución queda en NULL explícito (nunca '').
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: null,
      utm_campaign: null,
    }))
  })

  it('W3.1 (d): el correo es un RECORDATORIO magiclink, no el link de signup', async () => {
    freeHappyPathMocks()

    await expect(registerAction({}, freeForm())).rejects.toThrow(/^REDIRECT:/)

    // `signup` (e `invite`) los rechaza GoTrue para un usuario que ya existe, y con
    // `email_confirm: true` el usuario existe SIEMPRE: el camino viejo fallaría en el 100 % de las
    // altas.
    expect(sendCoachSignupConfirmationEmail).not.toHaveBeenCalled()
    expect(resendCoachSignupConfirmationEmail).toHaveBeenCalledWith({
      email: 'coach@example.com',
      coachName: 'Coach Test',
    })
  })

  it('W3.1 (c): si el recordatorio falla, el alta NO se borra ni se revierte', async () => {
    const { adminDb, deleteQuery } = freeHappyPathMocks()
    vi.mocked(resendCoachSignupConfirmationEmail).mockResolvedValueOnce({ ok: false, error: 'resend caído' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Este es EL renglón que evita que D1 = A se coma todas las altas free.
    await expect(registerAction({}, freeForm())).rejects.toThrow(/^REDIRECT:\/coach\/onboarding\/persona/)

    expect(deleteQuery.delete).not.toHaveBeenCalled()
    expect(adminDb.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[register] recordatorio de confirmación no salió')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('coach@example.com')
  })

  it('W3.1 (f): bienvenida + drip se disparan en el alta (ya nadie los dispara al confirmar)', async () => {
    freeHappyPathMocks()

    await expect(registerAction({}, freeForm())).rejects.toThrow(/^REDIRECT:/)

    // Se llamó ANTES del redirect por construcción: el redirect lanza y corta el action.
    expect(sendFreeCoachOnboardingEmails).toHaveBeenCalledWith(expect.objectContaining({
      coachId: 'u-free',
      email: 'coach@example.com',
      coachName: 'Coach Test',
      brandName: 'Antigravity Pro',
    }))
  })

  it('W3.1 (f): un fallo de los correos no rompe el alta ya escrita', async () => {
    freeHappyPathMocks()
    vi.mocked(sendFreeCoachOnboardingEmails).mockRejectedValueOnce(new Error('resend caído'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(registerAction({}, freeForm())).rejects.toThrow(/^REDIRECT:\/coach\/onboarding\/persona/)

    expect(warn).toHaveBeenCalledWith('[register] onboarding email failed')
  })

  // ── W3.3 (flujo-coach-nuevo): marca prendida al nacer ───────────────────────────────────────
  // El `insert` es UNO solo para free y para pago, así que el pin del camino pago cubre el otro
  // extremo del mismo objeto. El DEFAULT de la columna sigue en `false`: lo que manda es el valor.
  it('W3.3: el alta con tier pago también nace con la marca prendida', async () => {
    const { insertQuery } = paidHappyPathMocks()

    await expect(registerAction({}, buildRegisterFormData())).rejects.toThrow(/^REDIRECT:/)

    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      use_brand_colors_coach: true,
    }))
  })

  // ── W3.9: atribución del alta ────────────────────────────────────────────────────────────────
  // La escribe el SERVIDOR (las columnas no tienen grant a `authenticated`/`anon`), leyendo los
  // hidden inputs que `register/page.tsx` llena con lo que traía la URL del anuncio.
  it('W3.9: utm_source/utm_campaign de la URL llegan a la fila del coach', async () => {
    const { insertQuery } = paidHappyPathMocks()
    const formData = buildRegisterFormData()
    formData.set('utm_source', 'meta')
    formData.set('utm_campaign', 'coaches-ago')

    await expect(registerAction({}, formData)).rejects.toThrow(/^REDIRECT:/)

    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: 'meta',
      utm_campaign: 'coaches-ago',
    }))
  })

  it('W3.9: el valor se sanea (espacios colapsados, tope de largo) y el vacío queda NULL', async () => {
    const { insertQuery } = paidHappyPathMocks()
    const formData = buildRegisterFormData()
    formData.set('utm_source', '  meta \n ads  ')
    // Un query param es entrada de cualquiera: la columna no puede usarse como buzón.
    formData.set('utm_campaign', 'x'.repeat(400))

    await expect(registerAction({}, formData)).rejects.toThrow(/^REDIRECT:/)

    const inserted = insertQuery.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.utm_source).toBe('meta ads')
    expect(inserted.utm_campaign).toHaveLength(120)
  })

  it('W3.9: un utm vacío no escribe cadena vacía — escribe NULL', async () => {
    const { insertQuery } = paidHappyPathMocks()
    const formData = buildRegisterFormData()
    formData.set('utm_source', '   ')
    formData.set('utm_campaign', '')

    await expect(registerAction({}, formData)).rejects.toThrow(/^REDIRECT:/)

    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: null,
      utm_campaign: null,
    }))
  })
})
