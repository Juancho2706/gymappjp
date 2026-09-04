'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { WorkoutLogSetSchema } from '@eva/schemas'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay } from '@/lib/date-utils'
import { STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForClient } from '@/lib/student-access.server'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { PAST_SET_NOT_FOUND_ERROR, validateTargetDate } from '@eva/workout-engine'

export type LogState = {
    error?: string
    success?: boolean
    /**
     * Código de clase de error para que el flush de la cola offline decida reintentar vs DESCARTAR.
     * `invalid_block` = el block_id no existe (huérfano de reseed / FK 23503) → descartar, no reintentar.
     * `coach_paused` = la cuenta del coach está en pausa (post-gracia, solo-lectura) → el flush NO debe
     * reintentar en loop; el registro no entrará hasta que el coach reactive.
     * `past_set_not_found` = edición de un día PASADO (`target_date` anterior a hoy) donde NO existe la
     * fila de esa serie → jamás se inserta (imposible farmear adherencia retroactiva); el llamador
     * informa "no hay registro que editar", nunca reintenta. OJO: un `target_date` igual a HOY NO puede
     * producir este código — degrada al upsert normal de hoy (ver bloque de validación abajo).
     */
    code?: 'invalid_block' | 'unauthenticated' | 'validation' | 'db' | 'coach_paused' | 'past_set_not_found'
}

export async function logSetAction(
    _prev: LogState,
    formData: FormData
): Promise<LogState> {
    const getOptional = (key: string) => {
        const val = formData.get(key)
        if (val === null || val === '') return undefined
        return String(val).replace(',', '.')
    }

    // Nota (quick-win E2-6): texto libre — leída CRUDA, jamás por getOptional (que hace
    // replace(',', '.') y corrompería el texto). '' → undefined para no pisar con vacío.
    const noteRaw = formData.get('note')
    const note = noteRaw === null || String(noteRaw).trim() === '' ? undefined : String(noteRaw)

    // Sustitución de máquina ocupada (Fase L · C): texto/uuid — leídos CRUDOS (no por getOptional).
    // Sólo llegan cuando el bloque tenía sustitución activa; una serie normal no envía estas keys.
    const rawText = (key: string) => {
        const v = formData.get(key)
        return v === null || String(v).trim() === '' ? undefined : String(v).trim()
    }
    const substituted_exercise_id = rawText('substituted_exercise_id')
    const substituted_exercise_name = rawText('substituted_exercise_name')
    const substitution_reason = rawText('substitution_reason')

    // Hold POR LADO (E3.2 · executor-v3): la fila per_side de movilidad envía `metadata` como JSON
    // ({left_sec, right_sec}). Sólo llega en ese flujo; una serie normal no manda la key → undefined
    // (byte-idéntico al comportamiento previo). Se parsea permisivo: un JSON inválido se ignora (no
    // rompe el guardado — el `actual_hold_sec` sumado ya viaja aparte y es la fuente del hold total).
    const metadataRaw = formData.get('metadata')
    let metadata: unknown
    if (metadataRaw !== null && String(metadataRaw).trim() !== '') {
        try {
            metadata = JSON.parse(String(metadataRaw))
        } catch {
            metadata = undefined
        }
    }

    // Edición de día pasado (Ola 1, decisión CEO 10): `target_date` opcional `yyyy-mm-dd`. Un
    // `target_date` PASADO conmuta el flujo a modo SOLO-UPDATE (nunca inserta); igual a HOY o ausente =
    // upsert de HOY byte-idéntico. Se valida server-side más abajo, tras autenticar.
    const targetDate = rawText('target_date')

    const raw = {
        block_id: formData.get('block_id') as string,
        set_number: formData.get('set_number') as string,
        weight_kg: getOptional('weight_kg'),
        reps_done: getOptional('reps_done'),
        rpe: getOptional('rpe'),
        rir: getOptional('rir'),
        note,
        // Espejo polimórfico (M3): solo llegan desde las variantes cardio/movilidad/roller
        // del LogSetForm — un log strength de hoy no envía estas keys (AC4 sin regresión).
        actual_duration_sec: getOptional('actual_duration_sec'),
        actual_distance_m: getOptional('actual_distance_m'),
        actual_pace_sec_per_km: getOptional('actual_pace_sec_per_km'),
        actual_hold_sec: getOptional('actual_hold_sec'),
        actual_avg_hr: getOptional('actual_avg_hr'),
        // Sustitución (Fase L · C): NO sobreescriben exercise_id (AC-C7) — columnas dedicadas.
        substituted_exercise_id,
        substituted_exercise_name,
        substitution_reason,
        // Hold POR LADO (E3.2): {left_sec, right_sec} → workout_logs.metadata jsonb. El schema valida
        // el shape (enteros 0-86400, opcionales); undefined ⇒ el log no toca metadata.
        metadata,
    }

    const parsed = WorkoutLogSetSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message, code: 'validation' }
    }

    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin round-trip a GoTrue /user. getUser()
    // hacía una llamada de red POR CADA serie; en la red mala del gimnasio fallaba y devolvía un
    // "No autenticado" espurio que rompía el guardado. El proxy ya validó/refrescó la sesión y el
    // resto del repo ya migró a este patrón (ej. check-in.queries.ts).
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { error: 'No autenticado.', code: 'unauthenticated' }

    // Gate de suscripcion del coach: post-gracia (readonly) el alumno NO registra. En ok/grace pasa
    // normal. Defense-in-depth (la RLS es la barrera real); aqui devolvemos un error TIPADO en vez de
    // un 500 opaco. Fail-open ante fallo de lectura de esta capa.
    const access = await resolveStudentAccessForClient(supabase, user.id)
    if (access.state === 'readonly') {
        return { error: STUDENT_ACCESS_COPY.pausedWriteError, code: 'coach_paused' }
    }

    // R3 (auditoria 2026-06-11): todas las operaciones son sobre workout_logs propios del alumno
    // (client_manage_logs) → cliente user-scoped. RLS ademas acota el DELETE de duplicados.
    const { iso: todayStr } = getTodayInSantiago()
    // Ventana del día a escribir. Sin `target_date` = HOY (upsert clásico). Con `target_date` se valida
    // estricto (formato + pasado u hoy; el futuro se rechaza) y define la ventana de esa fecha.
    // SÓLO una fecha PASADA activa el modo solo-UPDATE de abajo: `target_date == HOY` degrada al upsert
    // normal de hoy (misma ventana, mismo comportamiento que sin `target_date`). Eso cubre las dos
    // entradas del incidente 2026-07-26: la URL `?fecha=<hoy>` y los items de la cola offline YA
    // serializados con `target_date` de hoy (que se descartaban como `past_set_not_found` y perdían la
    // serie). El anti-farmeo de adherencia retroactiva se conserva intacto para el pasado.
    let windowDateStr = todayStr
    let pastEditMode = false
    if (targetDate !== undefined) {
        const validated = validateTargetDate(targetDate, todayStr)
        if (!validated.ok) return { error: 'Fecha inválida.', code: 'validation' }
        windowDateStr = validated.iso
        pastEditMode = validated.iso !== todayStr
    }
    const { startIso: startTs, endIso: endTs } = getSantiagoUtcBoundsForDay(windowDateStr)

    const { data: existingRows } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('block_id', parsed.data.block_id)
        .eq('client_id', user.id)
        .eq('set_number', parsed.data.set_number)
        .gte('logged_at', startTs)
        .lt('logged_at', endTs)
        .order('logged_at', { ascending: false })

    let dbError

    // W2.3 (ciclo real y por lado): la key `metadata` viaja SÓLO cuando el payload la trajo. Antes se
    // escribía `?? null`, así que re-guardar una serie desde una superficie que no manda la key (el
    // upsert de hoy sin el campo, el modo solo-UPDATE de un día pasado, un item legacy de la cola)
    // BORRABA el jsonb entero: el hold por lado `{left_sec, right_sec}` de movilidad y, desde este
    // tren, el desglose `{left_reps, right_reps}` de fuerza. Omitir la key deja la columna intacta.
    // Vaciar un lado sigue siendo posible y explícito: mandar `{left_reps: 10, right_reps: null}`
    // reemplaza el jsonb con ese objeto (el zod acepta `null` por lado justamente para eso).
    const metadataPayload = parsed.data.metadata

    const payloadValues = {
        weight_kg: parsed.data.weight_kg ?? null,
        reps_done: parsed.data.reps_done ?? null,
        rpe: parsed.data.rpe ?? null,
        rir: parsed.data.rir ?? null,
        note: parsed.data.note ?? null,
        actual_duration_sec: parsed.data.actual_duration_sec ?? null,
        actual_distance_m: parsed.data.actual_distance_m ?? null,
        actual_pace_sec_per_km: parsed.data.actual_pace_sec_per_km ?? null,
        actual_hold_sec: parsed.data.actual_hold_sec ?? null,
        actual_avg_hr: parsed.data.actual_avg_hr ?? null,
        // Sustitución de máquina ocupada (Fase L · C, DC-1): visible para el coach en la ficha.
        // Snapshot del nombre → sobrevive al hard-delete del ejercicio. exercise_id NO se toca.
        substituted_exercise_id: parsed.data.substituted_exercise_id ?? null,
        substituted_exercise_name: parsed.data.substituted_exercise_name ?? null,
        substitution_reason: parsed.data.substitution_reason ?? null,
        // Hold POR LADO (E3.2) + reps por lado de fuerza (R3): jsonb. La key sólo existe cuando el
        // payload la trajo (W2.3) — sin ella el UPDATE no toca la columna y el INSERT la deja NULL.
        ...(metadataPayload !== undefined ? { metadata: metadataPayload } : {}),
    }

    if (existingRows && existingRows.length > 0) {
        const targetId = existingRows[0].id
        const { error: updateError } = await supabase
            .from('workout_logs')
            .update(payloadValues)
            .eq('id', targetId)
        dbError = updateError

        if (existingRows.length > 1) {
            const duplicateIds = existingRows.slice(1).map(r => r.id)
            await supabase.from('workout_logs').delete().in('id', duplicateIds)
        }
    } else if (pastEditMode) {
        // Modo solo-UPDATE: editar un día pasado JAMÁS inserta. Si no existe la fila de esa serie en
        // la ventana `target_date`, devolvemos un error tipado (imposible pre-cargar adherencia de un
        // día en el que el alumno no registró). El llamador (E1.6) lo muestra como "no hay registro".
        // La copia vive en `@eva/workout-engine` (PAST_SET_NOT_FOUND_ERROR): el motor RN devuelve el
        // MISMO texto en su réplica client-side del solo-UPDATE, así no driftean.
        return { error: PAST_SET_NOT_FOUND_ERROR, code: 'past_set_not_found' }
    } else {
        const { error: insertError } = await supabase.from('workout_logs').insert({
            block_id: parsed.data.block_id,
            client_id: user.id,
            set_number: parsed.data.set_number,
            ...payloadValues,
        })

        // 23505 = unique violation contra el índice `workout_logs_one_set_per_day`
        // (client_id, block_id, set_number, día-Santiago(logged_at)) que agrega la migración
        // 20260707. Sintoma de la CARRERA flush-vs-submit: el flush de la cola offline (evento
        // 'online') corrió CONCURRENTE con este submit online de la MISMA serie — ambos SELECT
        // vieron 0 filas y ambos intentaron INSERT; la DB rechaza al segundo. NO es error de
        // usuario ni algo que reintentar: re-SELECT la fila ganadora (la que sí entró) y hacemos
        // UPDATE encima (last-wins, misma semántica que la rama UPDATE de arriba). El manual
        // "upsert por día" ya no es atómico, así que el índice lo respalda desde la DB.
        // Backward-compatible: MIENTRAS la migración no esté aplicada en prod este 23505 no puede
        // ocurrir y el flujo es idéntico al anterior (la doble fila reaparece, pero sin regresión).
        if (insertError && (insertError as { code?: string }).code === '23505') {
            const { data: winnerRows } = await supabase
                .from('workout_logs')
                .select('id')
                .eq('block_id', parsed.data.block_id)
                .eq('client_id', user.id)
                .eq('set_number', parsed.data.set_number)
                .gte('logged_at', startTs)
                .lt('logged_at', endTs)
                .order('logged_at', { ascending: false })
                .limit(1)

            if (winnerRows && winnerRows.length > 0) {
                const { error: updateError } = await supabase
                    .from('workout_logs')
                    .update(payloadValues)
                    .eq('id', winnerRows[0].id)
                dbError = updateError
            } else {
                // El 23505 PRUEBA que ya existe la fila para (block_id, set_number, día); si no la
                // vemos en nuestra ventana (borde de día raro / RLS), NO reintentar en loop: la
                // serie ya quedó guardada → degradar a éxito silencioso.
                dbError = null
            }
        } else {
            dbError = insertError
        }
    }

    if (dbError) {
        // FK 23503 = el block_id no existe (bloque borrado/recreado por reseed): huérfano → el flush
        // debe DESCARTARLO, no reintentar en loop. (PostgrestError expone .code de Postgres.)
        const pgCode = (dbError as { code?: string }).code
        if (pgCode === '23503') return { error: 'El bloque ya no existe.', code: 'invalid_block' }
        return { error: dbError.message, code: 'db' }
    }

    // W2.4 · Auto-start del programa flexible (R14/R23). DESPUÉS de que la serie quedó guardada y
    // nunca antes: si la RPC falla, el registro del alumno ya está en la base. En modo edición de un
    // día PASADO no corre — la RPC sólo acepta HOY (R14) y una serie de otro día no significa que el
    // alumno esté empezando el programa hoy.
    if (!pastEditMode) {
        await autoStartFlexibleProgram(supabase, user.id, parsed.data.block_id)
    }

    // Sin revalidatePath por serie: la UI del exec es optimista + write-through y el resumen usa
    // sessionLogs en memoria. Revalidar el layout entero en cada serie devolvía payload RSC del
    // layout → parpadeo + salto de scroll (multiplicado N veces por el flush de la cola). Next 16
    // con dynamic=0 (staleTime 0) re-fetchea al navegar, así que coach/dashboard ven fresco igual;
    // el flush offline mantiene su router.refresh() al reconectar. La invalidación explícita ocurre
    // UNA vez al FINALIZAR (revalidateWorkoutViewAction), no por serie.
    return { success: true }
}

/**
 * Auto-start del programa de inicio flexible (W2.4 · tren «ciclo real y por lado», R14/R23).
 *
 * Un programa creado con `start_date_flexible = true` nace SIN fecha: el alumno la fija con «Empezar
 * hoy» (`startWorkoutProgramAction`) o, si se saltea el hero y entra directo a entrenar, con la
 * PRIMERA serie que registra. Acá va esa segunda entrada.
 *
 * Por qué una lectura propia: el action sólo conoce el `block_id`, así que resuelve
 * bloque → plan → programa en UN solo request (PostgREST anidado, PK indexada). No se puede confiar
 * en un flag del `FormData`: el estado del programa es autoridad del servidor, nunca del body.
 *
 * Por qué no se repite: en cuanto la RPC escribe, `start_date` deja de ser NULL y la lectura de la
 * serie siguiente ya no entra al `if`. Si dos series compiten, la RPC es idempotente (R28) y la
 * segunda vuelve con `started = false` → el evento se emite UNA vez (R23).
 *
 * Best-effort de punta a punta: cualquier fallo (lectura, RPC, `coach_account_paused`, red) se traga
 * en silencio. El gate real de cuenta pausada del guardado es el tipado de arriba
 * (`resolveStudentAccessForClient`), que ya corrió; acá romper el flujo sería perder la serie.
 */
async function autoStartFlexibleProgram(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clientId: string,
    blockId: string,
): Promise<void> {
    try {
        const { data } = await supabase
            .from('workout_blocks')
            .select(
                'workout_plans ( workout_programs ( id, start_date, start_date_flexible, program_structure_type ) )'
            )
            .eq('id', blockId)
            .maybeSingle()

        const plan = unwrapEmbedded<{ workout_programs: unknown }>(
            (data as { workout_plans?: unknown } | null)?.workout_plans
        )
        const program = unwrapEmbedded<FlexibleProgramRow>(plan?.workout_programs)
        // `!== true` / `!= null` a propósito: sólo el par exacto (flag prendido, fecha ausente) llama
        // la RPC. Un programa no flexible o ya iniciado no se toca (matriz LIVE 6a/6b).
        if (!program || program.start_date_flexible !== true || program.start_date != null) return

        const { data: rpcData, error } = await supabase.rpc('client_start_workout_program' as never, {
            p_program_id: program.id,
        } as never)
        if (error) return

        // `RETURNS TABLE` ⇒ PostgREST devuelve un array de una fila (R23: start_date, end_date, started).
        const row = unwrapEmbedded<StartWorkoutProgramRow>(rpcData as unknown)
        if (row?.started !== true) return

        await capturePostHogServerEvent({
            event: 'program_started_by_client',
            distinctId: clientId,
            properties: {
                program_id: program.id,
                structure: program.program_structure_type ?? null,
                via: 'auto',
            },
        })
    } catch {
        // Nunca romper el guardado de la serie por el auto-start.
    }
}

/** Fila del `RETURNS TABLE` de `client_start_workout_program` (R23). */
type StartWorkoutProgramRow = { start_date: string | null; end_date: string | null; started: boolean }

/** Columnas del programa que deciden el auto-start. */
type FlexibleProgramRow = {
    id: string
    start_date: string | null
    start_date_flexible: boolean | null
    program_structure_type: string | null
}

/** PostgREST devuelve el embed to-one como objeto y el `RETURNS TABLE` como array: normaliza ambos. */
function unwrapEmbedded<T>(value: unknown): T | null {
    if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
    return (value as T | null | undefined) ?? null
}

/**
 * Invalidación explícita de la vista de ejecución + dashboard, invocada UNA vez al FINALIZAR el
 * entreno (informe forense 2026-07-04, Fix C). Complementa (no sustituye) la frescura al reentrar
 * que garantiza el `router.refresh()` de montaje del cliente: evita que una entrada stale del cache
 * de ruta se reutilice en una navegación posterior. No revalida por serie (eso causaba parpadeo).
 */
export async function revalidateWorkoutViewAction(coachSlug: string, planId: string): Promise<void> {
    revalidatePath(`/c/${coachSlug}/workout/${planId}`)
    revalidatePath(`/c/${coachSlug}/dashboard`)
}
