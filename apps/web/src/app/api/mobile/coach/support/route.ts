import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { SupportMessageSchema } from '@eva/schemas'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildSupportEmail } from '@/lib/email/support-templates'
import { rateLimitSupport } from '@/lib/rate-limit'

/**
 * Endpoint mobile del Centro de Ayuda. Espejo de sendSupportMessage
 * (apps/web/.../coach/support/_actions/support.actions.ts): rate-limit + Zod +
 * email transaccional a SUPPORT_EMAIL_TO con replyTo del coach.
 *
 * Razon de existir: el envio usa Resend + bucket + rate-limit (server-side); el mobile no
 * puede correr el server action ni mandar email user-scoped. Antes el mobile solo abria un
 * mailto (sin clasificacion, adjunto, rate-limit ni confirmacion in-app). Recibe JSON
 * (no FormData). El adjunto se sube a support-attachments user-scoped DESDE el device y se
 * pasa aca como attachmentUrl ya publica (opcional).
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ success: false, error: 'No autenticado.', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ success: false, error: 'No autenticado.', code: 'INVALID_TOKEN' }, { status: 401 })
    const user = ud.user

    const rl = await rateLimitSupport(user.id)
    if (!rl.ok) {
        return NextResponse.json({ success: false, error: 'Has enviado muchos mensajes. Intenta más tarde.' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const parsed = SupportMessageSchema.safeParse({
        type: body?.type,
        subject: body?.subject,
        description: body?.description,
        priority: body?.priority || undefined,
        attachmentUrl: body?.attachmentUrl || undefined,
        metadataUrl: body?.metadataUrl || undefined,
        metadataUserAgent: body?.metadataUserAgent || undefined,
    })
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Revisa los campos del formulario.', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 }
        )
    }
    const { type, subject, description, priority, attachmentUrl, metadataUrl, metadataUserAgent } = parsed.data

    // Coach info via cliente token-scoped (RLS: coach lee su propia fila).
    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data: coach } = await userClient
        .from('coaches')
        .select('id, full_name, brand_name')
        .eq('id', user.id)
        .maybeSingle()
    if (!coach) return NextResponse.json({ success: false, error: 'No se encontró tu perfil de coach.' }, { status: 404 })

    const emailResult = buildSupportEmail({
        coachName: coach.full_name || 'Coach',
        coachEmail: user.email || 'sin-email',
        gymName: coach.brand_name,
        type,
        priority: priority ?? null,
        subject,
        description,
        attachmentUrl: attachmentUrl ?? null,
        metadata: {
            url: metadataUrl || 'No disponible',
            userAgent: metadataUserAgent || 'App movil EVA',
            timestamp: new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
            coachId: coach.id,
        },
    })

    const sendResult = await sendTransactionalEmail({
        to: process.env.SUPPORT_EMAIL_TO || 'contacto@eva-app.cl',
        replyTo: user.email || undefined,
        subject: emailResult.subject,
        html: emailResult.html,
        text: emailResult.text,
    })
    if (!sendResult.ok) {
        console.error('[mobile-support] failed:', sendResult.error)
        return NextResponse.json({ success: false, error: 'No se pudo enviar el mensaje. Intenta más tarde.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
}
