import { describe, expect, it, vi } from 'vitest'
import {
  programAssignmentEmailIdempotencyKey,
  sendProgramAssignmentNotifications,
  type ProgramAssignmentNotificationEmailSender,
  type ProgramAssignmentNotificationRepository,
  type ProgramAssignmentNotificationSnapshot,
} from './program-assignment-notification.service'

const PROGRAM_ID = '10000000-0000-4000-8000-000000000001'
const CLIENT_ID = '20000000-0000-4000-8000-000000000001'
const COACH_ID = '30000000-0000-4000-8000-000000000001'
const TEMPLATE_ID = '40000000-0000-4000-8000-000000000001'
const ORG_ID = '50000000-0000-4000-8000-000000000001'
const TEAM_ID = '60000000-0000-4000-8000-000000000001'

const baseSnapshot: ProgramAssignmentNotificationSnapshot = {
  coach: {
    brand_name: 'Fuerza Sur',
    slug: 'fuerza-sur',
    subscription_tier: 'pro',
    primary_color: '#123456',
    logo_url: 'https://cdn.test/logo.png',
  },
  programs: [{
    id: PROGRAM_ID,
    client_id: CLIENT_ID,
    coach_id: COACH_ID,
    org_id: null,
    name: 'Hipertrofia 4 semanas',
    start_date: '2026-07-13',
    source_template_id: TEMPLATE_ID,
    is_active: true,
    created_at: '2026-07-13T11:55:00.000Z',
  }],
  clients: [{
    id: CLIENT_ID,
    full_name: 'Ana Pérez',
    email: 'ana@example.com',
    coach_id: COACH_ID,
    team_id: null,
    org_id: null,
  }],
  enterpriseAssignedClientIds: [],
}

function deps(snapshot: ProgramAssignmentNotificationSnapshot, sendOk = true) {
  const loadSnapshot = vi.fn().mockResolvedValue(snapshot)
  const send = vi.fn().mockResolvedValue(sendOk
    ? { ok: true, providerMessageId: 'email-1' }
    : { ok: false, error: 'provider down' })
  return {
    repository: { loadSnapshot } as ProgramAssignmentNotificationRepository,
    emailSender: { send } as ProgramAssignmentNotificationEmailSender,
    loadSnapshot,
    send,
  }
}

describe('sendProgramAssignmentNotifications', () => {
  it('reproduce el email web y usa idempotencia estable por programa', async () => {
    const d = deps(baseSnapshot)
    const result = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      appUrl: 'https://www.eva-app.cl',
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...d,
    })

    expect(result).toEqual({ sentCount: 1, notifiedProgramIds: [PROGRAM_ID], skipped: [] })
    expect(d.send).toHaveBeenCalledOnce()
    const email = d.send.mock.calls[0]![0]
    expect(email).toMatchObject({
      to: 'ana@example.com',
      subject: 'Nuevo programa: Hipertrofia 4 semanas',
      idempotencyKey: `program-assigned-mobile/${PROGRAM_ID}`,
    })
    expect(email.html).toContain('Ana Pérez')
    expect(email.html).toContain('2026-07-13')
    expect(email.html).toContain('https://www.eva-app.cl/c/fuerza-sur/dashboard')
  })

  it('falla cerrado si programa o cliente no pertenecen al workspace', async () => {
    const d = deps({
      ...baseSnapshot,
      clients: [{ ...baseSnapshot.clients[0]!, coach_id: 'otro-coach' }],
    })
    const result = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...d,
    })

    expect(result.skipped).toEqual([{ programId: PROGRAM_ID, reason: 'program_not_eligible' }])
    expect(d.send).not.toHaveBeenCalled()
  })

  it('enterprise exige org coincidente y asignación viva al coach', async () => {
    const enterpriseSnapshot: ProgramAssignmentNotificationSnapshot = {
      ...baseSnapshot,
      programs: [{ ...baseSnapshot.programs[0]!, org_id: ORG_ID }],
      clients: [{ ...baseSnapshot.clients[0]!, coach_id: null, org_id: ORG_ID }],
      enterpriseAssignedClientIds: [],
    }
    const denied = deps(enterpriseSnapshot)
    const deniedResult = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'enterprise', orgId: ORG_ID },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...denied,
    })
    expect(deniedResult.skipped[0]?.reason).toBe('program_not_eligible')

    const allowed = deps({ ...enterpriseSnapshot, enterpriseAssignedClientIds: [CLIENT_ID] })
    const allowedResult = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'enterprise', orgId: ORG_ID },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...allowed,
    })
    expect(allowedResult.sentCount).toBe(1)
  })

  it('team autoriza por pool activo y no por clients.coach_id legacy', async () => {
    const teamSnapshot: ProgramAssignmentNotificationSnapshot = {
      ...baseSnapshot,
      clients: [{ ...baseSnapshot.clients[0]!, coach_id: 'coach-creador', team_id: TEAM_ID }],
    }
    const allowed = deps(teamSnapshot)
    const result = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'team', teamId: TEAM_ID },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...allowed,
    })
    expect(result.sentCount).toBe(1)

    const denied = deps({
      ...teamSnapshot,
      clients: [{ ...teamSnapshot.clients[0]!, team_id: 'otro-team' }],
    })
    const deniedResult = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'team', teamId: TEAM_ID },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...denied,
    })
    expect(deniedResult.skipped[0]?.reason).toBe('program_not_eligible')
  })

  it('solo notifica asignaciones recientes, activas y nacidas de plantilla', async () => {
    const stale = deps({
      ...baseSnapshot,
      programs: [{ ...baseSnapshot.programs[0]!, created_at: '2026-07-11T11:00:00.000Z' }],
    })
    const staleResult = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...stale,
    })
    expect(staleResult.skipped[0]?.reason).toBe('assignment_too_old')

    const notFromTemplate = deps({
      ...baseSnapshot,
      programs: [{ ...baseSnapshot.programs[0]!, source_template_id: null }],
    })
    const templateResult = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...notFromTemplate,
    })
    expect(templateResult.skipped[0]?.reason).toBe('program_not_eligible')
  })

  it('un fallo del proveedor no revierte la asignación y queda reportado', async () => {
    const d = deps(baseSnapshot, false)
    const result = await sendProgramAssignmentNotifications({
      userId: COACH_ID,
      programIds: [PROGRAM_ID],
      scope: { type: 'standalone' },
      appUrl: null,
      now: new Date('2026-07-13T12:00:00.000Z'),
      ...d,
    })
    expect(result).toEqual({
      sentCount: 0,
      notifiedProgramIds: [],
      skipped: [{ programId: PROGRAM_ID, reason: 'provider_error' }],
    })
  })

  it('la clave idempotente depende solo del evento persistido', () => {
    expect(programAssignmentEmailIdempotencyKey(PROGRAM_ID)).toBe(`program-assigned-mobile/${PROGRAM_ID}`)
  })
})
