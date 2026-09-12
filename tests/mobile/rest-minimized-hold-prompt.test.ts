// @vitest-environment jsdom
/**
 * R3b de «Reps tras el reloj» (W5.1 · enmienda E1 del owner, 12-09) — «el descanso arranca en el
 * contador MINI sobre la pantalla del ejercicio y recién pasa a la pantalla grande cuando el alumno
 * terminó de anotar, con el MISMO reloj».
 *
 * Se ejercita el `WorkoutTimerProvider` REAL: lo único que se dobla es el `RestTimerHost` (para leerle
 * las props y contar sus montajes) y las hojas nativas que el provider importa. Lo que se protege es
 * justamente lo que un refactor rompería sin que nadie lo note: que expandir NO re-monte el host —si
 * lo re-montara, `useRestTimerEngine` arrancaría de cero y el alumno vería el descanso reiniciado.
 *
 * GOTCHA de entorno: `tests/mobile/**` corre en el project `mobile-node`; este archivo pide jsdom por
 * cabecera (mecanismo de `vitest.config.ts`) porque monta React con `@testing-library/react`.
 * GOTCHA de resolución: los ids bare resuelven distinto desde `tests/` que desde `apps/mobile/`, así
 * que la cadena RN se dobla por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico (mismo patrón que
 * `tests/mobile/executor-v3-hold-module.test.ts`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import React from 'react'
import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)
const timersFile = (file: string) => mobileFile('components', 'alumno', 'workout', 'timers', file)
const v3File = (file: string) => mobileFile('components', 'alumno', 'workout', 'v3', file)

// ── Doble del host: registra CADA render y cuenta los MONTAJES ───────────────────────────────────
type HostProps = { initialSeconds: number; minimized: boolean; onMinimizedChange: (next: boolean) => void }
const hostRenders: HostProps[] = []
const hostMounts = { count: 0 }

vi.doMock(timersFile('RestTimerHost.tsx'), () => ({
  RestTimerHost: (props: HostProps) => {
    hostRenders.push(props)
    React.useEffect(() => {
      hostMounts.count += 1
    }, [])
    return null
  },
}))

// Hojas nativas del provider. `View` descarta props (el `onStartShouldSetResponderCapture` de RN no
// existe en el DOM) y sólo pinta los hijos: acá no se testea layout, se testea el estado.
vi.doMock(mobileDep('react-native'), () => ({
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  StyleSheet: { create: (o: unknown) => o, absoluteFill: {} },
}))
vi.doMock(mobileDep('moti'), () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))
vi.doMock(mobileFile('components', 'Toast.tsx'), () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }))
vi.doMock(timersFile('rest-timer-preferences.ts'), () => ({ hydrateRestTimerPrefs: vi.fn(async () => {}) }))
vi.doMock(timersFile('sound.ts'), () => ({ primeTimerAudio: vi.fn() }))
vi.doMock(timersFile('HoldTimer.tsx'), () => ({ HoldTimer: () => null }))
vi.doMock(timersFile('IntervalTimer.tsx'), () => ({ IntervalTimer: () => null }))
vi.doMock(timersFile('StopwatchTimer.tsx'), () => ({ StopwatchTimer: () => null }))

const { WorkoutTimerProvider, useWorkoutTimers } = await import(
  '../../apps/mobile/components/alumno/workout/timers/TimerProvider'
)
// Mismo grafo que el provider (import dinámico DESPUÉS de los `doMock`), así el mini-store del reloj
// es LA MISMA instancia de módulo que la que publica `startRest`. `rest-clock` no importa nada de RN.
const { clearRestClock, formatRestRemaining, restRemainingA11yLabel, useRestRemainingSec } = await import(
  '../../apps/mobile/components/alumno/workout/timers/rest-clock'
)
type TimersApi = ReturnType<typeof useWorkoutTimers>

/**
 * Monta el provider y devuelve un holder con el `api` del contexto (el mismo que consume `ExecutorV3`).
 * El `api` se publica en un efecto porque escribir la variable de afuera durante el render está
 * prohibido por `react-hooks/immutability`; `act()` corre los efectos, así que queda listo al volver.
 */
function mountProvider() {
  const holder: { api: TimersApi | null } = { api: null }
  const Probe = () => {
    const api = useWorkoutTimers()
    React.useEffect(() => {
      holder.api = api
    })
    return null
  }
  render(React.createElement(WorkoutTimerProvider, null, React.createElement(Probe)))
  return holder
}

const lastHost = () => hostRenders[hostRenders.length - 1]

beforeEach(() => {
  hostRenders.length = 0
  hostMounts.count = 0
  // El store del reloj es module-level (vive entre casos) y acá el host está DOBLADO, así que nadie
  // lo limpia al desmontar: se resetea a mano.
  clearRestClock()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('startRest(…, { minimized }) · R3b', () => {
  it('sin la opción el descanso arranca EXPANDIDO (interstitial), como siempre', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90))
    expect(lastHost().minimized).toBe(false)
    expect(lastHost().initialSeconds).toBe(90)
  })

  it('con `minimized: true` arranca en la BARRA, sin pasar por el interstitial', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90, { minimized: true }))
    expect(lastHost().minimized).toBe(true)
    expect(hostMounts.count).toBe(1)
  })

  it('el flag NO queda pegado: el descanso siguiente sin la opción vuelve a arrancar expandido', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90, { minimized: true }))
    expect(lastHost().minimized).toBe(true)
    act(() => ref.api!.startRest(60))
    expect(lastHost().minimized).toBe(false)
    // Descanso NUEVO ⇒ `nonce` nuevo ⇒ host re-montado (motor fresco). Es lo esperado acá.
    expect(hostMounts.count).toBe(2)
  })
})

describe('expandRest() · R3b', () => {
  it('expande el descanso minimizado SIN re-montar el host (el reloj no se reinicia)', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90, { minimized: true }))
    expect(hostMounts.count).toBe(1)

    act(() => ref.api!.expandRest())

    expect(lastHost().minimized).toBe(false)
    // LO IMPORTANTE: mismo host, mismo motor. Un re-montaje acá sería el descanso volviendo a 1:30.
    expect(hostMounts.count).toBe(1)
    expect(lastHost().initialSeconds).toBe(90)
  })

  it('es no-op si el descanso ya no está activo (terminó mientras el alumno anotaba)', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90, { minimized: true }))
    act(() => ref.api!.close())
    const rendersAfterClose = hostRenders.length

    expect(() => act(() => ref.api!.expandRest())).not.toThrow()
    expect(hostRenders.length).toBe(rendersAfterClose)
  })

  it('el toque en la barra (`onMinimizedChange`) sigue expandiendo, y el host tampoco se re-monta', () => {
    const ref = mountProvider()
    act(() => ref.api!.startRest(90, { minimized: true }))
    act(() => lastHost().onMinimizedChange(false))
    expect(lastHost().minimized).toBe(false)
    // …y minimizar de vuelta desde el interstitial.
    act(() => lastHost().onMinimizedChange(true))
    expect(lastHost().minimized).toBe(true)
    expect(hostMounts.count).toBe(1)
  })
})

/**
 * El orden importa y no se ve en ningún assert de runtime: la decisión de R3 tiene que calcularse
 * ANTES de `onCommitSet` (el orquestador la necesita EN el commit para arrancar el descanso
 * minimizado) mientras que la APERTURA del teclado sigue DESPUÉS (riesgo 2 del PLAN: `handleCommit`
 * limpia el teclado con un `setKeypadTarget(null)` síncrono en su primera línea). Montar las dos
 * pantallas completas para probar esto costaría media suite; el orden en la fuente es exacto y barato.
 */
describe('las pantallas deciden ANTES de commitear y abren DESPUÉS', () => {
  const SCREENS = {
    'ExerciseScreenV3.tsx': 'onCommitSet(payload, commitSetOptsFor({ repeat: isRepeat, minimizeRest: gap != null }))',
    'SupersetScreenV3.tsx': 'onCommitSet(payload, commitSetOptsFor({ minimizeRest: gap != null }))',
  } as const

  for (const [file, commitCall] of Object.entries(SCREENS)) {
    it(`${file}: holdCapturePromptFor → onCommitSet → onOpenSet`, () => {
      const src = fs.readFileSync(v3File(file), 'utf8')
      const decideAt = src.indexOf('holdCapturePromptFor({')
      const commitAt = src.indexOf(commitCall)
      const openAt = src.indexOf("prompt: 'hold-gap' })")
      expect(decideAt, 'la decisión (helper puro)').toBeGreaterThan(-1)
      expect(commitAt, 'el commit con su `opts`').toBeGreaterThan(decideAt)
      expect(openAt, 'la apertura del teclado').toBeGreaterThan(commitAt)
      // Una sola llamada a la regla por pantalla: si aparece dos veces, alguien la duplicó.
      expect((src.match(/holdCapturePromptFor\(\{/g) ?? []).length).toBe(1)
    })
  }

  it('ExecutorV3 pasa `minimized` en los DOS `startRest` automáticos y expande al resolver el prompt', () => {
    const src = fs.readFileSync(v3File('ExecutorV3.tsx'), 'utf8')
    // Ronda de superserie + bloque suelto. El tercero (`startPendingRoundRest`, el CTA manual) NO.
    expect(src).toContain('{ ...roundRestStartArgs(plan), minimized: opts?.minimizeRest === true }')
    expect(src).toContain('minimized: opts?.minimizeRest === true,')
    expect(src).toContain('timers.startRest(pending.seconds, roundRestStartArgs(pending))')
    // La expansión vive DENTRO de `resolveHoldPrompt` (que sólo corre si había un prompt `hold-gap`).
    const resolveAt = src.indexOf('const resolveHoldPrompt = useCallback(')
    const expandAt = src.indexOf('expandRest()', resolveAt)
    const nextCallbackAt = src.indexOf('const openSet = useCallback(', resolveAt)
    expect(resolveAt).toBeGreaterThan(-1)
    expect(expandAt).toBeGreaterThan(resolveAt)
    expect(expandAt).toBeLessThan(nextCallbackAt)
  })
})

/**
 * W5.1b — el chip vivo «Descanso 1:27» dentro del teclado. El `KeypadHost` es un `Modal` con la hoja
 * abajo: le tapa al alumno la `RestTimerBar` minimizada, así que el tiempo que queda tiene que verse
 * dentro del teclado. Se prueba el hook contra el `startRest` REAL del provider.
 */
describe('useRestRemainingSec · el reloj que ve el alumno mientras anota (W5.1b)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sin descanso vivo devuelve null (no hay chip que pintar)', () => {
    const hook = renderHook(() => useRestRemainingSec())
    expect(hook.result.current).toBeNull()
  })

  it('sigue al descanso minimizado: 90 s → 85 s a los 5 s → null al cancelar', () => {
    const ref = mountProvider()
    const hook = renderHook(() => useRestRemainingSec())

    act(() => ref.api!.startRest(90, { minimized: true }))
    expect(hook.result.current).toBe(90)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(hook.result.current).toBe(85)

    act(() => ref.api!.cancelRest())
    expect(hook.result.current).toBeNull()
  })

  it('un descanso que arranca en PAUSA (`autoStart: false`) muestra los segundos congelados', () => {
    const ref = mountProvider()
    const hook = renderHook(() => useRestRemainingSec())

    act(() => ref.api!.startRest(60, { minimized: true, autoStart: false }))
    expect(hook.result.current).toBe(60)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // En pausa el reloj NO corre: sigue en 60 (el motor lo republica si el alumno reanuda).
    expect(hook.result.current).toBe(60)
  })
})

describe('formato del chip · W5.1b', () => {
  it('mm:ss mientras corre y «¡A entrenar!» en el 0', () => {
    expect(formatRestRemaining(87)).toBe('1:27')
    expect(formatRestRemaining(9)).toBe('0:09')
    expect(formatRestRemaining(0)).toBe('¡A entrenar!')
  })

  it('la etiqueta hablada dice minutos y segundos, y concuerda en singular', () => {
    expect(restRemainingA11yLabel(87)).toBe('Descanso, quedan 1 minuto 27 segundos')
    expect(restRemainingA11yLabel(27)).toBe('Descanso, quedan 27 segundos')
    expect(restRemainingA11yLabel(60)).toBe('Descanso, queda 1 minuto')
    expect(restRemainingA11yLabel(1)).toBe('Descanso, queda 1 segundo')
    expect(restRemainingA11yLabel(0)).toBe('Descanso terminado, a entrenar')
  })

  it('el chip vive SÓLO en el prompt de huecos y en su propio componente (un tick no re-renderiza el teclado)', () => {
    const src = fs.readFileSync(
      path.resolve(mobileDir, 'components', 'alumno', 'workout', 'KeypadHost.tsx'),
      'utf8',
    )
    const gapAt = src.indexOf('{gapPrompt ? (')
    const chipAt = src.indexOf('<RestClockChip accent={accent} />')
    expect(gapAt).toBeGreaterThan(-1)
    expect(chipAt).toBeGreaterThan(gapAt)
    expect((src.match(/<RestClockChip/g) ?? []).length).toBe(1)
    // El hook se llama en `RestClockChip` —declarado ANTES del host— y nunca en el cuerpo del host:
    // si migrara ahí adentro, cada segundo re-renderizaría display, grid y chips mientras se tipea.
    expect(src.indexOf('useRestRemainingSec()')).toBeLessThan(src.indexOf('export function KeypadHost({'))
  })
})
