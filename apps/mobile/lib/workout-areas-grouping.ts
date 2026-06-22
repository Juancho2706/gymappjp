/**
 * Agrupación de bloques del builder por ÁREA (con fallback legacy) + superseries contiguas.
 *
 * Port VERBATIM de las funciones puras de la web (anti-drift — si cambian allá, actualizar acá):
 *   - apps/web/src/lib/workout-areas.ts  (executionAreaGroupsFor, legacyBucketFor, effectiveAreaKey,
 *                                         orderedAreaIds, classicSlugForAreaId, LEGACY_SECTION_AREA_ID)
 *   - apps/web/src/lib/workout-block-grouping.ts  (groupContiguousSupersetRuns)
 *   - apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts  (SET_BLOCK_AREA → moveBlockToArea)
 *
 * El reducer de mobile (lib/plan-builder/reducer.ts) NO tiene SET_BLOCK_AREA: solo conoce las 3
 * secciones legacy (warmup/main/cooldown). Por eso el area-picker on-card reconstruye el día con
 * `moveBlockToArea` (función pura, idéntica al reducer web) y lo aplica vía setDayBlocks.
 */

import type { BuilderBlock, BuilderSection } from './plan-builder/types'
import type { WorkoutArea } from './areas'

/** UUIDs fijos de las áreas system que mapean 1:1 al section legacy (seed 20260609062017). */
export const LEGACY_SECTION_AREA_ID = {
  warmup: '0000a5ec-0000-0000-0000-000000000001',
  main: '0000a5ec-0000-0000-0000-000000000010',
  cooldown: '0000a5ec-0000-0000-0000-000000000020',
} as const

export type LegacySectionSlug = keyof typeof LEGACY_SECTION_AREA_ID

type AreaResolvableBlock = { section?: string | null; section_template_id?: string | null }

/** Normalización legacy: todo lo no warmup/cooldown es main. */
function legacySectionOf(block: AreaResolvableBlock): LegacySectionSlug {
  return block.section === 'warmup' || block.section === 'cooldown' ? block.section : 'main'
}

/** Área efectiva del bloque: section_template_id si existe, sino el área system del section legacy. */
function effectiveAreaId(block: AreaResolvableBlock): string {
  return block.section_template_id || LEGACY_SECTION_AREA_ID[legacySectionOf(block)]
}

/** Clave de agrupación segura: si el área efectiva no está en la lista conocida, cae al área system legacy. */
export function effectiveAreaKey(block: AreaResolvableBlock, knownAreaIds: ReadonlySet<string>): string {
  const id = effectiveAreaId(block)
  return knownAreaIds.has(id) ? id : LEGACY_SECTION_AREA_ID[legacySectionOf(block)]
}

/** Slug legacy de un área system clásica por id; null si no es una de las 3. */
export function classicSlugForAreaId(areaId: string): LegacySectionSlug | null {
  if (areaId === LEGACY_SECTION_AREA_ID.warmup) return 'warmup'
  if (areaId === LEGACY_SECTION_AREA_ID.main) return 'main'
  if (areaId === LEGACY_SECTION_AREA_ID.cooldown) return 'cooldown'
  return null
}

/** Bucket legacy que persiste workout_blocks.section: system warmup/main/cooldown → su slug; resto → main. */
export function legacyBucketFor(area: Pick<WorkoutArea, 'slug' | 'is_system'> | null | undefined): LegacySectionSlug {
  if (area?.is_system && (area.slug === 'warmup' || area.slug === 'main' || area.slug === 'cooldown')) {
    return area.slug
  }
  return 'main'
}

/** Orden clásico de fallback cuando no hay áreas cargadas. */
const DEFAULT_CLASSIC_AREA_ORDER: readonly string[] = [
  LEGACY_SECTION_AREA_ID.warmup,
  LEGACY_SECTION_AREA_ID.main,
  LEGACY_SECTION_AREA_ID.cooldown,
]

/** Ids de áreas en orden de render (sort_order, luego nombre para estabilidad). */
export function orderedAreaIds(areas: readonly Pick<WorkoutArea, 'id' | 'sort_order' | 'name'>[]): string[] {
  if (!areas.length) return [...DEFAULT_CLASSIC_AREA_ORDER]
  return [...areas]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((a) => a.id)
}

// ─── Agrupación de ejecución por área (port de executionAreaGroupsFor) ────────

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
 * Agrupa bloques por área con fallback legacy (un plan viejo —solo section, o section_template_id de
 * los 3 clásicos— produce EXACTAMENTE warmup → main → cooldown → other, titulados por el caller).
 * Los bloques deben venir ordenados por order_index; el orden relativo se preserva por grupo.
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

// ─── Superseries contiguas (port de groupContiguousSupersetRuns) ─────────────

export type SupersetGroupRow<T> = {
  key: string
  /** Letra del grupo (A, B…) para UI; solo en `type === 'superset'`. */
  supersetLetter?: string
  blocks: T[]
  type: 'superset' | 'single'
}

/**
 * Bloques ya filtrados por un área y ordenados por `order_index` ascendente.
 * Agrupa superseries solo en tramos consecutivos (mismo `superset_group` y order_index +1).
 */
export function groupContiguousSupersetRuns<
  T extends { id: string; order_index: number; superset_group: string | null | undefined },
>(sectionSortedBlocks: T[]): SupersetGroupRow<T>[] {
  const result: SupersetGroupRow<T>[] = []
  let i = 0
  while (i < sectionSortedBlocks.length) {
    const b = sectionSortedBlocks[i]
    const g = b.superset_group?.trim()
    if (!g) {
      result.push({ key: `single-${b.id}`, blocks: [b], type: 'single' })
      i += 1
      continue
    }
    const run: T[] = [b]
    let j = i + 1
    while (j < sectionSortedBlocks.length) {
      const next = sectionSortedBlocks[j]
      const ng = next.superset_group?.trim()
      const prev = run[run.length - 1]
      if (ng === g && next.order_index === prev.order_index + 1) {
        run.push(next)
        j += 1
      } else {
        break
      }
    }
    result.push({ key: `ss-${g}-${b.id}`, supersetLetter: g, blocks: run, type: 'superset' })
    i = j
  }
  return result
}

// ─── Preview por área del día (port de buildDayPreviewSections web) ──────────

const PREVIEW_SECTION_LABEL: Record<LegacyExecutionSection, string> = {
  warmup: 'Calentamiento',
  main: 'Principal',
  cooldown: 'Enfriamiento',
  other: 'Otros',
}

export type PreviewAreaSection = {
  key: string
  label: string
  groups: SupersetGroupRow<BuilderBlock & { id: string; order_index: number; superset_group: string | null }>[]
}

/**
 * Agrupa los bloques de un día por ÁREA con fallback legacy (mismo helper que la ejecución del
 * alumno) + superseries contiguas. Un programa SOLO con secciones clásicas produce EXACTAMENTE
 * las secciones de siempre (Calentamiento → Principal → Enfriamiento). Espejo 1:1 de la web.
 */
export function buildDayPreviewSections(
  blocks: readonly BuilderBlock[],
  areas: readonly WorkoutArea[],
): PreviewAreaSection[] {
  const rows = blocks.map((b, order_index) => ({
    ...b,
    id: b.uid,
    order_index,
    superset_group: b.superset_group ?? null,
  }))
  return executionAreaGroupsFor(rows, areas).map((areaGroup) => ({
    key: areaGroup.key,
    label: areaGroup.name ?? PREVIEW_SECTION_LABEL[areaGroup.legacySection ?? 'main'],
    groups: groupContiguousSupersetRuns(areaGroup.blocks),
  }))
}

// ─── Mover bloque a área (port de SET_BLOCK_AREA del reducer web) ────────────

/**
 * Recompone los bloques de UN día tras mover `uid` al área `areaId`. Pura — el caller la aplica
 * con setDayBlocks (el reducer de mobile no tiene SET_BLOCK_AREA). Idéntica al reducer web:
 * - El bloque adopta section_template_id = areaId + section = bucket legacy del área.
 * - Mover de área ROMPE la superserie completa del bloque movido.
 * - Reagrupa el día por área en orden sort_order (áreas desconocidas caen al bucket legacy;
 *   un barrido final garantiza no perder ningún bloque).
 */
export function moveBlockToArea(
  dayBlocks: readonly BuilderBlock[],
  uid: string,
  areaId: string,
  areas: readonly WorkoutArea[],
): BuilderBlock[] {
  const block = dayBlocks.find((b) => b.uid === uid)
  if (!block) return [...dayBlocks]

  const area = areas.find((a) => a.id === areaId) ?? null
  const bucket: BuilderSection = area ? legacyBucketFor(area) : (classicSlugForAreaId(areaId) ?? 'main')

  // Mover de área rompe la superserie completa del bloque (igual que el legacy).
  const groupId = block.superset_group?.trim() || null
  const rest = dayBlocks
    .filter((b) => b.uid !== uid)
    .map((b) => (groupId && b.superset_group === groupId ? { ...b, superset_group: null } : b))
  const moved: BuilderBlock = { ...block, section: bucket, section_template_id: areaId, superset_group: null }

  const order = orderedAreaIds(areas)
  const known = new Set(order)
  const groups = new Map<string, BuilderBlock[]>()
  for (const b of rest) {
    const key = effectiveAreaKey(b, known)
    const group = groups.get(key)
    if (group) group.push(b)
    else groups.set(key, [b])
  }
  const targetKey = known.has(areaId) ? areaId : LEGACY_SECTION_AREA_ID[bucket]
  const targetGroup = groups.get(targetKey)
  if (targetGroup) targetGroup.push(moved)
  else groups.set(targetKey, [moved])

  const blocks: BuilderBlock[] = []
  const used = new Set<string>()
  for (const id of order) {
    const group = groups.get(id)
    if (group) {
      blocks.push(...group)
      used.add(id)
    }
  }
  for (const [id, group] of groups) {
    if (!used.has(id)) blocks.push(...group)
  }
  return blocks
}
