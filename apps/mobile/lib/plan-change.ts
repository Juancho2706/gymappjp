/**
 * plan-change — lógica PURA del cambio de plan visto desde la app (embudo Free→Pro, W6.4/W6.5).
 *
 * La app NO vende: el cobro vive en la web y en el correo (Apple 3.1.1 / política de pagos de
 * Google; ver `docs/specs/embudo-free-pro/SPEC.md` §«Decisiones cerradas»). Lo que sí puede hacer
 * es decir la VERDAD y celebrar un cambio que ya ocurrió afuera. Este módulo tiene las tres piezas
 * puras de eso:
 *
 *  1. `detectPlanChange(prev, next)` — comparar dos fotos del plan y decir si subió el tier o el
 *     cupo. Se corre DESPUÉS de revalidar entitlements («Actualizar estado» o pull-to-refresh);
 *     su resultado monta `PlanUpgradeCelebration`. Es estado posterior, jamás una CTA.
 *  2. `planCaption(platform)` — la ÚNICA línea que Android puede mostrar sobre cambios de plan
 *     (texto plano, sin link; el string vive en `lib/client-cap.ts`). En iOS devuelve `undefined`:
 *     cero botón, cero URL, cero precio.
 *  3. `formatUpdatedAgo(ts)` — «Actualizado hace 2 min» bajo el botón de refresco.
 *
 * CERO react-native / expo acá a propósito: el contrato se pinnea en `tests/mobile/plan-change.test.ts`
 * con el runner del repo, sin montar la app.
 */

import { STORE_PLAN_CHANGE_CAPTION, storePlanChangeCaption } from './client-cap'

/** Foto del plan en un instante. `tier` crudo (la columna puede traer un tier fuera del union). */
export interface PlanSnapshot {
  tier: string
  /** `coaches.max_clients` — cupo EFECTIVO. `null` = desconocido (no equivale a «ilimitado»). */
  maxClients: number | null
}

export type PlanChangeKind = 'tier_up' | 'cap_up' | 'none'

export interface PlanChange {
  kind: PlanChangeKind
  from: PlanSnapshot
  to: PlanSnapshot
}

/**
 * Orden de los tiers SOLO para comparar dos fotos («¿subió?»). No es catálogo ni precio: es la
 * escalera de cupo/capacidades. `growth`/`scale` son legacy (placeholders team/org, fuera de
 * venta) y se ubican entre pro y elite para no inventar un salto raro si aparecen en la columna.
 */
const TIER_ORDER: readonly string[] = ['free', 'starter', 'pro', 'growth', 'scale', 'elite']

function tierRank(tier: string): number {
  return TIER_ORDER.indexOf(tier)
}

/**
 * ¿Qué cambió entre dos fotos del plan?
 *
 * - `tier_up`: el tier subió en la escalera (free/starter → pro/elite es el caso real de venta).
 * - `cap_up`: mismo tier (o tier desconocido) pero `max_clients` creció — el grandfather de
 *   Pricing v3 mueve la columna sin tocar el tier, y eso también merece celebrarse.
 * - `none`: todo lo demás, incluidas las bajadas.
 *
 * FAIL-CLOSED: un tier fuera del union (columna stale) da rank −1 y NO dispara celebración; un
 * `maxClients` null tampoco (null es «no sé», no «ilimitado»): celebrar de más sería mentirle al
 * coach sobre un cambio que no pasó.
 */
export function detectPlanChange(prev: PlanSnapshot, next: PlanSnapshot): PlanChange {
  const edges = { from: prev, to: next }
  const prevRank = tierRank(prev.tier)
  const nextRank = tierRank(next.tier)

  if (prevRank >= 0 && nextRank >= 0) {
    if (nextRank > prevRank) return { kind: 'tier_up', ...edges }
    // Bajada de tier: aunque la columna de cupo quedara alta, no hay nada que celebrar.
    if (nextRank < prevRank) return { kind: 'none', ...edges }
  }

  if (
    typeof prev.maxClients === 'number' &&
    typeof next.maxClients === 'number' &&
    next.maxClients > prev.maxClients
  ) {
    return { kind: 'cap_up', ...edges }
  }

  return { kind: 'none', ...edges }
}

/**
 * Caption de plan por plataforma — la ÚNICA frase sobre cambios de plan admitida dentro de la app,
 * y solo en Android: Google publica como aceptable para apps consumption-only la fórmula «anda a
 * nuestro sitio para cambiar tu plan»; Apple no admite ni eso (3.1.1). Texto PLANO: jamás se pasa
 * a `Linking`. `undefined` en iOS (y en cualquier otra plataforma) por diseño — la AUSENCIA del
 * string es el requisito, no un detalle de UI. Split por `Platform.OS`, nunca por storefront.
 *
 * El string es UNO SOLO en la app: `STORE_PLAN_CHANGE_CAPTION` de `lib/client-cap.ts`, que ya lo
 * usa el muro de cupo del alta. Dos copias del mismo texto de compliance divergen al primer ajuste.
 * Y la DECISIÓN de mostrarlo también es una sola: esto delega en `storePlanChangeCaption`.
 */
export { STORE_PLAN_CHANGE_CAPTION }

export function planCaption(platform: string): string | undefined {
  return storePlanChangeCaption(platform)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * «Actualizado hace X» bajo el botón de refresco. Sin librerías de fechas: cuatro tramos bastan
 * para lo que el coach necesita saber (¿esto que veo es de recién o de ayer?).
 * `null` mientras no haya habido ningún refresco exitoso en esta sesión.
 */
export function formatUpdatedAgo(updatedAt: number | null, now: number = Date.now()): string | null {
  if (updatedAt == null) return null
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < MINUTE) return 'Actualizado recién'
  if (elapsed < HOUR) return `Actualizado hace ${Math.floor(elapsed / MINUTE)} min`
  if (elapsed < DAY) return `Actualizado hace ${Math.floor(elapsed / HOUR)} h`
  return `Actualizado hace ${Math.floor(elapsed / DAY)} d`
}
