/**
 * View-model de areas para la UI del builder (DayColumn / ExerciseBlock).
 * Los 3 clasicos (warmup/main/cooldown) conservan EXACTAMENTE sus clases actuales
 * (cero regresion visual); el resto toma una paleta estable por orden de aparicion.
 */

import type { WorkoutArea } from '@/domain/workout/types'
import { LEGACY_SECTION_AREA_ID, type LegacySectionSlug } from '@eva/workout-engine'

export type BuilderAreaVM = {
    id: string
    name: string
    slug: string
    shortLabel: string
    /** Drop zone / header punteado del dia */
    zoneClass: string
    /** Badge compacto en la tarjeta del ejercicio */
    badgeClass: string
    isClassic: boolean
}

const CLASSIC_SHORT: Record<LegacySectionSlug, string> = {
    warmup: 'CAL',
    main: 'PRI',
    cooldown: 'ENF',
}

const CLASSIC_ZONE: Record<LegacySectionSlug, string> = {
    warmup: 'border-amber-500/45 bg-amber-500/[0.07] text-amber-950/85 dark:text-amber-100/90',
    main: 'border-border/80 bg-muted/15 text-muted-foreground/85',
    cooldown: 'border-sky-500/45 bg-sky-500/[0.07] text-sky-950/85 dark:text-sky-100/90',
}

const CLASSIC_BADGE: Record<LegacySectionSlug, string> = {
    warmup: 'border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-100',
    main: 'border-primary/35 bg-primary/10 text-primary',
    cooldown: 'border-sky-500/40 bg-sky-500/12 text-sky-900 dark:text-sky-100',
}

/** Paleta para areas no clasicas (system extra + custom), por indice estable. */
const ZONE_PALETTE = [
    'border-violet-500/45 bg-violet-500/[0.07] text-violet-950/85 dark:text-violet-100/90',
    'border-emerald-500/45 bg-emerald-500/[0.07] text-emerald-950/85 dark:text-emerald-100/90',
    'border-rose-500/45 bg-rose-500/[0.07] text-rose-950/85 dark:text-rose-100/90',
    'border-orange-500/45 bg-orange-500/[0.07] text-orange-950/85 dark:text-orange-100/90',
    'border-teal-500/45 bg-teal-500/[0.07] text-teal-950/85 dark:text-teal-100/90',
    'border-fuchsia-500/45 bg-fuchsia-500/[0.07] text-fuchsia-950/85 dark:text-fuchsia-100/90',
]

const BADGE_PALETTE = [
    'border-violet-500/40 bg-violet-500/12 text-violet-900 dark:text-violet-100',
    'border-emerald-500/40 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100',
    'border-rose-500/40 bg-rose-500/12 text-rose-900 dark:text-rose-100',
    'border-orange-500/40 bg-orange-500/12 text-orange-900 dark:text-orange-100',
    'border-teal-500/40 bg-teal-500/12 text-teal-900 dark:text-teal-100',
    'border-fuchsia-500/40 bg-fuchsia-500/12 text-fuchsia-900 dark:text-fuchsia-100',
]

function classicSlugOf(area: Pick<WorkoutArea, 'slug' | 'is_system'>): LegacySectionSlug | null {
    if (area.is_system && (area.slug === 'warmup' || area.slug === 'main' || area.slug === 'cooldown')) {
        return area.slug
    }
    return null
}

/** Abreviatura de 3 letras desde el nombre (sin diacriticos). */
export function areaShortLabel(area: Pick<WorkoutArea, 'name' | 'slug' | 'is_system'>): string {
    const classic = classicSlugOf(area)
    if (classic) return CLASSIC_SHORT[classic]
    const plain = area.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '')
    return (plain.slice(0, 3) || '???').toUpperCase()
}

/** Fallback cuando no llegan areas del server: los 3 clasicos (paridad con el builder legacy). */
const FALLBACK_CLASSIC_AREAS: WorkoutArea[] = [
    { id: LEGACY_SECTION_AREA_ID.warmup, name: 'Calentamiento', slug: 'warmup', sort_order: 0, is_system: true, coach_id: null, team_id: null },
    { id: LEGACY_SECTION_AREA_ID.main, name: 'Principal', slug: 'main', sort_order: 10, is_system: true, coach_id: null, team_id: null },
    { id: LEGACY_SECTION_AREA_ID.cooldown, name: 'Enfriamiento', slug: 'cooldown', sort_order: 20, is_system: true, coach_id: null, team_id: null },
]

/** VMs ordenados por sort_order (paleta asignada solo a los no clasicos, en ese orden). */
export function buildAreaVMs(areas: readonly WorkoutArea[]): BuilderAreaVM[] {
    const source = areas.length ? areas : FALLBACK_CLASSIC_AREAS
    const ordered = [...source].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    let paletteIdx = 0
    return ordered.map(area => {
        const classic = classicSlugOf(area)
        if (classic) {
            return {
                id: area.id,
                name: area.name,
                slug: area.slug,
                shortLabel: CLASSIC_SHORT[classic],
                zoneClass: CLASSIC_ZONE[classic],
                badgeClass: CLASSIC_BADGE[classic],
                isClassic: true,
            }
        }
        const idx = paletteIdx % ZONE_PALETTE.length
        paletteIdx += 1
        return {
            id: area.id,
            name: area.name,
            slug: area.slug,
            shortLabel: areaShortLabel(area),
            zoneClass: ZONE_PALETTE[idx],
            badgeClass: BADGE_PALETTE[idx],
            isClassic: false,
        }
    })
}
