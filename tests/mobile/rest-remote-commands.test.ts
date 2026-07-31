// Puente entre los BOTONES de la notificación del descanso y el motor React
// (`apps/mobile/components/alumno/workout/timers/rest-remote-commands.ts`, QA-11 fase 2).
//
// Qué se testea DE VERDAD: `rest-remote-commands.ts` y `rest-live-notification.ts` corren reales.
// Sólo se mockean sus dos hojas nativas —`live-timer-notification` (require guardado de notifee +
// `react-native`) y `rest-notification` (expo-notifications)— más `rest-timer-preferences`
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
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-timer-preferences', () => ({
  isRestTimerMuted: () => false,
}))

vi.mock('../../apps/mobile/components/alumno/workout/timers/rest-notification', () => ({
  scheduleRestEndNotification: vi.fn(async () => {}),
  cancelRestEndNotification: vi.fn(async () => {}),
  dismissRestEndNotification: vi.fn(async () => {}),
}))

import { showLiveTimer, stopLiveTimer } from '../../apps/mobile/components/alumno/workout/timers/live-timer-notification'
import {
  cancelRestEndNotification,
  dismissRestEndNotification,
  scheduleRestEndNotification,
} from '../../apps/mobile/components/alumno/workout/timers/rest-notification'
import {
  REST_ACTION_PAUSE,
  REST_ACTION_PLUS15,
  REST_ACTION_RESUME,
  REST_ACTION_SKIP,
  REST_LIVE_NOTIF_ID,
  REST_PLUS_SECONDS,
} from '../../apps/mobile/components/alumno/workout/timers/rest-live-notification'
import {
  __resetRestRemoteCommands,
  clearRestLiveSnapshot,
  drainRestRemoteCommands,
  getRestLiveSnapshot,
  handleRestNotificationEvent,
  registerRestNotificationEvents,
  setRestLiveSnapshot,
  subscribeRestRemoteCommands,
  type RestLiveSnapshot,
} from '../../apps/mobile/components/alumno/workout/timers/rest-remote-commands'

const ACTION_PRESS = 2
const NOW = 1_800_000_000_000

function pressEvent(actionId: string, notificationId: string | undefined = REST_LIVE_NOTIF_ID) {
  return {
    type: ACTION_PRESS,
    detail: {
      notification: notificationId ? { id: notificationId } : undefined,
      pressAction: { id: actionId },
    },
  }
}

function snapshotEndingAt(endEpochMs: number): RestLiveSnapshot {
  return {
    endEpochMs,
    remainingSeconds: Math.max(0, Math.ceil((endEpochMs - Date.now()) / 1000)),
    initialSeconds: 90,
    muted: false,
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
  __resetRestRemoteCommands()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('registro de los listeners', () => {
  it('es idempotente y no lanza sin lib nativa', () => {
    expect(() => registerRestNotificationEvents()).not.toThrow()
    expect(() => registerRestNotificationEvents()).not.toThrow()
  })
})

describe('snapshot del descanso vivo', () => {
  it('set/get/clear', () => {
    expect(getRestLiveSnapshot()).toBeNull()
    const snap = snapshotEndingAt(NOW + 60_000)
    setRestLiveSnapshot(snap)
    expect(getRestLiveSnapshot()).toEqual(snap)
    clearRestLiveSnapshot()
    expect(getRestLiveSnapshot()).toBeNull()
  })
})

describe('cola de comandos remotos', () => {
  it('arranca vacía y drenar es idempotente', () => {
    expect(drainRestRemoteCommands()).toEqual([])
    expect(drainRestRemoteCommands()).toEqual([])
  })

  it('un press encola un comando y el drenaje lo vacía', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    const drained = drainRestRemoteCommands()
    expect(drained.map((c) => c.type)).toEqual(['plus15'])
    expect(drained[0].atMs).toBe(NOW)
    expect(drainRestRemoteCommands()).toEqual([])
  })

  it('avisa a los suscriptores vivos y, al suscribirse tarde, si ya había pendientes', async () => {
    const live = vi.fn()
    const late = vi.fn()

    const unsubLive = subscribeRestRemoteCommands(live)
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))
    expect(live).toHaveBeenCalledTimes(1)
    unsubLive()

    // Motor que monta DESPUÉS del press en background: el comando no puede perderse.
    const unsubLate = subscribeRestRemoteCommands(late)
    expect(late).toHaveBeenCalledTimes(1)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['plus15'])
    unsubLate()
  })

  it('el unsubscribe corta los avisos', async () => {
    const cb = vi.fn()
    subscribeRestRemoteCommands(cb)()
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_SKIP))
    expect(cb).not.toHaveBeenCalled()
  })

  it('un suscriptor que lanza no rompe el puente ni al resto', async () => {
    const boom = vi.fn(() => {
      throw new Error('consumidor roto')
    })
    const ok = vi.fn()
    subscribeRestRemoteCommands(boom)
    subscribeRestRemoteCommands(ok)

    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await expect(handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))).resolves.toBeUndefined()
    expect(ok).toHaveBeenCalledTimes(1)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['plus15'])
  })
})

describe('eventos ignorados', () => {
  it('ignora tipos que no son ACTION_PRESS', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent({ type: 1, detail: { pressAction: { id: REST_ACTION_SKIP } } })
    expect(drainRestRemoteCommands()).toEqual([])
  })

  it('ignora presses de OTRA notificación de la app (p.ej. cardio)', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15, 'eva-cardio-live'))
    expect(drainRestRemoteCommands()).toEqual([])
  })

  it('sin descanso vivo, +15 s no encola nada', async () => {
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))
    expect(drainRestRemoteCommands()).toEqual([])
    expect(getRestLiveSnapshot()).toBeNull()
  })
})

describe('+15 s desde la notificación (regla anti doble-apply)', () => {
  it('mueve el endEpochMs del snapshot exactamente 15 s y reprograma la alerta final', async () => {
    const end = NOW + 60_000
    setRestLiveSnapshot(snapshotEndingAt(end))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(end + REST_PLUS_SECONDS * 1000)
    expect(getRestLiveSnapshot()?.remainingSeconds).toBe(75)
    expect(scheduleRestEndNotification).toHaveBeenCalledWith(75)
    expect(lastLiveTimerCall()?.direction).toBe('down')
    expect(lastLiveTimerCall()?.endEpochMs).toBe(end + 15_000)
  })

  it('el motor ADOPTA el reloj del snapshot en vez de volver a sumar 15 s', async () => {
    const end = NOW + 60_000
    setRestLiveSnapshot(snapshotEndingAt(end))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    // Lo que hace `useRestTimerEngine.consumeRemoteCommands` al consumir 'plus15': NO suma nada,
    // lee el instante absoluto que ya dejó el handler.
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['plus15'])
    const adopted = getRestLiveSnapshot()?.endEpochMs as number

    expect(adopted).toBe(end + 15_000)
    // El bug que esta prueba blinda: re-aplicar el delta daría T+30 s por un solo toque.
    expect(adopted).not.toBe(end + 30_000)
    expect(Math.ceil((adopted - Date.now()) / 1000)).toBe(75)
  })

  it('dos presses seguidos suman 15 s cada uno (acumulan sobre el snapshot, no sobre el original)', async () => {
    const end = NOW + 60_000
    setRestLiveSnapshot(snapshotEndingAt(end))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(end + 30_000)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['plus15', 'plus15'])
  })

  it('un descanso ya vencido cuenta los 15 s desde AHORA, no desde el pasado', async () => {
    setRestLiveSnapshot({ endEpochMs: NOW - 40_000, remainingSeconds: 0, initialSeconds: 90, muted: false })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(NOW + 15_000)
  })
})

describe('pausar / reanudar desde la notificación', () => {
  it('pausa congela los restantes, suelta el reloj y deja la ficha estática con Reanudar/Saltar', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 42_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PAUSE))

    const snap = getRestLiveSnapshot()
    expect(snap?.endEpochMs).toBeNull()
    expect(snap?.remainingSeconds).toBe(42)
    expect(cancelRestEndNotification).toHaveBeenCalled()

    const shown = lastLiveTimerCall()
    expect(shown?.direction).toBe('none') // sin chronometer: no existe un contador congelado
    expect(shown?.id).toBe(REST_LIVE_NOTIF_ID)
    expect(shown?.title).toBe('Descanso en pausa')
    expect(shown?.actions?.map((a) => a.id)).toEqual([REST_ACTION_RESUME, REST_ACTION_SKIP])
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause'])
  })

  it('reanudar reconstruye el fin desde los segundos congelados', async () => {
    setRestLiveSnapshot({ endEpochMs: null, remainingSeconds: 42, initialSeconds: 90, muted: false })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_RESUME))

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(NOW + 42_000)
    expect(scheduleRestEndNotification).toHaveBeenCalledWith(42)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['resume'])
  })

  it('pausa→reanudar no pierde tiempo aunque pasen minutos reales en pausa', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 30_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PAUSE))

    vi.setSystemTime(NOW + 120_000) // dos minutos en pausa
    await handleRestNotificationEvent(pressEvent(REST_ACTION_RESUME))

    expect(getRestLiveSnapshot()?.endEpochMs).toBe(NOW + 120_000 + 30_000)
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['pause', 'resume'])
  })

  it('reanudar sin tiempo restante degrada a saltar', async () => {
    setRestLiveSnapshot({ endEpochMs: null, remainingSeconds: 0, initialSeconds: 90, muted: false })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_RESUME))

    expect(getRestLiveSnapshot()).toBeNull()
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })
})

describe('saltar desde la notificación', () => {
  it('limpia el snapshot, retira las notificaciones y encola skip', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_SKIP))

    expect(getRestLiveSnapshot()).toBeNull()
    expect(stopLiveTimer).toHaveBeenCalledWith(REST_LIVE_NOTIF_ID)
    expect(cancelRestEndNotification).toHaveBeenCalled()
    expect(dismissRestEndNotification).toHaveBeenCalled()
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })

  it('funciona incluso sin snapshot (notificación huérfana de un build previo)', async () => {
    await handleRestNotificationEvent(pressEvent(REST_ACTION_SKIP))
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })
})

describe('descarte de comandos huérfanos', () => {
  it('cerrar el descanso tira los comandos que nadie alcanzó a consumir', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))
    expect(getRestLiveSnapshot()).not.toBeNull()

    // Lo que hace el motor al cerrar/desmontar: un "+15 s" viejo NO puede revivir el descanso
    // siguiente.
    clearRestLiveSnapshot()
    expect(drainRestRemoteCommands()).toEqual([])
  })

  it('el skip propio sobrevive a su limpieza (encola después de limpiar)', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_SKIP))

    // El plus15 previo se descarta con el snapshot; queda sólo el skip que el motor debe aplicar.
    expect(drainRestRemoteCommands().map((c) => c.type)).toEqual(['skip'])
  })
})

describe('contexto visual del cronómetro vivo', () => {
  it('sin contexto conserva los copys históricos y las tres acciones', async () => {
    setRestLiveSnapshot(snapshotEndingAt(NOW + 60_000))
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    const shown = lastLiveTimerCall()
    expect(shown?.title).toBe('Descanso en curso')
    expect(shown?.body).toBe('Sonará al terminar.')
    expect(shown?.actions?.map((a) => a.id)).toEqual([REST_ACTION_PAUSE, REST_ACTION_PLUS15, REST_ACTION_SKIP])
  })

  it('con contexto arma "Descanso · sigue X" + "Serie n de N" y arrastra el logo del coach', async () => {
    setRestLiveSnapshot({
      ...snapshotEndingAt(NOW + 60_000),
      context: {
        nextLabel: 'Press banca',
        setIndex: 3,
        setTotal: 4,
        largeIconUrl: 'https://cdn.eva/logo.png',
        color: '#FF8800',
      },
    })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    const shown = lastLiveTimerCall()
    expect(shown?.title).toBe('Descanso · sigue Press banca')
    expect(shown?.body).toBe('Serie 3 de 4 · Sonará al terminar')
    expect(shown?.largeIconUrl).toBe('https://cdn.eva/logo.png')
    expect(shown?.color).toBe('#FF8800')
  })

  it('un color de marca inválido cae al acento EVA en vez de tumbar la notificación', async () => {
    setRestLiveSnapshot({
      ...snapshotEndingAt(NOW + 60_000),
      context: { color: 'rgb(255, 136, 0)' },
    })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PLUS15))

    expect(lastLiveTimerCall()?.color).toBe('#2680FF')
  })

  it('la ficha de pausa muestra el tiempo restante y el ejercicio que sigue', async () => {
    setRestLiveSnapshot({
      ...snapshotEndingAt(NOW + 95_000),
      context: { nextLabel: 'Sentadilla' },
    })
    await handleRestNotificationEvent(pressEvent(REST_ACTION_PAUSE))

    expect(lastLiveTimerCall()?.body).toBe('Quedan 1:35 · sigue Sentadilla')
  })
})
