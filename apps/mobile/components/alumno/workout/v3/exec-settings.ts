/**
 * Preferencias del ejecutor V3 device-scoped (E3.7 — la tuerca). Cubre los ajustes FUNCIONALES que no
 * viven ya en `rest-timer-preferences` (que maneja mute/tono/volumen/vibracion del cronometro):
 *   · keepAwake        — mantener la pantalla encendida durante la sesion (default ON).
 *   · showRpeRir       — mostrar las pills RPE/RIR en la pantalla de fuerza (default ON).
 *   · celebrationSounds — sonidos de celebracion (Ola 4). Default OFF (decision CEO: todo OFF salvo el
 *                         cronometro). Se persiste ya para que Ola 4 lo consuma sin migracion.
 *
 * Mismo patron que `wheel-hint` / `keypad-step-preference`: `AsyncStorage` es asincrono pero la UI
 * necesita el valor en el render, asi que se mantiene un cache en memoria hidratado una sola vez y
 * expuesto por `useSyncExternalStore`. Las escrituras marcan el cache al instante y persisten en
 * background (best-effort; si falla, quedan los defaults). Carril `eva:exec-settings-v1`.
 */
import { useCallback, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEEP_AWAKE_KEY = 'eva:exec-keepawake-v1'
const SHOW_RPE_RIR_KEY = 'eva:exec-showrpe-v1'
const CELEBRATION_SOUNDS_KEY = 'eva:exec-celebsound-v1'

export interface ExecSettings {
  keepAwake: boolean
  showRpeRir: boolean
  celebrationSounds: boolean
}

// Defaults (decision CEO): pantalla encendida ON, RPE/RIR visibles ON, sonidos de celebracion OFF.
const cache: ExecSettings = { keepAwake: true, showRpeRir: true, celebrationSounds: false }
let hydrated = false
const listeners = new Set<() => void>()

// Snapshot inmutable para useSyncExternalStore (nueva referencia SOLO al cambiar → evita loops).
let snapshot: ExecSettings = { ...cache }
function refreshSnapshot() {
  snapshot = { ...cache }
}

function emit() {
  refreshSnapshot()
  listeners.forEach((l) => l())
}

/** Hidrata el cache una sola vez desde AsyncStorage. Idempotente; nunca lanza. */
function hydrate(): void {
  if (hydrated) return
  hydrated = true
  void (async () => {
    try {
      const [keepAwake, showRpeRir, celeb] = await Promise.all([
        AsyncStorage.getItem(KEEP_AWAKE_KEY),
        AsyncStorage.getItem(SHOW_RPE_RIR_KEY),
        AsyncStorage.getItem(CELEBRATION_SOUNDS_KEY),
      ])
      // Defaults ON → solo '0' explicito los apaga; celebracion default OFF → solo '1' la enciende.
      if (keepAwake != null) cache.keepAwake = keepAwake !== '0'
      if (showRpeRir != null) cache.showRpeRir = showRpeRir !== '0'
      if (celeb != null) cache.celebrationSounds = celeb === '1'
      emit()
    } catch {
      // Sin persistencia → defaults. Nunca lanza.
    }
  })()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function getSnapshot(): ExecSettings {
  return snapshot
}

export function setKeepAwake(enabled: boolean): void {
  cache.keepAwake = enabled
  emit()
  void AsyncStorage.setItem(KEEP_AWAKE_KEY, enabled ? '1' : '0').catch(() => {})
}

export function setShowRpeRir(enabled: boolean): void {
  cache.showRpeRir = enabled
  emit()
  void AsyncStorage.setItem(SHOW_RPE_RIR_KEY, enabled ? '1' : '0').catch(() => {})
}

export function setCelebrationSounds(enabled: boolean): void {
  cache.celebrationSounds = enabled
  emit()
  void AsyncStorage.setItem(CELEBRATION_SOUNDS_KEY, enabled ? '1' : '0').catch(() => {})
}

/** Hook: preferencias del ejecutor V3. Hidrata al montar y re-renderiza al cambiar. */
export function useExecSettings(): ExecSettings {
  hydrate()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Lectura puntual sincrona (para efectos que no quieren re-render). */
export function getExecSettings(): ExecSettings {
  hydrate()
  return snapshot
}

/** Suscripcion imperativa (para efectos que reaccionan sin renderizar). */
export function subscribeExecSettings(fn: () => void): () => void {
  hydrate()
  return subscribe(fn)
}

/** Setters agrupados para consumo desde la tuerca. */
export const execSettingsActions = { setKeepAwake, setShowRpeRir, setCelebrationSounds }

/** Hook util: un setter memoizado por clave (evita recrear closures en la tuerca). */
export function useExecSettingsSetter() {
  return useCallback((key: keyof ExecSettings, value: boolean) => {
    if (key === 'keepAwake') setKeepAwake(value)
    else if (key === 'showRpeRir') setShowRpeRir(value)
    else if (key === 'celebrationSounds') setCelebrationSounds(value)
  }, [])
}
