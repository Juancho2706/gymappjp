// F6 (plan 04): el espejo a mano de tiers MURIÓ. La fuente única es @eva/tiers (paquete puro
// compartido web+mobile). Este archivo SOLO re-exporta + agrega azúcares de capability que la app
// mobile ya consumía (canUseNutrition/... ); cero catálogo duplicado, cero drift posible.
// Patrón ya probado en mobile: @eva/schemas / @eva/brand-kit (AGENTS.md, "Shared logic anti-drift").
//
// LEGACY: TIER_CONFIG conserva growth/scale para DISPLAY de cuentas grandfathered (el catálogo del
// paquete los mantiene); elite.maxClients = 100 (techo subido — F0-a) vive en el paquete. NO borrar.

import {
  TIER_CONFIG,
  getRecommendedTier,
  getTierCapabilities,
  type SubscriptionTier,
  type TierCapabilities,
} from '@eva/tiers'

export { TIER_CONFIG, getRecommendedTier, getTierCapabilities }
export type { SubscriptionTier, TierCapabilities }

// Azúcares de capability (1:1 con web). El paquete expone getTierCapabilities; estas envolturas
// mantienen la API que las pantallas mobile ya importan (nutricion/settings/ejercicios/dashboard).
export function canUseNutrition(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canUseNutrition
}
export function canUseBranding(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canUseBranding
}
export function canCreateCustomExercises(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canCreateCustomExercises
}
export function canImportClients(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canImportClients
}
