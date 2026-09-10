// @vitest-environment jsdom
/**
 * Motor de tiempo y estado del HOLD en pantalla (specs/cuenta-atras-en-pantalla, W3.1 + W3.2;
 * IDs **W3.T2** y **W3.T3** de DATA-TESTING §6.3).
 *
 * Se ejercita el hook REAL (`useCountdown` de `v3/timing.ts` y `useHoldModule` de
 * `v3/use-hold-module.ts`), no una copia: la regla que se protege —«el resultado no puede depender
 * de quién ganó la carrera a `triggerDone`»— vive dentro del hook y una reimplementación en el test
 * la volvería a escribir mal.
 *
 * GOTCHA de entorno: `tests/mobile/**\/*.test.ts` corre en el project `mobile-node` (node). Este
 * archivo pide jsdom por cabecera (mecanismo documentado en `vitest.config.ts:70-73`) porque
 * `renderHook` de Testing Library necesita `react-dom`. Sigue perteneciendo al project `mobile-node`
 * y lo corre el gate de W3 tal cual.
 *
 * GOTCHA de resolución: los ids bare resuelven distinto desde `tests/` que desde `apps/mobile/`, así
 * que la cadena React Native se mockea por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico
 * (mismo patrón que `tests/mobile/offline-queue-side-reps.test.ts`).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldSource, OptimisticLogPayload } from '@eva/workout-engine'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

// ── Dobles de la cadena nativa ────────────────────────────────────────────────────────────────────
type AppStateHandler = (state: string) => void
const appState = {
  currentState: 'active' as string,
  listeners: new Set<AppStateHandler>(),
}
/** Emula `AppState`: sólo `currentState` + `addEventListener('change')`, que es todo lo que usa el hook. */
const AppStateMock = {
  get currentState() {
    return appState.currentState
  },
  addEventListener(_event: string, handler: AppStateHandler) {
    appState.listeners.add(handler)
    return { remove: () => appState.listeners.delete(handler) }
  },
}
/** Cambia el estado de la app y NOTIFICA (el orden real: `currentState` primero, listeners después). */
function emitAppState(next: string) {
  appState.currentState = next
  for (const l of Array.from(appState.listeners)) l(next)
}

const holdDone = vi.fn()
const notif = {
  schedule: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  dismiss: vi.fn(async () => {}),
  sweep: vi.fn(async () => {}),
}

vi.doMock(mobileDep('react-native'), () => ({
  AppState: AppStateMock,
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Vibration: { vibrate: vi.fn() },
}))
vi.doMock(mobileFile('lib', 'haptics.ts'), () => ({
  haptics: {},
  timerHaptics: { holdDone },
}))
vi.doMock(mobileFile('components', 'alumno', 'workout', 'timers', 'hold-notification.ts'), () => ({
  scheduleHoldEndNotification: notif.schedule,
  cancelHoldEndNotification: notif.cancel,
  dismissHoldEndNotification: notif.dismiss,
  sweepHoldNotifications: notif.sweep,
  HOLD_NOTIF_MIN_SEC: 10,
}))

const { useCountdown } = await import('../../apps/mobile/components/alumno/workout/v3/timing')
const { useHoldModule } = await import('../../apps/mobile/components/alumno/workout/v3/use-hold-module')
type UseHoldModuleArgs = Parameters<typeof useHoldModule>[0]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
  appState.currentState = 'active'
  appState.listeners.clear()
  holdDone.mockClear()
  notif.schedule.mockClear()
  notif.cancel.mockClear()
  notif.dismiss.mockClear()
  notif.sweep.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Avanza el reloj FALSO y deja correr los intervalos de 250 ms del hook. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// W3.T3 · `useCountdown` — `expiredWhileAway` derivado de EVIDENCIA (R27) y `prime` (W3.1b)
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('useCountdown · expiredWhileAway sale de la evidencia, no del emisor (W3.1a / R27)', () => {
  /**
   * Monta un hold de 30 s ya corriendo, «bloquea la pantalla» y salta 3 minutos. Los dos caminos a
   * `triggerDone` compiten: acá se fuerza cuál gana y se exige el MISMO veredicto.
   */
  function runAwayScenario(winner: 'tick' | 'appstate') {
    const onDone = vi.fn()
    renderHook(() => useCountdown(30, onDone, true))
    // El efecto ancla `endRef` en el primer render: el fin absoluto es ahora + 30 s.
    advance(250)
    expect(onDone).not.toHaveBeenCalled()

    // La app se va a background y vuelve 3 minutos después (pantalla bloqueada).
    act(() => {
      appState.currentState = 'background'
    })
    vi.setSystemTime(Date.now() + 180_000)

    if (winner === 'tick') {
      // El intervalo pendiente corre ANTES de que llegue el evento de visibilidad: `currentState`
      // sigue diciendo 'background', pero además el fin quedó 150 s atrás.
      advance(250)
      emitAppState('active')
    } else {
      // El evento gana: RN ya dejó `currentState` en 'active' cuando notifica.
      act(() => {
        emitAppState('active')
      })
      advance(250)
    }
    return onDone
  }

  it('gana el TICK ⇒ expiredWhileAway: true', () => {
    const onDone = runAwayScenario('tick')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ expiredWhileAway: true })
  })

  it('gana el evento de AppState ⇒ el MISMO expiredWhileAway: true', () => {
    const onDone = runAwayScenario('appstate')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ expiredWhileAway: true })
  })

  it('fin en foreground y en hora ⇒ expiredWhileAway: false (el lado 2 puede arrancar solo)', () => {
    const onDone = vi.fn()
    renderHook(() => useCountdown(2, onDone, true))
    advance(2_100)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ expiredWhileAway: false })
  })

  it('dispara UNA sola vez aunque los dos caminos lleguen', () => {
    const onDone = vi.fn()
    renderHook(() => useCountdown(1, onDone, true))
    advance(1_100)
    act(() => {
      emitAppState('active')
    })
    advance(500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('useCountdown · prime deja el reloj ARMADO en idle (W3.1b / R27)', () => {
  it('prime(30) ⇒ idle mostrando el objetivo, sin arrancar ni disparar onDone', () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useCountdown(10, onDone, false))
    act(() => {
      result.current.prime(30)
    })
    expect(result.current.remaining).toBe(30)
    expect(result.current.running).toBe(false)
    expect(result.current.started).toBe(false)
    expect(result.current.done).toBe(false)
    expect(result.current.endAtMs).toBeNull()
    advance(5_000)
    expect(result.current.remaining).toBe(30)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('un reloj YA vencido vuelve a idle con prime (no queda en 0:00 done)', () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useCountdown(1, onDone, true))
    advance(1_100)
    expect(result.current.done).toBe(true)
    act(() => {
      result.current.prime(30)
    })
    expect(result.current.remaining).toBe(30)
    expect(result.current.done).toBe(false)
    expect(result.current.started).toBe(false)
  })

  it('restart NO cambia de comportamiento: sigue arrancando (llamadores actuales intactos)', () => {
    const { result } = renderHook(() => useCountdown(10, undefined, false))
    act(() => {
      result.current.restart(30)
    })
    expect(result.current.running).toBe(true)
    expect(result.current.started).toBe(true)
    expect(result.current.remaining).toBe(30)
  })

  it('endAtMs expone el fin ABSOLUTO mientras corre y se limpia al parar', () => {
    const { result } = renderHook(() => useCountdown(30, undefined, false))
    expect(result.current.endAtMs).toBeNull()
    act(() => {
      result.current.toggle()
    })
    expect(result.current.endAtMs).toBe(Date.now() + 30_000)
    act(() => {
      result.current.toggle()
    })
    expect(result.current.endAtMs).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// W3.T2 · `useHoldModule`
// ═════════════════════════════════════════════════════════════════════════════════════════════════

interface Harness {
  onSeed: ReturnType<typeof vi.fn>
  onCommit: ReturnType<typeof vi.fn>
  onSideChange: ReturnType<typeof vi.fn>
  typed: Record<string, string>
}

function mountHold(over: Partial<UseHoldModuleArgs> = {}) {
  const h: Harness = {
    onSeed: vi.fn(),
    onCommit: vi.fn(),
    onSideChange: vi.fn(),
    typed: {},
  }
  const args: UseHoldModuleArgs = {
    kind: 'mobility',
    blockId: 'blk-1',
    setNumber: 1,
    prescribedSec: 30,
    sideMode: null,
    context: 'solo',
    closesRound: false,
    resetKey: 'blk-1:1:1',
    getCaptureValues: () => h.typed,
    onSeed: h.onSeed,
    onCommit: h.onCommit,
    onSideChange: h.onSideChange,
    ...over,
  }
  const view = renderHook((props: UseHoldModuleArgs) => useHoldModule(props), { initialProps: args })
  return { ...view, h, args }
}

/** Payload y fuente del enésimo `onCommit`. */
function commitAt(h: Harness, i = 0) {
  const call = h.onCommit.mock.calls[i] as [OptimisticLogPayload, HoldSource, Record<string, unknown>]
  return { payload: call[0], source: call[1], info: call[2] }
}

describe('useHoldModule · A1/R21 — nada corre solo al abrir la pantalla', () => {
  it('arranca en idle con el objetivo cargado', () => {
    const { result } = mountHold()
    expect(result.current.status).toBe('idle')
    expect(result.current.remaining).toBe(30)
    expect(result.current.total).toBe(30)
    expect(result.current.side).toBe('single')
    expect(result.current.sides).toEqual(['single'])
    advance(5_000)
    expect(result.current.remaining).toBe(30)
    expect(result.current.status).toBe('idle')
  })

  it('barre las notificaciones huérfanas al montar (regla (d) de QA-10)', () => {
    mountHold()
    expect(notif.sweep).toHaveBeenCalledTimes(1)
  })
})

describe('useHoldModule · V2 — a 0 se anota y se envía solo, con la marca del reloj', () => {
  it('bilateral: guarda el OBJETIVO, marca timer y no avanza (V3)', () => {
    const { result, h } = mountHold({ prescribedSec: 5 })
    act(() => result.current.start())
    expect(result.current.status).toBe('running')
    advance(5_200)

    expect(h.onSeed).toHaveBeenCalled()
    const seeded = h.onSeed.mock.calls.at(-1)?.[0] as Record<string, string>
    expect(seeded).toEqual({ actual_hold_sec: '5' })

    const { payload, source, info } = commitAt(h)
    expect(source).toBe('timer')
    expect(info).toMatchObject({ side: 'single', advance: 'stay', expiredWhileAway: false })
    // CA-28: el hold BILATERAL de movilidad también gana la marca (contexto-objeto, W1.3b).
    expect(payload).toMatchObject({
      blockId: 'blk-1',
      setNumber: 1,
      actualHoldSec: 5,
      metadata: { hold_source: 'timer' },
    })
    expect(result.current.status).toBe('done')
  })

  it('vuelve de background con 300 s en un hold de 30 ⇒ guarda 30, no el reloj de pared', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    act(() => {
      appState.currentState = 'background'
    })
    vi.setSystemTime(Date.now() + 300_000)
    advance(250)
    act(() => emitAppState('active'))

    const { payload, info } = commitAt(h)
    expect(payload.actualHoldSec).toBe(30)
    expect(info.expiredWhileAway).toBe(true)
    expect(result.current.expiredWhileAway).toBe(true)
  })

  it('la háptica de 0 suena en foreground y NO cuando venció con la app fuera (W3.8/R31)', () => {
    const a = mountHold({ prescribedSec: 3 })
    act(() => a.result.current.start())
    advance(3_200)
    expect(holdDone).toHaveBeenCalledTimes(1)

    holdDone.mockClear()
    const b = mountHold({ prescribedSec: 30, blockId: 'blk-2' })
    act(() => b.result.current.start())
    act(() => {
      appState.currentState = 'background'
    })
    vi.setSystemTime(Date.now() + 300_000)
    advance(250)
    expect(holdDone).not.toHaveBeenCalled()
  })

  it('un envío por serie: el guard `block:set:side` impide el doble commit', () => {
    const { result, h } = mountHold({ prescribedSec: 3 })
    act(() => result.current.start())
    advance(3_200)
    expect(h.onCommit).toHaveBeenCalledTimes(1)
    // Re-medir y volver a llegar a 0 NO manda una segunda fila (el alumno corrige, no duplica).
    act(() => result.current.remeasure())
    act(() => result.current.start())
    advance(3_200)
    expect(h.onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('useHoldModule · A2/R22 — «Listo» antes de 0 y pausa', () => {
  it('doneEarly guarda LO TRANSCURRIDO con hold_source manual', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    vi.setSystemTime(Date.now() + 12_000)
    advance(250)
    act(() => result.current.doneEarly())

    const { payload, source } = commitAt(h)
    expect(source).toBe('manual')
    expect(payload.actualHoldSec).toBe(12)
    expect(payload.metadata).toMatchObject({ hold_source: 'manual' })
  })

  it('pausa: rellena la caja y NO envía', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    vi.setSystemTime(Date.now() + 8_000)
    advance(250)
    act(() => result.current.pause())

    expect(h.onCommit).not.toHaveBeenCalled()
    expect(h.onSeed.mock.calls.at(-1)?.[0]).toEqual({ actual_hold_sec: '8' })
    expect(result.current.status).toBe('paused')
  })

  it('remeasure vuelve a idle y NO reescribe la caja (restart ⇒ fillSeconds null)', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    vi.setSystemTime(Date.now() + 9_000)
    advance(250)
    h.onSeed.mockClear()
    act(() => result.current.remeasure())
    expect(h.onSeed).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.remaining).toBe(30)
  })

  it('con 0 s transcurridos «Listo» no envía nada (no-op del motor)', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.doneEarly())
    expect(h.onCommit).not.toHaveBeenCalled()
    expect(h.onSeed).not.toHaveBeenCalled()
  })
})

describe('useHoldModule · per_side (R34/R6)', () => {
  const perSide = { sideMode: 'per_side', prescribedSec: 4 } as const

  it('el izquierdo SIEMBRA y no envía; el derecho manda UNA fila con los dos lados', () => {
    const { result, h } = mountHold(perSide)
    expect(result.current.sides).toEqual(['left', 'right'])
    act(() => result.current.start())
    advance(4_200)

    // Lado 1: sólo semilla.
    expect(h.onCommit).not.toHaveBeenCalled()
    expect(h.onSeed.mock.calls.at(-1)?.[0]).toEqual({ hold_left_sec: '4' })
    expect(result.current.side).toBe('right')
    // Foreground ⇒ el lado 2 arranca SOLO (paridad con hoy).
    expect(h.onSideChange).toHaveBeenCalledWith('right', true)
    expect(result.current.running).toBe(true)

    advance(4_200)
    const { payload, source } = commitAt(h)
    expect(source).toBe('timer')
    // Una sola fila: `actual_hold_sec` = L + R y el desglose en el jsonb, con la marca en el MISMO objeto.
    expect(payload).toMatchObject({
      actualHoldSec: 8,
      metadata: { left_sec: 4, right_sec: 4, hold_source: 'timer' },
    })
  })

  it('R6: vencido con la app FUERA el lado 2 queda ARMADO en idle, no corriendo', () => {
    const { result, h } = mountHold({ ...perSide, prescribedSec: 30 })
    act(() => result.current.start())
    act(() => {
      appState.currentState = 'background'
    })
    vi.setSystemTime(Date.now() + 300_000)
    advance(250)
    act(() => emitAppState('active'))

    expect(result.current.side).toBe('right')
    expect(result.current.running).toBe(false)
    expect(result.current.started).toBe(false)
    expect(result.current.remaining).toBe(30)
    expect(h.onSideChange).toHaveBeenCalledWith('right', false)
    // Y el izquierdo quedó con el OBJETIVO, no con los 300 s de reloj de pared.
    expect(h.onSeed.mock.calls.at(-1)?.[0]).toEqual({ hold_left_sec: '30' })
  })

  it('lo TIPEADO por el alumno en la fila viaja en el payload del auto-envío', () => {
    const { result, h } = mountHold(perSide)
    act(() => result.current.start())
    advance(4_200)
    // El alumno corrige el izquierdo a mano antes de que cierre el derecho.
    h.typed = { hold_left_sec: '6' }
    advance(4_200)
    const { payload } = commitAt(h)
    expect(payload).toMatchObject({ actualHoldSec: 10, metadata: { left_sec: 6, right_sec: 4 } })
  })
})

describe('useHoldModule · superserie (V4 / D2)', () => {
  it('miembro que NO cierra la ronda ⇒ advance next-member', () => {
    const { result, h } = mountHold({ context: 'superset', closesRound: false, prescribedSec: 3 })
    act(() => result.current.start())
    advance(3_200)
    expect(commitAt(h).info).toMatchObject({ advance: 'next-member', closesRound: false })
  })

  it('miembro que CIERRA la ronda ⇒ advance stay (el descanso espera el toque, D2)', () => {
    const { result, h } = mountHold({ context: 'superset', closesRound: true, prescribedSec: 3 })
    act(() => result.current.start())
    advance(3_200)
    expect(commitAt(h).info).toMatchObject({ advance: 'stay', closesRound: true })
  })
})

describe('useHoldModule · fuerza por tiempo', () => {
  it('usa buildStrengthTimePayload: reps_done null, peso conservado y la marca del reloj', () => {
    const { result, h } = mountHold({ kind: 'strength_time', prescribedSec: 3 })
    h.typed = { weight: '10', rir: '2' }
    act(() => result.current.start())
    advance(3_200)
    const { payload } = commitAt(h)
    expect(payload).toMatchObject({
      weightKg: 10,
      repsDone: null,
      rir: 2,
      actualHoldSec: 3,
      metadata: { hold_source: 'timer' },
    })
    // `actual_duration_sec` es el eje de cardio: un hold NUNCA lo escribe (§ W1.3).
    expect(payload.actualDurationSec).toBeUndefined()
  })
})

describe('useHoldModule · resetKey y suspensión', () => {
  it('cambiar de serie/ronda vuelve a idle y reinicia los lados', () => {
    const { result, rerender, args } = mountHold({ sideMode: 'per_side', prescribedSec: 4 })
    act(() => result.current.start())
    advance(4_200)
    expect(result.current.side).toBe('right')

    act(() => {
      rerender({ ...args, setNumber: 2, resetKey: 'blk-1:2:2' })
    })
    expect(result.current.side).toBe('left')
    expect(result.current.status).toBe('idle')
    expect(result.current.remaining).toBe(4)
  })

  it('el descanso de grupo SUSPENDE la cuenta sin decisión del motor (no rellena ni envía)', () => {
    const { result, rerender, args, h } = mountHold({ context: 'superset', prescribedSec: 30 })
    act(() => result.current.start())
    vi.setSystemTime(Date.now() + 5_000)
    advance(250)
    act(() => {
      rerender({ ...args, context: 'superset', prescribedSec: 30, suspended: true })
    })
    expect(result.current.status).toBe('paused')
    expect(result.current.running).toBe(false)
    expect(h.onSeed).not.toHaveBeenCalled()
    expect(h.onCommit).not.toHaveBeenCalled()
  })
})

describe('useHoldModule · aviso del SO (W3.6)', () => {
  it('start y resume programan; pausa, «Listo» y re-medir cancelan + descartan', () => {
    const { result } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    expect(notif.schedule).toHaveBeenCalledWith(30)

    act(() => result.current.pause())
    expect(notif.cancel).toHaveBeenCalled()
    expect(notif.dismiss).toHaveBeenCalled()

    notif.schedule.mockClear()
    act(() => result.current.resume())
    expect(notif.schedule).toHaveBeenCalledTimes(1)

    notif.cancel.mockClear()
    act(() => result.current.remeasure())
    expect(notif.cancel).toHaveBeenCalled()
  })

  it('cambiar de LADO cancela y reprograma', () => {
    const { result } = mountHold({ sideMode: 'per_side', prescribedSec: 4 })
    act(() => result.current.start())
    notif.schedule.mockClear()
    notif.cancel.mockClear()
    advance(4_200)
    expect(notif.cancel).toHaveBeenCalled()
    expect(notif.schedule).toHaveBeenCalledWith(4)
    expect(result.current.side).toBe('right')
  })

  it('en los últimos ~2 s se cancela (el handler global no la pinta con la app abierta)', () => {
    const { result } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    notif.cancel.mockClear()
    vi.setSystemTime(Date.now() + 28_500)
    advance(250)
    expect(result.current.remaining).toBeLessThanOrEqual(2)
    expect(notif.cancel).toHaveBeenCalled()
  })

  it('volver a foreground cancela y descarta', () => {
    const { result } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    notif.cancel.mockClear()
    notif.dismiss.mockClear()
    act(() => emitAppState('active'))
    expect(notif.cancel).toHaveBeenCalled()
    expect(notif.dismiss).toHaveBeenCalled()
  })

  it('desmontar limpia', () => {
    const { result, unmount } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    notif.cancel.mockClear()
    unmount()
    expect(notif.cancel).toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// CA-90 · «Listo» desde idle siembra el OBJETIVO y no envía (la fila lo confirma, como hoy)
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('useHoldModule · CA-90 — seedObjective desde idle', () => {
  it('bilateral: siembra los segundos del objetivo, NO envía y sigue idle', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.seedObjective())
    expect(h.onCommit).not.toHaveBeenCalled()
    expect(h.onSeed.mock.calls.at(-1)?.[0]).toEqual({ actual_hold_sec: '30' })
    expect(result.current.status).toBe('idle')
  })

  it('per_side: el izquierdo siembra y deja el derecho ARMADO sin arrancar', () => {
    const { result, h } = mountHold({ prescribedSec: 30, sideMode: 'per_side' })
    act(() => result.current.seedObjective())
    expect(h.onSeed.mock.calls.at(-1)?.[0]).toEqual({ hold_left_sec: '30' })
    expect(result.current.side).toBe('right')
    expect(result.current.running).toBe(false)
    expect(h.onSideChange).toHaveBeenCalledWith('right', false)
    expect(h.onCommit).not.toHaveBeenCalled()
  })

  it('corriendo es un no-op (la caja la rellena el reloj, no el objetivo)', () => {
    const { result, h } = mountHold({ prescribedSec: 30 })
    act(() => result.current.start())
    h.onSeed.mockClear()
    act(() => result.current.seedObjective())
    expect(h.onSeed).not.toHaveBeenCalled()
  })
})
