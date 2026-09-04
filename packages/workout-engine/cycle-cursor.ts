/**
 * Cursor del ciclo — "hoy toca" en un programa `cycle` se resuelve por COMPLETITUD, jamás por
 * calendario (decisión D1 del owner 2026-09-03, spec `docs/specs/ciclo-real-y-por-lado`).
 *
 * Qué resuelve: `workout_plans.day_of_week` guarda DOS cosas distintas según la estructura del
 * programa — en `weekly` es el ISODOW (1..7) y en `cycle` es el ÍNDICE del ciclo (1..`cycle_length`).
 * Todas las superficies leían ese número como día de la semana, así que un alumno con un ciclo de 3
 * días sólo "tenía entreno" lunes/martes/miércoles y el jueves veía el hero vacío (feedback Movens,
 * 2026-09-03). La regla vive acá — y sólo acá — porque el concepto ya tenía implementaciones
 * paralelas por superficie (hero web, hero RN, ficha del coach); una cuarta sería drift garantizado.
 *
 * REGLA (SPEC "Modelo de dominio y reglas del motor"):
 *   · `N` = `cycle_length`. `L` = índice del último día COMPLETADO — la completitud más reciente por
 *     FECHA, no por orden de inserción (R11); empate de fecha ⇒ gana el mayor índice.
 *   · `hoy = (L mod N) + 1`. Sin ninguna completitud en la ventana de 30 días ⇒ **Día 1** (R10:
 *     reinicio explícito, sin persistencia — comportamiento declarado del contrato, no una regresión).
 *   · Si el índice calculado NO tiene plan, el cursor SALTA al siguiente índice que sí lo tenga
 *     (los planes sin bloques no participan del ciclo, R9 — el productor `buildCycleCompletions` ya
 *     no los emite y el caller no los pasa).
 *   · Completado HOY ⇒ `todayState: 'done'` con `todayPlanId` = el plan del día hecho (para que el
 *     hero pueda reabrirlo) y `next*` = el siguiente. Logs de hoy sin cerrar el día ⇒
 *     `todayState: 'in_progress'` en ese plan; el cursor NO adelanta.
 *   · El día calendario no participa: un alumno que vuelve el domingo tras dos semanas ve el día
 *     siguiente al último que cerró.
 *
 * WEEKLY = IDENTIDAD. En `weekly` la salida es exactamente la resolución de hoy
 * (`day_of_week === ISODOW`, `heroComplianceBundle.ts:95-105,150-162` en web y `home.tsx:350` en RN):
 * `completions` e `inProgress` NO alteran nada (los estados de la semana los siguen derivando las
 * grillas con su atribución greedy), `nextPlanId` es el siguiente ISODOW con plan SIN wrap —igual que
 * el `candidates` de `heroComplianceBundle.ts:151-158`— y `todayState` es siempre `'todo'`.
 *
 * `programState` (R30): el motor es el ÚNICO dueño de la semántica de "no empezó".
 * `'not_started'` ⟺ `start_date_flexible === true` **y** `start_date === null`; en cualquier otro
 * caso `'active'` (incluye el weekly sin fecha no flexible, que se comporta como hoy). Ninguna
 * superficie vuelve a derivarlo de `start_date`. Con `'not_started'` el cursor IGUAL devuelve el Día 1
 * disponible: el estado no depende de `todayIso` y la función sigue siendo pura.
 *
 * PURA, SIN RELOJ: `todayIso` (yyyy-mm-dd ya resuelto en America/Santiago) entra por parámetro; acá
 * no hay `Date.now()` ni acceso a red. Mismas entradas ⇒ misma salida en web y en RN.
 */

/** Estructura efectiva bajo la que se resolvió el cursor. */
export type CycleCursorMode = 'weekly' | 'cycle'

/** "No empezó" (inicio flexible sin fecha fijada) vs. programa corriendo. Ver R30. */
export type CycleProgramState = 'not_started' | 'active'

/** Estado de un día del ciclo dentro de la tira: hecho, el de hoy, o por venir. */
export type CycleSlotState = 'done' | 'today' | 'upcoming'

/** Estado del día de HOY: sin registrar, empezado a medias, o cerrado. */
export type CycleTodayState = 'todo' | 'in_progress' | 'done'

/** Fila del programa reducida a lo único que define el cursor. Sin columnas nuevas. */
export interface CycleCursorProgram {
    program_structure_type: 'weekly' | 'cycle' | null
    /** Largo del ciclo 1..14 (R8). `null` en weekly y en ciclos legacy sin el campo. */
    cycle_length: number | null
    /** ISO yyyy-mm-dd. `null` = no empezó (sólo posible con `start_date_flexible`, R2). */
    start_date: string | null
    /** Inicio flexible OPT-IN (R2). `null`/`false` = el coach fijó la fecha. */
    start_date_flexible: boolean | null
}

/**
 * Plan del programa. `day_of_week` es ISODOW en `weekly` e ÍNDICE del ciclo en `cycle` (misma
 * columna, dos semánticas). El caller ya filtró por variante A/B: el cursor no vuelve a filtrar.
 */
export interface CycleCursorPlan {
    id: string
    day_of_week: number | null
    title: string | null
}

/** Día COMPLETADO (100% de las series esperadas, `deriveDayCompletion`) fechado en Santiago. */
export interface CycleCompletion {
    planId: string
    /** yyyy-mm-dd Santiago del día completado (R11: día del `logged_at`, no del insert). */
    dateIso: string
}

/** Un día del ciclo con su estado, para la tira "Día 1 · Día 2 · Día 3" de las superficies. */
export interface CycleSlot {
    planId: string
    cycleIndex: number
    state: CycleSlotState
    /** Sólo en `done`: la fecha en que se cerró (yyyy-mm-dd Santiago). */
    doneDateIso?: string
}

export interface CycleCursorInput {
    program: CycleCursorProgram
    /** Planes YA filtrados por variante A/B; los que no participan (sin bloques) no vienen (R9). */
    plans: readonly CycleCursorPlan[]
    /** Días completados de los últimos 30 días — los produce `buildCycleCompletions` (R9). */
    completions: readonly CycleCompletion[]
    /** Día empezado y no cerrado (mismo productor). Sólo pesa si es de HOY. */
    inProgress?: { planId: string; dateIso: string } | null
    /** yyyy-mm-dd en America/Santiago. Inyectado: la función es pura. */
    todayIso: string
}

export interface CycleCursorResult {
    mode: CycleCursorMode
    programState: CycleProgramState
    todayPlanId: string | null
    todayCycleIndex: number | null
    todayState: CycleTodayState
    nextPlanId: string | null
    nextCycleIndex: number | null
    lastCompleted?: { planId: string; cycleIndex: number; dateIso: string }
    slots: CycleSlot[]
}

/**
 * Ventana única de la lectura de logs que alimenta el cursor (R10): web y RN piden los MISMOS 30
 * días. El cursor la vuelve a aplicar por defensa —una completitud más vieja no puede "revivir" el
 * ciclo si el caller amplía la query— y sin nada dentro de la ventana el cursor reinicia en Día 1.
 */
export const CYCLE_CURSOR_WINDOW_DAYS = 30

/** Tope duro de días de un ciclo (R8): 1..14. Más allá no existe en el builder ni en el schema. */
export const MAX_CYCLE_LENGTH = 14

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/** Milisegundos UTC de un `yyyy-mm-dd` de calendario REAL; `null` si el patrón o la fecha no existen. */
function isoToUtcMillis(iso: string): number | null {
    if (typeof iso !== 'string' || !ISO_YMD.test(iso)) return null
    const [y, m, d] = iso.split('-').map(Number)
    const ms = Date.UTC(y, m - 1, d)
    const dt = new Date(ms)
    // `Date.UTC` normaliza desbordes (mes 13 → año+1): re-verificamos los componentes.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
    return ms
}

/**
 * ISODOW (1 = lunes … 7 = domingo) de un día `yyyy-mm-dd` YA resuelto en Santiago. Se ancla en UTC a
 * propósito: la fecha entra como día calendario, así que la TZ del runtime no puede correrla.
 * Devuelve `0` si la cadena no es una fecha real (el caller nunca hace match con `0`).
 */
export function isoDayOfWeek(iso: string): number {
    const ms = isoToUtcMillis(iso)
    if (ms == null) return 0
    const dow = new Date(ms).getUTCDay()
    return dow === 0 ? 7 : dow
}

/**
 * ¿La fecha cae dentro de la ventana de 30 días que termina HOY? Fechas futuras quedan fuera (un log
 * no puede registrarse mañana) y las anteriores a la ventana también (R10 ⇒ el cursor vuelve al Día 1).
 */
export function isWithinCycleWindow(dateIso: string, todayIso: string): boolean {
    const from = isoToUtcMillis(dateIso)
    const to = isoToUtcMillis(todayIso)
    if (from == null || to == null) return false
    const days = Math.round((to - from) / 86_400_000)
    return days >= 0 && days <= CYCLE_CURSOR_WINDOW_DAYS
}

/** Índice entero válido 1..max, o `0` si el plan no tiene día utilizable. */
function normalizeIndex(dayOfWeek: number | null, max: number): number {
    if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek)) return 0
    if (dayOfWeek < 1 || dayOfWeek > max) return 0
    return dayOfWeek
}

/**
 * Largo efectivo del ciclo. `cycle_length` manda (clampeado a 1..14, R8). Sin él —ciclo legacy sin el
 * campo— se usa el mayor índice con plan: el wrap tiene que alcanzar a TODOS los días cargados (el
 * fallback legacy de 7 de `programDayLabel` es de PRESENTACIÓN; acá dejaría inalcanzables los días
 * 8..14 de un ciclo largo sin `cycle_length`).
 */
function resolveCycleLength(program: CycleCursorProgram, plans: readonly CycleCursorPlan[]): number {
    const raw = program.cycle_length
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
        return Math.min(Math.floor(raw), MAX_CYCLE_LENGTH)
    }
    let maxPlanIndex = 0
    for (const plan of plans) {
        const idx = normalizeIndex(plan.day_of_week, MAX_CYCLE_LENGTH)
        if (idx > maxPlanIndex) maxPlanIndex = idx
    }
    return maxPlanIndex > 0 ? maxPlanIndex : 1
}

interface IndexedPlan {
    plan: CycleCursorPlan
    index: number
}

/**
 * Planes con índice utilizable, EN EL ORDEN RECIBIDO (el caller ya ordenó y filtró por variante A/B;
 * el cursor no reordena ni re-filtra, C18). Índices repetidos: gana la primera aparición, igual que
 * `deriveDayCompletion` con los bloques repetidos.
 */
function indexPlans(plans: readonly CycleCursorPlan[], max: number): { entries: IndexedPlan[]; byIndex: Map<number, IndexedPlan> } {
    const entries: IndexedPlan[] = []
    const byIndex = new Map<number, IndexedPlan>()
    for (const plan of plans) {
        const index = normalizeIndex(plan.day_of_week, max)
        if (index === 0) continue
        const entry = { plan, index }
        entries.push(entry)
        if (!byIndex.has(index)) byIndex.set(index, entry)
    }
    return { entries, byIndex }
}

/** Primer índice CON plan a partir de `start` (barrido cíclico de `n` pasos). `null` si no hay ninguno. */
function findFromIndex(start: number, n: number, byIndex: Map<number, IndexedPlan>): IndexedPlan | null {
    if (byIndex.size === 0) return null
    for (let step = 0; step < n; step++) {
        const idx = ((start - 1 + step) % n) + 1
        const entry = byIndex.get(idx)
        if (entry) return entry
    }
    return null
}

/** Índice siguiente al `from` dentro del ciclo, saltando los índices sin plan. */
function nextEntryAfter(from: number, n: number, byIndex: Map<number, IndexedPlan>): IndexedPlan | null {
    return findFromIndex((from % n) + 1, n, byIndex)
}

/**
 * Resolución `weekly` — IDENTIDAD con lo de hoy. No mira `completions` ni `inProgress`: en weekly el
 * estado de cada día lo siguen derivando las grillas (atribución greedy de `weekPendingWorkouts.ts` /
 * `v3/weekly-streak.ts`), que este tren no toca. Los slots pasados quedan `'upcoming'` porque en un
 * programa semanal ese día VUELVE la semana que viene; nunca se declara `done` sin evidencia.
 */
function resolveWeeklyCursor(
    plans: readonly CycleCursorPlan[],
    todayIso: string,
    programState: CycleProgramState
): CycleCursorResult {
    const todayDow = isoDayOfWeek(todayIso)
    const { entries } = indexPlans(plans, 7)
    let todayEntry: IndexedPlan | null = null
    let nextEntry: IndexedPlan | null = null
    for (const entry of entries) {
        if (entry.index === todayDow) {
            if (!todayEntry) todayEntry = entry
            continue
        }
        // Siguiente ISODOW con plan, SIN wrap a la semana próxima: espejo de `candidates`
        // (`heroComplianceBundle.ts:151-158`), que filtra `day_of_week > todayDow` y ordena asc.
        if (entry.index > todayDow && (!nextEntry || entry.index < nextEntry.index)) nextEntry = entry
    }

    return {
        mode: 'weekly',
        programState,
        todayPlanId: todayEntry?.plan.id ?? null,
        todayCycleIndex: todayDow > 0 ? todayDow : null,
        todayState: 'todo',
        nextPlanId: nextEntry?.plan.id ?? null,
        nextCycleIndex: nextEntry?.index ?? null,
        slots: entries.map((entry) => ({
            planId: entry.plan.id,
            cycleIndex: entry.index,
            state: entry.index === todayDow ? ('today' as const) : ('upcoming' as const),
        })),
    }
}

/** Resolución `cycle` — el cursor por completitud (D1). */
function resolveCycleModeCursor(input: CycleCursorInput, programState: CycleProgramState): CycleCursorResult {
    const { program, plans, completions, todayIso } = input
    const n = resolveCycleLength(program, plans)
    const { entries, byIndex } = indexPlans(plans, n)
    const entryByPlanId = new Map<string, IndexedPlan>()
    for (const entry of entries) if (!entryByPlanId.has(entry.plan.id)) entryByPlanId.set(entry.plan.id, entry)

    // Completitudes utilizables: dentro de la ventana de 30 días y de un plan que participa del ciclo.
    let last: { entry: IndexedPlan; dateIso: string } | null = null
    const doneDateByPlan = new Map<string, string>()
    for (const completion of completions) {
        const entry = entryByPlanId.get(completion.planId)
        if (!entry) continue
        if (!isWithinCycleWindow(completion.dateIso, todayIso)) continue
        const previous = doneDateByPlan.get(entry.plan.id)
        if (!previous || completion.dateIso > previous) doneDateByPlan.set(entry.plan.id, completion.dateIso)
        // Más reciente por FECHA (R11), no por orden de inserción; empate ⇒ mayor índice.
        if (!last || completion.dateIso > last.dateIso || (completion.dateIso === last.dateIso && entry.index > last.entry.index)) {
            last = { entry, dateIso: completion.dateIso }
        }
    }

    let todayState: CycleTodayState = 'todo'
    let todayIndexRaw: number
    if (last && last.dateIso === todayIso) {
        // Ya cerró un día HOY: el cursor se queda en él (el hero lo reabre) y el próximo es el siguiente.
        todayIndexRaw = last.entry.index
        todayState = 'done'
    } else {
        todayIndexRaw = last ? (last.entry.index % n) + 1 : 1
    }

    let todayEntry = findFromIndex(todayIndexRaw, n, byIndex)

    // Día empezado y NO cerrado hoy: manda sobre el índice calculado (el cursor no adelanta). Nunca
    // pisa un día ya completado hoy — ése es un estado más avanzado.
    const inProgress = input.inProgress
    if (todayState !== 'done' && inProgress && inProgress.dateIso === todayIso) {
        const entry = entryByPlanId.get(inProgress.planId)
        if (entry) {
            todayEntry = entry
            todayState = 'in_progress'
        }
    }

    const todayCycleIndex = todayEntry ? todayEntry.index : todayIndexRaw
    const nextEntry = todayEntry ? nextEntryAfter(todayEntry.index, n, byIndex) : null

    return {
        mode: 'cycle',
        programState,
        todayPlanId: todayEntry?.plan.id ?? null,
        todayCycleIndex,
        todayState,
        nextPlanId: nextEntry?.plan.id ?? null,
        nextCycleIndex: nextEntry?.index ?? null,
        ...(last ? { lastCompleted: { planId: last.entry.plan.id, cycleIndex: last.entry.index, dateIso: last.dateIso } } : {}),
        slots: entries.map((entry) => {
            const doneDateIso = doneDateByPlan.get(entry.plan.id)
            // `done` gana a `today`: un día cerrado HOY se pinta hecho, con su fecha.
            if (doneDateIso) {
                return { planId: entry.plan.id, cycleIndex: entry.index, state: 'done' as const, doneDateIso }
            }
            const state: CycleSlotState = todayEntry && entry.plan.id === todayEntry.plan.id ? 'today' : 'upcoming'
            return { planId: entry.plan.id, cycleIndex: entry.index, state }
        }),
    }
}

/**
 * "Hoy toca" de un programa. En `weekly` es la identidad de la resolución por ISODOW; en `cycle` es
 * el cursor por completitud (D1). Función PURA: `todayIso` entra por parámetro y las `completions`
 * llegan del productor único `buildCycleCompletions` — ninguna superficie deriva completitud a mano.
 */
export function resolveCycleCursor(input: CycleCursorInput): CycleCursorResult {
    const { program } = input
    const programState: CycleProgramState =
        program.start_date_flexible === true && program.start_date == null ? 'not_started' : 'active'

    if (program.program_structure_type !== 'cycle') {
        return resolveWeeklyCursor(input.plans, input.todayIso, programState)
    }
    return resolveCycleModeCursor(input, programState)
}
