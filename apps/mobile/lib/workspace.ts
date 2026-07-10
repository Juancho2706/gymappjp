/**
 * workspace — capa de datos + hook `useWorkspace()` del contexto de workspace del coach (E7-01).
 * ESTA es la unica resolucion de contexto team/org/standalone de la app: los dominios coach (hub
 * Opciones, Suscripcion, Mi Marca, Team, workspace switcher, nav) la consumen — NADIE re-deriva.
 *
 * Deriva igual que la web (services/auth/workspace.service.ts) pero por PostgREST RLS del coach:
 *  - `coaches` (fila propia): subscription_status + active_org_id.
 *  - `team_members` (propias, activas) join `teams`: owner_coach_id + can_manage + kill-switch.
 *  - org: se detecta por app_metadata.org_id (la RLS del coach NO lee organization_members).
 * La logica PURA (kind / managed / guard de reactivar / (de)serializacion) vive en `workspace-core.ts`.
 *
 * Estrategia stale-while-revalidate (mismo patron que `entitlements.ts`):
 *  1. cache en memoria (store) + AsyncStorage (persistente entre arranques),
 *  2. al primer consumidor: hidrata la cache (respuesta inmediata) y revalida,
 *  3. revalida al volver a foreground (AppState 'active') y ante login/refresh de sesion,
 *  4. sin sesion => NO pega a PostgREST (contexto por defecto).
 * Sin Provider: `useSyncExternalStore` sobre un store de modulo (estado app-wide sin envolver el arbol).
 */
import { useSyncExternalStore } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import {
    applyActiveWorkspace,
    DEFAULT_WORKSPACE_CONTEXT,
    deriveWorkspaceContext,
    parseCachedWorkspaceContext,
    serializeWorkspaceContext,
    type RawCoachRow,
    type RawTeamMembership,
    type RawWorkspaceData,
    type WorkspaceContext,
} from './workspace-core'

// Re-export del contrato + los guards puros (E7-12 importa desde aca, no desde el core).
export {
    DEFAULT_WORKSPACE_CONTEXT,
    hasEffectiveAccess,
    isManagedSubscription,
    resolveReactivateRequired,
    type WorkspaceContext,
    type WorkspaceKind,
    type WorkspaceRef,
} from './workspace-core'

const CACHE_KEY = 'eva_workspace_context'
/** Preferencia de workspace ACTIVO del switcher (T13/E7-07), persistida entre arranques. */
const ACTIVE_KEY = 'eva_workspace_active'

/** Id del workspace que el coach eligio en el switcher (null = default determinista por prioridad). */
let preferredWorkspaceId: string | null = null

interface StoreState {
    context: WorkspaceContext
    /** `true` hasta la primera resolucion (cache o red). */
    loading: boolean
    /** `true` si se resolvio al menos una vez (cache o red). */
    ready: boolean
}

let state: StoreState = { context: DEFAULT_WORKSPACE_CONTEXT, loading: true, ready: false }
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let hydratedFromCache = false
let globalListenersWired = false

function emit() {
    for (const l of listeners) l()
}

function setState(next: Partial<StoreState>) {
    state = { ...state, ...next }
    emit()
}

function getSnapshot(): StoreState {
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

/** Forma cruda de la fila join `team_members` -> `teams` (cliente supabase sin tipos de DB). */
type TeamJoinRow = {
    can_manage?: boolean | null
    teams?:
        | {
              id: string
              name: string | null
              slug: string | null
              owner_coach_id: string | null
              deleted_at: string | null
              suspended_at: string | null
          }
        | Array<{
              id: string
              name: string | null
              slug: string | null
              owner_coach_id: string | null
              deleted_at: string | null
              suspended_at: string | null
          }>
        | null
}

/**
 * Lee las filas crudas del contexto del coach via PostgREST RLS. `null` si no hay sesion (el caller
 * cae al contexto por defecto). Fail-safe: cualquier query que falle degrada a vacio, nunca lanza.
 */
async function fetchRawWorkspaceData(): Promise<RawWorkspaceData | null> {
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session?.user) return null

    const userId = session.user.id
    const meta = session.user.app_metadata as Record<string, string> | undefined
    const orgIdMeta = meta?.org_id ?? null

    const [coachRes, membersRes, orgRes] = await Promise.all([
        supabase
            .from('coaches')
            .select('id, full_name, brand_name, slug, subscription_status, active_org_id')
            .eq('id', userId)
            .maybeSingle(),
        supabase
            .from('team_members')
            .select('can_manage, teams(id, name, slug, owner_coach_id, deleted_at, suspended_at)')
            .eq('coach_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null),
        orgIdMeta
            ? supabase.from('organizations').select('name').eq('id', orgIdMeta).maybeSingle()
            : Promise.resolve({ data: null }),
    ])

    const coach = (coachRes.data ?? null) as RawCoachRow | null
    const orgId = orgIdMeta ?? coach?.active_org_id ?? null
    const orgName = ((orgRes as { data?: { name?: string | null } | null }).data?.name) ?? null

    const memberships: RawTeamMembership[] = []
    for (const row of ((membersRes.data ?? []) as TeamJoinRow[])) {
        const t = row.teams
        const team = Array.isArray(t) ? t[0] : t
        if (!team) continue
        memberships.push({
            teamId: team.id,
            name: team.name ?? null,
            slug: team.slug ?? null,
            ownerCoachId: team.owner_coach_id ?? null,
            canManage: row.can_manage === true,
            deletedAt: team.deleted_at ?? null,
            suspendedAt: team.suspended_at ?? null,
        })
    }

    return { userId, coach, memberships, orgId, orgName }
}

/**
 * Resolucion one-shot (para services / callers sin hook). Fetch fresco + derivacion. Sin sesion o
 * ante fallo total => `DEFAULT_WORKSPACE_CONTEXT` (standalone, acceso abierto).
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
    try {
        const raw = await fetchRawWorkspaceData()
        if (!raw) return DEFAULT_WORKSPACE_CONTEXT
        return deriveWorkspaceContext(raw)
    } catch {
        return DEFAULT_WORKSPACE_CONTEXT
    }
}

async function hydrateFromCache(): Promise<void> {
    if (hydratedFromCache) return
    hydratedFromCache = true
    try {
        const [raw, activeId] = await Promise.all([
            AsyncStorage.getItem(CACHE_KEY),
            AsyncStorage.getItem(ACTIVE_KEY),
        ])
        preferredWorkspaceId = activeId ?? null
        if (!raw) return
        // El contexto cacheado ya trae el activo del ultimo derive; re-aplicamos la preferencia por
        // si el switcher cambio tras el ultimo persist de contexto (best-effort, sin refetch).
        let context = parseCachedWorkspaceContext(raw)
        if (preferredWorkspaceId) context = applyActiveWorkspace(context, preferredWorkspaceId)
        setState({ context, ready: true, loading: false })
    } catch {
        /* cache ilegible: la revalidacion la reemplaza */
    }
}

/**
 * Revalida el contexto contra PostgREST. Deduplicado por `inFlight`. Sin sesion => contexto por
 * defecto. Ante fallo de red conserva la cache y solo sale de `loading`.
 */
export function refreshWorkspace(): Promise<void> {
    if (inFlight) return inFlight
    inFlight = (async () => {
        try {
            const raw = await fetchRawWorkspaceData()
            if (!raw) {
                setState({ context: DEFAULT_WORKSPACE_CONTEXT, ready: true, loading: false })
                return
            }
            const context = deriveWorkspaceContext(raw, preferredWorkspaceId)
            setState({ context, ready: true, loading: false })
            try {
                await AsyncStorage.setItem(CACHE_KEY, serializeWorkspaceContext(context))
            } catch {
                /* persistencia best-effort */
            }
        } catch {
            setState({ loading: false })
        } finally {
            inFlight = null
        }
    })()
    return inFlight
}

async function bootstrap(): Promise<void> {
    await hydrateFromCache()
    await refreshWorkspace()
}

/** Limpia el contexto (logout). El proximo login re-hidrata/revalida. */
export function resetWorkspace(): void {
    hydratedFromCache = false
    preferredWorkspaceId = null
    setState({ context: DEFAULT_WORKSPACE_CONTEXT, ready: false, loading: false })
    void AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
    void AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {})
}

/**
 * Cambia el workspace ACTIVO desde el switcher (E7-07). Refleja el cambio en el acto (sin refetch)
 * via `applyActiveWorkspace` sobre la lista ya derivada, persiste la preferencia (ACTIVE_KEY) para
 * que sobreviva arranques/revalidaciones, y re-persiste el contexto. `id` desconocido => no-op.
 */
export function setActiveWorkspace(id: string): void {
    if (id === preferredWorkspaceId && state.context.workspaces.find((w) => w.id === id)?.isActive) return
    const next = applyActiveWorkspace(state.context, id)
    if (next === state.context) return // id no presente en la lista
    preferredWorkspaceId = id
    setState({ context: next })
    void AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {})
    void AsyncStorage.setItem(CACHE_KEY, serializeWorkspaceContext(next)).catch(() => {})
}

function wireGlobalListeners(): void {
    if (globalListenersWired) return
    globalListenersWired = true
    AppState.addEventListener('change', (s: AppStateStatus) => {
        if (s === 'active' && listeners.size > 0) void refreshWorkspace()
    })
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            resetWorkspace()
            return
        }
        void refreshWorkspace()
    })
}

export interface WorkspaceValue extends WorkspaceContext {
    /** `true` hasta la primera resolucion (cache o red). */
    loading: boolean
    /** `true` si se resolvio al menos una vez. */
    ready: boolean
    /** Fuerza una revalidacion (pull-to-refresh, tras cambiar de workspace). */
    refresh: () => Promise<void>
    /** Cambia el workspace ACTIVO (switcher E7-07) y persiste la preferencia. */
    setActiveWorkspace: (id: string) => void
}

/**
 * Hook app-wide del contexto de workspace del coach. En el primer render devuelve
 * `DEFAULT_WORKSPACE_CONTEXT` (standalone) y dispara hidratacion + revalidacion; re-renderiza cuando
 * el store cambia. No requiere Provider.
 */
export function useWorkspace(): WorkspaceValue {
    const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return {
        ...s.context,
        loading: s.loading,
        ready: s.ready,
        refresh: refreshWorkspace,
        setActiveWorkspace,
    }
}
