/**
 * Aviso del SO «Terminó tu hold» (specs/cuenta-atras-en-pantalla, **W3.6 / W3.T5** · R18 + R31).
 *
 * Se protegen las **4 reglas del fix QA-10** que documenta su gemelo
 * (`apps/mobile/components/alumno/workout/timers/cardio-notification.ts:15-21`) más el contrato de
 * permiso y el piso de duración de R29:
 *  (a) **id estable** `eva-hold-end` con `data.type = 'hold-end'` propios ⇒ re-agendar REEMPLAZA,
 *      nunca apila, y no barre las del descanso ni las de cardio;
 *  (b) **cola serializada** de schedule/cancel/dismiss/sweep ⇒ una carrera `cancel` + `schedule` deja
 *      **una sola** programada (la fuente demostrada de las huérfanas apiladas en MIUI);
 *  (c) **dismiss de las ya ENTREGADAS** del tipo hold al cerrar;
 *  (d) **sweep al arrancar** de cualquier programada huérfana del tipo hold.
 * Más: sólo se programa con permiso YA concedido (nunca promptea) y el mute global gobierna el
 * `sound` — el criterio de salida del tren es «vibra y avisa», nunca «suena».
 *
 * GOTCHA de resolución: mismo patrón que `tests/mobile/offline-queue-side-reps.test.ts` — el módulo
 * arrastra `expo-notifications` y `react-native`, así que se mockean por PATH ABSOLUTO resuelto desde
 * `apps/mobile` (`vi.doMock` + `import()` dinámico).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

interface ScheduledStub {
  identifier: string
  content: { title?: string; body?: string; sound?: unknown; data?: { type?: string } }
}

/** Scheduler nativo de mentira con la semántica que importa: el MISMO id reemplaza, no apila. */
const scheduled = new Map<string, ScheduledStub>()
const presented: Array<{ request: ScheduledStub }> = []

const scheduleNotificationAsync = vi.fn(async (input: ScheduledStub & { trigger: unknown }) => {
  // Un `await` real: sin la cola serializada, dos ops concurrentes se interleavan justo acá.
  await Promise.resolve()
  scheduled.set(input.identifier, { identifier: input.identifier, content: input.content })
  return input.identifier
})
const cancelScheduledNotificationAsync = vi.fn(async (id: string) => {
  await Promise.resolve()
  scheduled.delete(id)
})
const dismissNotificationAsync = vi.fn(async (id: string) => {
  const i = presented.findIndex((n) => n.request.identifier === id)
  if (i >= 0) presented.splice(i, 1)
})
const getAllScheduledNotificationsAsync = vi.fn(async () =>
  Array.from(scheduled.values()).map((n) => ({ identifier: n.identifier, content: n.content })),
)
const getPresentedNotificationsAsync = vi.fn(async () => presented.slice())

let permission: 'granted' | 'denied' = 'granted'
let muted = false
const ensureRestNotifPermission = vi.fn(async () => permission === 'granted')

vi.doMock(mobileDep('expo-notifications'), () => ({
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  dismissNotificationAsync,
  getAllScheduledNotificationsAsync,
  getPresentedNotificationsAsync,
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}))
vi.doMock(mobileDep('react-native'), () => ({ Platform: { OS: 'android' } }))
vi.doMock(mobileFile('components', 'alumno', 'workout', 'timers', 'rest-notification.ts'), () => ({
  getRestNotifPermission: vi.fn(async () => permission),
  ensureRestNotifPermission,
}))
vi.doMock(mobileFile('components', 'alumno', 'workout', 'timers', 'rest-timer-preferences.ts'), () => ({
  isRestTimerMuted: () => muted,
}))

const holdNotif = await import('../../apps/mobile/components/alumno/workout/timers/hold-notification')
const {
  HOLD_END_NOTIF_ID,
  HOLD_NOTIF_TYPE,
  HOLD_NOTIF_MIN_SEC,
  scheduleHoldEndNotification,
  cancelHoldEndNotification,
  dismissHoldEndNotification,
  sweepHoldNotifications,
} = holdNotif

/** Notificación de OTRO canal: el hold jamás la puede tocar. */
const restStub = (): ScheduledStub => ({
  identifier: 'eva-rest-end',
  content: { data: { type: 'rest-timer' } },
})

beforeEach(() => {
  scheduled.clear()
  presented.length = 0
  permission = 'granted'
  muted = false
  vi.clearAllMocks()
})

describe('(a) identificador estable y tipo propio', () => {
  it('programa con `eva-hold-end` y `data.type = "hold-end"`', async () => {
    await scheduleHoldEndNotification(30)
    expect(HOLD_END_NOTIF_ID).toBe('eva-hold-end')
    expect(HOLD_NOTIF_TYPE).toBe('hold-end')
    const call = scheduleNotificationAsync.mock.calls[0]![0]
    expect(call.identifier).toBe('eva-hold-end')
    expect(call.content.data).toEqual({ type: 'hold-end' })
    expect(call.content.title).toBe('Terminó tu hold')
  })

  it('re-agendar REEMPLAZA: a lo sumo existe UNA programada', async () => {
    await scheduleHoldEndNotification(30)
    await scheduleHoldEndNotification(45)
    await scheduleHoldEndNotification(20)
    expect(scheduled.size).toBe(1)
    expect(scheduled.has('eva-hold-end')).toBe(true)
  })

  it('el mute global gobierna el sound (misma tuerca que el descanso)', async () => {
    await scheduleHoldEndNotification(30)
    expect(scheduleNotificationAsync.mock.calls[0]![0].content.sound).toBe('default')
    muted = true
    await scheduleHoldEndNotification(30)
    expect(scheduleNotificationAsync.mock.calls[1]![0].content.sound).toBe(false)
  })
})

describe('permiso: nunca promptea', () => {
  it('sin permiso concedido no programa NADA (no-op seguro)', async () => {
    permission = 'denied'
    await scheduleHoldEndNotification(30)
    expect(scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(scheduled.size).toBe(0)
    // Y jamás dispara el prompt (ese es el flujo lazy del descanso, que corre en otro momento).
    expect(ensureRestNotifPermission).not.toHaveBeenCalled()
  })
})

describe('corolario R29: piso de duración', () => {
  it(`por debajo de ${HOLD_NOTIF_MIN_SEC} s no se programa (y cancela lo que hubiera)`, async () => {
    await scheduleHoldEndNotification(30)
    expect(scheduled.size).toBe(1)
    await scheduleHoldEndNotification(HOLD_NOTIF_MIN_SEC - 1)
    expect(scheduled.size).toBe(0)
  })

  it(`justo en ${HOLD_NOTIF_MIN_SEC} s sí se programa`, async () => {
    await scheduleHoldEndNotification(HOLD_NOTIF_MIN_SEC)
    expect(scheduled.size).toBe(1)
  })

  it('un valor no finito o negativo no rompe nada', async () => {
    await scheduleHoldEndNotification(Number.NaN)
    await scheduleHoldEndNotification(-5)
    expect(scheduled.size).toBe(0)
    expect(scheduleNotificationAsync).not.toHaveBeenCalled()
  })
})

describe('(b) cola serializada — cero carreras cancel↔schedule', () => {
  it('una carrera `cancel` + `schedule` deja UNA sola programada', async () => {
    await scheduleHoldEndNotification(30)
    // Sin serializar, el `cancel` puede resolverse DESPUÉS del `schedule` y matar la nueva.
    await Promise.all([cancelHoldEndNotification(), scheduleHoldEndNotification(45)])
    expect(scheduled.size).toBe(1)
    expect(scheduled.has(HOLD_END_NOTIF_ID)).toBe(true)
  })

  it('el orden inverso (`schedule` + `cancel`) deja CERO, sin huérfanas', async () => {
    await Promise.all([scheduleHoldEndNotification(45), cancelHoldEndNotification()])
    expect(scheduled.size).toBe(0)
  })

  it('un chaparrón de cambios de lado deja exactamente una', async () => {
    await Promise.all([
      scheduleHoldEndNotification(30),
      cancelHoldEndNotification(),
      scheduleHoldEndNotification(30),
      cancelHoldEndNotification(),
      scheduleHoldEndNotification(30),
    ])
    expect(scheduled.size).toBe(1)
  })
})

describe('(c) dismiss retira también las ya ENTREGADAS del tipo hold', () => {
  it('barre las visibles del hold y NO toca las del descanso', async () => {
    presented.push(
      { request: { identifier: 'otra-hold', content: { data: { type: HOLD_NOTIF_TYPE } } } },
      { request: restStub() },
    )
    await dismissHoldEndNotification()
    expect(presented.map((n) => n.request.identifier)).toEqual(['eva-rest-end'])
  })
})

describe('(d) sweep al arrancar', () => {
  it('cancela las programadas huérfanas del tipo hold y respeta las ajenas', async () => {
    scheduled.set(HOLD_END_NOTIF_ID, { identifier: HOLD_END_NOTIF_ID, content: { data: { type: HOLD_NOTIF_TYPE } } })
    scheduled.set('vieja-hold', { identifier: 'vieja-hold', content: { data: { type: HOLD_NOTIF_TYPE } } })
    scheduled.set('eva-rest-end', restStub())
    scheduled.set('eva-cardio-end', { identifier: 'eva-cardio-end', content: { data: { type: 'cardio-timer' } } })

    await sweepHoldNotifications()

    expect(Array.from(scheduled.keys()).sort()).toEqual(['eva-cardio-end', 'eva-rest-end'])
  })
})

describe('cancel', () => {
  it('cancela por el id estable y es idempotente', async () => {
    await scheduleHoldEndNotification(30)
    await cancelHoldEndNotification()
    await cancelHoldEndNotification()
    expect(scheduled.size).toBe(0)
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(HOLD_END_NOTIF_ID)
  })
})
