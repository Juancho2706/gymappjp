import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../_mutation-auth'

const biometricsSchema = z.object({
    heightCm: z.number().min(50).max(260).nullable(),
    weightKg: z.number().min(20).max(400).nullable(),
    sex: z.enum(['male', 'female', 'other']).nullable(),
    workspace: z.unknown().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const rawBody = await request.json().catch(() => null)
    const parsed = biometricsSchema.safeParse(rawBody)
    if (!parsed.success) {
        return NextResponse.json({
            error: 'Datos de biometría inválidos.',
            code: 'VALIDATION_ERROR',
            fieldErrors: parsed.error.flatten().fieldErrors,
        }, { status: 400 })
    }

    const a = await resolveMobileClientMutationContext(request, parsed.data.workspace)
    if ('error' in a) return a.error
    if (!(await mobileContextOwnsClient(a, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    const { heightCm, weightKg, sex } = parsed.data
    const { data: existing, error: readError } = await a.admin
        .from('client_intake')
        .select('id')
        .eq('client_id', clientId)
        .maybeSingle()
    if (readError) {
        return NextResponse.json({ error: readError.message, code: 'BIOMETRICS_READ_FAILED' }, { status: 500 })
    }

    if (existing) {
        const update: { height_cm?: number; weight_kg?: number; sex: 'male' | 'female' | 'other' | null } = { sex }
        if (heightCm !== null) update.height_cm = heightCm
        if (weightKg !== null) update.weight_kg = weightKg
        const { data: updated, error } = await a.admin
            .from('client_intake')
            .update(update)
            .eq('client_id', clientId)
            .select('id')
            .maybeSingle()
        if (error) {
            return NextResponse.json({ error: error.message, code: 'BIOMETRICS_UPDATE_FAILED' }, { status: 500 })
        }
        if (!updated) {
            return NextResponse.json({ error: 'La biometría cambió mientras se guardaba. Intenta nuevamente.', code: 'BIOMETRICS_STALE_WRITE' }, { status: 409 })
        }
        return NextResponse.json({ ok: true })
    }

    const { error } = await a.admin
        .from('client_intake')
        .insert({
            client_id: clientId,
            height_cm: heightCm ?? 0,
            weight_kg: weightKg ?? 0,
            sex,
            goals: '',
            experience_level: '',
            availability: '',
        })
    if (error) {
        return NextResponse.json({ error: error.message, code: 'BIOMETRICS_INSERT_FAILED' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
