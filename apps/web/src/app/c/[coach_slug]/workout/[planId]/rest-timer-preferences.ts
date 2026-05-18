'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TimerSound } from '@/lib/audioUtils'

/** localStorage: sonido de la alarma al terminar el descanso */
export const REST_TIMER_SOUND_KEY = 'restTimerSound'
/** localStorage: volumen 0–1 */
export const REST_TIMER_VOLUME_KEY = 'restTimerVolume'
/** localStorage: auto-iniciar cronómetro al guardar serie (gestionado en WorkoutExecutionClient) */
export const OMNIAUTOTIMER_KEY = 'omni_autotimer'

const VALID_SOUNDS: TimerSound[] = ['digital', 'bell', 'classic', 'boxing']

function parseSound(raw: string | null): TimerSound {
  if (raw && VALID_SOUNDS.includes(raw as TimerSound)) return raw as TimerSound
  return 'digital'
}

export function readRestTimerSound(): TimerSound {
  if (typeof window === 'undefined') return 'digital'
  return parseSound(localStorage.getItem(REST_TIMER_SOUND_KEY))
}

export function readRestTimerVolume(): number {
  if (typeof window === 'undefined') return 1
  const raw = localStorage.getItem(REST_TIMER_VOLUME_KEY)
  if (raw === null) return 1
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return 1
  return Math.max(0, Math.min(1, n))
}

export function writeRestTimerSound(sound: TimerSound) {
  if (typeof window === 'undefined') return
  localStorage.setItem(REST_TIMER_SOUND_KEY, sound)
  window.dispatchEvent(new CustomEvent('rest-timer-prefs-changed'))
}

export function writeRestTimerVolume(volume: number) {
  if (typeof window === 'undefined') return
  const v = Math.max(0, Math.min(1, volume))
  localStorage.setItem(REST_TIMER_VOLUME_KEY, String(v))
  window.dispatchEvent(new CustomEvent('rest-timer-prefs-changed'))
}

/** Estado de sonido/volumen para el panel de ajustes; sincroniza con otras pestañas vía `storage`. */
export function useRestTimerPreferences() {
  const [sound, setSound] = useState<TimerSound>('digital')
  const [volume, setVolume] = useState(1)

  const refreshFromStorage = useCallback(() => {
    setSound(readRestTimerSound())
    setVolume(readRestTimerVolume())
  }, [])

  useEffect(() => {
    refreshFromStorage()
    const onStorage = (e: StorageEvent) => {
      if (e.key === REST_TIMER_SOUND_KEY || e.key === REST_TIMER_VOLUME_KEY) {
        refreshFromStorage()
      }
    }
    const onCustom = () => refreshFromStorage()
    window.addEventListener('storage', onStorage)
    window.addEventListener('rest-timer-prefs-changed', onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('rest-timer-prefs-changed', onCustom)
    }
  }, [refreshFromStorage])

  const setSoundPersist = useCallback((next: TimerSound) => {
    setSound(next)
    writeRestTimerSound(next)
  }, [])

  const setVolumePersist = useCallback((next: number) => {
    const v = Math.max(0, Math.min(1, next))
    setVolume(v)
    writeRestTimerVolume(v)
  }, [])

  return { sound, volume, setSoundPersist, setVolumePersist, refreshFromStorage }
}
