import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveMobileClientMutationContext } from '../_mutation-auth'
import { bulkArchiveClients } from '@/services/client/client-archive.service'
import {
  archiveActor,
  archiveErrorResponse,
  bodyRecord,
  createServiceRoleClient,
  sendArchiveLifecycleEmail,
} from '../_archive-route.shared'

const schema = z.object({
  clientIds: z.array(z.uuid()).min(1).max(200),
  workspace: z.unknown().optional(),
}).strict()

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(bodyRecord(await request.json().catch(() => null)))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Selección de alumnos inválida.', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  const context = await resolveMobileClientMutationContext(request, parsed.data.workspace)
  if ('error' in context) return context.error

  const result = await bulkArchiveClients(createServiceRoleClient(), archiveActor(context), parsed.data.clientIds)
  if (!result.ok) return archiveErrorResponse(result)
  void Promise.allSettled(result.clients.map((client) => sendArchiveLifecycleEmail({ context, client, kind: 'archived' })))
  return NextResponse.json({
    ok: true,
    archived: result.clients.length,
    authFailures: result.authFailures.length,
    code: result.authFailures.length > 0 ? 'AUTH_SYNC_PENDING' : undefined,
  })
}
