/**
 * Builder RN del coach: cambio de tipo del bloque (W4.3 · R6/R32) y alta desde el catálogo con los
 * defaults DEL TIPO (W4.4 · R6).
 *
 * Se ejercitan las dos funciones PURAS que los sheets exportan —`applyBlockTypeChange`
 * (`components/coach/BlockEditorSheet.tsx`, la que llama `setTypeOverride`) y `buildCatalogBlock`
 * (`components/coach/ExerciseSearchSheet.tsx`, la que llama `handleSelect`)— sin renderizar nada:
 * lo que hay que pinnear es la operación sobre el estado del bloque, no el markup (el control
 * «Lado» y el resumen los toca W4.10).
 *
 * Para llegar a esas funciones hay que cargar módulos que importan react-native / expo / gorhom, así
 * que el grafo se mockea por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico (mismo patrón que
 * `module-off-notice.test.tsx`): los ids bare resuelven distinto desde `tests/` que desde
 * `apps/mobile/`. Los stubs nunca se ejecutan — solo tienen que dejar evaluar el módulo.
 *
 * El round-trip contra `serializeBlockInsert` (que el strip llegue a la DB con `null` explícito y no
 * lo reponga el passthrough de `_raw`) vive en `plan-builder-strip-roundtrip.test.ts`; acá se agrega
 * el caso que pasa por el CALL SITE real del sheet, que es lo que W4.3 cablea.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { POLYMORPHIC_BLOCK_FIELDS, SHARED_BLOCK_FIELDS } from '@eva/plan-builder'
import { effectiveExerciseType } from '@eva/workout-engine'
import { serializeBlockInsert } from '../../apps/mobile/lib/plan-builder/serialize'
import type { BuilderBlock } from '../../apps/mobile/lib/plan-builder/types'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

const stub = () => null

/** Las dos caras de `lucide-react-native` (CJS por `require`, ESM por `import`). */
function lucideIds(): string[] {
  const cjs = mobileDep('lucide-react-native').split('\\').join('/')
  return [cjs, cjs.replace('/dist/cjs/lucide-react-native.js', '/dist/esm/lucide-react-native.mjs')]
}

/**
 * Iconos que el grafo de los dos sheets necesita: los de cada componente MÁS los de
 * `lib/exercise-type-meta.ts` (`Dumbbell`, `GitCommit`, `HeartPulse`, `Move`), que se evalúa al
 * importar el editor. Si un icono nuevo entra al grafo, el test falla con el nombre exacto.
 */
const LUCIDE_ICONS = [
  'Activity', 'Check', 'ChevronDown', 'ChevronUp', 'Clock', 'Dumbbell', 'Eye', 'GitCommit',
  'HeartPulse', 'History', 'Info', 'Link2', 'Lock', 'Minus', 'Move', 'Pencil', 'Play', 'Plus',
  'Search', 'Trash2', 'X',
] as const

function mockMobileGraph(): void {
  vi.resetModules()

  vi.doMock(mobileDep('react-native'), () => ({
    View: stub,
    Text: stub,
    TextInput: stub,
    TouchableOpacity: stub,
    ScrollView: stub,
    FlatList: stub,
    Modal: stub,
    Pressable: stub,
    ActivityIndicator: stub,
    Switch: stub,
    Keyboard: { dismiss: () => {} },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: {
      create: <T,>(styles: T) => styles,
      flatten: <T,>(styles: T) => styles,
      hairlineWidth: 1,
      absoluteFillObject: {},
    },
  }))
  vi.doMock(mobileDep('@gorhom/bottom-sheet'), () => ({
    default: stub,
    BottomSheetModal: stub,
    BottomSheetScrollView: stub,
    BottomSheetFlatList: stub,
    BottomSheetTextInput: stub,
  }))
  vi.doMock(mobileDep('expo-image'), () => ({ Image: stub }))
  vi.doMock(mobileDep('moti'), () => ({ MotiView: stub, MotiText: stub }))
  vi.doMock(mobileDep('@react-native-async-storage/async-storage'), () => ({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
  }))
  for (const id of lucideIds()) {
    vi.doMock(id, () => Object.fromEntries(LUCIDE_ICONS.map((name) => [name, stub])))
  }

  vi.doMock(mobileFile('lib', 'supabase'), () => ({ supabase: {} }))
  vi.doMock(mobileFile('lib', 'use-sheet-keyboard-inset'), () => ({
    useSheetKeyboardInset: () => ({ keyboardInset: 0, onScroll: () => {} }),
  }))
  vi.doMock(mobileFile('lib', 'exercises'), () => ({
    exerciseThumb: () => null,
    filterExercises: () => [],
    MUSCLE_GROUPS: ['Todos'],
  }))
  vi.doMock(mobileFile('context', 'ThemeContext'), () => ({ useTheme: () => ({ theme: {} }) }))
  vi.doMock(mobileFile('components', 'Switch'), () => ({ Switch: stub }))
  vi.doMock(mobileFile('components', 'Button'), () => ({ Button: stub }))
  vi.doMock(mobileFile('components', 'VideoPlayer'), () => ({ VideoPlayer: stub }))
  vi.doMock(mobileFile('components', 'alumno', 'workout', 'v3', 'ExecMediaV3'), () => ({
    execMediaKind: () => 'none',
  }))
  vi.doMock(mobileFile('components', 'coach', 'ExerciseMediaLightbox'), () => ({
    ExerciseMediaLightbox: stub,
    isExerciseMediaPlayable: () => false,
  }))
  vi.doMock(mobileFile('components', 'coach', 'ExerciseFormSheet'), () => ({ ExerciseFormSheet: stub }))
}

async function loadBlockEditor() {
  mockMobileGraph()
  return import('../../apps/mobile/components/coach/BlockEditorSheet')
}

async function loadExerciseSearch() {
  mockMobileGraph()
  return import('../../apps/mobile/components/coach/ExerciseSearchSheet')
}

/** Fila DB de un bloque de cardio con TODOS los ejes del tipo poblados (lo que hidrata `mapDbBlock`). */
function cardioRow(): Record<string, unknown> {
  return {
    id: 'blk-1',
    plan_id: 'plan-old',
    order_index: 3,
    exercise_id: 'ex-42',
    sets: 4,
    reps: '30min',
    rest_time: '90s',
    notes: 'nota del coach',
    superset_group: 'A',
    section: 'main',
    section_template_id: 'sect-1',
    is_override: false,
    exercise_type: 'cardio',
    exercise_type_override: null,
    side_mode: 'per_side',
    instructions: 'Mantene el torso firme',
    duration_sec: 1800,
    distance_value: 5,
    distance_unit: 'km',
    hr_zone: 2,
    interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
    reps_value: 10,
    reps_unit: 'passes',
    target_pace_sec_per_km: 330,
    load_value: 20,
    load_unit: 'kg',
  }
}

function cardioBlock(over: Partial<BuilderBlock> = {}): BuilderBlock {
  const raw = cardioRow()
  return {
    uid: 'block-blk-1',
    exercise_id: 'ex-42',
    exercise_name: 'Trote',
    muscle_group: 'Cardio',
    sets: 4,
    reps: '30min',
    rest_time: '90s',
    notes: 'nota del coach',
    superset_group: 'A',
    section: 'main',
    section_template_id: 'sect-1',
    is_override: false,
    exercise_type: 'cardio',
    exercise_type_override: null,
    side_mode: 'per_side',
    instructions: 'Mantene el torso firme',
    duration_sec: 1800,
    distance_value: '5',
    distance_unit: 'km',
    hr_zone: 2,
    interval_config: raw.interval_config as BuilderBlock['interval_config'],
    reps_value: 10,
    reps_unit: 'passes',
    target_pace_sec_per_km: 330,
    load_value: '20',
    load_unit: 'kg',
    _raw: raw,
    ...over,
  }
}

/** Fila del catálogo tal como llega al sheet de búsqueda. */
function catalogExercise(over: Record<string, unknown> = {}) {
  return {
    id: 'ex-99',
    name: 'Trote continuo',
    muscle_group: 'Cardio',
    gif_url: null,
    image_url: null,
    video_url: null,
    secondary_muscles: null,
    body_part: null,
    equipment: null,
    cardio_modality: 'run',
    exercise_type: 'cardio',
    ...over,
  } as never
}

describe('BlockEditorSheet · applyBlockTypeChange (W4.3 · R6/R32)', () => {
  it('cardio → fuerza deja los 10 campos polimorficos en null explicito', async () => {
    const { applyBlockTypeChange } = await loadBlockEditor()
    const next = applyBlockTypeChange(cardioBlock(), 'strength')

    for (const field of POLYMORPHIC_BLOCK_FIELDS) {
      expect(field in next).toBe(true)
      expect(next[field]).toBeNull()
    }
  })

  it('conserva los campos compartidos y la identidad del bloque', async () => {
    const { applyBlockTypeChange } = await loadBlockEditor()
    const next = applyBlockTypeChange(cardioBlock(), 'strength')

    expect(next.sets).toBe(4)
    expect(next.rest_time).toBe('90s')
    expect(next.notes).toBe('nota del coach')
    expect(next.superset_group).toBe('A')
    expect(next.side_mode).toBe('per_side')
    expect(next.instructions).toBe('Mantene el torso firme')
    for (const field of SHARED_BLOCK_FIELDS) {
      expect(next[field]).not.toBeUndefined()
    }
    expect(next.uid).toBe('block-blk-1')
    expect(next.section_template_id).toBe('sect-1')
  })

  it('la regla del override vive en el call site: propio ⇒ null, forzado ⇒ el tipo', async () => {
    const { applyBlockTypeChange } = await loadBlockEditor()

    // el ejercicio ES cardio: volver a cardio borra el override
    expect(applyBlockTypeChange(cardioBlock({ exercise_type_override: 'strength' }), 'cardio')
      .exercise_type_override).toBeNull()
    // tipo distinto al del ejercicio ⇒ override explicito
    expect(applyBlockTypeChange(cardioBlock(), 'mobility').exercise_type_override).toBe('mobility')
    // bloque legacy (ejercicio sin tipo) resuelve fuerza ⇒ elegir fuerza no deja override
    expect(applyBlockTypeChange(cardioBlock({ exercise_type: null, exercise_type_override: 'cardio' }), 'strength')
      .exercise_type_override).toBeNull()
  })

  it('re-elegir el tipo que ya tiene el bloque no borra la prescripcion del coach', async () => {
    const { applyBlockTypeChange } = await loadBlockEditor()
    const next = applyBlockTypeChange(cardioBlock(), 'cardio')

    expect(next.duration_sec).toBe(1800)
    expect(next.distance_value).toBe('5')
    expect(next.hr_zone).toBe(2)
  })

  it('el bloque del call site llega al INSERT sin los campos del tipo anterior (round-trip)', async () => {
    const { applyBlockTypeChange } = await loadBlockEditor()
    const payload = serializeBlockInsert(applyBlockTypeChange(cardioBlock(), 'strength'), 0, 'plan-new')

    for (const field of POLYMORPHIC_BLOCK_FIELDS) {
      expect(payload[field]).toBeNull()
    }
    // el traicionero: `serialize.ts` decide `distance_unit` por `distance_value`; con el null
    // explicito queda null, con `undefined` habria vuelto 'km' desde `_raw`.
    expect(payload.distance_unit).toBeNull()
    // el ejercicio del catalogo ES cardio, asi que forzar fuerza persiste el override explicito
    expect(payload.exercise_type_override).toBe('strength')
    // lo compartido y el passthrough siguen vivos
    expect(payload.rest_time).toBe('90s')
    expect(payload.side_mode).toBe('per_side')
    expect(payload.section_template_id).toBe('sect-1')
  })
})

describe('ExerciseSearchSheet · buildCatalogBlock (W4.4)', () => {
  it('un ejercicio de cardio del catalogo nace cardio, no fuerza', async () => {
    const { buildCatalogBlock } = await loadExerciseSearch()
    const block = buildCatalogBlock(catalogExercise(), 'block-1')

    expect(effectiveExerciseType(block, { exercise_type: block.exercise_type })).toBe('cardio')
    expect(block.sets).toBe(1)
    expect(block.reps).toBe('10min')
    expect(block.duration_sec).toBe(600)
    expect(block.rest_time).toBe('')
  })

  it('movilidad y roller nacen con sus defaults tipados', async () => {
    const { buildCatalogBlock } = await loadExerciseSearch()

    const mobility = buildCatalogBlock(catalogExercise({ exercise_type: 'mobility' }), 'block-2')
    expect(mobility.sets).toBe(3)
    expect(mobility.reps).toBe('30s')
    expect(mobility.duration_sec).toBe(30)

    const roller = buildCatalogBlock(catalogExercise({ exercise_type: 'roller' }), 'block-3')
    expect(roller.sets).toBe(1)
    expect(roller.reps_value).toBe(10)
    expect(roller.reps_unit).toBe('passes')
  })

  it('fuerza y legacy (sin tipo) caen al default de fuerza compartido con web', async () => {
    const { buildCatalogBlock } = await loadExerciseSearch()

    for (const exercise_type of ['strength', null]) {
      const block = buildCatalogBlock(catalogExercise({ exercise_type }), 'block-4')
      expect(effectiveExerciseType(block, { exercise_type: block.exercise_type })).toBe('strength')
      expect(block.sets).toBe(3)
      expect(block.reps).toBe('8-12')
      expect(block.rest_time).toBe('90s')
      expect(block.duration_sec).toBeUndefined()
    }
  })

  it('la identidad del ejercicio y el area por defecto siguen viniendo del catalogo', async () => {
    const { buildCatalogBlock } = await loadExerciseSearch()
    const block = buildCatalogBlock(catalogExercise(), 'block-5')

    expect(block.uid).toBe('block-5')
    expect(block.exercise_id).toBe('ex-99')
    expect(block.exercise_name).toBe('Trote continuo')
    expect(block.muscle_group).toBe('Cardio')
    expect(block.cardio_modality).toBe('run')
    expect(block.section).toBe('main')
    expect(block.superset_group).toBeNull()
    expect(block.is_override).toBe(false)
  })

  it('el bloque nuevo de cardio persiste su duracion (deja de guardarse como series x reps)', async () => {
    const { buildCatalogBlock } = await loadExerciseSearch()
    const payload = serializeBlockInsert(buildCatalogBlock(catalogExercise(), 'block-6'), 0, 'plan-new')

    expect(payload.duration_sec).toBe(600)
    expect(payload.sets).toBe(1)
    expect(payload.reps).toBe('10min')
  })
})
