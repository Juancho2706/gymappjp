// @vitest-environment jsdom
/**
 * `KeypadHost` con kilos o libras (tren kg-lb-ejecutor, W4 · SPEC R1/R2/R7).
 *
 * Lo que se protege:
 *  1. Con el selector en libras, lo tecleado se guarda UNA sola vez en kilos (el motor convierte en el
 *     payload) y la serie lleva `weightUnit: 'lb'` — nunca 45 «kilos» ni una doble conversión.
 *  2. Sin la prop `weightUnit` el payload es byte-idéntico al previo al tren (sin key de unidad).
 *  3. Cambiar la unidad con un número escrito lo CONVIERTE (20 kg → 44,1 lb), lo reporta al borrador con
 *     la marca `wu`, y el guardado vuelve a los mismos kilos.
 *  4. El objetivo del header se lee en la unidad (60 kg sugeridos → «132,5 lb», redondeo a 2,5 lb).
 *
 * Mismo harness que `executor-v3-keypad-strength-time.test.ts`: el grafo nativo se dobla por PATH
 * ABSOLUTO con `vi.doMock` + `import()` dinámico y el motor (`@eva/workout-engine`) queda REAL.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeypadTarget, OptimisticLogPayload, WeightUnit } from '@eva/workout-engine'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

function lucideIds(): string[] {
  const cjs = mobileDep('lucide-react-native').split('\\').join('/')
  return [cjs, cjs.replace('/dist/cjs/lucide-react-native.js', '/dist/esm/lucide-react-native.mjs')]
}
function safeAreaIds(): string[] {
  const cjs = mobileDep('react-native-safe-area-context').split('\\').join('/')
  return [cjs, cjs.replace('/lib/commonjs/index.js', '/lib/module/index.js')]
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }

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
vi.doMock(mobileFile('lib', 'motion.ts'), () => ({ useEvaMotion: () => ({ reduced: true }) }))
vi.doMock(mobileFile('lib', 'shadows.ts'), () => ({ shadow: () => ({}) }))
vi.doMock(mobileFile('lib', 'haptics.ts'), () => ({ haptics: { select: vi.fn(), tap: vi.fn(), setDone: vi.fn() } }))
vi.doMock(mobileFile('components', 'alumno', 'workout', 'TypedKeypad.tsx'), () => ({
  EMPTY_CAPTURE_HINT: {
    strength: 'Ingresa al menos las repeticiones',
    cardio: 'Ingresa al menos los minutos',
    mobility: 'Ingresa al menos los segundos del hold',
    roller: 'Ingresa al menos las pasadas',
  },
  KEYPAD_ACTION_STYLE: {},
  KEYPAD_EYEBROW_STYLE: {},
  KeypadDisplayRow: (p: AnyProps) => createElement('div', { 'data-testid': 'display' }, `${p.display as string} ${(p.unit as string) ?? ''}`),
  KeypadGrid: () => createElement('div'),
  KeypadObjectiveHeader: (p: AnyProps) => createElement('div', { 'data-testid': 'objective' }, p.objectiveLine as ReactNode),
  WeightChips: () => createElement('div'),
  // El selector de verdad es pixel; acá dos botones que llaman `onChange` con cada unidad.
  WeightUnitToggle: (p: AnyProps) =>
    createElement(
      'div',
      { 'data-testid': 'unit-toggle' },
      (['kg', 'lb'] as const).map((u) =>
        createElement('button', { key: u, type: 'button', 'data-testid': `unit-${u}`, onClick: () => (p.onChange as (u: string) => void)(u) }, u),
      ),
    ),
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

/**
 * Target de fuerza por tiempo abierto por el prompt de huecos: su primario («Guardar») commitea de un
 * toque, sin «Siguiente» ni nota — la forma más corta de llegar al payload.
 */
function target(over: Partial<KeypadTarget> = {}): KeypadTarget {
  return {
    blockId: 'blk-1',
    setNumber: 1,
    exerciseName: 'Prensa',
    targetReps: '30s',
    targetSets: 4,
    suggestedWeight: 60,
    effortKind: 'rir',
    isEdit: true,
    strengthTimeMode: true,
    holdSource: 'manual',
    prompt: 'hold-gap',
    initialFieldIndex: 0,
    initialValues: { weight: '45', reps: '8', actual_hold_sec: '30' },
    ...over,
  }
}

function mount(t: KeypadTarget, weightUnit?: { value: WeightUnit; onChange: (u: WeightUnit) => void }) {
  return render(
    createElement(KeypadHost, { target: t, onCommit, onClose, onDraftChange, weightUnit }),
  )
}

const committed = () => onCommit.mock.calls[0][0] as OptimisticLogPayload

describe('KeypadHost · kilos o libras (W4)', () => {
  it('en libras guarda KILOS una sola vez y marca la unidad (45 lb → 20,41 kg)', () => {
    mount(target(), { value: 'lb', onChange: vi.fn() })
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed()).toMatchObject({ weightKg: 20.41, weightUnit: 'lb', repsDone: 8 })
  })

  it('sin selector el payload es el de siempre: 45 kg y sin key de unidad', () => {
    mount(target())
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed().weightKg).toBe(45)
    expect('weightUnit' in committed()).toBe(false)
  })

  it('en kilos con selector manda `weightUnit: kg` y el número tal cual', () => {
    mount(target(), { value: 'kg', onChange: vi.fn() })
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    expect(committed()).toMatchObject({ weightKg: 45, weightUnit: 'kg' })
  })

  it('el objetivo sugerido (kg) se lee en libras redondeado a 2,5', () => {
    mount(target(), { value: 'lb', onChange: vi.fn() })
    expect(screen.getByTestId('objective').textContent).toContain('132,5 lb')
  })

  it('cambiar kg → lb con un número escrito lo convierte, lo reporta con `wu` y no duplica al guardar', () => {
    const onChange = vi.fn()
    const t = target({ initialValues: { weight: '20', reps: '8', actual_hold_sec: '30' } })
    const view = mount(t, { value: 'kg', onChange })
    fireEvent.click(screen.getByTestId('unit-lb'))
    expect(onChange).toHaveBeenCalledWith('lb')
    // El ejecutor responde subiendo la unidad del ejercicio: el host re-renderiza con `lb`.
    view.rerender(createElement(KeypadHost, { target: t, onCommit, onClose, onDraftChange, weightUnit: { value: 'lb', onChange } }))
    const draft = onDraftChange.mock.calls.at(-1)?.[0] as Record<string, string>
    expect(draft).toMatchObject({ weight: '44,1', wu: 'lb' })
    expect(screen.getByTestId('display').textContent).toContain('44,1 lb')
    fireEvent.click(screen.getByTestId('keypad-gap-save'))
    // 44,1 lb = 20,0034 kg ⇒ 20 kg: la vuelta queda en el mismo peso, sin convertir dos veces.
    expect(committed()).toMatchObject({ weightKg: 20, weightUnit: 'lb' })
  })
})
