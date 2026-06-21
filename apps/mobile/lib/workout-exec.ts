/**
 * Lógica PURA de ejecución polimórfica del entrenamiento (mobile) — espejo 1:1 de la web:
 *   - apps/web/src/domain/workout/types.ts            (ExerciseType, IntervalConfig, SideMode, LoadType)
 *   - apps/web/src/lib/workout-exercise-type.ts       (effectiveExerciseType, compactDuration, compactDistance)
 *   - apps/web/src/lib/workout-interval.ts            (buildIntervalPhases, isTimeableInterval, INTERVAL_PHASE_LABEL)
 *   - apps/web/src/lib/workout-areas.ts               (executionAreaGroupsFor + classicSlugForAreaId + LEGACY_SECTION_AREA_ID)
 *
 * NOTA anti-drift: idealmente esto vive en un package compartido (@eva/*). Mientras tanto es
 * un port verbatim — si cambian las fórmulas/agrupación en web, actualizar acá. Sin imports
 * de RN/Supabase. El IntervalConfig de cardio.ts es laxo (intervalos system); acá se redeclara
 * el shape RICO de la web (work obligatorio con target) para la ejecución/timer.
 */

// ─── Tipos polimórficos (espejo domain/workout/types.ts) ──────────────────────
export type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'roller'
export type SideMode = 'bilateral' | 'per_side' | 'alternating'
export type LoadType = 'weight' | 'time' | 'bodyweight' | 'none'
export type LoadUnit = 'kg' | 'lb' | 'sec'
export type DistanceUnit = 'm' | 'km'
export type RepsUnit = 'reps' | 'passes' | 'breaths'

/** Shape de workout_blocks.interval_config (jsonb). */
export interface IntervalConfig {
  warmup_sec?: number
  cooldown_sec?: number
  repeats: number
  work: {
    duration_sec?: number
    distance_m?: number
    target?: {
      kind: 'hr_zone' | 'pace' | 'rpe' | 'none'
      hr_zone?: 1 | 2 | 3 | 4 | 5
      pace_sec_per_km?: number
      rpe?: number
    }
  }
  recovery?: {
    duration_sec?: number
    distance_m?: number
    mode?: 'rest' | 'jog' | 'walk'
  }
}

export const EXERCISE_TYPES: readonly ExerciseType[] = ['strength', 'cardio', 'mobility', 'roller']

function asExerciseType(raw: string | null | undefined): ExerciseType | null {
  return raw && (EXERCISE_TYPES as readonly string[]).includes(raw) ? (raw as ExerciseType) : null
}

/**
 * Tipo efectivo del bloque: override del bloque > tipo del ejercicio > 'strength'.
 * Un bloque legacy (sin override, ejercicio sin tipo) SIEMPRE resuelve 'strength'.
 */
export function effectiveExerciseType(
  block: { exercise_type_override?: string | null } | null | undefined,
  exercise: { exercise_type?: string | null } | null | undefined,
): ExerciseType {
  return (
    asExerciseType(block?.exercise_type_override) ??
    asExerciseType(exercise?.exercise_type) ??
    'strength'
  )
}

/** "90" → "90s" · "300" → "5min" · "75" → "75s". Compacto. */
export function compactDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  if (sec < 60 || sec % 60 !== 0) {
    if (sec >= 60) {
      const m = Math.floor(sec / 60)
      const s = sec % 60
      return `${m}m${String(s).padStart(2, '0')}s`
    }
    return `${sec}s`
  }
  return `${sec / 60}min`
}

/** "5000 m" → "5km" · "400 m" → "400m" · "7.5 m" → "7.5m". */
export function compactDistance(value: number, unit: DistanceUnit | string | null | undefined): string {
  if (unit === 'km') return `${value}km`
  if (value >= 1000 && value % 100 === 0) return `${value / 1000}km`
  return `${value}m`
}

// ─── Máquina de fases del timer de intervalos (espejo lib/workout-interval.ts) ─
export type IntervalPhaseKind = 'warmup' | 'work' | 'recovery' | 'cooldown'

export interface IntervalPhase {
  kind: IntervalPhaseKind
  durationSec: number
  repeat?: number
  totalRepeats?: number
}

export const INTERVAL_PHASE_LABEL: Record<IntervalPhaseKind, string> = {
  warmup: 'Calentamiento',
  work: 'Trabajo',
  recovery: 'Recuperación',
  cooldown: 'Vuelta a la calma',
}

/**
 * Secuencia warmup → (work → recovery)×(repeats×sets) → cooldown. La última recovery se
 * omite. Fases sin duración se omiten. Devuelve [] si el work no es cronometrable.
 */
export function buildIntervalPhases(config: IntervalConfig, sets: number = 1): IntervalPhase[] {
  const safeSets = Number.isFinite(sets) && sets >= 1 ? Math.round(sets) : 1
  const repeats = Number.isFinite(config.repeats) && config.repeats >= 1 ? Math.round(config.repeats) : 1
  const total = repeats * safeSets

  const workSec = config.work?.duration_sec ?? 0
  if (!Number.isFinite(workSec) || workSec <= 0) return []

  const phases: IntervalPhase[] = []
  if (config.warmup_sec && config.warmup_sec > 0) {
    phases.push({ kind: 'warmup', durationSec: Math.round(config.warmup_sec) })
  }
  const recoverySec = config.recovery?.duration_sec ?? 0
  for (let i = 1; i <= total; i += 1) {
    phases.push({ kind: 'work', durationSec: Math.round(workSec), repeat: i, totalRepeats: total })
    if (recoverySec > 0 && i < total) {
      phases.push({ kind: 'recovery', durationSec: Math.round(recoverySec), repeat: i, totalRepeats: total })
    }
  }
  if (config.cooldown_sec && config.cooldown_sec > 0) {
    phases.push({ kind: 'cooldown', durationSec: Math.round(config.cooldown_sec) })
  }
  return phases
}

/** ¿El interval_config es cronometrable (work por tiempo)? */
export function isTimeableInterval(config: IntervalConfig | null | undefined): boolean {
  return !!config && (config.work?.duration_sec ?? 0) > 0
}

// ─── Agrupación por área con fallback legacy (espejo lib/workout-areas.ts) ─────
export interface WorkoutArea {
  id: string
  name: string
  slug: string
  sort_order: number
  is_system: boolean
  coach_id: string | null
  team_id: string | null
}

/** UUIDs fijos de las áreas system clásicas (seed 20260609062017). */
export const LEGACY_SECTION_AREA_ID = {
  warmup: '0000a5ec-0000-0000-0000-000000000001',
  main: '0000a5ec-0000-0000-0000-000000000010',
  cooldown: '0000a5ec-0000-0000-0000-000000000020',
} as const

export type LegacySectionSlug = keyof typeof LEGACY_SECTION_AREA_ID

/** Slug legacy de un área system clásica por id; null si no es una de las 3. */
export function classicSlugForAreaId(areaId: string): LegacySectionSlug | null {
  if (areaId === LEGACY_SECTION_AREA_ID.warmup) return 'warmup'
  if (areaId === LEGACY_SECTION_AREA_ID.main) return 'main'
  if (areaId === LEGACY_SECTION_AREA_ID.cooldown) return 'cooldown'
  return null
}

type AreaResolvableBlock = { section?: string | null; section_template_id?: string | null }
type LegacyExecutionSection = 'warmup' | 'main' | 'cooldown' | 'other'

export type ExecutionAreaGroup<T> = {
  key: string
  name: string | null
  legacySection: LegacyExecutionSection | null
  slug: string | null
  sortOrder: number
  blocks: T[]
}

const LEGACY_GROUP_SORT: Record<LegacyExecutionSection, number> = {
  warmup: 0,
  main: 10,
  cooldown: 20,
  other: 9999,
}

/**
 * Agrupa bloques de ejecución por área con fallback legacy. Clásicos (por id) → vía legacy.
 * Áreas resueltas → por su nombre/sort_order. Ids no resueltos → sección legacy del bloque.
 */
export function executionAreaGroupsFor<T extends AreaResolvableBlock>(
  blocks: readonly T[],
  areas: readonly WorkoutArea[],
): ExecutionAreaGroup<T>[] {
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const groups = new Map<string, ExecutionAreaGroup<T>>()

  const legacyGroupFor = (section: LegacyExecutionSection): ExecutionAreaGroup<T> => {
    let g = groups.get(section)
    if (!g) {
      g = { key: section, name: null, legacySection: section, slug: null, sortOrder: LEGACY_GROUP_SORT[section], blocks: [] }
      groups.set(section, g)
    }
    return g
  }

  const legacySectionForBlock = (b: T): LegacyExecutionSection => {
    const s = b.section
    if (s === 'warmup' || s === 'main' || s === 'cooldown') return s
    if (s == null || s === '') return 'main'
    return 'other'
  }

  for (const block of blocks) {
    const id = block.section_template_id
    const classic = id ? classicSlugForAreaId(id) : null
    if (classic) {
      legacyGroupFor(classic).blocks.push(block)
      continue
    }
    const area = id ? areaById.get(id) : undefined
    if (!area) {
      legacyGroupFor(legacySectionForBlock(block)).blocks.push(block)
      continue
    }
    let g = groups.get(area.id)
    if (!g) {
      g = { key: area.id, name: area.name, legacySection: null, slug: area.slug, sortOrder: area.sort_order, blocks: [] }
      groups.set(area.id, g)
    }
    g.blocks.push(block)
  }

  return [...groups.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.name ?? a.key).localeCompare(b.name ?? b.key),
  )
}

/** Etiquetas/subtitulos de secciones legacy (es-neutro) — espejo de WorkoutExecutionClient. */
export const LEGACY_SECTION_TITLE: Record<LegacyExecutionSection, string> = {
  warmup: 'Calentamiento',
  main: 'Bloque principal',
  cooldown: 'Vuelta a la calma',
  other: 'Otros bloques',
}

export const LEGACY_SECTION_SUBTITLE: Record<LegacyExecutionSection, string> = {
  warmup: 'Movilidad y activacion antes del trabajo intenso.',
  main: 'Bloque de mayor esfuerzo: respeta series, reps y descansos.',
  cooldown: 'Baja la intensidad y cierra la sesion con control.',
  other: 'Ejercicios sin seccion definida. Si no estas seguro, consulta a tu coach.',
}

/** Subtitulos de las areas system no clasicas (por slug). */
export const SYSTEM_AREA_SUBTITLE: Record<string, string> = {
  mobility: 'Trabajo de movilidad y rango articular, controlado y sin prisa.',
  core_activation: 'Activa la zona media antes del trabajo principal.',
  power: 'Movimientos explosivos: calidad antes que cantidad, descansos completos.',
  conditioning: 'Acondicionamiento metabolico: manten el ritmo que te indique tu coach.',
}
