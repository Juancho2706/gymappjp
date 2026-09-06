import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sweepUnverifiedCoachDrips } from '@/lib/email/send-drip-sequence'

/**
 * Cron `drip-hygiene` — el caller diario de la higiene del drip (FCN W3.8, regla nueva de D1 05-09).
 *
 * QUÉ HACE: cancela en Resend lo que quede AGENDADO de la serie (D+2 / D+7 / D+14) de los coaches
 * cuyo D+1 REBOTÓ. La bienvenida transaccional del alta no se toca; esto solo frena lo agendado.
 *
 * QUÉ CAMBIÓ Y POR QUÉ: antes cancelaba por `coaches.email_verified_at IS NULL` a las 24 h, o sea a
 * todo coach que no volviera a probar su casilla. «No verificado» NO es «casilla inexistente»: le
 * comió el «pásate a Pro» a 24 de 45 altas nuevas que SÍ habían recibido el D+1 (Resend lo reportó
 * entregado). La prueba de que la casilla existe es la ENTREGA del D+1, que el webhook de Resend
 * escribe en `coach_email_ledger`; solo `bounced` / `complained` / `failed` cancelan, y todo lo
 * demás (entregado, sin señal del webhook, todavía sin salir) deja la serie viva. **SPEC §9 R4
 * queda superada por esta decisión.**
 *
 * La lógica entera vive en `sweepUnverifiedCoachDrips` (send-drip-sequence.ts), que nunca lanza
 * y devuelve el resumen contable —con el desglose `skipped` de por qué no se tocó a cada
 * candidato—; este endpoint es solo auth + wrapper, molde de `cap-nudge` (Bearer CRON_SECRET
 * fail-closed con timingSafeEqual).
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
