import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sweepUnverifiedCoachDrips } from '@/lib/email/send-drip-sequence'

/**
 * Cron `drip-hygiene` — el caller diario de la higiene de W3.8 (FCN).
 *
 * QUÉ HACE: cancela en Resend los drips agendados de coaches cuya casilla nadie probó nunca
 * (`coaches.email_verified_at IS NULL`) pasadas 24 h del alta. Bajo D1 = A el alta free nace
 * activa sin abrir el correo: mandarle 4 correos a una casilla que puede no existir quema la
 * reputación del dominio con rebotes. La bienvenida (transaccional, ya enviada en el alta) no
 * se toca; esto solo frena lo AGENDADO.
 *
 * La lógica entera vive en `sweepUnverifiedCoachDrips` (send-drip-sequence.ts), que nunca lanza
 * y devuelve el resumen contable; este endpoint es solo auth + wrapper, molde de `cap-nudge`
 * (Bearer CRON_SECRET fail-closed con timingSafeEqual).
 */
export const maxDuration = 60

function isAuthorized(req: Request): boolean {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    const expectedHeader = `Bearer ${expected}`
    const authBuf = Buffer.from(auth, 'utf8')
    const expectedBuf = Buffer.from(expectedHeader, 'utf8')
    if (authBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(authBuf, expectedBuf)
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const admin = createServiceRoleClient()
    const summary = await sweepUnverifiedCoachDrips(admin)
    return NextResponse.json({ ok: true, ...summary })
}
