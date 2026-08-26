import 'server-only'

import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { normalizePlatformEmail } from '@/lib/auth/platform-email'

type Db = SupabaseClient<Database>

/** Fila que devuelve el propio UPDATE: existe SOLO si esta llamada fue la que escribió. */
type FirstLoginRow = {
    coach_id: string | null
    created_at: string
    email: string | null
}

/**
 * W1.2 de flujo-coach-nuevo: «el alumno entró» deja de inferirse.
 *
 * Sella `clients.first_login_at` una sola vez y, si esta llamada fue la que escribió, emite
 * `student_first_login` a PostHog. Reglas del SPEC §5 que este archivo materializa:
 *
 * - Regla 1: escribe SOLO `service_role`. La columna no tiene column-grant para `authenticated`
 *   ni `anon` a propósito (`supabase/migrations/20260826044738_clients_first_login_at.sql`), así
 *   que el `admin` que recibe tiene que ser el cliente de service role del caller.
 * - Regla 2: es PRIMER login, no último. El `WHERE first_login_at IS NULL` del UPDATE es lo que
 *   hace idempotente la señal; sin él la North Star «activado dentro de 72 h» no se puede leer.
 * - Regla 3: best-effort pero SE ESPERA. El UPDATE es una sentencia por PK y se hace `await` en
 *   el call site antes de responder — la promesa flotante es la trampa que perdió 2 de 5
 *   bienvenidas el 19-08 (`lib/email/free-coach-onboarding.ts:24-28`). Lo único que NO se espera
 *   en línea es el capture de PostHog: va por `after()` de `next/server`, que mantiene viva la
 *   invocación sin sumarle latencia al login del alumno.
 *
 * OJO con `lib/meta/capi.ts:233-239`: ahí se documenta que `after()` NO corrió: ese camino termina
 * en `redirect()`, que aborta el render. Acá los dos call sites devuelven (JSON en el route RN, el
 * objeto `{success, redirectUrl}` en el login web), que es el caso soportado. Si aun así el evento
 * no apareciera en PostHog, la cura es mover SOLO el capture a `await` —nunca la escritura, que ya
 * se espera— y no volver a fire-and-forget.
 *
 * NUNCA lanza y NUNCA devuelve error al alumno: perder la señal es aceptable, romperle el ingreso
 * no. `Clean Architecture`: este servicio no importa nada de `app/`.
 */
export async function recordStudentFirstLogin(admin: Db, clientId: string): Promise<boolean> {
    if (!clientId) return false

    const nowIso = new Date().toISOString()

    let row: FirstLoginRow | null = null
    try {
        // `select(...)` sobre el UPDATE = returning: si vuelve vacío, otra sesión ya había
        // sellado la columna y esta llamada NO escribió. Es la única forma de distinguir
        // «primer login» de «login número N» sin un SELECT extra.
        const { data, error } = await admin
            .from('clients')
            .update({ first_login_at: nowIso })
            .eq('id', clientId)
            .is('first_login_at', null)
            .select('coach_id, created_at, email')

        if (error) {
            console.warn('[student-login-signal] no se pudo sellar first_login_at', error.message)
            return false
        }

        row = (data?.[0] as FirstLoginRow | undefined) ?? null
    } catch (error) {
        console.warn('[student-login-signal] excepción al sellar first_login_at', error)
        return false
    }

    // Sin fila: la columna ya estaba escrita. No se emite evento (aceptación de W1.2: dos
    // llamadas seguidas escriben una sola vez y emiten UN solo evento).
    if (!row) return false

    scheduleFirstLoginCapture(admin, row, nowIso)
    return true
}

/**
 * Agenda el capture fuera del camino crítico. Va aparte para que un fallo acá —incluido
 * `after()` llamado fuera de un request scope— nunca convierta una escritura real en `false`.
 */
function scheduleFirstLoginCapture(admin: Db, row: FirstLoginRow, nowIso: string): void {
    const coachId = row.coach_id
    if (!coachId) return

    try {
        after(async () => {
            await captureStudentFirstLogin(admin, coachId, row, nowIso)
        })
    } catch (error) {
        console.warn('[student-login-signal] no se pudo agendar el evento', error)
    }
}

/**
 * `import()` DINÁMICO del capture, mismo patrón que `persona.service.ts:403-422`:
 * `server-capture` es `server-only` y este servicio lo alcanzan módulos que también viven en
 * caminos donde ese import estático estorba.
 */
async function captureStudentFirstLogin(
    admin: Db,
    coachId: string,
    row: FirstLoginRow,
    nowIso: string,
): Promise<void> {
    try {
        const { capturePostHogServerEvent } = await import('@/lib/posthog/server-capture')
        await capturePostHogServerEvent({
            event: 'student_first_login',
            // `distinct_id` = el coach: la North Star es del coach, no del alumno, y por
            // consentimiento acá no viaja ningún dato personal del alumno.
            distinctId: coachId,
            properties: {
                seconds_since_created: secondsBetween(row.created_at, nowIso),
                self_invited: await resolveSelfInvited(admin, coachId, row.email),
            },
        })
    } catch (error) {
        console.warn('[student-login-signal] no se pudo emitir student_first_login', error)
    }
}

/** Segundos entre el alta del alumno y su primer login. `null` si la fecha no es legible. */
function secondsBetween(createdAt: string | null, nowIso: string): number | null {
    if (!createdAt) return null
    const created = Date.parse(createdAt)
    const now = Date.parse(nowIso)
    if (Number.isNaN(created) || Number.isNaN(now)) return null
    return Math.round((now - created) / 1000)
}

/**
 * Métrica-guarda del SPEC §2.1: el coach que se autoinvita para probar no cuenta como activación.
 *
 * Los dos correos se comparan NORMALIZADOS (`normalizePlatformEmail`): en crudo,
 * `coach+alumno@gmail.com` y los puntos de Gmail pasan limpio. `coaches` NO tiene columna `email`,
 * así que el del coach sale de Auth; si esa lectura falla, el evento sale igual con `null` —una
 * propiedad ausente sería indistinguible de «no se autoinvitó».
 */
async function resolveSelfInvited(
    admin: Db,
    coachId: string,
    studentEmail: string | null,
): Promise<boolean | null> {
    if (!studentEmail) return null

    try {
        const { data, error } = await admin.auth.admin.getUserById(coachId)
        const coachEmail = data?.user?.email
        if (error || !coachEmail) return null
        return normalizePlatformEmail(studentEmail) === normalizePlatformEmail(coachEmail)
    } catch {
        return null
    }
}
