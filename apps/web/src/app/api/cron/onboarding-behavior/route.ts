import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    behaviorEmailsDryRun,
    behaviorEmailsEnabled,
    sweepBehaviorEmails,
} from '@/lib/email/behavior/behavior-emails'

/**
 * Cron `onboarding-behavior` — el reloj de los correos por comportamiento del onboarding v2
 * (W6 / F6.1, D12 = A del owner).
 *
 * QUÉ HACE, cada hora: barre a los coaches con alta en los últimos 90 d, calcula sus señales
 * (+2 h sin alumno real · +24 h sin volver · +48 h alumno invitado que no entró · aha · +7 d sin
 * activar) y manda como máximo UN correo por coach y por corrida, deduplicado por
 * `(coach_id, template_key)` contra `coach_email_ledger`.
 *
 * DOS FRENOS AL ENCENDIDO (06-09, tras el ensayo que dio 83 envíos en la primera hora): solo entran
 * las cuentas creadas desde `BEHAVIOR_LAUNCH_CUTOVER`, y entre dos correos del mismo coach hay un
 * piso de `BEHAVIOR_MIN_GAP_MS` (24 h) que solo el aha atraviesa.
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

    const dry = behaviorEmailsDryRun() || new URL(req.url).searchParams.get('dry') === '1'
    const admin = createServiceRoleClient()
    const summary = await sweepBehaviorEmails(admin, { now: new Date(), dry })

    // `wouldSendByKey` y `beforeLaunch` van SUELTOS aunque el segundo ya viaje dentro de `skipped`:
    // el ensayo se audita leyendo el log del cron en Vercel, y ahí lo que se necesita a simple vista
    // es el reparto por template (cuántos correos de cada tipo saldrían) y cuántos coaches frenó el
    // corte de lanzamiento. Sin esto hay que llamar al endpoint a mano para verlo.
    console.info(
        `[cron/onboarding-behavior] done — dry=${dry} candidates=${summary.candidates} ` +
            `sent=${summary.sent} wouldSend=${summary.wouldSend.length} ` +
            `wouldSendByKey=${JSON.stringify(summary.wouldSendByKey)} ` +
            `beforeLaunch=${summary.skipped.before_launch} cooldown=${summary.skipped.cooldown} ` +
            `skipped=${JSON.stringify(summary.skipped)} errors=${summary.errors}`
    )

    return NextResponse.json({ ok: true, dry, ...summary })
}
