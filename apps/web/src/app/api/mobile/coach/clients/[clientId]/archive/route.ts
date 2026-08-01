import { NextRequest, NextResponse } from 'next/server'
import { mobileContextOwnsClient, resolveMobileClientMutationContext } from '../../_mutation-auth'
import { archiveClient } from '@/services/client/client-archive.service'
import {
  archiveActor,
  archiveErrorResponse,
  bodyRecord,
  createServiceRoleClient,
  sendArchiveLifecycleEmail,
} from '../../_archive-route.shared'

export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const body = bodyRecord(await request.json().catch(() => null))
  const context = await resolveMobileClientMutationContext(request, body.workspace)
  if ('error' in context) return context.error
  if (!(await mobileContextOwnsClient(context, clientId))) {
    return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  }

  const result = await archiveClient(createServiceRoleClient(), archiveActor(context), clientId)
  if (!result.ok) return archiveErrorResponse(result)
  if (!result.idempotent) {
    void sendArchiveLifecycleEmail({ context, client: result.client, kind: 'archived' }).catch(() => {})
  }
  return NextResponse.json({ ok: true, clientId: result.client.id, idempotent: result.idempotent === true })
}
