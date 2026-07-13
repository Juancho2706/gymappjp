import { describe, expect, it } from 'vitest'
import { MobileProgramAssignmentNotificationRequestSchema } from './program-assignment-notification'

const PROGRAM_ID = '10000000-0000-4000-8000-000000000001'
const TEAM_ID = '20000000-0000-4000-8000-000000000001'

describe('MobileProgramAssignmentNotificationRequestSchema', () => {
  it('acepta un batch móvil scopeado y acotado', () => {
    expect(MobileProgramAssignmentNotificationRequestSchema.parse({
      workspace: { kind: 'team_owner', teamId: TEAM_ID, orgId: null },
      programIds: [PROGRAM_ID],
    })).toEqual({
      workspace: { kind: 'team_owner', teamId: TEAM_ID, orgId: null },
      programIds: [PROGRAM_ID],
    })
  })

  it('rechaza ids inválidos, duplicados y payloads vacíos', () => {
    expect(MobileProgramAssignmentNotificationRequestSchema.safeParse({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [],
    }).success).toBe(false)
    expect(MobileProgramAssignmentNotificationRequestSchema.safeParse({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: [PROGRAM_ID, PROGRAM_ID],
    }).success).toBe(false)
    expect(MobileProgramAssignmentNotificationRequestSchema.safeParse({
      workspace: { kind: 'standalone', teamId: null, orgId: null },
      programIds: ['no-es-uuid'],
    }).success).toBe(false)
  })
})
