import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const resolveContext = vi.fn()
const createRepository = vi.fn()
const sendNotifications = vi.fn()
const repository = { loadSnapshot: vi.fn() }

vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
  resolveMobileClientMutationContext: (...args: unknown[]) => resolveContext(...args),
}))
vi.mock('@/infrastructure/db/program-assignment-notification.repository', () => ({
  createProgramAssignmentNotificationRepository: (...args: unknown[]) => createRepository(...args),
}))
vi.mock('@/infrastructure/email/resend-idempotent-email.repository', () => ({
  resendIdempotentEmailSender: { send: vi.fn() },
}))
vi.mock('@/services/workout/program-assignment-notification.service', () => ({
  sendProgramAssignmentNotifications: (...args: unknown[]) => sendNotifications(...args),
}))

import { POST } from './route'

const PROGRAM_ID = '10000000-0000-4000-8000-000000000001'

function request(body: unknown) {
  return new NextRequest('http://localhost/api/mobile/coach/program-assignment-notifications', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createRepository.mockReturnValue(repository)
  resolveContext.mockResolvedValue({
    admin: { marker: 'admin' },
    userDb: {},
    userId: 'coach-1',
    scope: { type: 'standalone' },
  })
  sendNotifications.mockResolvedValue({
    sentCount: 1,
    notifiedProgramIds: [PROGRAM_ID],
    skipped: [],
  })
})

describe('POST /api/mobile/coach/program-assignment-notifications', () => {
  it('rechaza payload inválido antes del email', async () => {
    const response = await POST(request({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [],
    }))
    expect(response.status).toBe(400)
    expect(resolveContext).toHaveBeenCalledOnce()
    expect(sendNotifications).not.toHaveBeenCalled()
  })

  it('propaga el rechazo autoritativo de Bearer/workspace', async () => {
    resolveContext.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const response = await POST(request({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [PROGRAM_ID],
    }))
    expect(response.status).toBe(401)
    expect(sendNotifications).not.toHaveBeenCalled()
  })

  it('pasa identidad y scope resueltos al servicio y devuelve resultado best-effort', async () => {
    const response = await POST(request({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [PROGRAM_ID],
    }))
    expect(response.status).toBe(200)
    expect(createRepository).toHaveBeenCalledWith({ marker: 'admin' })
    expect(sendNotifications).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'coach-1',
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      repository,
      emailSender: expect.objectContaining({ send: expect.any(Function) }),
    }))
    expect(await response.json()).toEqual({
      success: true,
      sentCount: 1,
      notifiedProgramIds: [PROGRAM_ID],
      skipped: [],
    })
  })

  it('falla cerrado si la validación DB interna no puede ejecutarse', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sendNotifications.mockRejectedValue(new Error('db unavailable'))
    const response = await POST(request({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [PROGRAM_ID],
    }))
    expect(response.status).toBe(500)
    expect((await response.json()).code).toBe('NOTIFICATION_PROCESSING_ERROR')
    consoleError.mockRestore()
  })
})
