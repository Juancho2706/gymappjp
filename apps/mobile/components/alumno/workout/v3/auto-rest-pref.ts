/**
 * Preferencia D5 «Pasar solo al descanso» — carril RN por ALUMNO
 * (specs/cuenta-atras-en-pantalla, W5.1 · R1 / R25 / R32 / R36).
 *
 * La preferencia YA existía con otro nombre (`omni_autotimer`, «Cronómetro automático»,
 * `timers/rest-timer-preferences.ts`) y era **device-scoped con default ON**. Este módulo la
 * re-encuadra: misma semántica, ahora **namespaceada por `clientId`** —el id va EN LA CLAVE, que es
 * lo que hace imposible leer la preferencia del otro alumno en el mismo teléfono (lección del bug de
 * marca cruzada tras el logout, `apps/mobile/lib/branding.ts`)— y con el default resuelto por cohorte
 * en el motor (`@eva/workout-engine/auto-rest-pref`).
 *
 * Patrón calcado de `v3/exec-settings.ts` y de `timers/rest-timer-preferences.ts`: **caché en
 * memoria + hidratación única + escritura optimista + `useSyncExternalStore`**. No es cosmética:
 * `readAutoRestPref` corre en la decisión de descanso de `ExecutorV3`, que es **SÍNCRONA y previa al
 * `await` de red** («QA: flash de la próxima serie»). Un lector asíncrono metería un `await` justo
 * ahí y traería de vuelta ese bug (R36).
 *
 * **Qué guarda la caché y qué no.** Guarda los valores CRUDOS del disco (`storedNew`, `storedLegacy`,
 * `seen`), no el booleano final. La cohorte se resuelve en cada lectura con
 * `resolveAutoRestDefault`, porque `hasHistory` es **`!showModal`** (F5) y `showModal` a su vez
 * depende de `seen`, que vive en disco: resolver el booleano dentro de la hidratación exigiría
 * conocer el resultado del modal antes de haber leído el disco. Resolver al leer corta ese nudo y
 * deja la firma del SDD intacta (`readAutoRestPref({clientId, hasHistory})`).
 *
 * Reglas duras del contrato:
 *  · **Sin hidratar ⇒ comportamiento de hoy (ON) y NO se escribe nada.** Una lectura pre-hidratación
 *    jamás pisa lo guardado.
 *  · **`clientId` nulo o no-uuid ⇒ carril legacy** (`omni_autotimer` vía `isRestAutoTimerEnabled` /
 *    `setRestAutoTimerEnabled`): se **lee y se escribe** esa clave, exactamente como hoy, y **cero**
 *    accesos a las claves nuevas (R32). No leerla pisaría con ON el OFF que ese dispositivo ya eligió.
 *  · **`resetAutoRestPref()` al cambiar de `clientId` y en `SIGNED_OUT`** (lo llama el janitor de
 *    `lib/auth-actions.ts`, el mismo sitio donde se limpia la caché por-usuario del saliente).
 */
import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
    AUTOREST_DEFAULT_STRATEGY,
    isUsableAutoRestClientId,
    resolveAutoRestDefault,
} from '@eva/workout-engine'
import { isRestAutoTimerEnabled, setRestAutoTimerEnabled, subscribeRestTimerPrefs } from '../timers'
// `OMNI_AUTOTIMER_KEY` no sale por el barrel de `timers` (sólo los getters/setters), y acá hace falta
// la clave cruda para la MIGRACIÓN DE LECTURA del paso 2 de `resolveAutoRestDefault`.
import { OMNI_AUTOTIMER_KEY } from '../timers/rest-timer-preferences'

// Re-export para que las dos plataformas compartan la MISMA constante y el toggle Q1 siga costando
// una línea en `packages/workout-engine/auto-rest-pref.ts` (R25).
export { AUTOREST_DEFAULT_STRATEGY }

/** Prefijo de la preferencia por alumno. Espejo EXACTO del carril web (test de paridad W5.T3). */
export const AUTOREST_PREF_KEY_PREFIX = 'eva:exec-autorest-v1:'
/** Prefijo de la marca «ya vio el modal». Espejo EXACTO del carril web. */
export const AUTOREST_SEEN_KEY_PREFIX = 'eva:exec-autorest-seen-v1:'

/** `eva:exec-autorest-v1:<clientId>`. */
export function autoRestPrefKey(clientId: string): string {
    return `${AUTOREST_PREF_KEY_PREFIX}${clientId}`
}
/** `eva:exec-autorest-seen-v1:<clientId>`. */
export function autoRestSeenKey(clientId: string): string {
    return `${AUTOREST_SEEN_KEY_PREFIX}${clientId}`
}

interface AutoRestCache {
    /** Alumno cuyos valores están en la caché. `null` = todavía nadie (o se reseteó). */
    clientId: string | null
    /** `true` cuando la lectura de disco de ESTE `clientId` terminó. Antes vale el default de hoy. */
    ready: boolean
    /** Valor crudo de `eva:exec-autorest-v1:<clientId>` (`'1'`/`'0'`), o `null`. */
    storedNew: string | null
    /** Valor crudo de `omni_autotimer` (`String(boolean)`), o `null`. Migración de lectura. */
    storedLegacy: string | null
    /** El alumno ya respondió (o cerró) el modal de una sola vez. */
    seen: boolean
}

const cache: AutoRestCache = { clientId: null, ready: false, storedNew: null, storedLegacy: null, seen: false }
/** Hidratación en vuelo por `clientId` (idempotencia: dos montajes no disparan dos lecturas). */
let hydrating: Promise<void> | null = null

type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
    listeners.forEach((l) => l())
}

/**
 * Suscripción imperativa a cambios de la preferencia (tuerca ↔ ejecutor ↔ modal). Cubre TAMBIÉN el
 * carril legacy: con `clientId` nulo la verdad vive en `rest-timer-preferences`, y un cambio hecho
 * desde el card del perfil o la barra del cronómetro tiene que re-renderizar igual.
 */
export function subscribeAutoRestPref(fn: Listener): () => void {
    listeners.add(fn)
    const offLegacy = subscribeRestTimerPrefs(fn)
    return () => {
        listeners.delete(fn)
        offLegacy()
    }
}

/**
 * Limpia la caché en memoria. Se llama al cambiar de `clientId` y en `SIGNED_OUT`
 * (`lib/auth-actions.ts`). Las claves en disco NO se tocan: están namespaceadas por alumno y son
 * justamente lo que hay que conservar.
 */
export function resetAutoRestPref(): void {
    cache.clientId = null
    cache.ready = false
    cache.storedNew = null
    cache.storedLegacy = null
    cache.seen = false
    hydrating = null
    emit()
}

/**
 * Hidrata la caché para `clientId` desde AsyncStorage. **Idempotente por `clientId`**: dos llamadas
 * con el mismo alumno comparten la misma promesa; con un alumno distinto resetea y vuelve a leer.
 * Nunca lanza — sin persistencia queda el comportamiento de hoy (ON) y no se escribe nada.
 */
export function hydrateAutoRestPref(input: { clientId: string | null }): Promise<void> {
    const { clientId } = input
    // R32: sin id usable no hay clave nueva que hidratar — manda `rest-timer-preferences` (legacy).
    if (!isUsableAutoRestClientId(clientId)) {
        if (cache.clientId != null) resetAutoRestPref()
        return Promise.resolve()
    }
    if (cache.clientId === clientId && hydrating) return hydrating
    if (cache.clientId !== clientId) resetAutoRestPref()
    cache.clientId = clientId
    hydrating = (async () => {
        try {
            const [storedNew, seenRaw, storedLegacy] = await Promise.all([
                AsyncStorage.getItem(autoRestPrefKey(clientId)),
                AsyncStorage.getItem(autoRestSeenKey(clientId)),
                AsyncStorage.getItem(OMNI_AUTOTIMER_KEY),
            ])
            // Carrera real: el alumno pudo cerrar sesión (o cambiar de cuenta) mientras leíamos.
            if (cache.clientId !== clientId) return
            // Una escritura optimista pudo ganarle a la lectura (el alumno movió el switch antes de
            // que el disco respondiera): en ese caso lo del disco es viejo y NO puede pisarla.
            if (cache.storedNew == null) cache.storedNew = storedNew
            cache.storedLegacy = storedLegacy
            cache.seen = cache.seen || seenRaw === '1'
            cache.ready = true
            emit()
        } catch {
            // AsyncStorage roto ⇒ fail-safe: queda el comportamiento de hoy y NO se escribe nada.
            if (cache.clientId !== clientId) return
            cache.ready = true
            emit()
        }
    })()
    return hydrating
}

/** ¿La caché ya refleja el disco para este alumno? Sin esto, `readAutoRestPref` devuelve el default. */
export function isAutoRestPrefReady(clientId: string | null): boolean {
    // Carril legacy: el cache de `rest-timer-preferences` lo hidrata el provider al montar.
    if (!isUsableAutoRestClientId(clientId)) return true
    return cache.ready && cache.clientId === clientId
}

/**
 * Lectura efectiva **SÍNCRONA** (R36). Sin `clientId` usable cae al carril legacy por dispositivo;
 * sin hidratar devuelve el comportamiento de hoy (ON) sin tocar nada.
 *
 * `hasHistory` es **siempre `!showModal`** (F5): lo resuelve el orquestador con
 * `resolveShowAutoRestModal` y lo baja acá. Ninguna superficie lo deriva por su cuenta.
 */
export function readAutoRestPref(input: { clientId: string | null; hasHistory: boolean }): boolean {
    if (!isUsableAutoRestClientId(input.clientId)) return isRestAutoTimerEnabled()
    if (cache.clientId !== input.clientId || !cache.ready) return true
    return resolveAutoRestDefault({
        storedNew: cache.storedNew,
        storedLegacy: cache.storedLegacy,
        hasHistory: input.hasHistory,
        storageAvailable: true,
        strategy: AUTOREST_DEFAULT_STRATEGY,
    }).enabled
}

/**
 * Escritura **optimista**: pisa la caché y emite en el mismo tick; la persistencia va después y si
 * falla no revierte la UI. Sin `clientId` usable escribe `omni_autotimer` (R32) y **no crea ninguna
 * clave nueva**.
 */
export function writeAutoRestPref(input: { clientId: string | null; enabled: boolean }): void {
    if (!isUsableAutoRestClientId(input.clientId)) {
        setRestAutoTimerEnabled(input.enabled)
        emit()
        return
    }
    const clientId = input.clientId
    if (cache.clientId !== clientId) {
        // Escribir para otro alumno sin haber hidratado sería pisar a ciegas: se adopta el alumno.
        resetAutoRestPref()
        cache.clientId = clientId
    }
    cache.storedNew = input.enabled ? '1' : '0'
    cache.ready = true
    emit()
    void AsyncStorage.setItem(autoRestPrefKey(clientId), input.enabled ? '1' : '0').catch(() => {})
}

/** ¿El alumno ya vio (y respondió/cerró) el modal? Sin id usable ⇒ `true` (nunca se muestra). */
export function hasSeenAutoRestModal(clientId: string | null): boolean {
    if (!isUsableAutoRestClientId(clientId)) return true
    if (cache.clientId !== clientId || !cache.ready) return true
    return cache.seen
}

/** Marca «visto». Se escribe al RESPONDER (o al cerrar sin responder), nunca al mostrarse. */
export function markAutoRestSeen(clientId: string | null): void {
    if (!isUsableAutoRestClientId(clientId)) return
    if (cache.clientId !== clientId) return
    cache.seen = true
    emit()
    void AsyncStorage.setItem(autoRestSeenKey(clientId), '1').catch(() => {})
}

/**
 * Hook reactivo: la tuerca y las pantallas leen de acá para que mover el switch pegue en la **serie
 * siguiente sin recargar** (W5.T5(b)). Hidrata al montar si hace falta.
 */
export function useAutoRestPref(clientId: string | null, hasHistory: boolean): boolean {
    if (isUsableAutoRestClientId(clientId)) void hydrateAutoRestPref({ clientId })
    // `getSnapshot` devuelve un BOOLEANO: `useSyncExternalStore` compara primitivos, así que no hace
    // falta memoizar nada. Cada `emit()` (hidratación, escritura optimista, carril legacy) despierta
    // al hook y la comparación decide si re-renderiza.
    return useSyncExternalStore(subscribeAutoRestPref, () => readAutoRestPref({ clientId, hasHistory }))
}
