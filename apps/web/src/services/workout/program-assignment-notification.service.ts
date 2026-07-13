import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import { buildProgramAssignedEmail } from '@/lib/email/transactional-templates'

const MAX_NOTIFICATION_AGE_MS = 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

export type ProgramAssignmentNotificationScope =
  | { type: 'standalone' }
  | { type: 'team'; teamId: string }
  | { type: 'enterprise'; orgId: string }

export type ProgramAssignmentNotificationProgram = {
  id: string
  client_id: string | null
  coach_id: string | null
  org_id: string | null
  name: string
  start_date: string | null
  source_template_id: string | null
  is_active: boolean
  created_at: string
}

export type ProgramAssignmentNotificationClient = {
  id: string
  full_name: string
  email: string
  coach_id: string | null
  team_id: string | null
  org_id: string | null
}

export type ProgramAssignmentNotificationCoach = {
  brand_name: string
  slug: string
  subscription_tier: string
  primary_color: string
  logo_url: string | null
} | null

export type ProgramAssignmentNotificationSnapshot = {
  coach: ProgramAssignmentNotificationCoach
  programs: ProgramAssignmentNotificationProgram[]
  clients: ProgramAssignmentNotificationClient[]
  enterpriseAssignedClientIds: string[]
}

export interface ProgramAssignmentNotificationRepository {
  loadSnapshot(input: {
    userId: string
    programIds: string[]
    scope: ProgramAssignmentNotificationScope
  }): Promise<ProgramAssignmentNotificationSnapshot>
}

export interface ProgramAssignmentNotificationEmailSender {
  send(input: {
    to: string
    subject: string
    html: string
    idempotencyKey: string
  }): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; error: string }>
}

export type ProgramAssignmentNotificationSkipReason =
  | 'program_not_eligible'
  | 'assignment_too_old'
  | 'client_email_missing'
  | 'provider_error'

export type ProgramAssignmentNotificationResult = {
  sentCount: number
  notifiedProgramIds: string[]
  skipped: {
    programId: string
    reason: ProgramAssignmentNotificationSkipReason
  }[]
}

export function programAssignmentEmailIdempotencyKey(programId: string): string {
  return `program-assigned-mobile/${programId}`
}

function programIsRecent(createdAt: string, nowMs: number): boolean {
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) return false
  const ageMs = nowMs - createdAtMs
  return ageMs >= -MAX_FUTURE_SKEW_MS && ageMs <= MAX_NOTIFICATION_AGE_MS
}

function clientMatchesScope(
  client: ProgramAssignmentNotificationClient,
  userId: string,
  scope: ProgramAssignmentNotificationScope,
  enterpriseAssignedClientIds: ReadonlySet<string>,
): boolean {
  if (scope.type === 'standalone') {
    return client.coach_id === userId && client.team_id === null && client.org_id === null
  }
  if (scope.type === 'team') {
    return client.team_id === scope.teamId && client.org_id === null
  }
  return client.org_id === scope.orgId
    && client.team_id === null
    && enterpriseAssignedClientIds.has(client.id)
}

function programMatchesScope(
  program: ProgramAssignmentNotificationProgram,
  userId: string,
  scope: ProgramAssignmentNotificationScope,
): boolean {
  if (program.coach_id !== userId || !program.client_id) return false
  if (!program.is_active || !program.source_template_id || !program.start_date) return false
  if (scope.type === 'enterprise') return program.org_id === scope.orgId
  return program.org_id === null
}

/**
 * Emite el mismo email que la asignación web, pero SOLO para programas que el cliente RN ya
 * persistió. La identidad y el workspace llegan resueltos por el endpoint; el servicio vuelve a
 * comprobar programa + cliente + asignación enterprise antes de producir cualquier side effect.
 *
 * El fallo de email es best-effort, igual que en web: nunca revierte ni falsea la asignación.
 */
export async function sendProgramAssignmentNotifications(input: {
  userId: string
  programIds: string[]
  scope: ProgramAssignmentNotificationScope
  appUrl: string | null
  now?: Date
  repository: ProgramAssignmentNotificationRepository
  emailSender: ProgramAssignmentNotificationEmailSender
}): Promise<ProgramAssignmentNotificationResult> {
  const programIds = [...new Set(input.programIds)]
  const snapshot = await input.repository.loadSnapshot({
    userId: input.userId,
    programIds,
    scope: input.scope,
  })
  const programs = new Map(snapshot.programs.map((program) => [program.id, program]))
  const clients = new Map(snapshot.clients.map((client) => [client.id, client]))
  const enterpriseAssignedClientIds = new Set(snapshot.enterpriseAssignedClientIds)
  const notifiedProgramIds: string[] = []
  const skipped: ProgramAssignmentNotificationResult['skipped'] = []
  const nowMs = (input.now ?? new Date()).getTime()

  const coach = snapshot.coach
  const brandName = coach?.brand_name || 'Tu Coach'
  const coachSlug = coach?.slug || 'coach'
  const emailBrand = resolveStudentEmailBranding({
    isStandalone: input.scope.type === 'standalone',
    tier: coach?.subscription_tier,
    logoUrl: coach?.logo_url,
    primaryColor: coach?.primary_color,
  })
  const dashboardUrl = input.appUrl
    ? `${input.appUrl}/c/${coachSlug}/dashboard`
    : `https://app.tu-dominio.com/c/${coachSlug}/dashboard`

  for (const programId of programIds) {
    const program = programs.get(programId)
    if (!program || !programMatchesScope(program, input.userId, input.scope)) {
      skipped.push({ programId, reason: 'program_not_eligible' })
      continue
    }
    if (!programIsRecent(program.created_at, nowMs)) {
      skipped.push({ programId, reason: 'assignment_too_old' })
      continue
    }

    const client = clients.get(program.client_id!)
    if (!client || !clientMatchesScope(client, input.userId, input.scope, enterpriseAssignedClientIds)) {
      skipped.push({ programId, reason: 'program_not_eligible' })
      continue
    }
    if (!client.email.trim()) {
      skipped.push({ programId, reason: 'client_email_missing' })
      continue
    }

    const email = buildProgramAssignedEmail({
      brandName,
      clientName: client.full_name,
      programName: program.name,
      startDate: program.start_date!,
      dashboardUrl,
      logoUrl: emailBrand.logoUrl,
      primaryColor: emailBrand.primaryColor,
    })
    const sendResult = await input.emailSender.send({
      to: client.email,
      subject: email.subject,
      html: email.html,
      idempotencyKey: programAssignmentEmailIdempotencyKey(program.id),
    }).catch(() => ({ ok: false as const, error: 'Email provider unavailable' }))

    if (!sendResult.ok) {
      skipped.push({ programId, reason: 'provider_error' })
      continue
    }
    notifiedProgramIds.push(programId)
  }

  return {
    sentCount: notifiedProgramIds.length,
    notifiedProgramIds,
    skipped,
  }
}
