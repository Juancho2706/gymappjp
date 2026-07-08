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
import { useSyncExternalStore } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { apiFetch } from './api'
import { setRemoteFlags, clearRemoteFlags } from './flags'
import {
    DEFAULT_CONFIG,
    hasModuleIn,
    normalizeConfig,
    parseCachedConfig,
    resolveEffectiveModules,
    serializeConfig,
    type MobileConfig,
    type ModuleKey,
    type RawMobileConfig,
} from './entitlements-core'

const CACHE_KEY = 'eva_entitlements_config'

interface StoreState {
    config: MobileConfig
    /** `true` hasta la primera resolucion (cache o red). */
    loading: boolean
    /** `true` si se hidrato al menos una vez (cache o red). */
    ready: boolean
}

let state: StoreState = { config: DEFAULT_CONFIG, loading: true, ready: false }
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

async function hydrateFromCache(): Promise<void> {
    if (hydratedFromCache) return
    hydratedFromCache = true
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY)
        if (!raw) return
        const cached = parseCachedConfig(raw)
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

/**
 * Revalida contra /api/mobile/config. Deduplicado por `inFlight`. Solo con sesion (sin ella no
 * pega al endpoint para no gatillar el 401 -> signOut del bridge). Ante fallo de red conserva la
 * cache y solo sale de `loading`.
 */
export function refreshEntitlements(): Promise<void> {
    if (inFlight) return inFlight
    inFlight = (async () => {
        try {
            if (!(await hasSession())) {
                setState({ loading: false })
                return
            }
            const raw = await apiFetch<RawMobileConfig>('/api/mobile/config', { authenticated: true })
            const config = normalizeConfig(raw)
            setRemoteFlags(config.flags)
            setState({ config, ready: true, loading: false })
            try {
                await AsyncStorage.setItem(CACHE_KEY, serializeConfig(config))
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
    await refreshEntitlements()
}

/** Limpia la config (logout). El proximo login re-hidrata/revalida. */
export function resetEntitlements(): void {
    hydratedFromCache = false
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
        refresh: refreshEntitlements,
    }
}
