/**
 * Areas del builder (workout_section_templates) — helpers puros compartidos entre
 * builder, preview y ejecucion. Expand-contract: section_template_id es la fuente
 * preferente; workout_blocks.section queda como bucket legacy de compatibilidad
 * (CHECK warmup/main/cooldown). NO tocar workout-block-grouping.ts (baseline F0).
 */

/**
 * Area de entrenamiento (workout_section_templates): system (7 fijas, solo-lectura),
 * custom de coach (coach_id) o custom de team (team_id). Espejo EXACTO de
 * `@/domain/workout/types` (web) — re-declarado acá para que el motor quede self-contained.
 */
export interface WorkoutArea {
    id: string
    name: string
    slug: string
    sort_order: number
    is_system: boolean
    coach_id: string | null
    team_id: string | null
}

/** UUIDs fijos de las areas system que mapean 1:1 al section legacy (seed 20260609062017). */
export const LEGACY_SECTION_AREA_ID = {
    warmup: '0000a5ec-0000-0000-0000-000000000001',
    main: '0000a5ec-0000-0000-0000-000000000010',
    cooldown: '0000a5ec-0000-0000-0000-000000000020',
} as const

export type LegacySectionSlug = keyof typeof LEGACY_SECTION_AREA_ID

/** Forma minima de un bloque para resolver su area (builder o ejecucion). */
export type AreaResolvableBlock = {
    section?: string | null
    section_template_id?: string | null
}

/** Normalizacion legacy identica al resto del codebase: todo lo no warmup/cooldown es main. */
export function legacySectionOf(block: AreaResolvableBlock): LegacySectionSlug {
    return block.section === 'warmup' || block.section === 'cooldown' ? block.section : 'main'
}

/** Area efectiva del bloque: section_template_id si existe, sino el area system del section legacy. */
export function effectiveAreaId(block: AreaResolvableBlock): string {
    return block.section_template_id || LEGACY_SECTION_AREA_ID[legacySectionOf(block)]
}

/**
 * Clave de agrupacion segura: si el area efectiva no esta en la lista conocida
 * (area borrada / de otro contexto), cae al area system del section legacy para
 * que el bloque NUNCA quede sin grupo visible.
 */
export function effectiveAreaKey(block: AreaResolvableBlock, knownAreaIds: ReadonlySet<string>): string {
    const id = effectiveAreaId(block)
    return knownAreaIds.has(id) ? id : LEGACY_SECTION_AREA_ID[legacySectionOf(block)]
}

/** Slug legacy de un area system clasica por id; null si no es una de las 3. */
export function classicSlugForAreaId(areaId: string): LegacySectionSlug | null {
    if (areaId === LEGACY_SECTION_AREA_ID.warmup) return 'warmup'
    if (areaId === LEGACY_SECTION_AREA_ID.main) return 'main'
    if (areaId === LEGACY_SECTION_AREA_ID.cooldown) return 'cooldown'
    return null
}

/**
 * Bucket legacy que persiste workout_blocks.section para un area dada:
 * system warmup/main/cooldown → su slug; cualquier otra (system extra o custom) → main.
 */
export function legacyBucketFor(area: Pick<WorkoutArea, 'slug' | 'is_system'> | null | undefined): LegacySectionSlug {
    if (area?.is_system && (area.slug === 'warmup' || area.slug === 'main' || area.slug === 'cooldown')) {
        return area.slug
    }
    return 'main'
}

/** Orden clasico de fallback cuando no hay areas cargadas. */
export const DEFAULT_CLASSIC_AREA_ORDER: readonly string[] = [
    LEGACY_SECTION_AREA_ID.warmup,
    LEGACY_SECTION_AREA_ID.main,
    LEGACY_SECTION_AREA_ID.cooldown,
]

/** Ids de areas en orden de render (sort_order, luego nombre para estabilidad). */
export function orderedAreaIds(areas: readonly Pick<WorkoutArea, 'id' | 'sort_order' | 'name'>[]): string[] {
    if (!areas.length) return [...DEFAULT_CLASSIC_AREA_ORDER]
    return [...areas]
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map(a => a.id)
}

// ─── CRUD de areas custom (F4) — helpers puros ───────────────────────────────

/**
 * Slug estable desde el nombre: sin diacriticos, kebab-case, solo [a-z0-9-].
 * Unicidad por scope la garantizan los indices parciales *_slug_uidx (colision → error friendly).
 * Nombres sin caracteres latinos (cirilico, emoji) llevan sufijo deterministico del nombre,
 * para que dos nombres distintos no colisionen ambos en el slug generico 'area'.
 */
export function slugifyAreaName(name: string): string {
    const slug = name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
    if (slug) return slug
    let hash = 0
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
    return `area-${hash.toString(36)}`
}

/**
 * sort_order para un area custom nueva: despues de la ultima existente (custom o system),
 * con piso 100 para que las custom queden detras de las 7 system (max seed = 30) por defecto.
 */
export function nextCustomSortOrder(areas: readonly Pick<WorkoutArea, 'sort_order'>[]): number {
    const maxExisting = areas.reduce((max, a) => Math.max(max, a.sort_order), 0)
    return Math.max(100, maxExisting + 10)
}

// ─── Ejecucion del alumno area-driven (F5) ───────────────────────────────────

type LegacyExecutionSection = 'warmup' | 'main' | 'cooldown' | 'other'

/** Grupo de render en la ejecucion: o un area resuelta (name) o una seccion legacy. */
export type ExecutionAreaGroup<T> = {
    /** area id, o slug legacy cuando legacySection esta seteado */
    key: string
    /** nombre real del area; null ⇒ el caller usa el titulo legacy de legacySection */
    name: string | null
    /** seteado cuando el grupo se resuelve por la via legacy (clasicos y fallbacks) */
    legacySection: LegacyExecutionSection | null
    /** slug del area (para subtitulos por area system); null en grupos legacy */
    slug: string | null
    sortOrder: number
    blocks: T[]
}

/** Orden sintetico de los grupos legacy — coincide con los sort_order seed de los clasicos. */
const LEGACY_GROUP_SORT: Record<LegacyExecutionSection, number> = {
    warmup: 0,
    main: 10,
    cooldown: 20,
    other: 9999,
}

/**
 * Agrupa bloques de ejecucion por area con fallback legacy (AC3: un plan viejo —solo
 * section, o section_template_id de los 3 clasicos— produce EXACTAMENTE los grupos
 * legacy de hoy: warmup → main → cooldown → other, titulados por el caller).
 * - Clasicos system (por id) van SIEMPRE por la via legacy (titulos/subtitulos actuales).
 * - Areas resueltas (system extra o custom visibles) agrupan por su nombre y sort_order.
 * - Ids no resueltos (area soft-deleted / no visible) caen a la seccion legacy del bloque.
 * Los bloques deben venir ordenados por order_index; el orden relativo se preserva por grupo.
 */
export function executionAreaGroupsFor<T extends AreaResolvableBlock>(
    blocks: readonly T[],
    areas: readonly WorkoutArea[]
): ExecutionAreaGroup<T>[] {
    const areaById = new Map(areas.map(a => [a.id, a]))
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
        (a, b) => a.sortOrder - b.sortOrder || (a.name ?? a.key).localeCompare(b.name ?? b.key)
    )
}
