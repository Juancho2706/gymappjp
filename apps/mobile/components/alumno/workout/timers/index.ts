/**
 * Timers del ejecutor de rutina alumno (E2-09). Un solo timer activo a la vez,
 * orquestado por `WorkoutTimerProvider`; los timers se montan solos vía provider.
 */
export { WorkoutTimerProvider, useWorkoutTimers, parseRestTime } from './TimerProvider'
export type { WorkoutTimersApi } from './TimerProvider'
export { RestTimerBar } from './RestTimerBar'
export { RestTimerHost, type RestInterstitialRenderer, type RestInterstitialHostControls } from './RestTimerHost'
export { useRestTimerEngine, type RestTimerEngine } from './useRestTimerEngine'
// Reloj del descanso vivo (W5.1b): mini-store + hook del chip que el teclado pinta mientras el alumno
// anota kg/reps con el descanso corriendo minimizado (R3b).
export {
  clearRestClock,
  formatRestRemaining,
  publishRestClock,
  readRestClock,
  restRemainingA11yLabel,
  restRemainingSecFrom,
  subscribeRestClock,
  useRestRemainingSec,
  type RestClock,
} from './rest-clock'
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
  isRestTimerSystemToneEnabled,
  setRestTimerSystemTone,
  subscribeRestTimerPrefs,
  type TimerSound,
} from './rest-timer-preferences'
export { registerTimerCue, registerTimerSound, primeTimerAudio, type TimerCueKind } from './sound'
