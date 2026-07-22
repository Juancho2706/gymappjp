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
/** Vibracion del cronometro (device-scoped). La tuerca V3 (E3.7) la controla; el motor la consume. */
const VIBRATION_KEY = 'restTimerVibration'
/**
 * Tono del SISTEMA (E5.2, solo Android). Cuando esta ON la alarma usa el alias estable
 * `content://settings/system/alarm_alert` en vez de un timbre del catalogo. Device-scoped, NO tiene
 * espejo web (es una capacidad nativa de Android): por eso vive en su propia clave y no en `SOUND_KEY`,
 * dejando intacto el espejo `restTimerSound` ↔ web. En iOS se ignora por completo (el guard esta en la
 * tuerca y en `sound.ts`). Si la reproduccion `content://` falla en runtime, `sound.ts` la apaga sola
 * (fallback al catalogo) llamando a `setRestTimerSystemTone(false)`.
 */
const SYSTEM_TONE_KEY = 'restTimerSystemTone'
/** Auto-iniciar el descanso al guardar la serie (device-scoped, opt-in). */
export const OMNI_AUTOTIMER_KEY = 'omni_autotimer'

const VALID_SOUNDS: TimerSound[] = ['digital', 'bell', 'classic', 'boxing']

interface PrefsCache {
  muted: boolean
  sound: TimerSound
  volume: number
  /** Auto-iniciar el descanso al guardar la serie. Default ON (espejo web). */
  autoTimer: boolean
  /** Vibracion del cronometro (alarma final + tick 3-2-1). Default ON. */
  vibration: boolean
  /** Tono del sistema (solo Android). Default OFF → usa el catalogo. */
  systemTone: boolean
}

// Default = web (sonido ON, cronómetro automático ON, vibracion ON, tono del sistema OFF). El cache se
// sobreescribe tras hidratar.
const cache: PrefsCache = { muted: false, sound: 'digital', volume: 1, autoTimer: true, vibration: true, systemTone: false }
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
    const [muted, sound, volume, autoTimer, vibration, systemTone] = await Promise.all([
      AsyncStorage.getItem(MUTED_KEY),
      AsyncStorage.getItem(SOUND_KEY),
      AsyncStorage.getItem(VOLUME_KEY),
      AsyncStorage.getItem(OMNI_AUTOTIMER_KEY),
      AsyncStorage.getItem(VIBRATION_KEY),
      AsyncStorage.getItem(SYSTEM_TONE_KEY),
    ])
    if (muted != null) cache.muted = muted === '1'
    if (sound != null && VALID_SOUNDS.includes(sound as TimerSound)) cache.sound = sound as TimerSound
    if (volume != null) {
      const n = parseFloat(volume)
      if (!Number.isNaN(n)) cache.volume = Math.max(0, Math.min(1, n))
    }
    // Web persiste String(bool); default ON → solo 'false' explícito lo apaga.
    if (autoTimer != null) cache.autoTimer = autoTimer !== 'false'
    // Vibracion default ON → solo '0' explícito la apaga.
    if (vibration != null) cache.vibration = vibration !== '0'
    // Tono del sistema default OFF → solo '1' explícito lo enciende.
    if (systemTone != null) cache.systemTone = systemTone === '1'
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
  // Elegir un timbre del catalogo implica NO usar el tono del sistema (Android): mantiene el invariante
  // en TODAS las superficies (tuerca V3 y card del perfil, que no conoce el tono del sistema) y su
  // persistencia. Sin esto, un usuario con tono del sistema ON que eligiera un timbre en el perfil
  // seguiria oyendo el del sistema. Persiste ambas claves para que el invariante sobreviva al reinicio.
  cache.systemTone = false
  emit()
  void AsyncStorage.setItem(SOUND_KEY, sound).catch(() => {})
  void AsyncStorage.setItem(SYSTEM_TONE_KEY, '0').catch(() => {})
}

export function setRestTimerVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, volume))
  cache.volume = v
  emit()
  void AsyncStorage.setItem(VOLUME_KEY, String(v)).catch(() => {})
}

/** Vibracion del cronometro (alarma final + tick 3-2-1). Default ON. La tuerca V3 la controla. */
export function isRestTimerVibrationEnabled(): boolean {
  return cache.vibration
}

export function setRestTimerVibration(enabled: boolean): void {
  cache.vibration = enabled
  emit()
  void AsyncStorage.setItem(VIBRATION_KEY, enabled ? '1' : '0').catch(() => {})
}

/**
 * Tono del SISTEMA (E5.2, solo Android). Default OFF. Cuando esta ON, `sound.ts` reproduce el alias
 * `content://settings/system/alarm_alert` en vez del timbre del catalogo; si esa reproduccion falla,
 * `sound.ts` la apaga sola (llama a `setRestTimerSystemTone(false)`) y cae al primer timbre del catalogo.
 * En iOS el valor se ignora (la opcion no se muestra y `sound.ts` solo lo consulta en Android).
 */
export function isRestTimerSystemToneEnabled(): boolean {
  return cache.systemTone
}

export function setRestTimerSystemTone(enabled: boolean): void {
  cache.systemTone = enabled
  emit()
  void AsyncStorage.setItem(SYSTEM_TONE_KEY, enabled ? '1' : '0').catch(() => {})
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
