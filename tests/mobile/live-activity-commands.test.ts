// Drenaje de los botones de las LIVE ACTIVITIES de iOS
// (`apps/mobile/components/alumno/workout/timers/live-activity-commands.ts`, Ola 7A).
//
// Qué se testea DE VERDAD: `live-activity-commands.ts` corre real, y con él los stores reales de
// `rest-remote-commands.ts` / `cardio-remote-commands.ts` (snapshot + cola). Sólo se mockean las
// hojas NATIVAS: `live-activity` (el módulo Expo local + ActivityKit), `live-timer-notification`
// (require guardado de notifee + react-native), `rest-notification` / `cardio-notification`
// (expo-notifications) y `rest-timer-preferences` (AsyncStorage).
//
// Se mockea POR RUTA DE ARCHIVO, no por id bare: los ids bare (`react-native`) resuelven distinto
// desde `tests/` que desde `apps/mobile/` en este monorepo pnpm, así que un `vi.mock('react-native')`
// NO alcanzaría al import del módulo bajo test.
//
// La regla que blindan estos tests: la verdad temporal de un comando es su `atMs` (el instante del
// PRESS), no el momento del drenaje. Entre uno y otro la app pudo estar suspendida minutos, y usar
// `Date.now()` haría que pausar "a los 40 s" dejara 40 menos lo que el alumno tardó en abrir EVA.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Rutas literales: `vi.mock` se HOISTEA por encima de todo, así que no puede leer constantes.
vi.mock('../../apps/mobile/components/alumno/workout/timers/live-activity', () => ({
  laIsSupported: () => true,
  laShowRest: vi.fn(),
  laShowRestPaused: vi.fn(),
  laStopRest: vi.fn(),
  laShowCardio: vi.fn(),
  laShowCardioPaused: vi.fn(),
  laStopCardio: vi.fn(),
  laDrainCommands: vi.fn(() => []),
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/live-timer-notification', () => ({
  getNotifee: () => null,
  getActionPressEventType: () => 2,
  showLiveTimer: vi.fn(async () => {}),
  stopLiveTimer: vi.fn(async () => {}),
  CARDIO_LIVE_ID: 'eva-cardio-live',
  CARDIO_CHANNEL_ID: 'cardio-live',
  CARDIO_CHANNEL_NAME: 'Cardio en curso',
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-timer-preferences', () => ({
  isRestTimerMuted: () => false,
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-notification', () => ({
  scheduleRestEndNotification: vi.fn(async () => {}),
  cancelRestEndNotification: vi.fn(async () => {}),
  dismissRestEndNotification: vi.fn(async () => {}),
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/cardio-notification', () => ({
  scheduleCardioEndNotification: vi.fn(async () => {}),
  cancelCardioEndNotification: vi.fn(async () => {}),
  dismissCardioEndNotification: vi.fn(async () => {}),
}))

import { laDrainCommands } from '../../apps/mobile/components/alumno/workout/timers/live-activity'
import {
  __resetLiveActivityCommandDrain,
  applyLiveActivityCommands,
  drainLiveActivityCommands,
} from '../../apps/mobile/components/alumno/workout/timers/live-activity-commands'
import {
  __resetCardioRemoteCommands,
  drainCardioRemoteCommands,
  getCardioLiveSnapshot,
  setCardioLiveSnapshot,
  type CardioLiveSnapshot,
} from '../../apps/mobile/components/alumno/workout/timers/cardio-remote-commands'
import {
  __resetRestRemoteCommands,
  drainRestRemoteCommands,
  getRestLiveSnapshot,
  setRestLiveSnapshot,
  type RestLiveSnapshot,
} from '../../apps/mobile/components/alumno/workout/timers/rest-remote-commands'

const NOW = 1_800_000_000_000
/** El press ocurrió 30 s ANTES del drenaje: la app estuvo suspendida ese rato. */
const PRESS = NOW - 30_000

function restSnapshot(overrides: Partial<RestLiveSnapshot> = {}): RestLiveSnapshot {
  return {
    endEpochMs: PRESS + 60_000, // al momento del press quedaban exactamente 60 s
    remainingSeconds: 90,
    initialSeconds: 120,
    muted: false,
    ...overrides,
  }
}

function cardioSnapshot(overrides: Partial<CardioLiveSnapshot> = {}): CardioLiveSnapshot {
  return {
    mode: 'countdown',
    endEpochMs: PRESS + 60_000,
    endNotifEpochMs: PRESS + 60_000,
    title: 'Cardio en curso',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  __resetRestRemoteCommands()
  __resetCardioRemoteCommands()
  __resetLiveActivityCommandDrain()
  vi.mocked(laDrainCommands).mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('applyLiveActivityCommands · descanso', () => {
  it('pausa congelando los segundos QUE QUEDABAN EN EL PRESS, no en el drenaje', () => {
    setRestLiveSnapshot(restSnapshot())

    applyLiveActivityCommands([{ id: 'rest-pause', atMs: PRESS }])

    const snap = getRestLiveSnapshot()
    expect(snap?.endEpochMs).toBeNull()
    // 60 s al momento del press. Con `Date.now()` habrían sido 30 → el bug que este test blinda.
    expect(snap?.remainingSeconds).toBe(60)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })

  it('+15 s corre el fin absoluto desde el fin vigente (nunca aplica el delta dos veces)', () => {
    const base = restSnapshot()
    setRestLiveSnapshot(base)

    applyLiveActivityCommands([{ id: 'rest-plus15', atMs: PRESS }])

    expect(getRestLiveSnapshot()?.endEpochMs).toBe((base.endEpochMs as number) + 15_000)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['plus15'])
  })

  it('+15 s sobre un descanso ya vencido cuenta desde el PRESS, no desde un pasado', () => {
    setRestLiveSnapshot(restSnapshot({ endEpochMs: PRESS - 5_000 }))

    applyLiveActivityCommands([{ id: 'rest-plus15', atMs: PRESS }])

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(PRESS + 15_000)
  })

  it('reanuda recreando el fin absoluto DESDE EL PRESS (la actividad ya venía corriendo)', () => {
    setRestLiveSnapshot(restSnapshot({ endEpochMs: null, remainingSeconds: 45 }))

    applyLiveActivityCommands([{ id: 'rest-resume', atMs: PRESS }])

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(PRESS + 45_000)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['resume'])
  })

  it('reanudar sin segundos restantes se resuelve como saltar', () => {
    setRestLiveSnapshot(restSnapshot({ endEpochMs: null, remainingSeconds: 0 }))

    applyLiveActivityCommands([{ id: 'rest-resume', atMs: PRESS }])

    expect(getRestLiveSnapshot()).toBeNull()
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })

  it('saltar limpia el espejo y encola DESPUÉS de limpiar (el comando no se descarta)', () => {
    setRestLiveSnapshot(restSnapshot())

    applyLiveActivityCommands([{ id: 'rest-skip', atMs: PRESS }])

    expect(getRestLiveSnapshot()).toBeNull()
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })

  it('sin descanso vivo no mueve nada ni encola (salvo saltar, que siempre limpia)', () => {
    applyLiveActivityCommands([{ id: 'rest-pause', atMs: PRESS }])

    expect(getRestLiveSnapshot()).toBeNull()
    expect(drainRestRemoteCommands()).toEqual([])
  })
})

describe('applyLiveActivityCommands · cardio', () => {
  it('pausa el countdown congelando restantes y el fin del bloque en el instante del press', () => {
    setCardioLiveSnapshot(cardioSnapshot())

    applyLiveActivityCommands([{ id: 'cardio-pause', atMs: PRESS }])

    const snap = getCardioLiveSnapshot()
    expect(snap?.endEpochMs).toBeNull()
    expect(snap?.pausedRemainingSec).toBe(60)
    expect(snap?.pausedEndNotifSec).toBe(60)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })

  it('pausa el cronómetro ascendente congelando TRANSCURRIDOS', () => {
    setCardioLiveSnapshot(
      cardioSnapshot({
        mode: 'stopwatch',
        endEpochMs: null,
        endNotifEpochMs: null,
        startEpochMs: PRESS - 120_000,
      }),
    )

    applyLiveActivityCommands([{ id: 'cardio-pause', atMs: PRESS }])

    const snap = getCardioLiveSnapshot()
    expect(snap?.pausedElapsedSec).toBe(120)
    expect(snap?.pausedRemainingSec).toBeNull()
  })

  it('reanuda el cronómetro ascendente sin arrastrar el tiempo en pausa', () => {
    setCardioLiveSnapshot(
      cardioSnapshot({
        mode: 'stopwatch',
        endEpochMs: null,
        endNotifEpochMs: null,
        startEpochMs: null,
        pausedElapsedSec: 120,
      }),
    )

    applyLiveActivityCommands([{ id: 'cardio-resume', atMs: PRESS }])

    expect(getCardioLiveSnapshot()?.startEpochMs).toBe(PRESS - 120_000)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['resume'])
  })

  it('reanudar una cuenta ya agotada limpia y NO encola', () => {
    setCardioLiveSnapshot(
      cardioSnapshot({ endEpochMs: null, endNotifEpochMs: null, pausedRemainingSec: 0 }),
    )

    applyLiveActivityCommands([{ id: 'cardio-resume', atMs: PRESS }])

    expect(getCardioLiveSnapshot()).toBeNull()
    expect(drainCardioRemoteCommands()).toEqual([])
  })
})

describe('drenaje', () => {
  it('enruta por prefijo: `rest-*` a la cola del descanso y `cardio-*` a la de cardio', () => {
    setRestLiveSnapshot(restSnapshot())
    setCardioLiveSnapshot(cardioSnapshot())
    vi.mocked(laDrainCommands).mockReturnValue([
      { id: 'rest-pause', atMs: PRESS },
      { id: 'cardio-pause', atMs: PRESS },
    ])

    drainLiveActivityCommands()

    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause'])
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })

  it('aplica los comandos EN ORDEN (pausar y luego reanudar deja el reloj corriendo)', () => {
    setRestLiveSnapshot(restSnapshot())
    vi.mocked(laDrainCommands).mockReturnValue([
      { id: 'rest-pause', atMs: PRESS },
      { id: 'rest-resume', atMs: PRESS + 10_000 },
    ])

    drainLiveActivityCommands()

    // Pausó con 60 s y reanudó 10 s después: el reloj retoma esos mismos 60 s desde el 2º press.
    expect(getRestLiveSnapshot()?.endEpochMs).toBe(PRESS + 10_000 + 60_000)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause', 'resume'])
  })

  it('ignora ids desconocidos sin romper el resto del lote', () => {
    setRestLiveSnapshot(restSnapshot())
    vi.mocked(laDrainCommands).mockReturnValue([
      { id: 'quien-sabe', atMs: PRESS },
      { id: 'rest-skip', atMs: PRESS },
    ])

    drainLiveActivityCommands()

    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })

  it('buzón vacío = NO-OP total (es el caso de Android y de los binarios sin módulo nativo)', () => {
    setRestLiveSnapshot(restSnapshot())

    drainLiveActivityCommands()

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(restSnapshot().endEpochMs)
    expect(drainRestRemoteCommands()).toEqual([])
  })
})
