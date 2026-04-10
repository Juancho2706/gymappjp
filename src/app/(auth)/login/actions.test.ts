import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
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

import { loginAction } from './actions'

function buildFormData(email: string, password: string) {
  const formData = new FormData()
  formData.set('email', email)
  formData.set('password', password)
  return formData
}

describe('loginAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(result).toEqual({ error: 'Email o contraseña incorrectos.' })
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

    expect(result).toEqual({ error: 'Esta cuenta no tiene acceso al panel de Coach.' })
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
      from: vi.fn().mockReturnValue(coachQuery),
    }

    createClientMock.mockResolvedValue(supabase)

    await expect(
      loginAction({}, buildFormData('coach@example.com', 'secret123'))
    ).rejects.toThrow('REDIRECT:/coach/dashboard')

    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard')
    expect(redirectMock).toHaveBeenCalledWith('/coach/dashboard')
  })
})
