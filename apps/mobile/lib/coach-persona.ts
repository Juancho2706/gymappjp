import type { Persona } from '@eva/schemas'
import { apiFetch } from './api'
import { supabase } from './supabase'

/**
 * Persona del coach en la app (SPEC coach-onboarding-v2 §1 y §9, TASKS W5 F5.1).
 *
 * Habla con `/api/mobile/coach/persona`, que es el MISMO núcleo que usa el server action web:
 * la app no decide sola si hay que preguntar (necesita `created_at`, el conteo de alumnos reales
 * y el workspace) ni escribe la persona por PostgREST (la respuesta siembra preferencias, evento y
 * alumno de ejemplo).
 *
 * Este módulo NO importa React ni react-native: es lógica pura + red, para poder testearlo con el
 * runner de la raíz (`tests/mobile/coach-persona.test.ts`).
 */

/** Ruta de la pantalla «¿A qué te dedicas?» en Expo Router. */
export const PERSONA_ROUTE = '/coach/onboarding/persona'

/** Home del coach: el destino de siempre y el fallback del primer ingreso. */
export const COACH_HOME_ROUTE = '/coach/home'

/** «Tus primeros pasos» en RN (`app/coach/guia.tsx`), paridad con `/coach/guia` de la web. */
export const COACH_GUIA_ROUTE = '/coach/guia'

/**
 * ¿La pantalla de la guía existe en el árbol de Expo Router?
 *
 * Una ruta inexistente no lanza: aterriza en `+not-found`, así que el destino del primer ingreso no
 * se puede resolver con un try/catch. La bandera es el contrato con W5-B, que es quien monta
 * `app/coach/guia.tsx`: en `false` el coach que contesta cae en su panel — nunca en una pantalla
 * vacía. Está en `true` porque la pantalla ya está en el árbol.
 */
export const RN_GUIA_SCREEN_READY = true

/** Destino después de contestar «¿A qué te dedicas?». */
export function resolvePostPersonaRoute(guiaReady: boolean = RN_GUIA_SCREEN_READY): string {
    return guiaReady ? COACH_GUIA_ROUTE : COACH_HOME_ROUTE
}

export interface CoachPersonaStatus {
    persona: Persona | null
    /** Respuesta a la segunda pregunta (`coaches.persona_also_other`). */
    alsoOther: boolean
    /** El gate del primer ingreso: mismo veredicto que el `proxy.ts` de la web (decisión D8). */
    needsPersona: boolean
}

const PERSONAS: readonly string[] = ['strength', 'nutrition', 'rehab', 'endurance', 'other']

/**
 * Normaliza la respuesta del endpoint. TOTAL y conservadora: un payload raro nunca puede terminar
 * en `needsPersona: true` (secuestraría el panel de un coach que ya trabaja).
 */
export function parseCoachPersonaStatus(payload: unknown): CoachPersonaStatus {
    const raw = payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {}
    const persona = typeof raw.persona === 'string' && PERSONAS.includes(raw.persona)
        ? (raw.persona as Persona)
        : null
    return {
        persona,
        alsoOther: raw.alsoOther === true,
        // Con persona elegida no se pregunta nunca más, diga lo que diga el server.
        needsPersona: persona == null && raw.needsPersona === true,
    }
}

/** Techo de espera del gate. Sin esto, una red colgada dejaría el panel detrás de un loader. */
export const PERSONA_GATE_TIMEOUT_MS = 6000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms)
        promise
            .then((value) => {
                clearTimeout(timer)
                resolve(value)
            })
            .catch(() => {
                clearTimeout(timer)
                resolve(null)
            })
    })
}

/**
 * Lee el estado de persona del coach logueado. `null` = no se pudo preguntar (sin red, 5xx,
 * endpoint sin desplegar): el caller trata eso como «no preguntes» — fail-open.
 */
export async function fetchCoachPersonaStatus(): Promise<CoachPersonaStatus | null> {
    try {
        const payload = await apiFetch<unknown>('/api/mobile/coach/persona', {
            method: 'GET',
            authenticated: true,
        })
        return parseCoachPersonaStatus(payload)
    } catch {
        return null
    }
}

export type SaveCoachPersonaResult =
    | { ok: true; demoClientId: string | null }
    | { ok: false; error: string }

const SAVE_FALLBACK_ERROR = 'No pudimos guardar tu elección. Revisa tu conexión e inténtalo de nuevo.'

/**
 * Guarda la respuesta. El servidor escribe persona + preferencias por dominio + evento + alumno de
 * ejemplo; acá solo se refleja el resultado y se actualiza la caché de sesión del gate.
 */
export async function saveCoachPersona(input: {
    persona: Persona
    alsoOther?: boolean
}): Promise<SaveCoachPersonaResult> {
    try {
        const payload = await apiFetch<{ ok?: boolean; demoClientId?: string | null }>(
            '/api/mobile/coach/persona',
            {
                method: 'POST',
                authenticated: true,
                body: { persona: input.persona, alsoOther: input.alsoOther === true },
            },
        )
        if (payload?.ok !== true) return { ok: false, error: SAVE_FALLBACK_ERROR }
        await markPersonaAnswered(input.persona, input.alsoOther === true)
        return { ok: true, demoClientId: payload.demoClientId ?? null }
    } catch (error) {
        return { ok: false, error: humanizeSaveError(error) }
    }
}

/**
 * El mensaje del SERVIDOR se muestra tal cual (viene redactado: «Tu panel lo administra tu
 * organización…»); un fallo de red trae `TypeError: Network request failed`, que no se le pone
 * nunca delante a nadie. El discriminante es el `status` que `ApiError` adjunta.
 */
export function humanizeSaveError(error: unknown): string {
    if (error == null || typeof error !== 'object') return SAVE_FALLBACK_ERROR
    const status = (error as { status?: unknown }).status
    const message = (error as { message?: unknown }).message
    if (typeof status !== 'number' || typeof message !== 'string' || message.trim() === '') {
        return SAVE_FALLBACK_ERROR
    }
    return message
}

// ── Caché de sesión del gate ─────────────────────────────────────────────────────────────────
//
// El layout del árbol coach consulta el gate en cada navegación. Sin caché eso sería un request
// por salto; con caché es UNO por sesión. La clave es el `user.id`: cambiar de cuenta en el mismo
// arranque (QA, coach + su propio alumno) no puede heredar el veredicto del anterior.

let cachedUserId: string | null = null
let cachedStatus: CoachPersonaStatus | null = null
let inFlight: Promise<CoachPersonaStatus | null> | null = null

/** Olvida el veredicto (cambio de cuenta, logout, tests). */
export function resetCoachPersonaCache(): void {
    cachedUserId = null
    cachedStatus = null
    inFlight = null
}

/** Lectura sincrónica de lo ya resuelto en esta sesión. */
export function getCachedCoachPersonaStatus(): CoachPersonaStatus | null {
    return cachedStatus
}

/**
 * El coach acaba de contestar: se apaga el gate sin volver a preguntarle al servidor (si no, el
 * `replace` a la guía volvería a caer en la pantalla de persona por la caché vieja).
 *
 * Es `async` porque la caché se llavea por cuenta: sin sellar el `userId` acá, el próximo
 * `resolveCoachPersonaGate` vería la llave vacía, descartaría el veredicto recién escrito y
 * volvería a preguntar (justo en el salto a la guía, que es donde más duele).
 */
export async function markPersonaAnswered(persona: Persona, alsoOther: boolean): Promise<void> {
    const { data } = await supabase.auth.getSession()
    cachedUserId = data.session?.user.id ?? null
    cachedStatus = { persona, alsoOther, needsPersona: false }
    inFlight = null
}

/**
 * Veredicto del gate para el layout de `/coach`. Una sola consulta por sesión y por cuenta, con
 * dedupe de las llamadas concurrentes y techo de espera. `null` = no se pudo resolver ⇒ el layout
 * no redirige a nadie.
 */
export async function resolveCoachPersonaGate(): Promise<CoachPersonaStatus | null> {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id ?? null
    if (!userId) return null

    if (userId !== cachedUserId) {
        cachedUserId = userId
        cachedStatus = null
        inFlight = null
    }
    if (cachedStatus != null) return cachedStatus
    if (inFlight != null) return inFlight

    inFlight = withTimeout(fetchCoachPersonaStatus(), PERSONA_GATE_TIMEOUT_MS).then((status) => {
        inFlight = null
        // Solo se cachea un veredicto REAL: un fallo se reintenta en la próxima navegación.
        if (status != null && userId === cachedUserId) cachedStatus = status
        return status
    })
    return inFlight
}
