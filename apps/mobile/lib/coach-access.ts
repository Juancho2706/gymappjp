/**
 * coach-access — estado de ACCESO POR SUSCRIPCION del coach (gate E7-12, endurecido).
 *
 * POR QUE EXISTE (hallazgo QA 2026-07-31): el gate vivia como `useEffect(…, [])` dentro de
 * `app/coach/(tabs)/_layout.tsx`. Eso dejaba DOS agujeros:
 *   1. Las rutas coach FUERA del grupo `(tabs)` (ficha del alumno, program-builder, nutrition-v2,
 *      cardio, bodycomp, movement, settings/*, foods, tools…) no pasaban por ese layout: un coach
 *      vencido las abria y operaba normal.
 *   2. El layout de tabs NO se desmonta al navegar entre tabs, asi que el chequeo corria UNA vez
 *      por arranque: tras el `replace` a /coach/reactivate, un back-gesture o cualquier
 *      `router.push` devolvia al dashboard sin re-evaluar.
 *
 * La correccion mueve el gate a `app/coach/_layout.tsx` (cubre TODO el arbol coach) y lo convierte
 * en ESTADO REACTIVO: mientras `blocked` sea true, el layout no renderiza contenido, sin importar
 * como se haya llegado a la ruta.
 *
 * Estrategia stale-while-revalidate, mismo patron que `workspace.ts` / `entitlements.ts`:
 *  1. cache en memoria + AsyncStorage (respuesta inmediata en arranques siguientes),
 *  2. revalida al primer consumidor, al volver a foreground y en cada navegacion dentro de /coach
 *     (throttled: ver REVALIDATE_MS),
 *  3. sin sesion / sin fila de coach => estado neutro (un alumno jamas queda "bloqueado" por esto).
 *
 * FAIL-OPEN deliberado (mismo contrato que el gate del alumno): hasta la primera resolucion
 * `blocked` es false. El techo real de autorizacion es la DB/RLS + los endpoints, no esta pantalla;
 * un fail-closed aca solo lograria mostrar un muro falso ante una red lenta.
 *
 * NO usa el store de `workspace.ts` a proposito: ese contexto no lee `current_period_end`, y sin esa
 * fecha `hasEffectiveAccess` trataria a un cancelado CON gracia viva como bloqueado.
 */
import { useSyncExternalStore } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getCoachProfile } from './coach'
import { resolveReactivateRequired } from './workspace-core'

const CACHE_KEY = 'eva_coach_access'
/** Ventana de throttle de la revalidacion por navegacion (una query PostgREST por salto es flood). */
const REVALIDATE_MS = 30_000

interface AccessState {
    /** `subscription_status` crudo. null = sin resolver o sin fila de coach (alumno). */
    subscriptionStatus: string | null
    /** Necesario para la GRACIA de canceled/trialing/paused/past_due. */
    currentPeriodEnd: string | null
    /** `true` si se resolvio al menos una vez (cache o red). */
    ready: boolean
}

let state: AccessState = { subscriptionStatus: null, currentPeriodEnd: null, ready: false }
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let lastResolvedAt = 0
let hydratedFromCache = false
let globalListenersWired = false

function emit() {
    for (const l of listeners) l()
}

function setState(next: Partial<AccessState>) {
    state = { ...state, ...next }
    emit()
}

function getSnapshot(): AccessState {
    return state
}

function subscribe(cb: () => void): () => void {
    listeners.add(cb)
    wireGlobalListeners()
    if (listeners.size === 1) void bootstrap()
    return () => {
        listeners.delete(cb)
    }
}

async function hydrateFromCache(): Promise<void> {
    if (hydratedFromCache) return
    hydratedFromCache = true
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as Partial<AccessState>
        setState({
            subscriptionStatus: typeof parsed.subscriptionStatus === 'string' ? parsed.subscriptionStatus : null,
            currentPeriodEnd: typeof parsed.currentPeriodEnd === 'string' ? parsed.currentPeriodEnd : null,
            ready: true,
        })
    } catch {
        /* cache ilegible: la revalidacion la reemplaza */
    }
}

/**
 * Revalida contra PostgREST. Deduplicado por `inFlight` y throttled por `REVALIDATE_MS` salvo
 * `force` (post-accion: al volver a Free hay que reflejarlo en el acto).
 */
export function refreshCoachAccess(force = false): Promise<void> {
    if (inFlight) return inFlight
    if (!force && lastResolvedAt > 0 && Date.now() - lastResolvedAt < REVALIDATE_MS) {
        return Promise.resolve()
    }
    inFlight = (async () => {
        try {
            const profile = await getCoachProfile()
            lastResolvedAt = Date.now()
            if (!profile) {
                // Sin fila de coach (alumno, o sesion cerrada): estado neutro, nunca bloqueante.
                setState({ subscriptionStatus: null, currentPeriodEnd: null, ready: true })
                await AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
                return
            }
            const next: AccessState = {
                subscriptionStatus: profile.subscriptionStatus,
                currentPeriodEnd: profile.currentPeriodEnd,
                ready: true,
            }
            setState(next)
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {})
        } catch {
            // Fallo de red: conservamos lo cacheado y solo salimos de "sin resolver".
            setState({ ready: true })
        } finally {
            inFlight = null
        }
    })()
    return inFlight
}

async function bootstrap(): Promise<void> {
    await hydrateFromCache()
    await refreshCoachAccess(true)
}

/** Limpia el estado (logout). El proximo login re-hidrata. */
export function resetCoachAccess(): void {
    hydratedFromCache = false
    lastResolvedAt = 0
    setState({ subscriptionStatus: null, currentPeriodEnd: null, ready: false })
    void AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
}

function wireGlobalListeners(): void {
    if (globalListenersWired) return
    globalListenersWired = true
    AppState.addEventListener('change', (s: AppStateStatus) => {
        // El plan pudo vencer (o reactivarse) mientras la app estaba en background.
        if (s === 'active' && listeners.size > 0) void refreshCoachAccess(true)
    })
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            resetCoachAccess()
            return
        }
        void refreshCoachAccess(true)
    })
}

export interface CoachAccessValue {
    /** `true` si ya se resolvio al menos una vez (cache o red). */
    ready: boolean
    /** `true` si el coach perdio acceso EFECTIVO y debe ir a /coach/reactivate. */
    blocked: boolean
    /** `subscription_status` crudo (para copy; NUNCA para gatear — usar `blocked`). */
    subscriptionStatus: string | null
    /** Fuerza una revalidacion (tras volver a Free, pull-to-refresh, reintento manual). */
    refresh: (force?: boolean) => Promise<void>
}

/**
 * Hook app-wide del acceso del coach. Sin Provider (store de modulo + useSyncExternalStore).
 * `blocked` respeta la gracia hasta `current_period_end` y NUNCA gatea a managed (org/team),
 * porque delega en `resolveReactivateRequired` — la MISMA funcion pura que usa la web.
 */
export function useCoachAccess(): CoachAccessValue {
    const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return {
        ready: s.ready,
        blocked: resolveReactivateRequired(s.subscriptionStatus, s.currentPeriodEnd),
        subscriptionStatus: s.subscriptionStatus,
        refresh: refreshCoachAccess,
    }
}
