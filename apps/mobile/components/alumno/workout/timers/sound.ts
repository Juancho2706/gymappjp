/**
 * Cue de audio de los timers (E2-09) — canal SECUNDARIO. La háptica es el canal
 * primario en móvil (siempre suena en el device); el audio refuerza.
 *
 * Estado del subsistema: mobile aún NO tiene librería de audio. Se DECLARA
 * `expo-audio` en `package.json` (dep, install diferido por el orquestador) y se
 * carga con `require` GUARDADO — mismo patrón que `VideoPlayer.tsx` con
 * `expo-video`. Consecuencia:
 *   · Antes de `expo install expo-audio` + un asset de cue, TODO acá es no-op
 *     seguro (nunca lanza, no rompe el typecheck: no hay import estático).
 *   · Tras instalar y registrar un asset vía `registerTimerCue`, reproduce.
 *
 * Gating: el sonido respeta `isRestTimerMuted()` (default web = ON). La háptica
 * NO pasa por acá y nunca se silencia.
 *
 * NOTA de integración: falta (a) `expo install expo-audio` y (b) un asset de
 * sonido bundleado (p.ej. `assets/audio/rest-alarm.m4a`) registrado al arrancar.
 * Sin (b) no hay fuente que reproducir aunque (a) exista — por eso es no-op.
 */
import { isRestTimerMuted, getRestTimerVolume, getRestTimerSound, type TimerSound } from './rest-timer-preferences'

/** Superficie mínima de expo-audio que usamos (tipada acá para no exigir sus tipos pre-install). */
interface AudioPlayerLike {
  volume: number
  seekTo: (seconds: number) => void
  play: () => void
}
interface ExpoAudioLike {
  createAudioPlayer: (source: number | { uri: string }) => AudioPlayerLike
  setAudioModeAsync?: (mode: {
    playsInSilentMode?: boolean
    interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers'
    shouldPlayInBackground?: boolean
  }) => Promise<void>
}

let ExpoAudio: ExpoAudioLike | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoAudio = require('expo-audio') as ExpoAudioLike
} catch {
  ExpoAudio = null
}

export type TimerCueKind = 'tick' | 'alarm' | 'done' | 'phase' | 'finish'

type CueSource = number | { uri: string }

// Assets de cue registrados (require('...') → number, o { uri }). Vacío hasta
// que la integración bundlee sonidos. Un player por fuente (reutilizado con seekTo).
const cueSources: Partial<Record<TimerCueKind, CueSource>> = {}
// Assets de la ALARMA por timbre (`TimerSound`): espejo de los 4 timbres web
// (digital/bell/classic/boxing). `playTimerCue('alarm')` resuelve la fuente vía
// `getRestTimerSound()`, así elegir un sonido en ajustes CAMBIA el audio (paridad
// con `playTimerSound(readRestTimerSound())` web). Vacío hasta bundlear los assets.
const soundAssets: Partial<Record<TimerSound, CueSource>> = {}
const players: Record<string, AudioPlayerLike> = {}

/** Registra el asset de un cue genérico (tick/done/phase/finish). */
export function registerTimerCue(kind: TimerCueKind, source: CueSource): void {
  cueSources[kind] = source
}

/** Registra el asset de la alarma para un timbre concreto (digital/bell/classic/boxing). */
export function registerTimerSound(sound: TimerSound, source: CueSource): void {
  soundAssets[sound] = source
}

/**
 * Prepara el modo de audio del cue. Best-effort (nunca lanza).
 *
 * DECISIÓN (modo silencio): en apps de fitness el beep de fin de descanso DEBE
 * sonar aunque el iPhone tenga el switch físico en silencio — el usuario entrena
 * con el teléfono mudo y espera igual la señal para la siguiente serie (paridad
 * con Strong/Hevy/apps de gym). Por eso `playsInSilentMode: true`. El único
 * silenciador es la preferencia IN-APP `restTimerMuted` (gate en `playTimerCue`);
 * la háptica nunca se silencia. `interruptionMode: 'duckOthers'` baja (no corta)
 * la música/podcast del usuario durante el beep y la restaura sola. El cue no
 * suena en background (ahí lo cubre la notificación local); `shouldPlayInBackground:false`.
 */
export function primeTimerAudio(): void {
  void ExpoAudio?.setAudioModeAsync?.({
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
  }).catch(() => {})
}

/**
 * Reproduce un cue si (1) no está muteado, (2) expo-audio está instalado y
 * (3) hay un asset registrado para ese cue. Cualquier ausencia → no-op.
 */
export function playTimerCue(kind: TimerCueKind): void {
  if (isRestTimerMuted()) return
  const mod = ExpoAudio
  // La alarma respeta el timbre elegido (`getRestTimerSound`); cae al asset genérico
  // 'alarm' si aún no se bundleó un asset por-timbre. El resto de cues usa su fuente.
  const sound = kind === 'alarm' ? getRestTimerSound() : null
  const source = kind === 'alarm' ? (soundAssets[sound!] ?? cueSources.alarm) : cueSources[kind]
  const key = kind === 'alarm' ? `alarm:${sound}` : kind
  if (!mod || source == null) return
  try {
    let player = players[key]
    if (!player) {
      player = mod.createAudioPlayer(source)
      players[key] = player
    }
    player.volume = getRestTimerVolume()
    player.seekTo(0)
    player.play()
  } catch {
    // Falla de audio nunca interrumpe el timer.
  }
}

// Cue bundleado del fin de descanso: 3 tonos brillantes (espeja el sonido web
// 'digital'). Se registra al cargar el módulo; Metro lo empaqueta como asset.
// El 'tick' 3-2-1 queda a cargo de la háptica (no registramos asset para evitar
// repetir la alarma completa cada segundo). Reproduce SOLO cuando expo-audio esté
// instalado (`expo install expo-audio`) + un build nativo lo incluya; hasta
// entonces `playTimerCue` es no-op seguro.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerTimerCue('alarm', require('../../../../assets/audio/rest-cue.wav'))
} catch {
  // Sin el asset (o bundler sin soporte) el cue queda en no-op.
}
