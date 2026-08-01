import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveMobileClientMutationContext } from '../_mutation-auth'
import { getClientUnarchiveCapacity, hasClientUnarchiveCapacity } from '@/services/client/client-archive.service'
import { archiveActor, bodyRecord, createServiceRoleClient } from '../_archive-route.shared'

const schema = z.object({ workspace: z.unknown().optional() }).strict()

/**
 * Read-only capacity snapshot for the archived roster. The mutation repeats this check,
 * but exposing it lets RN avoid presenting an enabled unarchive action when the active
 * pool is already full.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(bodyRecord(await request.json().catch(() => null)))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Workspace inválido.', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const context = await resolveMobileClientMutationContext(request, parsed.data.workspace)
  if ('error' in context) return context.error

  const result = await getClientUnarchiveCapacity(createServiceRoleClient(), archiveActor(context))
  if (!result.ok) {
    return NextResponse.json({ error: 'No pudimos validar el cupo del workspace.', code: 'CLIENT_LIMIT_CHECK_FAILED' }, { status: 503 })
  }

  return NextResponse.json({
    ...result,
    available: hasClientUnarchiveCapacity(result),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
