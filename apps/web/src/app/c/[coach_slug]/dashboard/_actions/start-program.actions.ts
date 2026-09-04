'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForClient } from '@/lib/student-access.server'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

/**
 * «Empezar hoy» — el ALUMNO fija la fecha de inicio de su programa flexible (tren «ciclo real y por
 * lado», W2.2 · R14/R23/R24).
 *
 * Un programa creado con `start_date_flexible = true` nace con `start_date` y `end_date` en NULL
 * (R21). El hero del dashboard muestra «Tu programa está listo» y esta action es su ÚNICA acción: la
 * RPC `client_start_workout_program` sólo acepta HOY (R14), así que no hay date-picker ni parámetro
 * de fecha — «Elegir otra fecha» quedó fuera del tren.
 *
 * La escritura la hace la RPC (SECURITY DEFINER) con sus propios guards: dueño (`client_id =
 * auth.uid()`), programa activo, flexible y sin fecha, más el gate de suscripción del coach. Acá no
 * se toca `workout_programs` por PostgREST.
 *
 * Archivo `'use server'`: sólo exporta funciones async (el schema Zod y los helpers quedan privados;
 * los tipos se borran en compilación, igual que `LogState` / `QuickWeightState`).
 */

/**
 * Resultado de «Empezar hoy». Expone las TRES columnas del `RETURNS TABLE` de la RPC (R23):
 * `started` distingue «esta llamada escribió la fecha» de «ya estaba», y es lo único que decide si
 * se emite `program_started_by_client`.
 *
 * `code`:
 *  - `validation`      → input mal formado; la RPC no se llamó.
 *  - `unauthenticated` → sin sesión; la RPC no se llamó.
 *  - `coach_paused`    → cuenta del coach en pausa (R17). MISMO código y copy que `logSetAction`
 *                        (`workout-log.actions.ts`), para que el alumno vea el texto de siempre.
 *  - `not_startable`   → ESTADO, no crash: el programa no es del alumno, no está activo, no es
 *                        flexible o ya no está en condiciones de empezar. El hero relee el programa.
 *  - `out_of_range`    → la ventana de la RPC es sólo HOY (R14). No debería ocurrir desde esta
 *                        action (no manda fecha); se mapea igual para no devolver un 500 opaco.
 *  - `db`              → cualquier otro fallo de Postgres/Supabase.
 */
export type StartProgramState = {
    success?: boolean
    /** `workout_programs.start_date` persistida (yyyy-mm-dd Santiago). */
    startDate?: string | null
    /** `start_date + weeks_to_repeat*7 − 1`, calculada por la RPC. Viaja SIEMPRE con `startDate` (R21). */
    endDate?: string | null
    /** `true` sólo cuando ESTA llamada escribió la fecha (R23). `false` = ya estaba (idempotente). */
    started?: boolean
    error?: string
    code?: 'validation' | 'unauthenticated' | 'coach_paused' | 'not_startable' | 'out_of_range' | 'db'
}

/**
 * El `coachSlug` es obligatorio: la ruta del hero es `/c/[coach_slug]/dashboard` y sin el slug la
 * action no puede revalidarla — tras «Empezar hoy» el RSC seguiría diciendo «Empezar hoy».
 * `z.guid()` (no `z.uuid()`) por el gotcha de ids no-RFC del repo.
 */
const StartProgramInputSchema = z.object({
    coachSlug: z.string().trim().min(1).max(120),
    programId: z.guid(),
})

export type StartWorkoutProgramInput = z.infer<typeof StartProgramInputSchema>

export async function startWorkoutProgramAction(input: StartWorkoutProgramInput): Promise<StartProgramState> {
    const parsed = StartProgramInputSchema.safeParse(input)
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.', code: 'validation' }
    }
    const { coachSlug, programId } = parsed.data

    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin round-trip a GoTrue — mismo criterio que
    // `logSetAction`. La identidad SIEMPRE sale de la sesión, nunca del input.
    const { data: claims } = await supabase.auth.getClaims()
    const clientId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null
    if (!clientId) return { error: 'No autenticado.', code: 'unauthenticated' }

    // Gate de suscripción del coach (R17), idéntico al de `logSetAction`: post-gracia el alumno no
    // escribe. Defense-in-depth — la RPC lo vuelve a chequear con `private.student_write_allowed` y
    // esa es la barrera real; acá el error sale TIPADO en vez de un 500 opaco. Fail-open si la
    // lectura de esta capa falla.
    const access = await resolveStudentAccessForClient(supabase, clientId)
    if (access.state === 'readonly') {
        return { error: STUDENT_ACCESS_COPY.pausedWriteError, code: 'coach_paused' }
    }

    // Sin `p_start_date`: NULL ⇒ hoy Santiago (R14/R24). No existe el parámetro en la firma de la
    // action justamente para que nadie mande otra fecha y coseche un `start_date_out_of_range`.
    // `as never`: la migración de la RPC todavía no está aplicada en LIVE, así que `database.types.ts`
    // no la conoce (mismo patrón que `dashboard.queries.ts` con `get_client_current_streak`).
    const { data, error } = await supabase.rpc('client_start_workout_program' as never, {
        p_program_id: programId,
    } as never)

    if (error) return mapStartProgramError(error as { message?: string; code?: string })

    // `RETURNS TABLE` ⇒ PostgREST devuelve un array de una fila.
    const row = unwrapRow(data as unknown)
    if (!row) return { error: 'No se pudo empezar el programa.', code: 'db' }

    // El hero vive en `/c/[coach_slug]/dashboard` y el layout `/c` pinta el estado del programa:
    // sin las dos invalidaciones el RSC volvería a renderizar «Empezar hoy» tras confirmar.
    revalidatePath(`/c/${coachSlug}/dashboard`)
    revalidatePath('/c', 'layout')

    // R23: `started = true` es la ÚNICA condición para contar el evento. Una segunda llamada (doble
    // tap, carrera con el auto-start de la primera serie) vuelve con `false` y no emite nada.
    if (row.started === true) {
        await captureProgramStarted(supabase, clientId, programId)
    }

    return {
        success: true,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        started: row.started === true,
    }
}

/** Fila del `RETURNS TABLE` de `client_start_workout_program` (R23). */
type StartWorkoutProgramRow = { start_date: string | null; end_date: string | null; started: boolean }

function unwrapRow(value: unknown): StartWorkoutProgramRow | null {
    if (Array.isArray(value)) return (value[0] as StartWorkoutProgramRow | undefined) ?? null
    return (value as StartWorkoutProgramRow | null | undefined) ?? null
}

/**
 * Los errores de la RPC viajan con el MENSAJE PELADO (`program_not_startable`, `coach_account_paused`,
 * `start_date_out_of_range`, `unauthenticated`), como el resto de la casa: se distinguen por
 * `includes`, no por `code` — `42501` lo comparten «no es tuyo» y «coach en pausa» (mismo criterio
 * que `intake.actions.ts#mapRpcError`).
 */
function mapStartProgramError(error: { message?: string; code?: string }): StartProgramState {
    const message = error.message ?? ''
    if (message.includes('coach_account_paused')) {
        return { error: STUDENT_ACCESS_COPY.pausedWriteError, code: 'coach_paused' }
    }
    if (message.includes('program_not_startable')) {
        // ESTADO, no crash: probablemente el programa ya tiene fecha o el coach lo desactivó.
        return { error: 'Este programa ya no se puede empezar.', code: 'not_startable' }
    }
    if (message.includes('start_date_out_of_range')) {
        return { error: 'Sólo se puede empezar hoy.', code: 'out_of_range' }
    }
    if (message.includes('unauthenticated')) {
        return { error: 'No autenticado.', code: 'unauthenticated' }
    }
    return { error: 'No se pudo empezar el programa.', code: 'db' }
}

/**
 * `program_started_by_client {program_id, structure, via}` (R7/R23), una sola vez por programa.
 *
 * `structure` no viaja en la firma de la action a propósito (R14/R24: el input es exactamente
 * `{coachSlug, programId}`), así que se lee de la base — una sola vez en la vida del programa, en el
 * camino en que la RPC efectivamente escribió. Best-effort: ni la lectura ni el envío pueden romper
 * un «Empezar hoy» que ya quedó persistido.
 */
async function captureProgramStarted(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clientId: string,
    programId: string,
): Promise<void> {
    let structure: string | null = null
    try {
        const { data } = await supabase
            .from('workout_programs')
            .select('program_structure_type')
            .eq('id', programId)
            .maybeSingle()
        structure = (data as { program_structure_type?: string | null } | null)?.program_structure_type ?? null
    } catch {
        // Sin estructura el evento igual se emite (la propiedad va null); perderlo sería peor.
    }

    await capturePostHogServerEvent({
        event: 'program_started_by_client',
        distinctId: clientId,
        properties: { program_id: programId, structure, via: 'button' },
    })
}
