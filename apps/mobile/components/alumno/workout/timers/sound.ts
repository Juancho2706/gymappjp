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
 * NOTA de integración: los assets de sonido YA están bundleados y registrados al
 * cargar el módulo (un `.wav` por timbre + el tick de countdown, ver abajo). Sólo
 * falta (a) `expo install expo-audio` para que el `require('expo-audio')` guardado
 * resuelva; hasta entonces `playTimerCue` es no-op seguro (no hay import estático).
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
// con `playTimerSound(readRestTimerSound())` web). Poblado al final del módulo con
// un asset por timbre (digital/bell/classic/boxing).
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
 *
 * `opts.force` OMITE el gate de mute: para PREVIEWS por acción directa del usuario
 * en ajustes (elegir timbre / mover volumen / "Probar sonido"). Paridad con la web,
 * donde el panel `WorkoutTimerSettingsPanel` reproduce `playTimerSound` SIEMPRE al
 * cambiar sonido/volumen (`:56-64`), sin gatear por mute (el mute vive sólo en la
 * barra, no en el panel). La cuenta regresiva (tick) y la alarma real sí respetan mute.
 */
export function playTimerCue(kind: TimerCueKind, opts?: { force?: boolean }): void {
  if (!opts?.force && isRestTimerMuted()) return
  const mod = ExpoAudio
  // El fin de descanso ('alarm'), el fin de HOLD ('done') y los cambios/fin de fase
  // de INTERVALO ('phase'/'finish') respetan el TIMBRE elegido por el usuario
  // (`getRestTimerSound`) — paridad con la web, que en los tres casos reproduce
  // `playTimerSound(readRestTimerSound(), readRestTimerVolume())`
  // (HoldTimer.tsx:33 done; IntervalTimer.tsx:44 beep de fase/fin). Caen al asset
  // genérico 'alarm' si aún no se bundleó un asset por-timbre. Solo 'tick' (beep de
  // countdown por segundo) conserva su propia fuente.
  const usesTimbre = kind === 'alarm' || kind === 'done' || kind === 'phase' || kind === 'finish'
  const sound = usesTimbre ? getRestTimerSound() : null
  const source = usesTimbre ? (soundAssets[sound!] ?? cueSources.alarm) : cueSources[kind]
  const key = usesTimbre ? `alarm:${sound}` : kind
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

// Assets bundleados de la alarma — UNO por timbre (`TimerSound`), sintetizados para
// espejar los 4 timbres de la web `audioUtils.ts:35-124` (digital = 3 beeps square
// 1000Hz; bell = sine 800Hz resonante; classic = 4 pulsos triangle 2000Hz; boxing =
// sine 600Hz + square 1200Hz metálico). Al registrarlos, `playTimerCue('alarm')`
// resuelve `soundAssets[getRestTimerSound()]` → elegir Digital/Campana/Clásico/Boxeo
// en ajustes CAMBIA el audio (paridad web `playTimerSound(readRestTimerSound())`).
// `rest-cue.wav` queda como fallback genérico de `cueSources.alarm` (si algún timbre
// no resolviera). El 'tick' 3-2-1 tiene su propio asset corto (sine 760Hz ~0.16s,
// espeja `playCountdownBeep` audioUtils.ts:8-33) — NO reusa la alarma completa, así
// el beep de countdown suena por segundo sin repetir la alarma. Metro empaqueta los
// .wav; reproduce SOLO cuando expo-audio esté instalado (`expo install expo-audio`) +
// un build nativo lo incluya; hasta entonces `playTimerCue` es no-op seguro.
try {
  /* eslint-disable @typescript-eslint/no-require-imports */
  registerTimerCue('alarm', require('../../../../assets/audio/rest-cue.wav'))
  registerTimerSound('digital', require('../../../../assets/audio/alarm-digital.wav'))
  registerTimerSound('bell', require('../../../../assets/audio/alarm-bell.wav'))
  registerTimerSound('classic', require('../../../../assets/audio/alarm-classic.wav'))
  registerTimerSound('boxing', require('../../../../assets/audio/alarm-boxing.wav'))
  registerTimerCue('tick', require('../../../../assets/audio/timer-tick.wav'))
  /* eslint-enable @typescript-eslint/no-require-imports */
} catch {
  // Sin los assets (o bundler sin soporte) los cues quedan en no-op.
}
