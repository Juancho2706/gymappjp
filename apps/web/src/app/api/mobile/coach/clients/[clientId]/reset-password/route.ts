import { NextRequest, NextResponse } from 'next/server'
import { generateStudentTempPassword } from '@/lib/auth/temp-credentials'
import {
    applyMobileClientScope,
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../_mutation-auth'

/** Reset de contraseña del alumno (espejo de resetClientPasswordAction) — devuelve temp de 6 dígitos. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    const ctx = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in ctx) return ctx.error
    if (!(await mobileContextOwnsClient(ctx, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    // PIN puro numérico lo rechaza la protección HIBP de Supabase (422). Eva${pin}! pasa.
    const tempPassword = generateStudentTempPassword()
    const { error: authError } = await ctx.admin.auth.admin.updateUserById(clientId, { password: tempPassword })
    if (authError) return NextResponse.json({ error: `Error al actualizar: ${authError.message}`, code: 'RESET_FAILED' }, { status: 500 })

    await applyMobileClientScope(
        ctx.admin.from('clients').update({ force_password_change: true }).eq('id', clientId),
        ctx,
    )
    return NextResponse.json({ ok: true, tempPassword })
}
