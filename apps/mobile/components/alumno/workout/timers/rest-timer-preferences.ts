/**
 * Preferencias del descanso/alarma (RN) — espejo de la web
 * `c/[coach_slug]/workout/[planId]/rest-timer-preferences.ts`.
 *
 * Diferencia de plataforma: en web `localStorage` es SÍNCRONO; en RN
 * `AsyncStorage` es asíncrono. Los timers leen la preferencia en callbacks de
 * cuenta regresiva (por-segundo) donde no se puede `await`, así que mantenemos
 * un cache EN MEMORIA hidratado una sola vez (`hydrateRestTimerPrefs`, llamado
 * por el provider al montar) y expuesto por getters SÍNCRONOS. Las escrituras
 * actualizan el cache al instante y persisten en background.
 *
 * Default = comportamiento web: sonido ON (`muted=false`), sonido `digital`,
 * volumen 1. El sonido real está gateado por esta preferencia (ver `sound.ts`);
 * la háptica NO se silencia (canal primario en móvil).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

/** Tipo de alarma — espejo exacto de `TimerSound` (web `lib/audioUtils.ts`). */
export type TimerSound = 'digital' | 'bell' | 'classic' | 'boxing'

const MUTED_KEY = 'restTimerMuted'
const SOUND_KEY = 'restTimerSound'
const VOLUME_KEY = 'restTimerVolume'
/** Auto-iniciar el descanso al guardar la serie (device-scoped, opt-in). */
export const OMNI_AUTOTIMER_KEY = 'omni_autotimer'

const VALID_SOUNDS: TimerSound[] = ['digital', 'bell', 'classic', 'boxing']

interface PrefsCache {
  muted: boolean
  sound: TimerSound
  volume: number
  /** Auto-iniciar el descanso al guardar la serie. Default ON (espejo web). */
  autoTimer: boolean
}

// Default = web (sonido ON, cronómetro automático ON). El cache se sobreescribe tras hidratar.
const cache: PrefsCache = { muted: false, sound: 'digital', volume: 1, autoTimer: true }
let hydrated = false

type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

/** Suscripción a cambios de preferencia (panel de ajustes ↔ barra de descanso). */
export function subscribeRestTimerPrefs(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Hidrata el cache desde AsyncStorage. Idempotente y a prueba de fallos: si
 * AsyncStorage falla, quedan los defaults web. Llamar UNA vez al montar el
 * provider (no bloquea el arranque — el default es usable de inmediato).
 */
export async function hydrateRestTimerPrefs(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const [muted, sound, volume, autoTimer] = await Promise.all([
      AsyncStorage.getItem(MUTED_KEY),
      AsyncStorage.getItem(SOUND_KEY),
      AsyncStorage.getItem(VOLUME_KEY),
      AsyncStorage.getItem(OMNI_AUTOTIMER_KEY),
    ])
    if (muted != null) cache.muted = muted === '1'
    if (sound != null && VALID_SOUNDS.includes(sound as TimerSound)) cache.sound = sound as TimerSound
    if (volume != null) {
      const n = parseFloat(volume)
      if (!Number.isNaN(n)) cache.volume = Math.max(0, Math.min(1, n))
    }
    // Web persiste String(bool); default ON → solo 'false' explícito lo apaga.
    if (autoTimer != null) cache.autoTimer = autoTimer !== 'false'
    emit()
  } catch {
    // Sin persistencia → defaults web. Nunca lanza.
  }
}

export function isRestTimerMuted(): boolean {
  return cache.muted
}

export function getRestTimerSound(): TimerSound {
  return cache.sound
}

export function getRestTimerVolume(): number {
  return cache.volume
}

export function setRestTimerMuted(muted: boolean): void {
  cache.muted = muted
  emit()
  void AsyncStorage.setItem(MUTED_KEY, muted ? '1' : '0').catch(() => {})
}

export function setRestTimerSound(sound: TimerSound): void {
  if (!VALID_SOUNDS.includes(sound)) return
  cache.sound = sound
  emit()
  void AsyncStorage.setItem(SOUND_KEY, sound).catch(() => {})
}

export function setRestTimerVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, volume))
  cache.volume = v
  emit()
  void AsyncStorage.setItem(VOLUME_KEY, String(v)).catch(() => {})
}

/** Auto-iniciar el descanso al guardar la serie (device-scoped, default ON). */
export function isRestAutoTimerEnabled(): boolean {
  return cache.autoTimer
}

export function setRestAutoTimerEnabled(enabled: boolean): void {
  cache.autoTimer = enabled
  emit()
  void AsyncStorage.setItem(OMNI_AUTOTIMER_KEY, String(enabled)).catch(() => {})
}
