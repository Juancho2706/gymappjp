/**
 * Clave «ya vio el tour corto del builder», POR COACH (W8.2.1). Antes era una sola clave para todo el
 * teléfono (`builder_onboarding_seen_short_v1`): el segundo coach que entraba en el mismo equipo
 * nunca veía su tour. La clave vieja se sigue leyendo como «visto» para no re-mostrárselo a quien ya
 * lo vio antes de este cambio.
 */
export const LEGACY_BUILDER_TOUR_SEEN_KEY = 'builder_onboarding_seen_short_v1'

export function builderTourSeenKey(coachId: string): string {
  return `${LEGACY_BUILDER_TOUR_SEEN_KEY}:${coachId}`
}

/** ¿Arranca solo el tour corto? Puro: lo decide la clave del coach, la vieja y si la guía está activa. */
export function shouldAutoStartBuilderTour(input: {
  coachSeen: string | null
  legacySeen: string | null
  guideActive: boolean
}): boolean {
  if (input.guideActive) return false
  return !input.coachSeen && !input.legacySeen
}
