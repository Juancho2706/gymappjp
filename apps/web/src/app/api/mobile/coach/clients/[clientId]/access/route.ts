import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mobileContextOwnsClient, resolveMobileClientMutationContext } from '../../_mutation-auth'
import { setClientAccessState } from '@/services/client/client-archive.service'
import {
  archiveActor,
  archiveErrorResponse,
  bodyRecord,
  createServiceRoleClient,
} from '../../_archive-route.shared'

const schema = z.object({ isActive: z.boolean(), workspace: z.unknown().optional() }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const parsed = schema.safeParse(bodyRecord(await request.json().catch(() => null)))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos de acceso inválidos.', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  const context = await resolveMobileClientMutationContext(request, parsed.data.workspace)
  if ('error' in context) return context.error
  if (!(await mobileContextOwnsClient(context, clientId))) {
    return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  }
  const result = await setClientAccessState(createServiceRoleClient(), archiveActor(context), clientId, parsed.data.isActive)
  if (!result.ok) return archiveErrorResponse(result)
  return NextResponse.json({ ok: true, clientId: result.client.id, isActive: result.client.isActive === true })
}
