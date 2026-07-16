/**
 * entitlements — capa de datos + hook `useEntitlements()` de mobile (E0-C1). ESTA es la unica
 * implementacion de entitlements de la app; los 9 dominios de paridad la consumen para
 * mostrar/ocultar superficie de pago. El gate de DINERO (escritura) NO vive aca: ya esta en los
 * endpoints /api/mobile/* (assertModule server-side); esto solo espeja la VISIBILIDAD.
 *
 * Estrategia stale-while-revalidate:
 *  1. cache en memoria (store de modulo) + AsyncStorage (persistente entre arranques),
 *  2. al primer consumidor: hidrata la cache (respuesta inmediata, aunque sea vieja) y revalida,
 *  3. revalida al volver a foreground (AppState 'active') y ante login/refresh de sesion,
 *  4. sin sesion => NO pega al endpoint (evita el 401 -> signOut del bridge apiFetch).
 *
 * Sin Provider: se usa `useSyncExternalStore` sobre un store de modulo, que da estado compartido
 * app-wide sin envolver el arbol (mas liviano que el patron ThemeContext y sin tocar _layout).
 * `entitlements-core.ts` concentra la logica PURA testeable; aca solo va la glue de RN.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { apiFetch } from './api'
import { setRemoteFlags, clearRemoteFlags } from './flags'
import type { ClientActionWorkspace } from './client-actions'
import {
    DEFAULT_CONFIG,
    hasModuleIn,
    isNutritionSectionVisibleIn,
    normalizeConfig,
    parseCachedConfigEnvelope,
    resolveEffectiveModules,
    serializeConfigEnvelope,
    type MobileConfig,
    type ModuleKey,
    type NutritionSectionKey,
    type RawMobileConfig,
} from './entitlements-core'

const CACHE_KEY = 'eva_entitlements_config'
/** TTL corto de la resolucion `nutritionV2Coach` por alumno (canary por alumno alcanzando mobile). */
const CLIENT_FLAG_TTL_MS = 15 * 60 * 1000
const CLIENT_FLAG_PREFIX = 'eva_nutrition_v2_coach_flag'

interface StoreState {
    config: MobileConfig
    /** `true` hasta la primera resolucion (cache o red). */
    loading: boolean
    /** `true` si se hidrato al menos una vez (cache o red). */
    ready: boolean
}

let state: StoreState = { config: DEFAULT_CONFIG, loading: true, ready: false }
const listeners = new Set<() => void>()
let refreshQueue: Promise<void> = Promise.resolve()
let hydratedFromCache = false
let globalListenersWired = false
let resetVersion = 0

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

async function hydrateFromCache(): Promise<void> {
    if (hydratedFromCache) return
    hydratedFromCache = true
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY)
        if (!raw) return
        const cached = parseCachedConfigEnvelope(raw, Date.now())
        setRemoteFlags(cached.flags)
        setState({ config: cached, ready: true, loading: false })
    } catch {
        /* cache ilegible: se ignora, la revalidacion la reemplaza */
    }
}

async function hasSession(): Promise<boolean> {
    try {
        const { data } = await supabase.auth.getSession()
        return !!data.session
    } catch {
        return false
    }
}

function configPath(workspace: ClientActionWorkspace | null, clientId?: string | null): string {
    const params: string[] = []
    if (workspace) {
        params.push(`workspaceKind=${encodeURIComponent(workspace.kind)}`)
        if (workspace.teamId) params.push(`teamId=${encodeURIComponent(workspace.teamId)}`)
        if (workspace.orgId) params.push(`orgId=${encodeURIComponent(workspace.orgId)}`)
    }
    if (clientId) params.push(`clientId=${encodeURIComponent(clientId)}`)
    return params.length ? `/api/mobile/config?${params.join('&')}` : '/api/mobile/config'
}

async function resolveActiveCoachWorkspace(): Promise<ClientActionWorkspace | null> {
    try {
        // Dynamic import: workspace.ts usa apiFetch y refresca entitlements tras un switch. Mantener
        // este borde dinamico evita un ciclo de inicializacion entre ambos stores app-wide.
        const { getActiveCoachWorkspace } = await import('./workspace')
        return await getActiveCoachWorkspace()
    } catch {
        return null
    }
}

async function performRefresh(
    version: number,
    explicitWorkspace?: ClientActionWorkspace,
): Promise<void> {
    if (version !== resetVersion) return
    setState({ loading: true })
    try {
        if (!(await hasSession())) {
            if (version === resetVersion) setState({ loading: false })
            return
        }
        // Coach: siempre manda scope explicito del workspace activo. Alumno/no-coach: null conserva
        // el resolver legacy de /api/mobile/config (coach/team/org del propio alumno).
        const workspace = explicitWorkspace ?? await resolveActiveCoachWorkspace()
        const raw = await apiFetch<RawMobileConfig>(configPath(workspace), { authenticated: true })
        const config = normalizeConfig(raw)
        if (version !== resetVersion) return
        setRemoteFlags(config.flags)
        setState({ config, ready: true, loading: false })
        try {
            await AsyncStorage.setItem(CACHE_KEY, serializeConfigEnvelope(config, Date.now()))
        } catch {
            /* persistencia best-effort */
        }
    } catch {
        if (version === resetVersion) setState({ loading: false })
    }
}

/**
 * Revalida contra /api/mobile/config para el workspace coach ACTIVO. Las llamadas se serializan:
 * un TOKEN_REFRESHED durante el switch puede encolar una revalidacion implicita, pero la explicita
 * del switch corre despues y queda como estado final. Sin sesion no llama al endpoint.
 */
export function refreshEntitlements(explicitWorkspace?: ClientActionWorkspace): Promise<void> {
    // Capturar la generacion al ENCOLAR: una request del usuario anterior nunca puede arrancar tras
    // un SIGNED_OUT/SIGNED_IN y aplicar config al usuario nuevo.
    const version = resetVersion
    const task = refreshQueue.then(() => performRefresh(version, explicitWorkspace))
    refreshQueue = task.catch(() => {})
    return task
}

/**
 * Resuelve módulos para un recurso/workspace concreto sin contaminar el cache global.
 * La ficha puede pertenecer a otro pool distinto del workspace preferido del switcher.
 */
export async function getWorkspaceEntitlements(workspace: ClientActionWorkspace): Promise<MobileConfig> {
    const raw = await apiFetch<RawMobileConfig>(configPath(workspace), { authenticated: true })
    return normalizeConfig(raw)
}

// --- Flag `nutritionV2Coach` resuelto POR alumno (canary por alumno) --------------------------------
// El flag global del coach (canary por coach / mode on) sigue prendiendo V2 sin esta consulta; esto
// solo cubre el caso "canary acotado SOLO por alumno", invisible al flag global. Cache corta memoria +
// disco por workspace+alumno para no repegar en cada montaje de ficha/constructor.

type ClientFlagEntry = { value: boolean; fetchedAt: number }
const clientFlagMemory = new Map<string, ClientFlagEntry>()

function clientFlagKey(workspace: ClientActionWorkspace | null, clientId: string): string {
    const w = workspace ? `${workspace.kind}:${workspace.teamId ?? '-'}:${workspace.orgId ?? '-'}` : 'none'
    return `${w}:${clientId}`
}

function isClientFlagFresh(entry: ClientFlagEntry | undefined, now: number): entry is ClientFlagEntry {
    return !!entry && now - entry.fetchedAt <= CLIENT_FLAG_TTL_MS
}

async function readClientFlagFromDisk(key: string, now: number): Promise<boolean | null> {
    try {
        const raw = await AsyncStorage.getItem(`${CLIENT_FLAG_PREFIX}:${key}`)
        if (!raw) return null
        const entry = JSON.parse(raw) as Partial<ClientFlagEntry>
        if (typeof entry.value !== 'boolean' || typeof entry.fetchedAt !== 'number') return null
        if (!isClientFlagFresh(entry as ClientFlagEntry, now)) return null
        clientFlagMemory.set(key, entry as ClientFlagEntry)
        return entry.value
    } catch {
        return null
    }
}

async function clearClientFlagDisk(): Promise<void> {
    try {
        const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`${CLIENT_FLAG_PREFIX}:`))
        if (keys.length) await AsyncStorage.multiRemove(keys)
    } catch {
        /* best-effort */
    }
}

/**
 * Resuelve `nutritionV2Coach` CON el clientId de la ruta pegando a /api/mobile/config?clientId=…, para
 * que un canary acotado por alumno alcance la ficha/constructor del coach en mobile. Fail-closed: sin
 * sesion, sin clientId o ante fallo => `false` (la pantalla cae al flag global por OR). TTL corto en
 * memoria + disco, key plegada por workspace+alumno.
 */
export async function fetchNutritionV2CoachFlagForClient(clientId: string): Promise<boolean> {
    if (!clientId) return false
    const now = Date.now()
    if (!(await hasSession())) return false
    const workspace = await resolveActiveCoachWorkspace()
    const key = clientFlagKey(workspace, clientId)

    const memo = clientFlagMemory.get(key)
    if (isClientFlagFresh(memo, now)) return memo.value
    const disk = await readClientFlagFromDisk(key, now)
    if (disk !== null) return disk

    try {
        const raw = await apiFetch<RawMobileConfig>(configPath(workspace, clientId), { authenticated: true })
        const value = normalizeConfig(raw).flags.nutritionV2Coach === true
        const entry: ClientFlagEntry = { value, fetchedAt: now }
        clientFlagMemory.set(key, entry)
        void AsyncStorage.setItem(`${CLIENT_FLAG_PREFIX}:${key}`, JSON.stringify(entry)).catch(() => {})
        return value
    } catch {
        return false
    }
}

/**
 * Hook para ficha/constructor/summary del coach: `true` si el rollout `nutritionV2Coach` aplica a ESTE
 * alumno. Default `false` hasta resolver / ante fallo; la pantalla lo combina por OR con el flag global
 * (que sigue prendiendo V2 sin esperar esta consulta).
 */
export function useNutritionV2CoachFlagForClient(clientId: string | null | undefined): boolean {
    const [enabled, setEnabled] = useState(false)
    useEffect(() => {
        if (!clientId) {
            setEnabled(false)
            return
        }
        let active = true
        void fetchNutritionV2CoachFlagForClient(clientId).then((value) => {
            if (active) setEnabled(value)
        })
        return () => {
            active = false
        }
    }, [clientId])
    return enabled
}

async function bootstrap(): Promise<void> {
    await hydrateFromCache()
    await refreshEntitlements()
}

/** Limpia la config (logout). El proximo login re-hidrata/revalida. */
export function resetEntitlements(): void {
    hydratedFromCache = false
    resetVersion += 1
    clientFlagMemory.clear()
    void clearClientFlagDisk()
    clearRemoteFlags()
    setState({ config: DEFAULT_CONFIG, ready: false, loading: false })
    void AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
}

function wireGlobalListeners(): void {
    if (globalListenersWired) return
    globalListenersWired = true
    // Revalidar al volver a foreground (stale-while-revalidate).
    AppState.addEventListener('change', (s: AppStateStatus) => {
        if (s === 'active' && listeners.size > 0) void refreshEntitlements()
    })
    // Reaccionar a login/logout/refresh de token.
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            resetEntitlements()
            return
        }
        void refreshEntitlements()
    })
}

export interface EntitlementsValue {
    /** `true` hasta la primera resolucion (cache o red). */
    loading: boolean
    /** `true` si se resolvio al menos una vez. */
    ready: boolean
    /** Modulos de pago EFECTIVOS (post kill-switch) del scope del usuario. */
    enabledModules: Set<ModuleKey>
    /** Master switch del dominio Nutricion (gate del tab del alumno). Fail-open => true. */
    nutritionEnabled: boolean
    /** ¿El modulo `key` esta habilitado para este usuario? */
    hasModule: (key: ModuleKey) => boolean
    /**
     * ¿Es visible la seccion `key` de Nutricion? (notas/compras/plato/off-plan/recetas/…). Espejo
     * de `sectionFlags` de web, fail-OPEN: ausente/`true` => visible; solo `false` explicito oculta.
     */
    isNutritionSectionEnabled: (key: NutritionSectionKey) => boolean
    /** Fuerza una revalidacion (pull-to-refresh, reintento manual). */
    refresh: () => Promise<void>
}

/**
 * Hook app-wide de entitlements. En el primer render devuelve DEFAULT_CONFIG (fail-open:
 * 0 modulos, nutricion visible) y dispara la hidratacion + revalidacion; re-renderiza cuando el
 * store cambia. No requiere Provider.
 */
export function useEntitlements(): EntitlementsValue {
    const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return {
        loading: s.loading,
        ready: s.ready,
        enabledModules: resolveEffectiveModules(s.config),
        nutritionEnabled: s.config.featurePrefs.nutritionEnabled,
        hasModule: (key) => hasModuleIn(s.config, key),
        isNutritionSectionEnabled: (key) => isNutritionSectionVisibleIn(s.config, key),
        refresh: refreshEntitlements,
    }
}
