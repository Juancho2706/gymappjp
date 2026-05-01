/** Misma clave que `BrandSettingsTourClient` al marcar tour Mi Marca como visto. */
export function brandTourSeenStorageKey(coachId: string) {
    return `eva:brand-settings-tour-seen:${coachId}` as const
}

/**
 * CustomEvent (misma pestaña) al cerrar el tour Mi Marca. El checklist del dashboard puede
 * re-leer `localStorage` y actualizar el paso “marca” sin recargar.
 */
export const BRAND_TOUR_SEEN_CHANGED_EVENT = 'eva:brand-tour-seen-changed' as const

export type BrandTourSeenChangedDetail = { coachId: string }
