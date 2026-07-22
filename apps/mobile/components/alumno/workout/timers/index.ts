/**
 * Timers del ejecutor de rutina alumno (E2-09). Un solo timer activo a la vez,
 * orquestado por `WorkoutTimerProvider`; los timers se montan solos vía provider.
 */
export { WorkoutTimerProvider, useWorkoutTimers, parseRestTime } from './TimerProvider'
export type { WorkoutTimersApi } from './TimerProvider'
export { RestTimerBar } from './RestTimerBar'
export { RestTimerHost, type RestInterstitialRenderer, type RestInterstitialHostControls } from './RestTimerHost'
export { useRestTimerEngine, type RestTimerEngine } from './useRestTimerEngine'
export { HoldTimer } from './HoldTimer'
export { IntervalTimer } from './IntervalTimer'
export { StopwatchTimer } from './StopwatchTimer'
export {
  hydrateRestTimerPrefs,
  isRestTimerMuted,
  setRestTimerMuted,
  getRestTimerSound,
  setRestTimerSound,
  getRestTimerVolume,
  setRestTimerVolume,
  isRestAutoTimerEnabled,
  setRestAutoTimerEnabled,
  isRestTimerVibrationEnabled,
  setRestTimerVibration,
  subscribeRestTimerPrefs,
  type TimerSound,
} from './rest-timer-preferences'
export { registerTimerCue, registerTimerSound, primeTimerAudio, type TimerCueKind } from './sound'
