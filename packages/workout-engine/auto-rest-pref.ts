/**
 * Preferencia D5 «Pasar solo al descanso» — NÚCLEO PURO (specs/cuenta-atras-en-pantalla, W5 · R1 /
 * R25 / R32 / R36 / F5).
 *
 * Acá vive SOLO lo que no depende de plataforma: la estrategia del default, el resolver de cohorte y
 * el resolver del modal de una sola vez. Las claves, la caché y el storage viven en los dos archivos
 * de plataforma, que **re-exportan** `AUTOREST_DEFAULT_STRATEGY` desde este módulo para que la
 * decisión del owner (Q1) siga costando **una línea en un solo archivo** (R25):
 *   · RN  `apps/mobile/components/alumno/workout/v3/auto-rest-pref.ts`
 *   · Web `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/auto-rest-pref.ts`
 *
 * Reglas que este archivo congela y que ningún consumidor puede reimplementar:
 *  · **F5 — `hasHistory := !showModal`**: primero se resuelve el modal, y el booleano de cohorte es su
 *    negación. Con la definición ingenua (las 3 señales del bundle, acotadas a los ejercicios del plan
 *    abierto) un veterano con mesociclo nuevo, el alumno demo o `stepIndex > 0` quedarían **OFF sin
 *    haber decidido nada** — la regresión T9 de DATA-TESTING §9.
 *  · **R32 — `clientId` nulo ⇒ sin modal**: sin id con qué namespacear la clave, preguntar y no poder
 *    guardar la respuesta por alumno es peor que no preguntar; la plataforma cae al carril legacy por
 *    dispositivo (`omni_autotimer`), que se lee **y se escribe**.
 *  · **R32 — `rest_time` NO entra al resolver**: la preferencia es GLOBAL del alumno, no del bloque.
 *  · **T8 — storage inaccesible ⇒ sin modal** y valor de cohorte (un modal repetido es hostigamiento).
 */

/**
 * Estrategia del default, UNA sola constante para las dos plataformas (R25).
 *
 * D5 dice literalmente «Por defecto APAGADA»; R1 fija ON para quien ya tiene historial, porque es lo
 * que la base vive hoy (RN `timers/rest-timer-preferences.ts` arranca `autoTimer: true`; web
 * `WorkoutExecutionClient` arranca `useState(true)`). La divergencia está declarada en el SPEC con su
 * pregunta Q1 al owner y se aísla ACÁ: si el owner responde «OFF global», el cambio es **esta línea**
 * —no un refactor ni una wave nueva— y la variante ya está cubierta como FILA del test de cohortes
 * (W1.T4), nunca como rama muerta.
 */
export const AUTOREST_DEFAULT_STRATEGY: 'cohort' | 'off' = 'cohort'

/** De dónde salió el valor devuelto por `resolveAutoRestDefault` (telemetría/QA, nunca UI). */
export type AutoRestDefaultSource =
    /** La clave nueva por alumno ya existía: manda su valor. */
    | 'stored'
    /** Migración de lectura: no hay clave nueva pero sí `omni_autotimer` del dispositivo. */
    | 'legacy'
    /** Sin clave y con historial ⇒ ON (cero regresión para la base viva). */
    | 'cohort-history'
    /** Sin clave y sin historial ⇒ OFF (primer entreno: D5 literal, y sale el modal). */
    | 'cohort-first'
    /** `strategy: 'off'` colapsó las dos cohortes en OFF (Q1 = «OFF global»). */
    | 'strategy-off'

export interface AutoRestDefaultInput {
    /** Valor crudo de `eva:exec-autorest-v1:<clientId>` (`'1'`/`'0'`), o `null` si no existe. */
    storedNew: string | null
    /** Valor crudo de `omni_autotimer` (`String(boolean)` histórico), o `null` si no existe. */
    storedLegacy: string | null
    /** **F5**: SIEMPRE `!showModal`. Ninguna superficie lo calcula por su cuenta (§3.6.a). */
    hasHistory: boolean
    /** `false` = modo privado / AsyncStorage roto ⇒ fail-safe (nunca se escribe nada). */
    storageAvailable: boolean
    /** Llega desde `AUTOREST_DEFAULT_STRATEGY`; no se lee adentro (R25). */
    strategy: 'cohort' | 'off'
}

/**
 * PURA: valor inicial de la preferencia «Pasar solo al descanso» (D5 / R1 / R25).
 *
 * Prioridad:
 *  1. clave nueva presente      ⇒ su valor (`'1'` = ON, cualquier otra cosa = OFF)
 *  2. `omni_autotimer` presente ⇒ migración de LECTURA (`raw !== 'false'`, el default histórico es ON)
 *  3. sin clave y CON historial ⇒ `true`
 *  4. sin clave y SIN historial ⇒ `false` (primer entreno)
 *
 * Con `strategy === 'off'` los pasos 3 y 4 colapsan en `false`; **1 y 2 no cambian** — una preferencia
 * que el alumno ya eligió manda sobre cualquier default.
 *
 * `storageAvailable === false` no puede aportar valores guardados (los dos crudos llegan `null` por
 * construcción), así que cae en la cohorte y, junto con `showModal:false`, deja al alumno exactamente
 * como está hoy.
 */
export function resolveAutoRestDefault(input: AutoRestDefaultInput): {
    enabled: boolean
    source: AutoRestDefaultSource
} {
    // 1. La clave nueva por alumno manda siempre, incluso con `strategy: 'off'`.
    if (input.storedNew != null) return { enabled: input.storedNew === '1', source: 'stored' }
    // 2. Migración de lectura desde el carril device-scoped. `String(boolean)` ⇒ sólo 'false' apaga.
    if (input.storedLegacy != null) return { enabled: input.storedLegacy !== 'false', source: 'legacy' }
    // 3/4. Cohorte — o el colapso de R25.
    if (input.strategy === 'off') return { enabled: false, source: 'strategy-off' }
    return input.hasHistory
        ? { enabled: true, source: 'cohort-history' }
        : { enabled: false, source: 'cohort-first' }
}

/** Modo de apertura del ejecutor. Sólo `'normal'` puede mostrar el modal (W5.4). */
export type AutoRestModalMode = 'normal' | 'past-date' | 'repeat' | 'recover'

export interface ShowAutoRestModalInput {
    /** Marca `eva:exec-autorest-seen-v1:<clientId>`. Se escribe al RESPONDER, nunca al mostrarse. */
    seen: boolean
    /** `Object.keys(previousHistory).length` del bundle ya cargado (0 queries). */
    previousHistoryCount: number
    /** `Object.keys(exerciseMaxes).length` del bundle ya cargado. */
    exerciseMaxesCount: number
    /** Series de HOY ya registradas. */
    sessionLogsCount: number
    /** `clients.is_demo` — el coach entra como su alumno demo por «Vive tu app» y no debe verlo. */
    isDemo: boolean
    mode: AutoRestModalMode
    /** El modal sale en el PRIMER ejercicio de la sesión. */
    stepIndex: number
    /** `false` ⇒ nunca se muestra (T8: un modal que no puede guardar su respuesta es hostigamiento). */
    storageAvailable: boolean
    /**
     * Id del alumno dueño de la sesión. **R32**: si no es un uuid no vacío no hay con qué namespacear
     * la clave ⇒ no se muestra el modal y la preferencia cae al carril legacy por dispositivo. Es
     * `null` en web cuando `getClientRootUser()` devuelve `null` (`page.tsx` lo contempla).
     */
    clientId: string | null
}

/** uuid RFC-4122 en cualquiera de sus versiones, case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ¿`clientId` sirve para namespacear la preferencia? (R32/CA-93). Sin esto la clave sería
 * `eva:exec-autorest-v1:undefined`, es decir UNA preferencia compartida por todos los alumnos de ese
 * dispositivo — exactamente el bug de la marca cruzada tras el logout, con otro nombre.
 */
export function isUsableAutoRestClientId(clientId: string | null | undefined): clientId is string {
    return typeof clientId === 'string' && UUID_RE.test(clientId.trim())
}

/**
 * PURA (R14): señal de «primer entreno». Las 3 cuentas viajan en el bundle que el ejecutor ya cargó
 * (web `page.tsx` ← `_data/workout-execution.queries.ts`; RN `lib/workout-session.ts`) ⇒ 0 queries,
 * offline-safe. Falso positivo declarado: un veterano con un plan 100 % de ejercicios nuevos lo ve
 * una vez en su vida — cuesta **un modal**, no una regresión de comportamiento (F5).
 */
export function isFirstWorkout(input: {
    previousHistoryCount: number
    exerciseMaxesCount: number
    sessionLogsCount: number
}): boolean {
    return (
        input.previousHistoryCount === 0 &&
        input.exerciseMaxesCount === 0 &&
        input.sessionLogsCount === 0
    )
}

/**
 * PURA: ¿corresponde mostrar el modal de D5? (§3.7 + R32). El resolver **no** recibe ni mira
 * `rest_time`: la preferencia es global del alumno, así que el modal sale en el primer ejercicio
 * aunque ese bloque no tenga descanso configurado (DECISIONS-2 SPEC-3).
 *
 * Lo que este resolver NO decide: el momento exacto dentro del montaje. El overlay del Despegue/morph
 * y los sheets abiertos son condición de **cuándo**, y los agrega la UI (W5.6/W5.7).
 */
export function resolveShowAutoRestModal(input: ShowAutoRestModalInput): boolean {
    if (!isUsableAutoRestClientId(input.clientId)) return false
    if (!input.storageAvailable) return false
    if (input.seen) return false
    if (input.isDemo) return false
    if (input.mode !== 'normal') return false
    if (input.stepIndex !== 0) return false
    return isFirstWorkout(input)
}
