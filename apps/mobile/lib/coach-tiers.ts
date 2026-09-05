// F6 (plan 04): el espejo a mano de tiers MURIÓ. La fuente única es @eva/tiers (paquete puro
// compartido web+mobile). Este archivo SOLO re-exporta + agrega azúcares de capability que la app
// mobile ya consumía (canUseNutrition/... ); cero catálogo duplicado, cero drift posible.
// Patrón ya probado en mobile: @eva/schemas / @eva/brand-kit (AGENTS.md, "Shared logic anti-drift").
//
// 🚫 TIER_CONFIG NO se re-exporta (embudo-free-pro W5.5). El catálogo entero arrastra el precio
// mensual, el label y las features de tiers ajenos hasta el bundle de RN, y basta con que una
// pantalla lea el precio del catálogo «para informar» para que la app iOS muestre un precio
// —guideline 3.1.1—. Mobile solo necesita el CUPO: `getTierMaxClients(tier)`. El guard vive en
// `tests/mobile-no-prices.test.ts`.

import {
  EVA_BADGE_LABEL,
  getEvaBadgeUrl,
  getRecommendedTier,
  getTierCapabilities,
  getTierMaxClients,
  isBrandingAllowed,
  parseSubscriptionTier,
  showsEvaBadge,
  studentCountLabel,
  type EvaBadgeMedium,
  type SubscriptionTier,
  type TierCapabilities,
} from '@eva/tiers'

// Pricing v3 (docs/specs/pricing-v3, owner 2026-08-21): el sello «Hecho con EVA» (gancho de Pro) y
// el plural de alumnos salen del MISMO paquete que usa la web — cero copia del texto ni del link.
export {
  EVA_BADGE_LABEL,
  getEvaBadgeUrl,
  getRecommendedTier,
  getTierCapabilities,
  // Cupo de VENTA por tier (catálogo). Con un coach concreto a mano manda `profile.maxClients`
  // (columna) — esto es para el copy del plan Free en onboarding, donde no hay coach todavía.
  getTierMaxClients,
  isBrandingAllowed,
  // Retiro de Starter (S1): parser tolerante ÚNICO del valor crudo de `coaches.subscription_tier`.
  // Mata la copia a mano que vivía en `lib/coach.ts`. `LEGACY_TIER_ALIASES` NO se re-exporta acá:
  // es de VENTA (deep-links `?tier=`) y RN no vende (regla de tiendas).
  parseSubscriptionTier,
  showsEvaBadge,
  studentCountLabel,
}
export type { EvaBadgeMedium, SubscriptionTier, TierCapabilities }

// Azúcares de capability (1:1 con web). El paquete expone getTierCapabilities; estas envolturas
// mantienen la API que las pantallas mobile ya importan (nutricion/settings/ejercicios/dashboard).
// Retiro de Starter (S1): desde que `getTierCapabilities` tiene red (fallback a las capabilities de
// free), un tier fuera del union ya NO devuelve undefined ⇒ estos 4 azúcares pasan de fail-closed a
// FAIL-OPEN (free tiene las 4 en `true` desde pricing v3). Es inalcanzable en la práctica: la única
// entrada del tier a RN es `lib/coach.ts`, que normaliza con `parseSubscriptionTier` antes de mapear
// el perfil. El `?.` se conserva como cinturón por si el catálogo volviera a devolver undefined.
export function canUseNutrition(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier)?.canUseNutrition === true
}
export function canUseBranding(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier)?.canUseBranding === true
}
export function canCreateCustomExercises(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier)?.canCreateCustomExercises === true
}
export function canImportClients(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier)?.canImportClients === true
}
