// View-model de areas para la UI del builder mobile (AreaDropZone + badge del bloque).
//
// Espejo funcional de apps/web/src/app/coach/builder/[clientId]/area-ui.ts (buildAreaVMs),
// pero devolviendo COLORES (hex) en vez de clases Tailwind: las clases arbitrarias de la web
// (border-violet-500/45 …) no aplican a RN. Los 3 clasicos conservan su semantica
// (warmup ambar, main marca, cooldown celeste); el resto toma una paleta estable por orden.
//
// La resolucion de orden/area la delega a los helpers PUROS de @eva/workout-engine
// (orderedAreaIds, effectiveAreaKey, LEGACY_SECTION_AREA_ID) → cero drift con el reducer.
import {
  LEGACY_SECTION_AREA_ID,
  effectiveAreaKey,
  orderedAreaIds,
  type AreaResolvableBlock,
  type LegacySectionSlug,
  type WorkoutArea,
} from '@eva/workout-engine'

export interface MobileAreaVM {
  id: string
  name: string
  slug: string
  shortLabel: string
  /** Color del dot/badge del area; `null` en `main` ⇒ el consumidor usa theme.primary (brand). */
  color: string | null
  isClassic: boolean
}

const CLASSIC_SHORT: Record<LegacySectionSlug, string> = { warmup: 'CAL', main: 'PRI', cooldown: 'ENF' }
// warmup = --warning-500 (#F5A524, igual que program-builder); cooldown = celeste; main = marca (null).
const CLASSIC_COLOR: Record<LegacySectionSlug, string | null> = { warmup: '#F5A524', main: null, cooldown: '#38BDF8' }

/** Paleta hex para areas no clasicas (system extra + custom), por indice estable — espeja ZONE_PALETTE web. */
const AREA_PALETTE = ['#8B5CF6', '#10B981', '#F43F5E', '#F97316', '#14B8A6', '#D946EF']

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

/** VMs ordenados por sort_order (paleta hex asignada solo a los no clasicos, en ese orden). */
export function buildMobileAreaVMs(areas: readonly WorkoutArea[]): MobileAreaVM[] {
  const source = areas.length ? areas : FALLBACK_CLASSIC_AREAS
  const ordered = [...source].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  let paletteIdx = 0
  return ordered.map((area) => {
    const classic = classicSlugOf(area)
    if (classic) {
      return { id: area.id, name: area.name, slug: area.slug, shortLabel: CLASSIC_SHORT[classic], color: CLASSIC_COLOR[classic], isClassic: true }
    }
    const color = AREA_PALETTE[paletteIdx % AREA_PALETTE.length]
    paletteIdx += 1
    return { id: area.id, name: area.name, slug: area.slug, shortLabel: areaShortLabel(area), color, isClassic: false }
  })
}

/** Ids de areas conocidas (para resolver la clave efectiva de cada bloque, fallback legacy incluido). */
export function knownAreaIdSet(areas: readonly WorkoutArea[]): Set<string> {
  return new Set(orderedAreaIds(areas))
}

/** Clave de area efectiva de un bloque (section_template_id o area system del section legacy). */
export function areaKeyOfBlock(block: AreaResolvableBlock, knownAreaIds: ReadonlySet<string>): string {
  return effectiveAreaKey(block, knownAreaIds)
}
