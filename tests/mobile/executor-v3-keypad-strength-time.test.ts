// @vitest-environment jsdom
/**
 * `KeypadHost` en modo FUERZA POR TIEMPO — tercera rama del commit (R6) y copy del prompt de huecos
 * (R9), del tren «Reps tras el reloj» (W2.7).
 *
 * Lo que se protege:
 *  1. El re-commit por teclado de una serie que cerró el RELOJ **conserva** `metadata.hold_source`.
 *     Hasta este tren el host sólo tenía dos ramas (`typed` / `strength`), así que editar una plancha
 *     la reescribía con `buildStrengthPayload`: se perdían `actual_hold_sec` y la marca de fuente, y
 *     con ella el assert de DB del E2E W6.10 (`tests/exec-hold-superset.spec.ts:230`).
 *  2. `isEmptyCapture` en modo tiempo IGNORA el peso (misma regla que la fila, `SetRow.tsx:952-962`):
 *     el peso sugerido ya viene puesto, así que contarlo dejaría «Guardar» activo sobre una serie que
 *     nadie entrenó.
 *  3. El secundario «Sin reps» CIERRA sin commitear: la serie ya está guardada por V2 y el prompt no
 *     puede ser una vía para reescribirla en blanco.
 *
 * GOTCHA de resolución (mismo patrón que `module-off-notice.test.tsx` y `executor-v3-hold-module.test.ts`):
 * los ids bare resuelven distinto desde `tests/` que desde `apps/mobile/`, así que el grafo nativo se
 * mockea por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico. Los primitivos de RN se cambian por
 * elementos del DOM (`Pressable` → `button`) para poder disparar los taps con Testing Library. El
 * motor (`@eva/workout-engine`) queda REAL: es justo lo que se está verificando.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeypadTarget, OptimisticLogPayload } from '@eva/workout-engine'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

/** Las dos caras de `lucide-react-native` (CJS por `require`, ESM por `import`). */
function lucideIds(): string[] {
  const cjs = mobileDep('lucide-react-native').split('\\').join('/')
  return [cjs, cjs.replace('/dist/cjs/lucide-react-native.js', '/dist/esm/lucide-react-native.mjs')]
}
/**
 * Igual que lucide: `react-native-safe-area-context` publica `main` (commonjs) y `module` (esm), y
 * `require.resolve` devuelve el primero mientras que Vite prefiere el segundo. Se mockean LAS DOS
 * caras o el doble se aplica a un id que nadie importa y el test intenta cargar el módulo nativo.
 */
function safeAreaIds(): string[] {
  const cjs = mobileDep('react-native-safe-area-context').split('\\').join('/')
  return [cjs, cjs.replace('/lib/commonjs/index.js', '/lib/module/index.js')]
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }

/** Sólo lo que el DOM entiende: el resto de los props de RN no son atributos válidos. */
function domProps(p: AnyProps): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof p.testID === 'string') out['data-testid'] = p.testID
  if (typeof p.accessibilityLabel === 'string') out['aria-label'] = p.accessibilityLabel
  return out
}

const box = (p: AnyProps) => createElement('div', domProps(p), p.children)
const span = (p: AnyProps) => createElement('span', domProps(p), p.children)
const button = (p: AnyProps) =>
  createElement(
    'button',
    { ...domProps(p), type: 'button', disabled: p.disabled === true, onClick: p.onPress as (() => void) | undefined },
    p.children,
  )

vi.doMock(mobileDep('react-native'), () => ({
  Modal: (p: AnyProps) => createElement('div', null, p.children),
  KeyboardAvoidingView: box,
  View: box,
  Text: span,
  TextInput: () => createElement('input'),
  Pressable: button,
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
}))
vi.doMock(mobileDep('moti'), () => ({
  MotiView: box,
  AnimatePresence: (p: AnyProps) => createElement('div', null, p.children),
}))
for (const id of safeAreaIds()) {
  vi.doMock(id, () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
}
for (const id of lucideIds()) {
  const icon = () => createElement('i')
  vi.doMock(id, () => ({ ArrowLeft: icon, ArrowRight: icon, Check: icon, StickyNote: icon, X: icon }))
}
// `lib/motion` arrastra Reanimated y `lib/shadows` el brand-kit + la identidad del loader: nada de eso
// participa de la decisión que se prueba.
vi.doMock(mobileFile('lib', 'motion.ts'), () => ({ useEvaMotion: () => ({ reduced: true }) }))
vi.doMock(mobileFile('lib', 'shadows.ts'), () => ({ shadow: () => ({}) }))
vi.doMock(mobileFile('lib', 'haptics.ts'), () => ({ haptics: { select: vi.fn(), tap: vi.fn(), setDone: vi.fn() } }))
// Las primitivas presentacionales del teclado (display, grid, chips, header) son puro pixel: se
// sustituyen por cajas vacías para no arrastrar otra vez la cadena nativa.
vi.doMock(mobileFile('components', 'alumno', 'workout', 'TypedKeypad.tsx'), () => ({
  EMPTY_CAPTURE_HINT: {
    strength: 'Ingresa al menos las repeticiones',
    cardio: 'Ingresa al menos los minutos',
    mobility: 'Ingresa al menos los segundos del hold',
    roller: 'Ingresa al menos las pasadas',
  },
  KEYPAD_ACTION_STYLE: {},
  KEYPAD_EYEBROW_STYLE: {},
  KeypadDisplayRow: () => createElement('div'),
  KeypadGrid: () => createElement('div'),
  KeypadObjectiveHeader: (p: AnyProps) => createElement('div', { 'data-testid': 'objective' }, p.objectiveLine as ReactNode),
  WeightChips: () => createElement('div'),
}))

const { KeypadHost } = await import('../../apps/mobile/components/alumno/workout/KeypadHost')

const onCommit = vi.fn()
const onClose = vi.fn()
const onDraftChange = vi.fn()

beforeEach(() => {
  onCommit.mockClear()
  onClose.mockClear()
  onDraftChange.mockClear()
})

/** Target de fuerza por tiempo tal como lo arma la rama nueva de `openSet` (R5). */
function timeTarget(over: Partial<KeypadTarget> = {}): KeypadTarget {
  return {
    blockId: 'blk-1',
    setNumber: 2,
    exerciseName: 'Plancha frontal',
    targetReps: '30s',
    targetSets: 4,
    suggestedWeight: 60,
    effortKind: 'rir',
    isEdit: true,
    strengthTimeMode: true,
    holdSource: 'timer',
    prompt: 'hold-gap',
    initialFieldIndex: 1,
    initialValues: { weight: '60', reps: '8', actual_hold_sec: '30' },
    ...over,
  }
}

function mount(target: KeypadTarget) {
  return render(
    createElement(KeypadHost, { target, onCommit, onClose, onDraftChange, accent: '#1462DC', accentText: '#FFFFFF' }),
  )
}

/** Payload del primer `onCommit`. */
const committed = () => onCommit.mock.calls[0][0] as OptimisticLogPayload

describe('KeypadHost · fuerza por tiempo (R6) — tercera rama del commit', () => {
  it('guarda hold + reps + peso y CONSERVA `metadata.hold_source` del target', () => {
    mount(timeTarget())
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(committed()).toMatchObject({
      blockId: 'blk-1',
      setNumber: 2,
      weightKg: 60,
      repsDone: 8,
      actualHoldSec: 30,
      metadata: { hold_source: 'timer' },
    })
    // `actual_duration_sec` es el eje de cardio: un hold NUNCA lo escribe.
    expect(committed().actualDurationSec).toBeUndefined()
  })

  it('sin `holdSource` en el target la marca cae a `manual` (la escribió una persona)', () => {
    mount(timeTarget({ holdSource: null }))
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed().metadata).toMatchObject({ hold_source: 'manual' })
  })

  it('`per_side`: `actual_hold_sec` es la SUMA y el desglose viaja con la marca en el MISMO jsonb', () => {
    mount(
      timeTarget({
        sideMode: 'per_side',
        initialValues: { weight: '20', reps: '6', hold_left_sec: '30', hold_right_sec: '28' },
      }),
    )
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed()).toMatchObject({
      actualHoldSec: 58,
      repsDone: 6,
      metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
    })
  })

  it('las reps vacías se guardan como `null`, nunca como 0 (F1)', () => {
    mount(timeTarget({ initialValues: { weight: '60', reps: '', actual_hold_sec: '30' } }))
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed().repsDone).toBeNull()
    expect(committed().actualHoldSec).toBe(30)
  })
})

describe('KeypadHost · fuerza por tiempo — `isEmptyCapture` ignora el peso', () => {
  it('sólo con el peso sugerido el primario queda INERTE (el peso no es trabajo registrado)', () => {
    mount(timeTarget({ initialValues: { weight: '60', reps: '', actual_hold_sec: '' } }))
    const save = screen.getByTestId('keypad-gap-save')
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('con los segundos puestos el primario se habilita aunque no haya reps', () => {
    mount(timeTarget({ initialValues: { weight: '60', reps: '', actual_hold_sec: '30' } }))
    expect(screen.getByTestId('keypad-gap-save')).not.toBeDisabled()
  })

  it('con las reps puestas y sin peso también (el eje obligatorio no es el peso)', () => {
    mount(timeTarget({ initialValues: { weight: '', reps: '8', actual_hold_sec: '' } }))
    expect(screen.getByTestId('keypad-gap-save')).not.toBeDisabled()
  })
})

describe('KeypadHost · copy del prompt de huecos (R9 · SPEC §6)', () => {
  it('foco en REPS: eyebrow con los segundos guardados, pregunta y secundario «Sin reps»', () => {
    mount(timeTarget())
    expect(screen.getByText('Serie 2 · guardada con 30 s')).toBeTruthy()
    expect(screen.getByText('¿Cuántas reps hiciste?')).toBeTruthy()
    const dismiss = screen.getByTestId('keypad-gap-dismiss')
    expect(dismiss.textContent).toBe('Sin reps')
    expect(dismiss.getAttribute('aria-label')).toBe('Dejar la serie sin reps')
    // El objetivo prescrito NO desaparece: el alumno tiene que ver contra qué está anotando (R6).
    expect(screen.getByTestId('objective').textContent).toBe('4×30s · 60 kg')
  })

  it('foco en PESO: la pregunta y el secundario cambian de eje', () => {
    mount(timeTarget({ initialFieldIndex: 0, initialValues: { weight: '', reps: '', actual_hold_sec: '30' } }))
    expect(screen.getByText('¿Con cuánto peso?')).toBeTruthy()
    const dismiss = screen.getByTestId('keypad-gap-dismiss')
    expect(dismiss.textContent).toBe('Sin peso')
    expect(dismiss.getAttribute('aria-label')).toBe('Dejar la serie sin peso')
  })

  it('`per_side`: el eyebrow suma los dos lados, igual que `actual_hold_sec`', () => {
    mount(
      timeTarget({
        sideMode: 'per_side',
        initialValues: { weight: '20', reps: '', hold_left_sec: '30', hold_right_sec: '28' },
      }),
    )
    expect(screen.getByText('Serie 2 · guardada con 58 s')).toBeTruthy()
  })

  it('«Sin reps» CIERRA sin commitear: la serie guardada por el reloj no se toca', () => {
    mount(timeTarget({ initialValues: { weight: '60', reps: '', actual_hold_sec: '30' } }))
    fireEvent.click(screen.getByTestId('keypad-gap-dismiss'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('SIN `prompt` (camino «Editar») el teclado queda como siempre: un solo primario, sin secundario', () => {
    mount(timeTarget({ prompt: undefined }))
    expect(screen.queryByTestId('keypad-gap-dismiss')).toBeNull()
    expect(screen.queryByTestId('keypad-gap-save')).toBeNull()
    // Tres campos y el foco en el 1 ⇒ el primario todavía es «Siguiente», como en cualquier edición.
    expect(screen.getByTestId('keypad-next')).toBeTruthy()
    expect(screen.queryByText('¿Cuántas reps hiciste?')).toBeNull()
  })
})
