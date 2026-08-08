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
 * FAIL-CLOSED para el arbol coach: hasta resolver el estado actual y el cupo del workspace,
 * `blocked` permanece true y el layout solo muestra el loader. La autorizacion real sigue siendo
 * DB/RLS + endpoints; este cierre evita exponer el dashboard mientras una cuenta cambiada o vencida
 * aun no fue revalidada.
 *
 * NO usa el store de `workspace.ts` a proposito: ese contexto no lee `current_period_end`, y sin esa
 * fecha `hasEffectiveAccess` trataria a un cancelado CON gracia viva como bloqueado.
 */
import { useSyncExternalStore } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getCoachProfile } from './coach'
import { getActiveCoachWorkspace } from './workspace'
import { resolveReactivateRequired, type WorkspaceKind } from './workspace-core'

const CACHE_KEY_PREFIX = 'eva_coach_access_v2:'
const LEGACY_CACHE_KEY = 'eva_coach_access'
/** Ventana de throttle de la revalidacion por navegacion (una query PostgREST por salto es flood). */
const REVALIDATE_MS = 30_000

interface AccessState {
    coachId: string | null
    /** `subscription_status` crudo. null = sin resolver o sin fila de coach (alumno). */
    subscriptionStatus: string | null
    subscriptionTier: string | null
    /** Necesario para la GRACIA de canceled/trialing/paused/past_due. */
    currentPeriodEnd: string | null
    /** Cupo personal ya resuelto; Team nunca entra en este número. */
    activeStandaloneClientCount: number | null
    workspaceKind: WorkspaceKind | null
    /** `true` si se resolvio contra el estado actual de servidor, no solo desde cache. */
    ready: boolean
}

let state: AccessState = {
    coachId: null,
    subscriptionStatus: null,
    subscriptionTier: null,
    currentPeriodEnd: null,
    activeStandaloneClientCount: null,
    workspaceKind: null,
    ready: false,
}
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let lastResolvedAt = 0
let hydratedFromCache = false
let globalListenersWired = false
let cacheKey: string | null = null

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
        const { data: { session } } = await supabase.auth.getSession()
        const currentUserId = session?.user.id ?? null
        cacheKey = currentUserId ? `${CACHE_KEY_PREFIX}${currentUserId}` : null
        const raw = cacheKey ? await AsyncStorage.getItem(cacheKey) : null
        if (!raw) return
        const parsed = JSON.parse(raw) as Partial<AccessState> & { accessVersion?: number }
        if (parsed.accessVersion !== 2 || parsed.coachId !== currentUserId) return
        setState({
            coachId: parsed.coachId ?? null,
            subscriptionStatus: typeof parsed.subscriptionStatus === 'string' ? parsed.subscriptionStatus : null,
            subscriptionTier: typeof parsed.subscriptionTier === 'string' ? parsed.subscriptionTier : null,
            currentPeriodEnd: typeof parsed.currentPeriodEnd === 'string' ? parsed.currentPeriodEnd : null,
            activeStandaloneClientCount:
                typeof parsed.activeStandaloneClientCount === 'number' ? parsed.activeStandaloneClientCount : null,
            workspaceKind: parsed.workspaceKind ?? null,
            // A cache is only a warm start. The gate stays closed until the current account and
            // current workspace capacity are revalidated against the server.
            ready: false,
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
    // Cerrar el gate SOLO si nunca se resolvio contra servidor. Una revalidacion de fondo sobre un
    // estado ya resuelto no puede degradar a `ready:false`: `blocked` incluye "sin resolver", asi
    // que eso marcaba bloqueado a un coach al dia en CADA salto dentro de /coach y el layout lo
    // expulsaba a /coach/reactivate (QA device 2026-08-08). El cambio de cuenta sigue cerrando el
    // gate: `resetCoachAccess` vuelve `lastResolvedAt` a 0 antes de revalidar.
    if (lastResolvedAt === 0) setState({ ready: false })
    inFlight = (async () => {
        try {
            const [profile, workspace] = await Promise.all([getCoachProfile(), getActiveCoachWorkspace()])
            lastResolvedAt = Date.now()
            if (!profile) {
                // Sin fila de coach (alumno, o sesion cerrada): estado neutro, nunca bloqueante.
                setState({
                    coachId: null,
                    subscriptionStatus: null,
                    subscriptionTier: null,
                    currentPeriodEnd: null,
                    activeStandaloneClientCount: null,
                    workspaceKind: null,
                    ready: true,
                })
                if (cacheKey) await AsyncStorage.removeItem(cacheKey).catch(() => {})
                await AsyncStorage.removeItem(LEGACY_CACHE_KEY).catch(() => {})
                return
            }
            const workspaceKind = workspace?.kind ?? null
            let activeStandaloneClientCount: number | null = null
            if (profile.subscriptionTier === 'free' && workspaceKind === 'standalone') {
                const { count, error } = await supabase
                    .from('clients')
                    .select('id', { count: 'exact', head: true })
                    .eq('coach_id', profile.id)
                    .is('org_id', null)
                    .is('team_id', null)
                    .eq('is_archived', false)
                if (error) throw error
                activeStandaloneClientCount = count ?? 0
            }
            const next: AccessState = {
                coachId: profile.id,
                subscriptionStatus: profile.subscriptionStatus,
                subscriptionTier: profile.subscriptionTier,
                currentPeriodEnd: profile.currentPeriodEnd,
                activeStandaloneClientCount,
                workspaceKind,
                ready: true,
            }
            setState(next)
            if (!cacheKey) cacheKey = `${CACHE_KEY_PREFIX}${profile.id}`
            await AsyncStorage.setItem(cacheKey, JSON.stringify({ ...next, accessVersion: 2 })).catch(() => {})
        } catch {
            // Fail-closed: sin capacidad actual no se renderiza el dashboard ni se opera por deep link.
            setState({ ready: false })
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
    setState({
        coachId: null,
        subscriptionStatus: null,
        subscriptionTier: null,
        currentPeriodEnd: null,
        activeStandaloneClientCount: null,
        workspaceKind: null,
        ready: false,
    })
    if (cacheKey) void AsyncStorage.removeItem(cacheKey).catch(() => {})
    void AsyncStorage.removeItem(LEGACY_CACHE_KEY).catch(() => {})
    cacheKey = null
}

function wireGlobalListeners(): void {
    if (globalListenersWired) return
    globalListenersWired = true
    AppState.addEventListener('change', (s: AppStateStatus) => {
        // El plan pudo vencer (o reactivarse) mientras la app estaba en background.
        if (s === 'active' && listeners.size > 0) void refreshCoachAccess(true)
    })
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            resetCoachAccess()
            return
        }
        // Otra cuenta => el estado resuelto de la anterior no puede sobrevivir ni un frame ahora que
        // una revalidacion de fondo conserva el ultimo veredicto: se cierra el gate antes de pedir.
        const nextUserId = session?.user.id ?? null
        if (nextUserId && state.coachId && nextUserId !== state.coachId) resetCoachAccess()
        void refreshCoachAccess(true)
    })
}

export interface CoachAccessValue {
    /** `true` si ya se resolvio contra el estado actual de servidor. */
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
        blocked:
            !s.ready ||
            resolveReactivateRequired(s.subscriptionStatus, s.currentPeriodEnd, Date.now(), {
                subscriptionTier: s.subscriptionTier,
                activeStandaloneClientCount: s.activeStandaloneClientCount,
                workspaceKind: s.workspaceKind,
            }),
        subscriptionStatus: s.subscriptionStatus,
        refresh: refreshCoachAccess,
    }
}
