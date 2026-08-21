import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildClientArchivedEmail, buildClientUnarchivedEmail } from '@/lib/email/transactional-templates'
import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import type { MobileClientMutationContext } from './_mutation-auth'
import type {
  ArchivedClient,
  ClientArchiveActor,
  ClientArchiveResult,
} from '@/services/client/client-archive.service'

export function bodyRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
}

export function archiveActor(context: MobileClientMutationContext): ClientArchiveActor {
  switch (context.scope.type) {
    case 'team':
      return { coachId: context.userId, workspace: { type: 'team', teamId: context.scope.teamId } }
    case 'enterprise':
      return { coachId: context.userId, workspace: { type: 'enterprise', orgId: context.scope.orgId } }
    case 'standalone':
      return { coachId: context.userId, workspace: { type: 'standalone' } }
  }
}

export function archiveErrorResponse(result: Extract<ClientArchiveResult, { ok: false }>): NextResponse {
  const status = result.code === 'CLIENT_NOT_FOUND'
    ? 404
    : result.code === 'CLIENT_LIMIT_REACHED' || result.code === 'CLIENT_NOT_ARCHIVED' || result.code === 'CLIENT_ARCHIVED_READ_ONLY'
      ? 409
      : result.code === 'CLIENT_LIMIT_CHECK_FAILED'
        ? 503
        : 500
  return NextResponse.json({ error: result.error, code: result.code, limit: result.limit }, { status })
}

/** Notifications are best-effort; state, RLS and Auth never depend on mail delivery. */
export async function sendArchiveLifecycleEmail(input: {
  context: MobileClientMutationContext
  client: ArchivedClient
  kind: 'archived' | 'unarchived'
}): Promise<void> {
  if (!input.client.email) return

  const { context } = input
  const [{ data: coach }, authResult, teamResult] = await Promise.all([
    context.admin
      .from('coaches')
      .select('full_name, brand_name, slug, invite_code, subscription_tier, primary_color, logo_url')
      .eq('id', context.userId)
      .maybeSingle(),
    context.admin.auth.admin.getUserById(context.userId),
    context.scope.type === 'team'
      ? context.admin.from('teams').select('name, slug').eq('id', context.scope.teamId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!coach) return

  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
  const team = teamResult.data
  const publicPath = team ? `/t/${team.slug}` : `/c/${getCoachPublicIdentifier(coach)}`
  const emailBrand = resolveStudentEmailBranding({
    isStandalone: context.scope.type === 'standalone',
    tier: coach.subscription_tier,
    logoUrl: coach.logo_url,
    primaryColor: coach.primary_color,
  })
  const brandName = team?.name ?? coach.brand_name ?? coach.full_name ?? 'EVA'
  const email = input.kind === 'archived'
    ? buildClientArchivedEmail({
      clientName: input.client.fullName,
      coachBrandName: brandName,
      coachName: coach.full_name ?? 'Tu entrenador',
      coachEmail: authResult.data.user?.email ?? null,
      coachPublicUrl: `${appUrl}${publicPath}`,
      logoUrl: emailBrand.logoUrl,
      primaryColor: emailBrand.primaryColor,
      showsEvaBadge: emailBrand.showsEvaBadge,
    })
    : buildClientUnarchivedEmail({
      clientName: input.client.fullName,
      coachBrandName: brandName,
      coachName: coach.full_name ?? 'Tu entrenador',
      loginUrl: `${appUrl}${publicPath}/login`,
      logoUrl: emailBrand.logoUrl,
      primaryColor: emailBrand.primaryColor,
      showsEvaBadge: emailBrand.showsEvaBadge,
    })
  await sendTransactionalEmail({ to: input.client.email, subject: email.subject, html: email.html })
}

/** Kept as a named import boundary: mutation routes never construct a service role themselves. */
export { createServiceRoleClient }
