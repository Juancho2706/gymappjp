import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  applyMobileClientScope,
  mobileContextOwnsClient,
  resolveMobileClientMutationContext,
} from '../_mutation-auth'
import { deleteClientHard } from '@/services/client/client-deletion.service'

const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe usar el formato YYYY-MM-DD.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year!, month! - 1, day!))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  }, 'La fecha no es válida.')

/**
 * Deliberately excludes is_archived/is_active. Their transitions have authentication and
 * entitlement side effects and must use the explicit archive/unarchive/access endpoints.
 */
const clientPatchSchema = z.object({
  goal_weight_kg: z.number().min(20).max(400).nullable().optional(),
  full_name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  subscription_start_date: isoDateSchema.nullable().optional(),
  workspace: z.unknown().optional(),
}).strict()

function bodyRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
}

async function archivedClientResponse(
  request: NextRequest,
  clientId: string,
  workspace: unknown,
): Promise<NextResponse | null> {
  const context = await resolveMobileClientMutationContext(request, workspace)
  if ('error' in context) return context.error
  const query = applyMobileClientScope(
    context.admin.from('clients').select('id, is_archived').eq('id', clientId),
    context,
  )
  const { data } = await query.maybeSingle()
  if (!data) return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  if (data.is_archived === true) {
    return NextResponse.json({
      error: 'Los alumnos archivados son de solo lectura. Desarchívalo para volver a gestionarlo.',
      code: 'ARCHIVED_CLIENT_READ_ONLY',
    }, { status: 409 })
  }
  return null
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const body = bodyRecord(await request.json().catch(() => null))
  const blocked = await archivedClientResponse(request, clientId, body.workspace)
  if (blocked) return blocked

  const context = await resolveMobileClientMutationContext(request, body.workspace)
  if ('error' in context) return context.error
  if (!(await mobileContextOwnsClient(context, clientId))) {
    return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { error, code } = await deleteClientHard(context.admin, clientId)
  if (error) return NextResponse.json({ error, code: code ?? 'DELETE_FAILED' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const body = bodyRecord(await request.json().catch(() => null))
  const parsed = clientPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Datos del alumno inválidos.',
      code: 'VALIDATION_ERROR',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 })
  }

  const { workspace: _workspace, ...patch } = parsed.data
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.', code: 'NO_FIELDS' }, { status: 400 })
  }

  const blocked = await archivedClientResponse(request, clientId, parsed.data.workspace)
  if (blocked) return blocked
  const context = await resolveMobileClientMutationContext(request, parsed.data.workspace)
  if ('error' in context) return context.error
  if (!(await mobileContextOwnsClient(context, clientId))) {
    return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data: updated, error } = await applyMobileClientScope(
    context.admin.from('clients').update(patch).eq('id', clientId),
    context,
  ).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message, code: 'UPDATE_FAILED' }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
