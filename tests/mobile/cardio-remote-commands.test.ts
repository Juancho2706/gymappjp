// Puente entre los BOTONES de la notificación viva de CARDIO y la pantalla
// (`apps/mobile/components/alumno/workout/timers/cardio-remote-commands.ts`), más el REGISTRO ÚNICO
// de eventos de notificación que ahora comparten descanso y cardio
// (`apps/mobile/components/alumno/workout/timers/notification-events.ts`).
//
// Qué se testea DE VERDAD: `cardio-remote-commands.ts`, `cardio-live-notification.ts`,
// `notification-events.ts` y `rest-remote-commands.ts` corren REALES. Sólo se mockean las hojas
// nativas —`live-timer-notification` (require guardado de notifee + `react-native`),
// `cardio-notification` / `rest-notification` (expo-notifications)— y `rest-timer-preferences`
// (AsyncStorage). Se mockean POR RUTA, no por id de paquete: los ids bare (`react-native`) resuelven
// distinto desde `tests/` que desde `apps/mobile/` en este monorepo pnpm, así que un
// `vi.mock('react-native')` NO alcanzaría al import del módulo bajo test.
//
// El mock de `getNotifee()` devuelve null a propósito: es el estado de los builds actuales (sin la
// lib nativa enlazada) y el camino NO-OP que debe quedar blindado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Rutas literales: `vi.mock` se HOISTEA por encima de todo, así que no puede leer constantes.
vi.mock('../../apps/mobile/components/alumno/workout/timers/live-timer-notification', () => ({
  // Sin lib nativa enlazada → NO-OP total (build actual).
  getNotifee: () => null,
  // EventType.ACTION_PRESS del enum de notify-kit (fallback numérico documentado en el módulo real).
  getActionPressEventType: () => 2,
  showLiveTimer: vi.fn(async () => {}),
  stopLiveTimer: vi.fn(async () => {}),
  // Identidad de la notificación de cardio (valores reales del módulo).
  CARDIO_LIVE_ID: 'eva-cardio-live',
  CARDIO_CHANNEL_ID: 'cardio-live',
  CARDIO_CHANNEL_NAME: 'Cardio en curso',
}))

// Tercera hoja nativa (Ola 7A): la Live Activity de iOS. `cardio-live-notification` la llama en su
// rama iOS y el módulo real importa `react-native` + el módulo Expo local, ninguno cargable acá.
vi.mock('../../apps/mobile/components/alumno/workout/timers/live-activity', () => ({
  laIsSupported: () => false,
  laShowRest: vi.fn(),
  laShowRestPaused: vi.fn(),
  laStopRest: vi.fn(),
  laShowCardio: vi.fn(),
  laShowCardioPaused: vi.fn(),
  laStopCardio: vi.fn(),
  laDrainCommands: vi.fn(() => []),
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/cardio-notification', () => ({
  scheduleCardioEndNotification: vi.fn(async () => {}),
  cancelCardioEndNotification: vi.fn(async () => {}),
  dismissCardioEndNotification: vi.fn(async () => {}),
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-timer-preferences', () => ({
  isRestTimerMuted: () => false,
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-notification', () => ({
  scheduleRestEndNotification: vi.fn(async () => {}),
  cancelRestEndNotification: vi.fn(async () => {}),
  dismissRestEndNotification: vi.fn(async () => {}),
}))

import {
  showLiveTimer,
  stopLiveTimer,
} from '../../apps/mobile/components/alumno/workout/timers/live-timer-notification'
import {
  cancelCardioEndNotification,
  scheduleCardioEndNotification,
} from '../../apps/mobile/components/alumno/workout/timers/cardio-notification'
import {
  CARDIO_ACTION_PAUSE,
  CARDIO_ACTION_RESUME,
  CARDIO_ACTION_SKIP_PHASE,
  CARDIO_ACTION_STOP,
  CARDIO_LIVE_ID,
} from '../../apps/mobile/components/alumno/workout/timers/cardio-live-notification'
import {
  __resetCardioRemoteCommands,
  clearCardioLiveSnapshot,
  drainCardioRemoteCommands,
  getCardioLiveSnapshot,
  handleCardioNotificationEvent,
  registerCardioNotificationEvents,
  setCardioLiveSnapshot,
  subscribeCardioRemoteCommands,
  type CardioLiveSnapshot,
} from '../../apps/mobile/components/alumno/workout/timers/cardio-remote-commands'
import {
  __resetNotificationEvents,
  dispatchNotificationEvent,
} from '../../apps/mobile/components/alumno/workout/timers/notification-events'
import {
  REST_ACTION_PAUSE,
  REST_LIVE_NOTIF_ID,
} from '../../apps/mobile/components/alumno/workout/timers/rest-live-notification'
import {
  __resetRestRemoteCommands,
  drainRestRemoteCommands,
  getRestLiveSnapshot,
  registerRestNotificationEvents,
  setRestLiveSnapshot,
} from '../../apps/mobile/components/alumno/workout/timers/rest-remote-commands'

const ACTION_PRESS = 2
const NOW = 1_800_000_000_000

function pressEvent(actionId: string, notificationId: string | undefined = CARDIO_LIVE_ID) {
  return {
    type: ACTION_PRESS,
    detail: {
      notification: notificationId ? { id: notificationId } : undefined,
      pressAction: { id: actionId },
    },
  }
}

/** Countdown/fase de intervalo CORRIENDO hasta `endEpochMs`. */
function runningDown(endEpochMs: number, over: Partial<CardioLiveSnapshot> = {}): CardioLiveSnapshot {
  return {
    mode: 'countdown',
    endEpochMs,
    endNotifEpochMs: endEpochMs,
    title: 'Cardio · Trote suave',
    body: 'Zona 2 objetivo',
    color: '#22c55e',
    ...over,
  }
}

/** Cronómetro ascendente CORRIENDO desde `startEpochMs`. */
function runningUp(startEpochMs: number, over: Partial<CardioLiveSnapshot> = {}): CardioLiveSnapshot {
  return {
    mode: 'stopwatch',
    startEpochMs,
    endNotifEpochMs: null,
    title: 'Cardio en curso',
    color: '#22c55e',
    ...over,
  }
}

/** Último payload que recibió `showLiveTimer` (para inspeccionar copys/acciones/dirección). */
function lastLiveTimerCall() {
  const calls = vi.mocked(showLiveTimer).mock.calls
  return calls.length ? calls[calls.length - 1][0] : null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  __resetCardioRemoteCommands()
  __resetRestRemoteCommands()
  __resetNotificationEvents()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('registro de los listeners', () => {
  it('es idempotente y no lanza sin lib nativa', () => {
    expect(() => registerCardioNotificationEvents()).not.toThrow()
    expect(() => registerCardioNotificationEvents()).not.toThrow()
  })
})

describe('snapshot del cardio vivo', () => {
  it('set/get/clear', () => {
    expect(getCardioLiveSnapshot()).toBeNull()
    const snap = runningDown(NOW + 300_000)
    setCardioLiveSnapshot(snap)
    expect(getCardioLiveSnapshot()).toEqual(snap)
    clearCardioLiveSnapshot()
    expect(getCardioLiveSnapshot()).toBeNull()
  })
})

describe('cola de comandos remotos', () => {
  it('arranca vacía y drenar es idempotente', () => {
    expect(drainCardioRemoteCommands()).toEqual([])
    expect(drainCardioRemoteCommands()).toEqual([])
  })

  it('un press encola un comando y el drenaje lo vacía', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))

    const drained = drainCardioRemoteCommands()
    expect(drained.map((c) => c.type)).toEqual(['pause'])
    expect(drained[0].atMs).toBe(NOW)
    expect(drainCardioRemoteCommands()).toEqual([])
  })

  it('avisa a los suscriptores vivos y, al suscribirse tarde, si ya había pendientes', async () => {
    const live = vi.fn()
    const late = vi.fn()

    const unsubLive = subscribeCardioRemoteCommands(live)
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(live).toHaveBeenCalledTimes(1)
    unsubLive()

    // Pantalla que monta DESPUÉS del press en background: el comando no puede perderse.
    const unsubLate = subscribeCardioRemoteCommands(late)
    expect(late).toHaveBeenCalledTimes(1)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
    unsubLate()
  })

  it('el unsubscribe corta los avisos', async () => {
    const cb = vi.fn()
    subscribeCardioRemoteCommands(cb)()
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(cb).not.toHaveBeenCalled()
  })

  it('un suscriptor que lanza no rompe el puente ni al resto', async () => {
    const boom = vi.fn(() => {
      throw new Error('consumidor roto')
    })
    const ok = vi.fn()
    subscribeCardioRemoteCommands(boom)
    subscribeCardioRemoteCommands(ok)

    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await expect(handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))).resolves.toBeUndefined()
    expect(ok).toHaveBeenCalledTimes(1)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })
})

describe('eventos ignorados', () => {
  it('ignora tipos que no son ACTION_PRESS', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent({ type: 1, detail: { pressAction: { id: CARDIO_ACTION_PAUSE } } })
    expect(drainCardioRemoteCommands()).toEqual([])
  })

  it('ignora presses de OTRA notificación de la app (p.ej. el descanso)', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE, REST_LIVE_NOTIF_ID))
    expect(drainCardioRemoteCommands()).toEqual([])
  })

  it('sin cardio vivo no encola nada', async () => {
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(drainCardioRemoteCommands()).toEqual([])
    expect(getCardioLiveSnapshot()).toBeNull()
  })
})

describe('pausar / reanudar un countdown desde la notificación', () => {
  it('pausa congela los restantes, suelta el reloj y deja la ficha estática con Reanudar', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 42_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))

    const snap = getCardioLiveSnapshot()
    expect(snap?.endEpochMs).toBeNull()
    expect(snap?.pausedRemainingSec).toBe(42)
    expect(snap?.endNotifEpochMs).toBeNull()
    expect(snap?.pausedEndNotifSec).toBe(42)
    expect(stopLiveTimer).toHaveBeenCalledWith(CARDIO_LIVE_ID)
    expect(cancelCardioEndNotification).toHaveBeenCalled()

    const shown = lastLiveTimerCall()
    expect(shown?.direction).toBe('none') // sin chronometer: no existe un contador congelado
    expect(shown?.id).toBe(CARDIO_LIVE_ID)
    expect(shown?.title).toBe('Cardio en pausa')
    expect(shown?.body).toBe('Quedan 0:42')
    expect(shown?.actions?.map((a) => a.id)).toEqual([CARDIO_ACTION_RESUME])
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })

  it('reanudar reconstruye el fin desde los segundos congelados y reprograma la alerta final', async () => {
    setCardioLiveSnapshot({
      mode: 'countdown',
      endEpochMs: null,
      pausedRemainingSec: 42,
      pausedEndNotifSec: 42,
      title: 'Cardio · Trote suave',
    })
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))

    expect(getCardioLiveSnapshot()?.endEpochMs).toBe(NOW + 42_000)
    expect(getCardioLiveSnapshot()?.pausedRemainingSec).toBeNull()
    expect(scheduleCardioEndNotification).toHaveBeenCalledWith(42)
    expect(lastLiveTimerCall()?.direction).toBe('down')
    expect(lastLiveTimerCall()?.endEpochMs).toBe(NOW + 42_000)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['resume'])
  })

  it('pausa→reanudar no pierde tiempo aunque pasen minutos reales en pausa', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 30_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))

    vi.setSystemTime(NOW + 120_000) // dos minutos en pausa
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))

    expect(getCardioLiveSnapshot()?.endEpochMs).toBe(NOW + 120_000 + 30_000)
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause', 'resume'])
  })

  it('reanudar sin tiempo restante limpia en vez de revivir un reloj vencido', async () => {
    setCardioLiveSnapshot({ mode: 'countdown', endEpochMs: null, pausedRemainingSec: 0, title: 'Cardio' })
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))

    expect(getCardioLiveSnapshot()).toBeNull()
    expect(drainCardioRemoteCommands()).toEqual([])
    expect(scheduleCardioEndNotification).not.toHaveBeenCalled()
  })

  it('el bloque de intervalos conserva su fin de BLOQUE, distinto del fin de la fase', async () => {
    // Fase que termina en 30 s, secuencia completa en 5 min: son dos instantes distintos y el
    // handler NO recomputa la secuencia — arrastra el que ya calculó el display.
    setCardioLiveSnapshot(
      runningDown(NOW + 30_000, { mode: 'interval', endNotifEpochMs: NOW + 300_000, phaseIndex: 1, phaseCount: 8 }),
    )
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(getCardioLiveSnapshot()?.pausedEndNotifSec).toBe(300)

    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))
    expect(getCardioLiveSnapshot()?.endEpochMs).toBe(NOW + 30_000)
    expect(scheduleCardioEndNotification).toHaveBeenCalledWith(300)
    // Botones de intervalo: pausa + avance de fase.
    expect(lastLiveTimerCall()?.actions?.map((a) => a.id)).toEqual([CARDIO_ACTION_PAUSE, CARDIO_ACTION_SKIP_PHASE])
  })
})

describe('cronómetro por distancia (detener = pausar)', () => {
  it('detener congela lo TRANSCURRIDO y muestra "Llevas m:ss"', async () => {
    setCardioLiveSnapshot(runningUp(NOW - 95_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_STOP))

    const snap = getCardioLiveSnapshot()
    expect(snap?.startEpochMs).toBeNull()
    expect(snap?.pausedElapsedSec).toBe(95)
    expect(lastLiveTimerCall()?.title).toBe('Cardio en pausa')
    expect(lastLiveTimerCall()?.body).toBe('Llevas 1:35')
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['stop'])
  })

  it('reanudar retoma el ascendente sin arrastrar el tiempo en pausa ni programar alerta final', async () => {
    setCardioLiveSnapshot(runningUp(NOW - 95_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_STOP))

    vi.setSystemTime(NOW + 60_000) // un minuto detenido
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))

    expect(getCardioLiveSnapshot()?.startEpochMs).toBe(NOW + 60_000 - 95_000)
    expect(lastLiveTimerCall()?.direction).toBe('up')
    expect(lastLiveTimerCall()?.actions?.map((a) => a.id)).toEqual([CARDIO_ACTION_STOP])
    expect(scheduleCardioEndNotification).not.toHaveBeenCalled()
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['stop', 'resume'])
  })
})

describe('fase siguiente desde la notificación', () => {
  it('suelta el reloj y la alerta final, deja una ficha SIN acciones y encola el salto', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 30_000, { mode: 'interval', endNotifEpochMs: NOW + 300_000 }))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_SKIP_PHASE))

    expect(stopLiveTimer).toHaveBeenCalledWith(CARDIO_LIVE_ID)
    expect(cancelCardioEndNotification).toHaveBeenCalled()

    const shown = lastLiveTimerCall()
    expect(shown?.direction).toBe('none')
    expect(shown?.title).toBe('Fase saltada')
    // Sin acciones: el salto real lo aplica la pantalla; el handler no recomputa la secuencia.
    expect(shown?.actions).toBeUndefined()

    const snap = getCardioLiveSnapshot()
    expect(snap?.endEpochMs).toBeNull()
    expect(snap?.endNotifEpochMs).toBeNull()
    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['skip-phase'])
  })

  it('un "Reanudar" huérfano tras el salto no revive nada', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 30_000, { mode: 'interval' }))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_SKIP_PHASE))
    drainCardioRemoteCommands()

    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_RESUME))
    expect(getCardioLiveSnapshot()).toBeNull()
    expect(drainCardioRemoteCommands()).toEqual([])
  })
})

describe('descarte de comandos huérfanos', () => {
  it('cerrar el bloque tira los comandos que nadie alcanzó a consumir', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 300_000))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(getCardioLiveSnapshot()).not.toBeNull()

    // Lo que hace la pantalla al terminar/desmontar: un "Pausar" viejo NO puede caer sobre el bloque
    // siguiente.
    clearCardioLiveSnapshot()
    expect(drainCardioRemoteCommands()).toEqual([])
  })
})

describe('color de marca inválido', () => {
  it('cae al acento EVA en vez de tumbar la notificación (Notifee rechaza no-hex)', async () => {
    setCardioLiveSnapshot(runningDown(NOW + 42_000, { color: 'rgb(34, 197, 94)' }))
    await handleCardioNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))
    expect(lastLiveTimerCall()?.color).toBe('#2680FF')
  })
})

describe('registro ÚNICO compartido con el descanso', () => {
  // Notifee admite UN solo `onBackgroundEvent` por app, así que ambos puentes se anotan en el mismo
  // despachador y éste enruta por prefijo del action id. Estas dos pruebas blindan que no se pisen.
  it('un press del DESCANSO no llega al handler de cardio', async () => {
    registerRestNotificationEvents()
    registerCardioNotificationEvents()
    setRestLiveSnapshot({ endEpochMs: NOW + 60_000, remainingSeconds: 60, initialSeconds: 90, muted: false })
    setCardioLiveSnapshot(runningDown(NOW + 300_000))

    await dispatchNotificationEvent({
      type: ACTION_PRESS,
      detail: { notification: { id: REST_LIVE_NOTIF_ID }, pressAction: { id: REST_ACTION_PAUSE } },
    })

    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause'])
    expect(drainCardioRemoteCommands()).toEqual([])
    // El cardio quedó intacto: sigue corriendo con su fin original.
    expect(getCardioLiveSnapshot()?.endEpochMs).toBe(NOW + 300_000)
  })

  it('un press de CARDIO no llega al handler del descanso', async () => {
    registerRestNotificationEvents()
    registerCardioNotificationEvents()
    setRestLiveSnapshot({ endEpochMs: NOW + 60_000, remainingSeconds: 60, initialSeconds: 90, muted: false })
    setCardioLiveSnapshot(runningDown(NOW + 300_000))

    await dispatchNotificationEvent(pressEvent(CARDIO_ACTION_PAUSE))

    expect(drainCardioRemoteCommands().map((c) => c.type)).toEqual(['pause'])
    expect(drainRestRemoteCommands()).toEqual([])
    // El descanso quedó intacto: sigue corriendo con su fin original.
    expect(getRestLiveSnapshot()?.endEpochMs).toBe(NOW + 60_000)
  })

  it('ignora un press cuyo action id no pertenece a ningún puente', async () => {
    registerRestNotificationEvents()
    registerCardioNotificationEvents()
    setCardioLiveSnapshot(runningDown(NOW + 300_000))

    await dispatchNotificationEvent({
      type: ACTION_PRESS,
      detail: { pressAction: { id: 'push-open-chat' } },
    })

    expect(drainCardioRemoteCommands()).toEqual([])
    expect(drainRestRemoteCommands()).toEqual([])
  })
})
