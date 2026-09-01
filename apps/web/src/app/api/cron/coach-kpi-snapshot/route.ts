import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { snapshotAllCoachKpis, snapshotCoachKpis } from '@/app/coach/dashboard/_data/kpi-snapshot.queries'

/**
 * Cron `coach-kpi-snapshot` — la foto diaria que hace posible el delta de «En riesgo» (7C fase 2).
 *
 * QUÉ HACE. Escribe una fila por coach en `coach_kpi_snapshots` con `risk_count`, `active_clients`,
 * `avg_adherence` y `sessions_7d`. El dashboard lee la fila de hace 7 días y de ahí sale el delta
 * del tile «En riesgo» y el saldo NETO de «Alumnos»; sin historial esos deltas quedan en `null` y
 * la UI cae a su caption. No se puede reconstruir a posteriori: `workout_programs.is_active` es un
 * booleano mutable sin historial, los check-ins del pulse llegan hasta `now−35d` y la nutrición
 * hasta `now−7d`.
 *
 * HORARIO. `30 4 * * *` UTC ≈ 01:30 (verano, UTC−3) / 00:30 (invierno, UTC−4) en Santiago: la
 * fila del día se escribe apenas empieza, así que describe el estado al INICIO de ese día.
 *
 * IDEMPOTENTE. El upsert va por `(coach_id, day)`, así que se puede correr a mano el mismo día sin
 * duplicar — es justamente la forma de SEMBRAR la fila de hoy tras el deploy:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://www.eva-app.cl/api/cron/coach-kpi-snapshot
 *
 * `?coach_id=<uuid>` siembra UN coach (diagnóstico o alta nueva) en vez de la cohorte completa.
 *
 * SIN UI: no toca ninguna pantalla. Auth `CRON_SECRET` fail-closed (sin env, nadie entra).
 * Errores PARCIALES responden 200 con la lista: un coach roto no puede esconder las filas que sí
 * se guardaron. Solo un fallo de la corrida entera devuelve 500.
 */

/** Cohorte chica pero con ~3 consultas por coach (pulse incluido): el default de 10 s no alcanza. */
export const maxDuration = 60

// `z.guid()` y NO `z.uuid()`: hay ids sembrados que no son RFC 4122 y la validación estricta los
// rechazaría. Mismo criterio que los endpoints móviles del repo.
const coachIdSchema = z.guid()

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

    const coachIdParam = new URL(req.url).searchParams.get('coach_id')
    if (coachIdParam !== null) {
        const parsed = coachIdSchema.safeParse(coachIdParam)
        if (!parsed.success) {
            return NextResponse.json({ ok: false, error: 'coach_id inválido' }, { status: 400 })
        }
    }

    const admin = createServiceRoleClient()
    const now = new Date()

    try {
        const result = coachIdParam
            ? await snapshotCoachKpis(admin, [coachIdParam], now)
            : await snapshotAllCoachKpis(admin, now)

        console.info(
            `[cron/coach-kpi-snapshot] day=${result.day} snapshotted=${result.snapshotted} errors=${result.errors.length}`
        )
        if (result.errors.length > 0) {
            console.warn(`[cron/coach-kpi-snapshot] parciales: ${result.errors.join(' | ')}`)
        }

        return NextResponse.json({ ok: true, day: result.day, snapshotted: result.snapshotted, errors: result.errors })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/coach-kpi-snapshot] corrida abortada:', message)
        return NextResponse.json({ ok: false, error: 'snapshot run failed' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    return GET(req)
}
