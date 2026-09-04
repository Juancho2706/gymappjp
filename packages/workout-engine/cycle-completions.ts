/**
 * Productor ÚNICO de la completitud que consume el cursor del ciclo (R9, spec
 * `docs/specs/ciclo-real-y-por-lado`). Convierte la lectura de logs de los últimos 30 días en los
 * días COMPLETADOS (`completions`) y el día empezado y no cerrado de hoy (`inProgress`) que
 * `resolveCycleCursor` necesita.
 *
 * Por qué existe: la lógica "qué día está hecho" (denominador por plan, dedup por (plan, día),
 * omisiones) vivía SÓLO a 7 días y duplicada — web `weekPendingWorkouts.ts:255-282` y RN
 * `v3/weekly-streak.ts:171-189`. Sin este productor cada superficie la reimplementaría distinto para
 * el ciclo y el mismo alumno vería un día distinto en la PWA y en la app. Ninguna superficie deriva
 * completitud a mano: todas llaman acá.
 *
 * REGLA — no se reimplementa nada: el veredicto de "día hecho" sale tal cual de `deriveDayCompletion`
 * (`day-completion.ts:136`) alimentado por `countLoggedSetsByBlock` (`:193`) y
 * `skippedBlockIdsFromLogs` (`:215`), que este archivo NO toca.
 *   · Un plan SIN bloques no participa del ciclo: se salta, nunca es "hoy" y nunca aparece como
 *     completado (R9). No aplica acá la regla legacy de la grilla weekly ("sin denominador, ≥ 1 serie
 *     = hecho").
 *   · Un día suma con ≥ 1 log DEL PROGRAMA — el enlace bloque→plan es el que decide. Los logs con
 *     `block_id` nulo son NEUTROS: no suman ni restan (R29). Los de un bloque de otro programa
 *     tampoco cuentan para este ciclo.
 *   · Cada completitud se fecha por el DÍA SANTIAGO del `logged_at` (R11) — `workout_logs` no tiene
 *     columna `target_date` (es metadato de la cola offline de RN, y en ESCRITURA su modo solo-UPDATE
 *     pisa la fila ya existente de ese día sin mover su `logged_at`). Por eso editar un día viejo no
 *     lo mueve de fecha, y el cursor puede seguir la completitud más reciente por FECHA en vez de por
 *     orden de inserción.
 *
 * LECTURA ÚNICA (R10): web y RN alimentan esto con la MISMA query — logs de los últimos 30 días,
 * `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `order by logged_at
 * desc`, `limit 200`. `plan_id` no es columna de `workout_logs`: viaja por el join
 * `workout_blocks(plan_id)`, que PostgREST devuelve como objeto (o arreglo, según el cliente) — acá se
 * aceptan las dos formas. Sin ninguna completitud en la ventana el resultado es `[]` y el cursor
 * reinicia en Día 1: comportamiento declarado del contrato.
 *
 * PURA, SIN RELOJ: `todayIso` entra por parámetro (igual que en `cycle-cursor.ts`).
 */
import { isWithinCycleWindow, type CycleCompletion, type CycleCursorPlan } from './cycle-cursor'
import {
    countLoggedSetsByBlock,
    deriveDayCompletion,
    skippedBlockIdsFromLogs,
    type DayCompletionBlock,
    type LoggedSetRow,
} from './day-completion'

/**
 * Fila de la lectura única (R10). Extiende la `LoggedSetRow` del motor con la fecha del registro y el
 * plan que viaja por el join. `logged_at` es un timestamptz; el día calendario se resuelve en
 * Santiago, nunca por el prefijo UTC de la cadena.
 */
export interface CycleCompletionLogRow extends LoggedSetRow {
    logged_at?: string | null
    /** Join `workout_blocks(plan_id)`: objeto en PostgREST, arreglo en algunos clientes. */
    workout_blocks?: { plan_id?: string | null } | { plan_id?: string | null }[] | null
}

export interface CycleCompletionsInput {
    /** Planes del programa ya filtrados por variante A/B (los mismos que recibe el cursor). */
    plans: readonly CycleCursorPlan[]
    /**
     * Bloques VIGENTES por plan — el denominador de cada día. `sets` viaja acá: sin él todo bloque
     * valdría 1 unidad y un día cerraría con una sola serie (el P0 de `workout-day-in-progress`).
     */
    blocksByPlan: Readonly<Record<string, readonly DayCompletionBlock[]>>
    /** Logs de los últimos 30 días (R10). */
    logs: readonly CycleCompletionLogRow[]
    /** yyyy-mm-dd en America/Santiago. */
    todayIso: string
}

export interface CycleCompletionsResult {
    /** Días completados, ordenados por fecha ascendente (empate: por `planId`). */
    completions: CycleCompletion[]
    /** Día de HOY empezado y no cerrado, si lo hay. */
    inProgress?: { planId: string; dateIso: string }
}

const SANTIAGO_TZ = 'America/Santiago'
const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formateador reutilizado (construir un `Intl.DateTimeFormat` por fila cuesta caro con 200 logs).
 * `formatToParts` + armado manual, NUNCA `toLocaleString` + `new Date(string)`: el string localizado
 * no es ISO y Hermes/iOS lo rechaza ("Invalid Date", bug de clase ya documentado en RN).
 */
const SANTIAGO_DAY_PARTS = new Intl.DateTimeFormat('en-US', {
    timeZone: SANTIAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

/**
 * Día calendario `yyyy-mm-dd` de America/Santiago para un instante (`workout_logs.logged_at`).
 * `null` si el valor falta o no parsea.
 *
 * Helper PROPIO del paquete a propósito: la única implementación existente vive en las apps
 * (`apps/web/src/lib/date-utils.ts:340` y `apps/mobile/lib/date-utils.ts:75`) y un paquete jamás
 * importa de `apps/*`. Mismo criterio que ellas: TZ fija por `Intl`, sin depender del huso del runtime.
 *
 * Una cadena que YA es un día calendario (`yyyy-mm-dd`, columnas `date`) se devuelve tal cual: pasarla
 * por `new Date()` la anclaría a medianoche UTC y en Santiago caería el día anterior.
 */
export function santiagoDayFromInstant(instant: string | null | undefined): string | null {
    if (typeof instant !== 'string') return null
    const raw = instant.trim()
    if (raw.length === 0) return null
    if (ISO_YMD.test(raw)) return raw
    // Postgres puede entregar `yyyy-mm-dd hh:mm:ss+00`: Hermes no parsea ese espacio y ningún motor
    // acepta el offset de 2 dígitos, así que se normalizan los dos antes de construir la fecha.
    let normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
    if (/[+-]\d{2}$/.test(normalized)) normalized = `${normalized}:00`
    const dt = new Date(normalized)
    if (Number.isNaN(dt.getTime())) return null
    const parts = SANTIAGO_DAY_PARTS.formatToParts(dt)
    let year = ''
    let month = ''
    let day = ''
    for (const part of parts) {
        if (part.type === 'year') year = part.value
        else if (part.type === 'month') month = part.value
        else if (part.type === 'day') day = part.value
    }
    if (!year || !month || !day) return null
    return `${year}-${month}-${day}`
}

/** `plan_id` del join, aceptando la forma objeto y la forma arreglo. */
function joinedPlanId(row: CycleCompletionLogRow): string | null {
    const joined = row.workout_blocks
    if (!joined) return null
    const first = Array.isArray(joined) ? joined[0] : joined
    const planId = first?.plan_id
    return typeof planId === 'string' && planId.length > 0 ? planId : null
}

interface DayGroup {
    planId: string
    dateIso: string
    rows: LoggedSetRow[]
}

/**
 * Días completados y día en curso a partir de la lectura de logs. Único productor de `completions`
 * para `resolveCycleCursor`: web y RN lo consumen, nadie deriva la completitud por su cuenta (R9).
 */
export function buildCycleCompletions(input: CycleCompletionsInput): CycleCompletionsResult {
    const { plans, blocksByPlan, logs, todayIso } = input

    // Sólo participan los planes CON bloques (R9): sin denominador no existe el "100% de nada".
    const blocksForPlan = new Map<string, readonly DayCompletionBlock[]>()
    const blockToPlan = new Map<string, string>()
    for (const plan of plans) {
        const blocks = blocksByPlan[plan.id]
        if (!Array.isArray(blocks) || blocks.length === 0) continue
        if (blocksForPlan.has(plan.id)) continue
        blocksForPlan.set(plan.id, blocks)
        for (const block of blocks) {
            if (typeof block?.id !== 'string' || block.id.length === 0) continue
            if (!blockToPlan.has(block.id)) blockToPlan.set(block.id, plan.id)
        }
    }

    const groups = new Map<string, DayGroup>()
    for (const log of logs) {
        const blockId = log.block_id
        // Log huérfano (`block_id` nulo): NEUTRO — no suma ni resta (R29).
        if (typeof blockId !== 'string' || blockId.length === 0) continue
        // El enlace bloque→plan manda. El `plan_id` del join sólo cubre el bloque borrado del plan.
        let planId = blockToPlan.get(blockId) ?? null
        if (planId == null) {
            const joined = joinedPlanId(log)
            planId = joined && blocksForPlan.has(joined) ? joined : null
        }
        // Bloque de otro programa o de un plan sin bloques: fuera del ciclo.
        if (planId == null) continue

        const dateIso = santiagoDayFromInstant(log.logged_at)
        if (dateIso == null || !isWithinCycleWindow(dateIso, todayIso)) continue

        const key = `${planId}#${dateIso}`
        const group = groups.get(key)
        if (group) group.rows.push(log)
        else groups.set(key, { planId, dateIso, rows: [log] })
    }

    const completions: CycleCompletion[] = []
    const inProgressPlanIds = new Set<string>()
    for (const group of groups.values()) {
        const blocks = blocksForPlan.get(group.planId)
        if (!blocks) continue
        const completion = deriveDayCompletion({
            blocks,
            loggedSetsByBlock: countLoggedSetsByBlock(group.rows),
            skippedBlockIds: skippedBlockIdsFromLogs(group.rows),
        })
        // Dedup por (plan, día): el agrupamiento ya garantiza una sola completitud por par.
        if (completion.state === 'done') completions.push({ planId: group.planId, dateIso: group.dateIso })
        else if (completion.state === 'in_progress' && group.dateIso === todayIso) inProgressPlanIds.add(group.planId)
    }

    completions.sort((a, b) => (a.dateIso === b.dateIso ? a.planId.localeCompare(b.planId) : a.dateIso < b.dateIso ? -1 : 1))

    // Un solo día en curso: si el alumno picoteó dos planes hoy gana el primero del arreglo `plans`
    // (orden del caller), para que la salida sea determinista.
    let inProgress: { planId: string; dateIso: string } | undefined
    if (inProgressPlanIds.size > 0) {
        for (const plan of plans) {
            if (inProgressPlanIds.has(plan.id)) {
                inProgress = { planId: plan.id, dateIso: todayIso }
                break
            }
        }
    }

    return inProgress ? { completions, inProgress } : { completions }
}
