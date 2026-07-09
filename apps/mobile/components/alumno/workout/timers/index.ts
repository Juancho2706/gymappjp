/**
 * Timers del ejecutor de rutina alumno (E2-09). Un solo timer activo a la vez,
 * orquestado por `WorkoutTimerProvider`; los timers se montan solos vía provider.
 */
export { WorkoutTimerProvider, useWorkoutTimers, parseRestTime } from './TimerProvider'
export type { WorkoutTimersApi } from './TimerProvider'
export { RestTimerBar } from './RestTimerBar'
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
  subscribeRestTimerPrefs,
  type TimerSound,
} from './rest-timer-preferences'
export { registerTimerCue, primeTimerAudio, type TimerCueKind } from './sound'
