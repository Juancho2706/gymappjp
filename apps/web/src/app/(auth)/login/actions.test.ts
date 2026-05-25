import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  clearFailCountMock,
  createClientMock,
  incrementFailCountMock,
  readFailCountMock,
  revalidatePathMock,
  redirectMock,
  resolvePostLoginRedirectMock,
  verifyTurnstileMock,
} = vi.hoisted(() => ({
  clearFailCountMock: vi.fn().mockResolvedValue(undefined),
  createClientMock: vi.fn(),
  incrementFailCountMock: vi.fn().mockResolvedValue(undefined),
  readFailCountMock: vi.fn().mockResolvedValue(0),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  resolvePostLoginRedirectMock: vi.fn().mockResolvedValue('/coach/dashboard'),
  verifyTurnstileMock: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('@/lib/auth/fail-counter', () => ({
  CAPTCHA_THRESHOLD: 5,
  clearFailCount: clearFailCountMock,
  incrementFailCount: incrementFailCountMock,
  readFailCount: readFailCountMock,
}))

vi.mock('@/lib/auth/turnstile', () => ({
  verifyTurnstile: verifyTurnstileMock,
}))

vi.mock('@/lib/auth/post-login-redirect.server', () => ({
  resolvePostLoginRedirect: resolvePostLoginRedirectMock,
}))

import { loginAction } from './_actions/login.actions'

function buildFormData(email: string, password: string) {
  const formData = new FormData()
  formData.set('email', email)
  formData.set('password', password)
  return formData
}

describe('loginAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readFailCountMock.mockResolvedValue(0)
    resolvePostLoginRedirectMock.mockResolvedValue('/coach/dashboard')
    verifyTurnstileMock.mockResolvedValue(true)
  })

  it('returns auth error for invalid credentials', async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
      },
    }

    createClientMock.mockResolvedValue(supabase)

    const result = await loginAction({}, buildFormData('coach@example.com', 'badpass'))

    expect(result.error).toBeTruthy()
    expect(incrementFailCountMock).toHaveBeenCalledWith('coach')
  })

  it('signs out when authenticated user is not a coach', async () => {
    const coachQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }

    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn().mockReturnValue(coachQuery),
    }

    createClientMock.mockResolvedValue(supabase)

    const result = await loginAction({}, buildFormData('coach@example.com', 'secret123'))

    expect(result.error).toBeTruthy()
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('redirects to dashboard for valid coach credentials', async () => {
    const coachQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1' } }),
    }

    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'coaches') return coachQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    createClientMock.mockResolvedValue(supabase)

    await expect(
      loginAction({}, buildFormData('coach@example.com', 'secret123'))
    ).rejects.toThrow('REDIRECT:/coach/dashboard')

    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard')
    expect(redirectMock).toHaveBeenCalledWith('/coach/dashboard')
    expect(clearFailCountMock).toHaveBeenCalledWith('coach')
  })
})
