import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildNorthStarEmail,
    computeNorthStarWeeklyRow,
} from '@/services/metrics/north-star-weekly.service'
import {
    buildSurfaceFunnelSection,
    computeSurfaceFunnelReport,
    type SurfaceFunnelReport,
} from '@/services/metrics/surface-funnel.service'

/**
 * Cron `north-star-weekly` — «calculada sola» deja de ser una promesa (W1.6).
 *
 * SPEC §2.2 fija la North Star calculada sola a 30 días, pero W0.1 dejó una CONSULTA que alguien
 * corre a mano: sin este cron, «sola» significa «el jefe se acuerda el martes». Cada lunes 13:00
 * UTC este endpoint calcula la fila de la SEMANA RECIÉN CERRADA y se la manda al owner por Resend,
 * con los cinco guardarraíles y el `n` de cada uno («sin lectura» bajo el mínimo).
 *
 * B4 (plan «Activación», 02-10): el mismo correo suma el embudo registro → demo → sumó alumno →
 * entró → lo usa separado por superficie de alta (`surface-funnel.service.ts`). Si ese cálculo
 * falla, el correo sale igual con un aviso en esa sección: la North Star no depende de él.
 *
 * SIN UI: no toca ninguna pantalla ni crea superficie nueva.
 *
 * `?dry=1`: calcula la fila y la devuelve SIN mandar correo. Es la forma de auditar la corrida
 * (y la única disponible mientras `NORTH_STAR_REPORT_TO` no exista).
 *
 * FAIL-CLOSED de la auth (`CRON_SECRET`, con `timingSafeEqual`) y FAIL-SILENT del destinatario:
 * si falta `NORTH_STAR_REPORT_TO` responde 200 con `skipped: 'no_recipient_env'` y la fila, en vez
 * de 500. Es deliberado: la env la setea el owner DESPUÉS del deploy, y un cron en rojo por una
 * variable que todavía no existe solo produce alertas que nadie puede accionar.
 */

/** Cohorte chica pero con una llamada a GoTrue por coach y por alumno: el default de 10 s no alcanza. */
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
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const admin = createServiceRoleClient()
    const now = new Date()

    try {
        const row = await computeNorthStarWeeklyRow(admin, { now })

        console.info(
            `[cron/north-star-weekly] semana=${row.semana} n=${row.n} invitaron_ns=${row.invitaron_ns} ` +
                `activados=${row.activados} maduras72h=${row.maduras_72h} ns=${row.north_star_pct ?? 'null'} dry=${dry}`
        )

        let funnel: SurfaceFunnelReport | null = null
        try {
            funnel = await computeSurfaceFunnelReport(admin, { now })
        } catch (err) {
            console.error(
                '[cron/north-star-weekly] embudo por superficie falló:',
                err instanceof Error ? err.message : String(err)
            )
        }

        if (dry) {
            return NextResponse.json({ ok: true, dry: true, sent: false, row, funnel })
        }

        const to = process.env.NORTH_STAR_REPORT_TO?.trim()
        if (!to) {
            console.warn(
                '[cron/north-star-weekly] NORTH_STAR_REPORT_TO no está seteada: la fila se calculó y NO se envió correo.'
            )
            return NextResponse.json({ ok: true, skipped: 'no_recipient_env', row, funnel })
        }

        const { subject, html: northStarHtml } = buildNorthStarEmail(row)
        const html = northStarHtml + buildSurfaceFunnelSection(funnel)
        const result = await sendTransactionalEmail({ to, subject, html })
        if (!result.ok) {
            console.error('[cron/north-star-weekly] envío falló:', result.error)
            return NextResponse.json({ ok: false, error: 'send_failed', row }, { status: 500 })
        }

        return NextResponse.json({ ok: true, sent: true, row, funnel })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/north-star-weekly] corrida abortada:', message)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }
}
