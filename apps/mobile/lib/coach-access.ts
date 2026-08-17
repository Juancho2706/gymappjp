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
 * "No hay fila de coach" y "no pude preguntar" son estados DISTINTOS (auditoria 2026-08-09): las dos
 * lecturas se hacen con las variantes ESTRICTAS (`getCoachProfileStrict` / `getActiveCoachWorkspaceStrict`),
 * que lanzan ante red caida o 5xx. Antes ambas devolvian `null` y el modulo caia en la rama neutra
 * con `ready:true` — en modo avion el arbol coach completo se renderizaba para un coach vencido, y
 * encima se borraba la cache del veredicto.
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
import { getCoachProfileStrict } from './coach'
import { getActiveCoachWorkspaceStrict } from './workspace'
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
    /**
     * `coaches.max_clients` del perfil — el cupo EFECTIVO del coach (pricing v2, P2 grandfather):
     * un free VIEJO conserva su 3 en la columna aunque el catálogo nuevo diga 2. null = desconocido
     * (cache vieja / perfil sin dato) ⇒ el guard cae al catálogo de venta.
     */
    maxClients: number | null
    workspaceKind: WorkspaceKind | null
    /** `true` si se resolvio contra el estado actual de servidor, no solo desde cache. */
    ready: boolean
    /**
     * `true` si la ultima revalidacion no pudo PREGUNTAR (offline/5xx/RLS). El gate queda cerrado
     * (`ready:false`) pero en condicion RE-INTENTABLE: `lastResolvedAt` vuelve a 0 y la UI puede
     * ofrecer "Reintentar" leyendo `status === 'error'`.
     */
    errored: boolean
}

const EMPTY_ACCESS: Omit<AccessState, 'ready' | 'errored'> = {
    coachId: null,
    subscriptionStatus: null,
    subscriptionTier: null,
    currentPeriodEnd: null,
    activeStandaloneClientCount: null,
    maxClients: null,
    workspaceKind: null,
}

let state: AccessState = { ...EMPTY_ACCESS, ready: false, errored: false }
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let lastResolvedAt = 0
let hydratedFromCache = false
let globalListenersWired = false
let cacheKey: string | null = null
/**
 * Id del usuario de la ULTIMA resolucion, haya fila de coach o no. `state.coachId` no sirve como
 * guard de cambio de cuenta: es null para un alumno y para el estado neutro, asi que una sesion
 * previa sin fila de coach dejaba entrar al usuario siguiente con el veredicto ajeno.
 */
let lastResolvedUserId: string | null = null
/**
 * Token de generacion. `resetCoachAccess` lo incrementa: cualquier revalidacion que ya estaba en
 * vuelo cuando cambio la cuenta queda huerfana y NO puede escribir estado ni cache (su veredicto es
 * del usuario anterior).
 */
let generation = 0

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
            // Cache v2 vieja sin el campo ⇒ null (el guard cae al catálogo hasta revalidar).
            maxClients: typeof parsed.maxClients === 'number' ? parsed.maxClients : null,
            workspaceKind: parsed.workspaceKind ?? null,
            // A cache is only a warm start. The gate stays closed until the current account and
            // current workspace capacity are revalidated against the server.
            ready: false,
            errored: false,
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
    const gen = generation
    inFlight = (async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const sessionUserId = session?.user.id ?? null
            // AMBAS estrictas: `null` aca significa "no hay fila de coach", nunca "no pude preguntar"
            // (eso LANZA y cae al catch fail-closed de abajo).
            const [profile, workspace] = await Promise.all([
                getCoachProfileStrict(),
                getActiveCoachWorkspaceStrict(),
            ])
            if (gen !== generation) return
            lastResolvedAt = Date.now()
            lastResolvedUserId = profile?.id ?? sessionUserId
            if (!profile) {
                // Sin fila de coach (alumno, o sesion cerrada): estado neutro, nunca bloqueante.
                setState({ ...EMPTY_ACCESS, ready: true, errored: false })
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
                // Cupo efectivo (grandfather P2): la columna del perfil manda sobre el catálogo.
                maxClients: typeof profile.maxClients === 'number' ? profile.maxClients : null,
                workspaceKind,
                ready: true,
                errored: false,
            }
            if (gen !== generation) return
            setState(next)
            if (!cacheKey) cacheKey = `${CACHE_KEY_PREFIX}${profile.id}`
            await AsyncStorage.setItem(cacheKey, JSON.stringify({ ...next, accessVersion: 2 })).catch(() => {})
        } catch {
            if (gen !== generation) return
            // Fail-closed: sin capacidad actual no se renderiza el dashboard ni se opera por deep link.
            // `lastResolvedAt = 0` deja el estado RE-INTENTABLE: el throttle no puede sellar el loader
            // (desde el muro no hay navegacion que lo destrabe), y la cache NO se toca: un fallo de red
            // no puede borrar el ultimo veredicto conocido.
            lastResolvedAt = 0
            setState({ ready: false, errored: true })
        } finally {
            if (gen === generation) inFlight = null
        }
    })()
    return inFlight
}

async function bootstrap(): Promise<void> {
    await hydrateFromCache()
    await refreshCoachAccess(true)
}

/** Limpia el estado (logout / cambio de cuenta). El proximo login re-hidrata. */
export function resetCoachAccess(): void {
    hydratedFromCache = false
    lastResolvedAt = 0
    lastResolvedUserId = null
    // Nueva generacion ANTES de soltar `inFlight`: la revalidacion en vuelo (si la hay) queda
    // huerfana y el proximo `refreshCoachAccess(force)` arranca una propia en vez de devolver la
    // promesa vieja — sin esto el usuario entrante heredaba el veredicto del saliente.
    generation += 1
    inFlight = null
    setState({ ...EMPTY_ACCESS, ready: false, errored: false })
    if (cacheKey) void AsyncStorage.removeItem(cacheKey).catch(() => {})
    void AsyncStorage.removeItem(LEGACY_CACHE_KEY).catch(() => {})
    cacheKey = null
}

/**
 * Reaccion a los cambios de sesion (exportada para test; en runtime la cablea `wireGlobalListeners`).
 * El guard compara contra `lastResolvedUserId` — el usuario de la ULTIMA resolucion, con o sin fila
 * de coach — porque `state.coachId` es null para alumnos y para el estado neutro: con esa
 * comparacion, entrar como coach despues de una sesion de alumno NO reseteaba nada y el coach corria
 * unos frames con el `ready:true` ajeno.
 */
export function handleCoachAccessAuthChange(event: string, nextUserId: string | null): void {
    if (event === 'SIGNED_OUT') {
        resetCoachAccess()
        return
    }
    // Otra cuenta => el estado resuelto de la anterior no puede sobrevivir ni un frame ahora que
    // una revalidacion de fondo conserva el ultimo veredicto: se cierra el gate antes de pedir.
    if (nextUserId && lastResolvedUserId && nextUserId !== lastResolvedUserId) resetCoachAccess()
    void refreshCoachAccess(true)
}

function wireGlobalListeners(): void {
    if (globalListenersWired) return
    globalListenersWired = true
    AppState.addEventListener('change', (s: AppStateStatus) => {
        // El plan pudo vencer (o reactivarse) mientras la app estaba en background.
        if (s === 'active' && listeners.size > 0) void refreshCoachAccess(true)
    })
    supabase.auth.onAuthStateChange((event, session) => {
        handleCoachAccessAuthChange(event, session?.user.id ?? null)
    })
}

/**
 * Discriminante para la UI. `ready`/`blocked` SIGUEN siendo el contrato de gateo (derivados): esto
 * solo permite distinguir "todavia resolviendo" de "no pude preguntar" para ofrecer un reintento.
 */
export type CoachAccessStatus = 'resolving' | 'allowed' | 'blocked' | 'error'

export interface CoachAccessValue {
    /** `true` si ya se resolvio contra el estado actual de servidor. */
    ready: boolean
    /** `true` si el coach perdio acceso EFECTIVO y debe ir a /coach/reactivate. */
    blocked: boolean
    /** `resolving` | `allowed` | `blocked` | `error` (solo presentacion; el gate es `blocked`). */
    status: CoachAccessStatus
    /** `subscription_status` crudo (para copy; NUNCA para gatear — usar `blocked`). */
    subscriptionStatus: string | null
    /** Fuerza una revalidacion (tras volver a Free, pull-to-refresh, reintento manual). */
    refresh: (force?: boolean) => Promise<void>
}

/**
 * Derivacion del valor publico. `blocked` respeta la gracia hasta `current_period_end` y NUNCA gatea
 * a managed (org/team), porque delega en `resolveReactivateRequired` — la MISMA funcion pura que usa
 * la web.
 *
 * El reloj es `lastResolvedAt` (instante de la ULTIMA resolucion), no `Date.now()`: el render queda
 * puro y el veredicto es estable entre re-renders. Una gracia que vence con la app abierta se
 * refleja en la siguiente revalidacion (foreground o navegacion, throttle 30s), no en un re-render
 * arbitrario. Con `lastResolvedAt === 0` no hay veredicto: `!ready` ya cortocircuita a bloqueado.
 */
function toAccessValue(s: AccessState, now: number): CoachAccessValue {
    const blocked =
        !s.ready ||
        resolveReactivateRequired(s.subscriptionStatus, s.currentPeriodEnd, now, {
            subscriptionTier: s.subscriptionTier,
            activeStandaloneClientCount: s.activeStandaloneClientCount,
            workspaceKind: s.workspaceKind,
            // Pricing v2 (P2): el cupo free se mide contra el max_clients real del coach.
            freeClientLimit: s.maxClients,
        })
    const status: CoachAccessStatus = s.errored && !s.ready ? 'error' : !s.ready ? 'resolving' : blocked ? 'blocked' : 'allowed'
    return { ready: s.ready, blocked, status, subscriptionStatus: s.subscriptionStatus, refresh: refreshCoachAccess }
}

/** Lectura puntual del acceso, sin hook (tests y callers fuera de React). */
export function getCoachAccessSnapshot(): CoachAccessValue {
    return toAccessValue(state, lastResolvedAt)
}

/** Hook app-wide del acceso del coach. Sin Provider (store de modulo + useSyncExternalStore). */
export function useCoachAccess(): CoachAccessValue {
    const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return toAccessValue(s, lastResolvedAt)
}
