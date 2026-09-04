/**
 * «Empezar hoy» del alumno RN (tren «Ciclo real y por lado», tarea W3.1).
 *
 * Un programa flexible (`start_date_flexible = true`) nace SIN fecha (R13/R21): el alumno decide
 * cuándo empieza. La escritura la hace la RPC `client_start_workout_program` (SECURITY DEFINER,
 * migración `20260903212038_…`) porque el alumno solo tiene SELECT sobre `workout_programs`; acá
 * vive el ÚNICO cliente RN de esa RPC, con su traducción de errores y su evento.
 *
 * Contrato (R23/R24, DATA-SECURITY §2.3):
 *   - Firma SIN fecha: la RPC solo acepta HOY (R14) y «Elegir otra fecha» quedó fuera del tren, así
 *     que no hay dónde pasar una fecha desde la app. `p_start_date` viaja explícitamente en `null`
 *     ⇒ la RPC usa `eva_santiago_day(now())`.
 *   - `RETURNS TABLE (start_date, end_date, started)` ⇒ PostgREST devuelve un ARREGLO de filas; se
 *     lee la fila entera y `end_date` se usa TAL CUAL (nunca se recalcula en cliente, R21).
 *   - `started = true` es la ÚNICA condición para emitir `program_started_by_client`: la RPC es
 *     idempotente (si ya tenía fecha devuelve `started = false` sin escribir), así que el auto-start
 *     de cada serie puede llamarla sin contar el evento dos veces.
 *   - Los errores llegan como MENSAJE PELADO (`coach_account_paused`, `program_not_startable`,
 *     `start_date_out_of_range`, `unauthenticated`) y se traducen a un resultado DISCRIMINADO: esta
 *     función NUNCA lanza hacia la UI — el hero pinta un estado, no un crash, y el ejecutor no puede
 *     perder una serie ya guardada por culpa de un fallo de esta llamada.
 */
import { supabase } from './supabase'
import { captureAppEvent } from './analytics'
import { STUDENT_ACCESS_COPY } from './student-access-copy'

/** Desde dónde se disparó el inicio: el botón del hero o la primera serie del ejecutor (R23). */
export type ProgramStartVia = 'button' | 'auto'

/** Códigos que devuelve la RPC (mensaje pelado) + `unknown` para red / respuesta inesperada. */
export type StartProgramErrorCode =
  | 'coach_account_paused'
  | 'program_not_startable'
  | 'start_date_out_of_range'
  | 'unauthenticated'
  | 'unknown'

/**
 * Resultado discriminado: la UI ramifica por `ok` y nunca ve el código crudo de Postgres.
 * `startDate`/`endDate` son SIEMPRE los persistidos por el server (la RPC los devuelve tras el
 * `RETURNING`), y `started` distingue «esta llamada la escribió» de «ya estaba».
 */
export type StartProgramResult =
  | { ok: true; startDate: string; endDate: string | null; started: boolean }
  | { ok: false; code: StartProgramErrorCode; message: string }

/** Copy humano por código. `coach_account_paused` reusa el mismo texto que el guardado de series. */
const ERROR_COPY: Record<StartProgramErrorCode, string> = {
  coach_account_paused: STUDENT_ACCESS_COPY.pausedWriteError,
  // No es un crash sino un ESTADO (DATA-SECURITY §2.3): el programa ya empezó, dejó de estar
  // activo o el coach lo cambió ⇒ la pantalla vuelve a leer el programa.
  program_not_startable: 'No se pudo empezar el programa. Actualiza la pantalla para ver cómo quedó.',
  start_date_out_of_range: 'El programa solo se puede empezar hoy.',
  unauthenticated: 'Tu sesión expiró. Vuelve a entrar para empezar el programa.',
  unknown: 'No se pudo empezar el programa. Intenta nuevamente.',
}

/** Códigos tipados en el orden en que se buscan dentro del error de PostgREST. */
const RPC_ERROR_CODES: readonly Exclude<StartProgramErrorCode, 'unknown'>[] = [
  'coach_account_paused',
  'program_not_startable',
  'start_date_out_of_range',
  'unauthenticated',
]

/**
 * Clasifica el error de la RPC por su MENSAJE PELADO (decisión del tren: mismos códigos crudos que
 * el resto de la casa, match con `includes`). Se mira `message` + `details` + `hint` porque
 * PostgREST reparte el texto del `RAISE EXCEPTION` entre esos campos según la versión.
 */
function classifyRpcError(error: unknown): StartProgramErrorCode {
  if (error == null) return 'unknown'
  const e = error as { message?: unknown; details?: unknown; hint?: unknown }
  const haystack = [e.message, e.details, e.hint]
    .filter((x): x is string => typeof x === 'string')
    .join(' | ')
  for (const code of RPC_ERROR_CODES) {
    if (haystack.includes(code)) return code
  }
  return 'unknown'
}

/** Fila que devuelve la RPC (`RETURNS TABLE`): PostgREST la entrega dentro de un arreglo. */
type StartProgramRow = { start_date?: unknown; end_date?: unknown; started?: unknown }

function pickRow(data: unknown): StartProgramRow | null {
  if (Array.isArray(data)) return (data[0] as StartProgramRow | undefined) ?? null
  if (data && typeof data === 'object') return data as StartProgramRow
  return null
}

/**
 * Fija el `start_date` (y el `end_date` derivado) del programa flexible del alumno. Sin fecha por
 * contrato (R24): la RPC solo acepta hoy.
 *
 * @param programId `workout_programs.id` del programa del alumno.
 * @param opts `via` distingue el botón del hero del auto-start del ejecutor (default `'button'`);
 *   `structure` es el `program_structure_type` que ya tiene la pantalla — viaja SOLO como prop del
 *   evento, no cambia nada del lado del server.
 */
export async function startWorkoutProgram(
  programId: string,
  opts?: { via?: ProgramStartVia; structure?: 'weekly' | 'cycle' | null },
): Promise<StartProgramResult> {
  const via: ProgramStartVia = opts?.via ?? 'button'
  try {
    const { data, error } = await supabase.rpc('client_start_workout_program', {
      p_program_id: programId,
      // Explícito: la RPC lo resuelve a hoy (Santiago). No hay date-picker en este tren (R14).
      p_start_date: null,
    })
    if (error) {
      const code = classifyRpcError(error)
      return { ok: false, code, message: ERROR_COPY[code] }
    }

    const row = pickRow(data)
    // Sin fila legible no se inventa una fecha en cliente (R28): eso pintaría un hero «empezado»
    // que la DB no respalda.
    if (!row || typeof row.start_date !== 'string') {
      return { ok: false, code: 'unknown', message: ERROR_COPY.unknown }
    }

    const started = row.started === true
    // R23: el evento se emite SOLO cuando ESTA llamada escribió la fecha. Un segundo tap, el
    // auto-start de la segunda serie o una carrera devuelven `started = false` y no cuentan.
    if (started) {
      captureAppEvent('program_started_by_client', {
        program_id: programId,
        structure: opts?.structure ?? null,
        via,
      })
    }

    return {
      ok: true,
      startDate: row.start_date,
      endDate: typeof row.end_date === 'string' ? row.end_date : null,
      started,
    }
  } catch (e) {
    // Red caída / cliente que lanza: NUNCA propaga. El llamador (hero o `logSet`) sigue su curso
    // — en el ejecutor la serie ya quedó guardada o encolada antes de llegar acá.
    const code = classifyRpcError(e)
    return { ok: false, code, message: ERROR_COPY[code] }
  }
}

/** Lo que el ejecutor sabe del programa del plan en curso, para decidir el auto-start. */
export interface AutoStartProgramInput {
  /** `workout_plans.program_id` — sin programa no hay nada que empezar. */
  programId: string | null | undefined
  /** `workout_programs.start_date_flexible` (default `false`, R13). */
  flexible: boolean | null | undefined
  /** `workout_programs.start_date`: sólo un programa SIN fecha se auto-inicia. */
  startDate: string | null | undefined
  /** Día pasado que se está editando (`?fecha`): ahí no se empieza nada hoy. */
  editDate?: string | null
  /** Ya se llamó a la RPC en esta sesión (o hay una llamada en vuelo). */
  alreadyAttempted?: boolean
}

/**
 * ¿La serie que se acaba de guardar debe empezar el programa? (W3.2, espejo del auto-start web
 * W2.4). Puro para poder testearlo sin bootear el hook: el ejecutor sólo lo consulta.
 */
export function shouldAutoStartProgram(input: AutoStartProgramInput): boolean {
  if (input.alreadyAttempted) return false
  if (input.editDate) return false
  if (!input.programId) return false
  if (input.flexible !== true) return false
  return input.startDate == null
}
