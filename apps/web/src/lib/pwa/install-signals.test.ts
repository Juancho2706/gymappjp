import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  markFirstWorkoutCompleted,
  hasCompletedFirstWorkout,
  dismissInstallPrompt,
  isInstallPromptDismissed,
  FIRST_WORKOUT_EVENT,
} from './install-signals'

const KEYS = [
  'eva-first-workout-completed',
  'eva-pwa-install-dismiss-until',
  'eva-pwa-install-dismissed',
]

afterEach(() => {
  KEYS.forEach((k) => localStorage.removeItem(k))
  vi.useRealTimers()
})

describe('install-signals — primer workout', () => {
  it('no está marcado por defecto', () => {
    expect(hasCompletedFirstWorkout()).toBe(false)
  })

  it('marca la señal y dispara el evento in-session', () => {
    let fired = false
    const onEvt = () => {
      fired = true
    }
    window.addEventListener(FIRST_WORKOUT_EVENT, onEvt)
    markFirstWorkoutCompleted()
    window.removeEventListener(FIRST_WORKOUT_EVENT, onEvt)

    expect(hasCompletedFirstWorkout()).toBe(true)
    expect(fired).toBe(true)
  })

  it('es idempotente (no re-dispara si ya estaba marcada)', () => {
    markFirstWorkoutCompleted()
    let fired = false
    const onEvt = () => {
      fired = true
    }
    window.addEventListener(FIRST_WORKOUT_EVENT, onEvt)
    markFirstWorkoutCompleted()
    window.removeEventListener(FIRST_WORKOUT_EVENT, onEvt)

    expect(hasCompletedFirstWorkout()).toBe(true)
    expect(fired).toBe(false)
  })
})

describe('install-signals — descarte con back-off', () => {
  it('no está descartado por defecto', () => {
    expect(isInstallPromptDismissed()).toBe(false)
  })

  it('descarta dentro de la ventana y expira pasado el back-off', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    dismissInstallPrompt()
    expect(isInstallPromptDismissed()).toBe(true)

    // +31 días (> 14 días de back-off) → deja de estar silenciado
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    expect(isInstallPromptDismissed()).toBe(false)
  })

  it('migra el descarte permanente heredado a una ventana de back-off', () => {
    localStorage.setItem('eva-pwa-install-dismissed', 'true')
    expect(isInstallPromptDismissed()).toBe(true)
    // La clave heredada se limpia tras migrar.
    expect(localStorage.getItem('eva-pwa-install-dismissed')).toBeNull()
    expect(localStorage.getItem('eva-pwa-install-dismiss-until')).not.toBeNull()
  })
})
