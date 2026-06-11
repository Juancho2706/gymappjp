/**
 * Areas del builder (workout_section_templates) — helpers puros compartidos entre
 * builder, preview y ejecucion. Expand-contract: section_template_id es la fuente
 * preferente; workout_blocks.section queda como bucket legacy de compatibilidad
 * (CHECK warmup/main/cooldown). NO tocar workout-block-grouping.ts (baseline F0).
 */

import type { WorkoutArea } from '@/domain/workout/types'

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
