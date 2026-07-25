'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Ejecutor V3 (E3.7) — preferencias de la tuerca del entrenamiento, device-scoped en localStorage
 * (mismo patrón que `rest-timer-preferences`). Estas prefs NO viajan al server: cada teléfono recuerda
 * las suyas. Decisión CEO 3: todo el audio de la app va OFF salvo el cronómetro del descanso.
 *
 * El sonido/tono/volumen del cronómetro NO viven aquí: reutilizan el carril existente del RestTimer
 * (`rest-timer-preferences`: mute/sound/volume). Aquí sólo viven las prefs nuevas de la tuerca:
 * vibración, celebraciones (default OFF), mantener pantalla encendida y mostrar RPE/RIR.
 *
 * Todos los writes emiten `exec-settings-changed` para que la sesión (y el RestTimer) reaccionen sin
 * recargar; también escuchamos `storage` para multi-pestaña.
 */

/** localStorage: háptico del descanso (beeps 3-2-1 + alarma final). default true ⇒ vibra (histórico). */
export const EXEC_VIBRATION_KEY = 'execVibration'
/** localStorage: sonidos de celebración (micro "+1 serie"). default false ⇒ OFF (decisión CEO 3). */
export const EXEC_CELEBRATIONS_KEY = 'execCelebrations'
/** localStorage: mantener la pantalla encendida durante el descanso (WakeLock). default true (histórico). */
export const EXEC_KEEP_AWAKE_KEY = 'execKeepAwake'
/** localStorage: mostrar la sección de esfuerzo RPE/RIR en fuerza. default true (histórico). */
export const EXEC_SHOW_EFFORT_KEY = 'execShowEffort'

/** Evento de sincronización (misma pestaña) de las prefs nuevas de la tuerca. */
export const EXEC_SETTINGS_EVENT = 'exec-settings-changed'

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === '1'
}

function writeBool(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, value ? '1' : '0')
  window.dispatchEvent(new CustomEvent(EXEC_SETTINGS_EVENT))
}

/** Háptico del descanso activado. Default true (comportamiento actual). */
export function readExecVibration(): boolean {
  return readBool(EXEC_VIBRATION_KEY, true)
}
export function writeExecVibration(on: boolean) {
  writeBool(EXEC_VIBRATION_KEY, on)
}

/** Sonidos de celebración. Default false ⇒ OFF (decisión CEO 3). */
export function readExecCelebrations(): boolean {
  return readBool(EXEC_CELEBRATIONS_KEY, false)
}
export function writeExecCelebrations(on: boolean) {
  writeBool(EXEC_CELEBRATIONS_KEY, on)
}

/** Mantener pantalla encendida (WakeLock del descanso). Default true (comportamiento actual). */
export function readExecKeepAwake(): boolean {
  return readBool(EXEC_KEEP_AWAKE_KEY, true)
}
export function writeExecKeepAwake(on: boolean) {
  writeBool(EXEC_KEEP_AWAKE_KEY, on)
}

/** Mostrar RPE/RIR en fuerza. Default true (comportamiento actual). */
export function readExecShowEffort(): boolean {
  return readBool(EXEC_SHOW_EFFORT_KEY, true)
}
export function writeExecShowEffort(on: boolean) {
  writeBool(EXEC_SHOW_EFFORT_KEY, on)
}

export interface ExecSettings {
  vibration: boolean
  celebrations: boolean
  keepAwake: boolean
  showEffort: boolean
}

/**
 * Estado reactivo de las prefs nuevas de la tuerca. Hidratación-safe: arranca en los defaults del
 * server y se sincroniza tras montar (evita mismatch SSR/cliente). Reacciona a `exec-settings-changed`
 * (misma pestaña) y `storage` (otras pestañas).
 */
export function useExecSettings(): ExecSettings & {
  setVibration: (on: boolean) => void
  setCelebrations: (on: boolean) => void
  setKeepAwake: (on: boolean) => void
  setShowEffort: (on: boolean) => void
} {
  const [settings, setSettings] = useState<ExecSettings>({
    vibration: true,
    celebrations: false,
    keepAwake: true,
    showEffort: true,
  })

  const refresh = useCallback(() => {
    setSettings({
      vibration: readExecVibration(),
      celebrations: readExecCelebrations(),
      keepAwake: readExecKeepAwake(),
      showEffort: readExecShowEffort(),
    })
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(EXEC_SETTINGS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EXEC_SETTINGS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  return {
    ...settings,
    setVibration: (on) => {
      setSettings((s) => ({ ...s, vibration: on }))
      writeExecVibration(on)
    },
    setCelebrations: (on) => {
      setSettings((s) => ({ ...s, celebrations: on }))
      writeExecCelebrations(on)
    },
    setKeepAwake: (on) => {
      setSettings((s) => ({ ...s, keepAwake: on }))
      writeExecKeepAwake(on)
    },
    setShowEffort: (on) => {
      setSettings((s) => ({ ...s, showEffort: on }))
      writeExecShowEffort(on)
    },
  }
}
