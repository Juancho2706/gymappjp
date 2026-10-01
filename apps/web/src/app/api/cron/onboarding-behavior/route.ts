import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    behaviorEmailsDryRun,
    behaviorEmailsEnabled,
    behaviorLaunchCutover,
    sweepBehaviorEmails,
} from '@/lib/email/behavior/behavior-emails'

/**
 * Cron `onboarding-behavior` — el reloj de los correos por comportamiento del onboarding v2
 * (W6 / F6.1, D12 = A del owner).
 *
 * QUÉ HACE, cada hora: barre a los coaches con alta en los últimos 90 d, calcula sus señales
 * (día 1 sin alumno real · día 3 sin su primera rutina · +48 h alumno invitado que no entró · aha ·
 * +7 d sin activar) y manda como máximo UN correo por coach y por corrida, deduplicado por
 * `(coach_id, template_key)` contra `coach_email_ledger`.
 *
 * FRENOS (plan «Correos y activación», 01-10): solo entran las cuentas creadas desde
 * `ONBOARDING_BEHAVIOR_EMAILS_SINCE` (sin esa env no entra nadie); solo sale entre 09:00 y 20:00 de
 * Chile; y el cupo compartido con el aviso de cupo y el carrito abandonado (1 cada 24 h, 3 por
 * semana) que solo el aha atraviesa. Quien pidió la baja no recibe nada.
 *
 * `?dry=1&since=<ISO>` (SOLO en ensayo) audita con otro corte —por ejemplo, la cohorte entera desde el
 * 06-09— sin tocar la env ni mandar nada. Fuera de ensayo `since` se ignora.
 *
 * POR QUÉ HORARIO Y NO DIARIO: `vercel.json` solo tenía crons diarios/semanales, así que un «+2 h»
 * agendado ahí sería en realidad «hasta +26 h» y el correo del día 1 llegaría al día 2 (hallazgo
 * w6-w7-08 de la auditoría 22-08). El disparo EN LÍNEA (`enqueueBehaviorCheck`, D12 = B) cubre lo
 * que ni siquiera una hora aguanta: el aha.
 *
 * FLAG APAGADO POR DEFECTO: sin `ONBOARDING_BEHAVIOR_EMAILS_ENABLED=true` responde
 * `200 {skipped:'disabled'}` y no lee ni manda NADA — el owner revisa el copy antes de encenderlo.
 * Con `ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN=true` (o `?dry=1`) corre el barrido completo y devuelve
 * `wouldSend` sin tocar Resend.
 *
 * La lógica entera vive en `lib/email/behavior/*` (motor puro + servicio), que nunca lanza y
 * devuelve un resumen contable; este endpoint es solo auth + wrapper, molde de `drip-hygiene` y
 * `cap-nudge` (Bearer `CRON_SECRET` fail-closed con `timingSafeEqual`).
 */

/**
 * Un coach por corrida ≈ GoTrue + 4 lecturas + ledger + Resend + el espaciado de 600 ms. Con el
 * padrón actual (44 coaches, y solo los de los últimos 90 d entran) sobra; 60 es el valor con
 * precedente en el repo (`cap-nudge`, `checkout-abandoned`) y es válido en cualquier plan de Vercel.
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

    // Fail-closed del flag ANTES de crear el cliente de service role: apagado significa apagado,
    // ni una lectura.
    if (!behaviorEmailsEnabled()) {
        return NextResponse.json({ ok: true, skipped: 'disabled' })
    }

    const params = new URL(req.url).searchParams
    const dry = behaviorEmailsDryRun() || params.get('dry') === '1'
    // El corte de la URL solo vale en ensayo: un envío real con otro corte sería saltarse la env.
    const sinceParam = dry ? params.get('since')?.trim() : null
    const launchCutover =
        sinceParam && Number.isFinite(new Date(sinceParam).getTime()) ? sinceParam : behaviorLaunchCutover()
    const admin = createServiceRoleClient()
    const summary = await sweepBehaviorEmails(admin, { now: new Date(), dry, policy: { launchCutover } })

    // `wouldSendByKey` y `beforeLaunch` van SUELTOS aunque el segundo ya viaje dentro de `skipped`:
    // el ensayo se audita leyendo el log del cron en Vercel, y ahí lo que se necesita a simple vista
    // es el reparto por template (cuántos correos de cada tipo saldrían) y cuántos coaches frenó el
    // corte de lanzamiento. Sin esto hay que llamar al endpoint a mano para verlo.
    console.info(
        `[cron/onboarding-behavior] done — dry=${dry} candidates=${summary.candidates} ` +
            `sent=${summary.sent} wouldSend=${summary.wouldSend.length} ` +
            `wouldSendByKey=${JSON.stringify(summary.wouldSendByKey)} ` +
            `since=${launchCutover ?? 'none'} beforeLaunch=${summary.skipped.before_launch} ` +
            `outsideHours=${summary.skipped.outside_hours} cooldown=${summary.skipped.cooldown} ` +
            `skipped=${JSON.stringify(summary.skipped)} errors=${summary.errors}`
    )

    return NextResponse.json({ ok: true, dry, since: launchCutover, ...summary })
}
