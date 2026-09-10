'use client'

/**
 * Preferencia D5 «Pasar solo al descanso» — carril WEB por ALUMNO
 * (specs/cuenta-atras-en-pantalla, W5.1 · R1 / R25 / R32).
 *
 * **Paridad exacta con RN** (`apps/mobile/components/alumno/workout/v3/auto-rest-pref.ts`): mismas
 * claves, misma codificación `'1'`/`'0'`, mismo resolver de cohorte del motor. El test W5.T3 importa
 * las constantes de las DOS plataformas y las compara: si alguien renombra una clave de un lado, ese
 * test se pone rojo antes de que un alumno pierda su preferencia al cambiar de dispositivo.
 *
 * En web `localStorage` es SÍNCRONO, así que no hace falta caché ni hidratación: se lee directo, como
 * ya hace `v3/exec-settings.ts`. Lo que sí se copia de ahí es el evento `exec-settings-changed`, que
 * mantiene la tuerca y la sesión sincronizadas sin recargar.
 *
 * **La verdad vive en `WorkoutExecutionClient`**, nunca en `LogSetForm`: el orquestador mantiene el
 * estado y lo baja como prop `autoTimerEnabled`. Sin eso habría una lectura de storage por fila
 * montada y dos fuentes de verdad en la misma pantalla.
 *
 * **`clientId` nulo (R32)**: `getClientRootUser()` es nullable y `page.tsx` lo contempla. Sin id con
 * qué namespacear, la preferencia cae al carril legacy por dispositivo `omni_autotimer` —que se
 * **lee y se escribe**, como hoy— sin crear ninguna clave nueva, y el modal no se muestra.
 */
import {
    AUTOREST_DEFAULT_STRATEGY,
    isUsableAutoRestClientId,
    resolveAutoRestDefault,
} from '@eva/workout-engine'
import { EXEC_SETTINGS_EVENT } from './exec-settings'

// Re-export: UNA sola constante para las dos plataformas (R25).
export { AUTOREST_DEFAULT_STRATEGY }

/** Prefijo de la preferencia por alumno. Espejo EXACTO del carril RN. */
export const AUTOREST_PREF_KEY_PREFIX = 'eva:exec-autorest-v1:'
/** Prefijo de la marca «ya vio el modal». Espejo EXACTO del carril RN. */
export const AUTOREST_SEEN_KEY_PREFIX = 'eva:exec-autorest-seen-v1:'
/** Carril legacy device-scoped que este módulo migra por LECTURA (y que sigue mandando sin `clientId`). */
export const OMNI_AUTOTIMER_KEY = 'omni_autotimer'

/** `eva:exec-autorest-v1:<clientId>`. */
export function autoRestPrefKey(clientId: string): string {
    return `${AUTOREST_PREF_KEY_PREFIX}${clientId}`
}
/** `eva:exec-autorest-seen-v1:<clientId>`. */
export function autoRestSeenKey(clientId: string): string {
    return `${AUTOREST_SEEN_KEY_PREFIX}${clientId}`
}

/**
 * ¿`localStorage` está disponible? Modo privado de Safari, quota llena o storage bloqueado por
 * política lanzan al TOCARLO, no al leer `typeof window`. Alimenta `storageAvailable` del resolver
 * del modal (T8: sin storage no se pregunta, porque no se podría guardar la respuesta).
 */
export function isAutoRestStorageAvailable(): boolean {
    if (typeof window === 'undefined') return false
    try {
        const probe = '__eva_autorest_probe__'
        window.localStorage.setItem(probe, '1')
        window.localStorage.removeItem(probe)
        return true
    } catch {
        return false
    }
}

function readRaw(key: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeRaw(key: string, value: string): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // Modo privado / quota: la UI ya se movió (escritura optimista); no se revierte.
    }
    try {
        window.dispatchEvent(new CustomEvent(EXEC_SETTINGS_EVENT))
    } catch {
        // Entornos sin CustomEvent (tests node): la escritura igual ocurrió.
    }
}

/**
 * Lectura efectiva de la preferencia. `hasHistory` es **siempre `!showModal`** (F5): lo resuelve el
 * orquestador con `resolveShowAutoRestModal` y lo baja acá.
 */
export function readAutoRestPref(input: { clientId: string | null; hasHistory: boolean }): boolean {
    const storageAvailable = isAutoRestStorageAvailable()
    if (!isUsableAutoRestClientId(input.clientId)) {
        // R32: carril legacy por dispositivo, LEÍDO — un OFF que el alumno ya eligió acá se respeta.
        return resolveAutoRestDefault({
            storedNew: null,
            storedLegacy: readRaw(OMNI_AUTOTIMER_KEY),
            hasHistory: input.hasHistory,
            storageAvailable,
            strategy: AUTOREST_DEFAULT_STRATEGY,
        }).enabled
    }
    return resolveAutoRestDefault({
        storedNew: readRaw(autoRestPrefKey(input.clientId)),
        storedLegacy: readRaw(OMNI_AUTOTIMER_KEY),
        hasHistory: input.hasHistory,
        storageAvailable,
        strategy: AUTOREST_DEFAULT_STRATEGY,
    }).enabled
}

/**
 * Escritura de la preferencia. Sin `clientId` usable escribe `omni_autotimer` con la codificación
 * histórica `String(boolean)` (R32) y **no crea ninguna clave nueva**.
 */
export function writeAutoRestPref(input: { clientId: string | null; enabled: boolean }): void {
    if (!isUsableAutoRestClientId(input.clientId)) {
        writeRaw(OMNI_AUTOTIMER_KEY, String(input.enabled))
        return
    }
    writeRaw(autoRestPrefKey(input.clientId), input.enabled ? '1' : '0')
}

/** ¿El alumno ya vio (y respondió/cerró) el modal? Sin id usable ⇒ `true` (nunca se muestra). */
export function hasSeenAutoRestModal(clientId: string | null): boolean {
    if (!isUsableAutoRestClientId(clientId)) return true
    return readRaw(autoRestSeenKey(clientId)) === '1'
}

/** Marca «visto». Se escribe al RESPONDER (o al cerrar sin responder), nunca al mostrarse. */
export function markAutoRestSeen(clientId: string | null): void {
    if (!isUsableAutoRestClientId(clientId)) return
    writeRaw(autoRestSeenKey(clientId), '1')
}
