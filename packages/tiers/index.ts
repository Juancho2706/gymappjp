/**
 * @eva/tiers — fuente ÚNICA del catálogo de planes (tiers) y ciclos de cobro.
 *
 * Paquete puro TypeScript: CERO Next.js / Supabase / React / RN. Por eso la MISMA
 * lógica corre en web (Next) y en mobile (Expo) — mata el drift del espejo a mano que
 * antes vivía duplicado en apps/mobile/lib/coach-tiers.ts (ver plan 04, F6).
 *
 * Respeta capas (CLAUDE.md): domain/ y lib/ de web RE-EXPORTAN de acá (mismo patrón que
 * @eva/schemas / @eva/brand-kit). NO mover acá nada acoplado a un framework (iconos Lucide,
 * componentes, queries) — esos mapas de display siguen en su superficie.
 *
 * Plan 04 (consolidación de planes + ciclos):
 * - growth/scale fuera de venta, pero INTACTOS en runtime/DB/admin (grandfathered + placeholder
 *   team/org_managed, migración 20260609230000). NO borrar del union ni del catálogo.
 * - trimestral + anual habilitados en los 3 pagos (F0/D2).
 *
 * Pricing v2 (specs/pricing-v2, decisión del dueño 2026-08-17):
 * - Estructura de venta Free / Pro / Elite. starter salió de la venta (SALE_TIERS) en v2 y, con el
 *   retiro de Starter (docs/specs/retiro-starter-y-enterprise, S2, 2026-09-05), salió también del
 *   union y de TIER_CONFIG. Sigue en el CHECK de DB solo por el histórico contable (D3=A): el
 *   union quedó MÁS CHICO que el CHECK a propósito, y `parseSubscriptionTier` es la puerta.
 * - TIER_CONFIG.maxClients = catálogo de VENTA (coaches NUEVOS): free 2 / pro 25 / elite 60.
 * - Los coaches EXISTENTES conservan sus límites viejos (free 3 / pro 30 / elite 100) vía
 *   `tierMaxClientsFor(tier, coachCreatedAt)` con corte en PRICING_V2_CUTOVER. Todo sitio con
 *   el coach a mano usa ESE helper; getTierMaxClients queda solo como catálogo de venta.
 * - Los PRECIOS CLP no cambian en esta tanda (el estudio de IVA va aparte).
 *
 * Pricing v3 (docs/specs/pricing-v3, decisión del owner 2026-08-21: 1A 2A 3A 4A 5A 6A):
 * - El white-label pasa a estar en TODOS los planes desde v3. Esto REVIERTE la decisión CEO
 *   2026-06-21 («branding = Pro+ ENTERO», white-label v2): ya NO es la regla vigente.
 * - Pro se distingue por dos cosas y solo dos: el CUPO (25 alumnos) y NO llevar el sello
 *   «Hecho con EVA» (capacidad `showsEvaBadge`, helper homónimo). Free sí lo lleva.
 * - Free = 1 alumno (TIER_CONFIG.free.maxClients), con marca propia completa.
 * - El grandfather por USO vive en la columna `coaches.max_clients` (backfill del 2026-08-21,
 *   que NO toca a los free con 2+ alumnos). La escalera de fecha (`tierMaxClientsFor`) es solo
 *   write-path (qué número se ESCRIBE en activaciones/bajadas) y fallback defensivo cuando el
 *   select omite la columna — NUNCA es la fuente de verdad del cupo de un coach concreto.
 *
 * Contrato de fallback del paquete (retiro de Starter, S1):
 * - Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 *   Vale para los 7 helpers blindados: getTierPriceClp, getTierCapabilities,
 *   getTierAllowedBillingCycles, isBillingCycleAllowedForTier, getDefaultBillingCycleForTier,
 *   getTierBillingCycleSummary y getTierRank.
 * - isBrandingAllowed sigue fail-closed y showsEvaBadge fail-open: leen TIER_CAPABILITIES directo,
 *   no pasan por getTierCapabilities.
 * - El valor crudo de `coaches.subscription_tier` se normaliza con `parseSubscriptionTier` ANTES de
 *   entrar al union: esa es la puerta única de las lecturas de DB/RN.
 */

// ── Tipos de negocio ────────────────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'quarterly' | 'annual'

/**
 * Union de los tiers VIVOS. growth/scale LEGACY pero vivos en runtime — NO borrar.
 *
 * Es MÁS CHICO que el CHECK de DB (`coaches_subscription_tier_check`, baseline:938), que sigue
 * aceptando `'starter'` por el histórico contable (retiro de Starter S2, D3=A: el CHECK no se
 * toca). Todo valor crudo de DB entra por `parseSubscriptionTier`, que degrada a `'free'`.
 */
export type SubscriptionTier = 'free' | 'pro' | 'elite' | 'growth' | 'scale'

/**
 * Tiers estructuralmente vendibles. Subconjunto de SubscriptionTier; growth/scale quedan fuera
 * (grandfathered). La venta real es free/pro/elite. `starter` salió de SALE_TIERS en pricing v2 y
 * del tipo en el retiro de Starter (S2): los deep-links viejos `?tier=starter` se resuelven con
 * `LEGACY_TIER_ALIASES`, no con este union.
 */
export type SaleTier = 'free' | 'pro' | 'elite'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    features: string[]
}

export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canCreateCustomExercises: boolean
    canImportClients: boolean
    /**
     * Pricing v3: ¿las superficies del ALUMNO llevan el sello «Hecho con EVA»?
     * Es el gancho de Pro (D3=A): free true; pro/elite/growth/scale false.
     * NO es lo contrario de canUseBranding — desde v3 un free tiene su marca Y el sello.
     */
    showsEvaBadge: boolean
}

// ── Listas de venta / legacy ──────────────────────────────────────────────────

/**
 * Tiers a la venta (orden de menor a mayor). Fuente única para selectores y recomendación.
 * growth/scale siguen fuera de venta pero vivos en el union (grandfathered).
 */
export const SALE_TIERS: readonly SaleTier[] = ['free', 'pro', 'elite'] as const

/** Type guard: ¿el tier (string arbitrario, ej. query param) es uno de los tiers a la venta? */
export function isSaleTier(tier: string): tier is SaleTier {
    return (SALE_TIERS as readonly string[]).includes(tier)
}

/**
 * Parser tolerante ÚNICO del valor crudo de `coaches.subscription_tier` (lecturas de DB y de RN).
 *
 * `'free'|'pro'|'elite'|'growth'|'scale'` ⇒ el mismo; cualquier otra cosa (`'starter'`,
 * `'starter_lite'`, `null`, basura, un número) ⇒ `'free'`. Reemplaza las 5 copias a mano que vivían
 * en `coach/dashboard/page.tsx`, `coach/guia/page.tsx`, `coach/layout.tsx`,
 * `api/mobile/coach/dashboard/route.ts` y `apps/mobile/lib/coach.ts`.
 *
 * La lista blanca es de LITERALES a propósito: retirar un tier del catálogo es borrar su literal
 * de acá y nada más. `'starter'` ya está fuera (retiro de Starter, S1): una fila residual con ese
 * valor aterriza en `'free'`, que es el default seguro (no cobra, no regala beneficios pagos).
 *
 * NO usar para deep-links de venta viejos (`?tier=`): para eso está `LEGACY_TIER_ALIASES`.
 */
export function parseSubscriptionTier(raw: unknown): SubscriptionTier {
    const v = String(raw ?? 'free').toLowerCase()
    if (v === 'free' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
    return 'free'
}

/**
 * Alias de tiers retirados, SOLO para deep-links de VENTA viejos (`?tier=` en la URL) en TRES
 * pantallas: `coach/reactivate`, `processing` y `flow-processing`. Un link de campaña o un correo
 * viejo que todavía diga `?tier=starter` tiene que vender el plan que reemplazó a Starter.
 *
 * `(auth)/register` queda FUERA a propósito: ahí un tier que ya no existe degrada a `'free'`
 * (`isSaleTier(rawTier) ? rawTier : 'free'`), porque el default seguro de un alta es el que NO
 * cobra — mapearlo a `'pro'` le inventaría un cobro al que recién se registra.
 *
 * NUNCA para filas de DB: el valor crudo de `coaches.subscription_tier` pasa por
 * `parseSubscriptionTier`, que degrada a `'free'`.
 */
export const LEGACY_TIER_ALIASES: Record<string, SaleTier> = {
    starter: 'pro',
    starter_lite: 'pro',
}

// ── Catálogo + display testeable ──────────────────────────────────────────────

const QUARTERLY_DISCOUNT = 0.1
const ANNUAL_DISCOUNT = 0.2
// 'Branding personalizado' NO es shared por una razón histórica: el único tier sin marca propia
// era starter, ya retirado del catálogo (S2). Desde pricing v3 (owner 2026-08-21) el white-label
// está en todos los planes VENDIDOS — free incluido —, así que el bullet se agrega explícitamente
// a free/pro/elite/growth/scale. La regla vieja «branding = Pro+ ENTERO» (decision CEO 2026-06-21,
// white-label v2) quedó REVERTIDA por v3; no volver a leerla como vigente.
const SHARED_TIER_FEATURES = [
    'Rutinas ilimitadas con GIFs',
    'Catálogo de ejercicios con GIF',
    'Programas de entrenamiento',
    'Check-in y progreso',
    'Dashboard coach',
] as const

// Decisión CEO 2026-07-17: los 4 módulos profesionales (cardio, evaluación de movimiento,
// composición corporal y nutrición por intercambios) vienen INCLUIDOS en todo plan pago.
// Ya no se venden como add-ons; el valor lo captura la suscripción.
const MODULES_INCLUDED_FEATURE = '4 módulos profesionales incluidos'

/**
 * Rango de alumnos por tier (copy marketing / UI de VENTA — catálogo pricing v3).
 * Un coach grandfathered ve SU límite real (columna `coaches.max_clients`), no este label.
 */
export const TIER_STUDENT_RANGE_LABEL: Record<SubscriptionTier, string> = {
    // Pricing v3: el Free vende 1 alumno CON marca propia (ese es el gancho, no el cupo).
    free: '1 alumno con tu marca',
    pro: 'Hasta 25 alumnos',
    // Contrato de venta pricing v2: Elite = el tramo 26–60 (Pro cubre hasta 25).
    elite: '26–60 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: '61–120 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: 'Hasta 500 alumnos',
}

/**
 * Plural correcto para un conteo de alumnos («1 alumno» vs «2 alumnos»).
 *
 * Pricing v3 lo hace obligatorio: con el free en 1, cualquier copy que interpole el cupo
 * imprimía «1 alumnos». Fuente ÚNICA para las superficies de copy (landing, /pricing, FAQ,
 * centro de ayuda, verify-email, correos, RN) — nadie vuelve a concatenar la 's' a mano.
 * `lang: 'en'` sirve al espejo inglés de la landing v2 («1 client» / «N clients»).
 */
export function studentCountLabel(n: number, lang: 'es' | 'en' = 'es'): string {
    const noun = lang === 'en' ? (n === 1 ? 'client' : 'clients') : n === 1 ? 'alumno' : 'alumnos'
    return `${n} ${noun}`
}

/** Etiqueta corta por tier (espejo único web + mobile). */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
    free: 'Gratis',
    pro: 'Pro',
    elite: 'Elite',
    growth: 'Growth',
    scale: 'Scale',
}

// Pricing v3: maxClients = catálogo de VENTA (coaches NUEVOS, creados >= PRICING_V3_CUTOVER):
// free 1 / pro 25 / elite 60. Los coaches anteriores conservan su cupo real en la columna
// `coaches.max_clients` (que GANA en todos los gates); tierMaxClientsFor() es el write-path/fallback.
export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
    free: {
        label: 'Free',
        maxClients: 1,
        monthlyPriceClp: 0,
        // Pricing v3 (owner 2026-08-21): free = TODO EVA (módulos, nutrición y white-label completo)
        // con cupo 1 y el sello «Hecho con EVA» en las superficies del alumno. Mismo orden de bullets
        // que pro/elite. Los bullets de venta salen de esta lista.
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Branding personalizado', 'Planes de nutrición'],
    },
    pro: {
        label: 'Pro',
        maxClients: 25,
        monthlyPriceClp: 29990,
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Branding personalizado', 'Planes de nutrición'],
    },
    elite: {
        label: 'Elite',
        maxClients: 60,
        monthlyPriceClp: 44990,
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Branding personalizado', 'Planes de nutrición'],
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: {
        label: 'Growth',
        maxClients: 120,
        monthlyPriceClp: 84990,
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Branding personalizado', 'Planes de nutrición'],
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: {
        label: 'Scale',
        maxClients: 500,
        monthlyPriceClp: 190000,
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Branding personalizado', 'Planes de nutrición'],
    },
}

/**
 * Feature gates by tier.
 *
 * Pricing v3 (owner 2026-08-21, docs/specs/pricing-v3): free = TODO liberado, white-label
 * INCLUIDO. Esto REVIERTE la regla «branding = Pro+ ENTERO» (decision CEO 2026-06-21,
 * white-label v2) — ya no rige. El gate único de marca sigue siendo isBrandingAllowed().
 *
 * Lo que distingue a los planes pagos ya no es la marca sino:
 *  - el CUPO de alumnos (TIER_CONFIG.maxClients / columna coaches.max_clients), y
 *  - `showsEvaBadge`: el sello «Hecho con EVA» en las superficies del alumno (app /c, login,
 *    PDF de nutrición, correos, export RN). free true; pro/elite/growth/scale false.
 *
 * Los 5 tiers vivos tienen `canUseNutrition` y `canUseBranding` en true: el único que los tenía en
 * false era starter, retirado del catálogo (S2). Los gates que los leen quedan como defensa ante un
 * tier corrupto, no como regla de negocio vigente.
 */
const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
    free: {
        canUseNutrition: true,
        // Pricing v3: el free tiene su marca propia completa (logo, color, preset, fuente, loader,
        // layout de login). Lo que paga Pro es el cupo y sacarse el sello.
        canUseBranding: true,
        canCreateCustomExercises: true,
        canImportClients: true,
        showsEvaBadge: true,
    },
    pro: {
        canUseNutrition: true,
        canUseBranding: true,
        canCreateCustomExercises: true,
        canImportClients: true,
        showsEvaBadge: false,
    },
    elite: {
        canUseNutrition: true,
        canUseBranding: true,
        canCreateCustomExercises: true,
        canImportClients: true,
        showsEvaBadge: false,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: {
        canUseNutrition: true,
        canUseBranding: true,
        canCreateCustomExercises: true,
        canImportClients: true,
        showsEvaBadge: false,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: {
        canUseNutrition: true,
        canUseBranding: true,
        canCreateCustomExercises: true,
        canImportClients: true,
        showsEvaBadge: false,
    },
}

// ── Helpers de precio / límites / capacidades ─────────────────────────────────

function applyDiscount(price: number, discount: number) {
    return Math.round(price * (1 - discount))
}

/**
 * Precio TOTAL del período por tier y ciclo (mensual · ×3 −10 % · ×12 −20 %).
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 */
export function getTierPriceClp(tier: SubscriptionTier, cycle: BillingCycle) {
    const monthly = TIER_CONFIG[tier]?.monthlyPriceClp ?? 0
    if (cycle === 'monthly') return monthly
    if (cycle === 'quarterly') return applyDiscount(monthly * 3, QUARTERLY_DISCOUNT)
    // anual = ×12 −20% para todo tier (la rama especial annualPriceClp de scale se eliminó — D3)
    return applyDiscount(monthly * 12, ANNUAL_DISCOUNT)
}

/**
 * Catálogo de VENTA: límite de alumnos para coaches NUEVOS (creados >= PRICING_V3_CUTOVER).
 * NO usar cuando hay un coach concreto a mano — ahí manda la columna `coaches.max_clients` y,
 * como fallback, `tierMaxClientsFor(tier, created_at)` (escalera de grandfather v2/v3).
 */
export function getTierMaxClients(tier: SubscriptionTier) {
    // Tier fuera del union (string arbitrario de DB o de un form): cae al piso de FREE, jamás al
    // cupo de un tier pago ni a un throw. Mismo fail-safe que `tierMaxClientsFor`, que ya usa `?.`
    // en sus tres peldaños — acá el acceso directo reventaba con TypeError y tumbaba el alta/gate.
    return TIER_CONFIG[tier]?.maxClients ?? TIER_CONFIG.free.maxClients
}

// ── Grandfather por fecha: escalera pre-v2 / v2 / v3 (specs/pricing-v2 P2 + pricing-v3 D4) ──

/**
 * Fecha de corte de pricing v2 (el deploy de la reestructura Free/Pro/Elite).
 * Coaches creados ANTES de este instante conservan los límites viejos; los creados
 * DESPUÉS (>=) entran con el catálogo nuevo. ISO UTC, comparable vía Date.parse.
 */
export const PRICING_V2_CUTOVER = '2026-08-18T00:00:00Z'

const PRICING_V2_CUTOVER_MS = Date.parse(PRICING_V2_CUTOVER)

/**
 * Fecha de corte de pricing v3 (día D del deploy Free-1-con-marca, docs/specs/pricing-v3).
 * Coaches creados >= este instante nacen con el catálogo v3 (free 1). ISO UTC.
 */
export const PRICING_V3_CUTOVER = '2026-08-21T00:00:00Z'

const PRICING_V3_CUTOVER_MS = Date.parse(PRICING_V3_CUTOVER)

/**
 * Límites de alumnos PRE pricing-v2 (los que regían hasta PRICING_V2_CUTOVER).
 * growth/scale son legacy puros y mantienen su techo en ambos lados del corte.
 */
const PRE_CUTOVER_TIER_MAX_CLIENTS: Record<SubscriptionTier, number> = {
    free: 3,
    pro: 30,
    elite: 100,
    growth: 120,
    scale: 500,
}

/**
 * Límites del mundo pricing-v2 (vigentes entre PRICING_V2_CUTOVER y PRICING_V3_CUTOVER).
 * Solo free cambia en v3 (2 → 1); el resto es idéntico al catálogo actual y se repite acá
 * para que el peldaño del medio sea explícito y no dependa de TIER_CONFIG (que ya es v3).
 */
const V2_TIER_MAX_CLIENTS: Record<SubscriptionTier, number> = {
    free: 2,
    pro: 25,
    elite: 60,
    growth: 120,
    scale: 500,
}

/**
 * Límite de alumnos para UN coach concreto — escalera de 3 peldaños por fecha de creación.
 *
 * Regla del dueño (2026-08-17, literal): «los pro actuales retienen sus 30; los free
 * actuales retienen sus 3; y los demás archivados igual». NINGÚN coach existente pierde
 * capacidad por un cambio de catálogo.
 *
 * - Creado ANTES de PRICING_V2_CUTOVER ⇒ mundo pre-v2 (free 3 / pro 30 / elite 100).
 * - Creado entre V2 (incl.) y V3 (excl.) ⇒ mundo v2 (free 2 / pro 25 / elite 60).
 * - Creado >= PRICING_V3_CUTOVER ⇒ catálogo v3 vigente (TIER_CONFIG: free 1 / pro 25 / elite 60).
 * - Fecha null/undefined/inválida ⇒ se trata como coach PRE-v2 (fail-safe GENEROSO: ante la duda
 *   jamás se le quita capacidad a nadie).
 *
 * Pricing v3: este helper es SOLO write-path (qué número se escribe en activaciones/bajadas) y
 * fallback defensivo. El grandfather REAL de v3 es por USO y vive en la columna
 * `coaches.max_clients`, que gana en todos los gates cuando el select la trae.
 */
export function tierMaxClientsFor(
    tier: SubscriptionTier,
    coachCreatedAt: string | Date | null | undefined
): number {
    const createdMs =
        coachCreatedAt instanceof Date
            ? coachCreatedAt.getTime()
            : typeof coachCreatedAt === 'string'
              ? Date.parse(coachCreatedAt)
              : NaN
    // Solo una fecha VÁLIDA sube peldaños; todo lo demás cae al mundo pre-v2 (generoso).
    if (!Number.isFinite(createdMs) || createdMs < PRICING_V2_CUTOVER_MS) {
        // Tier fuera del union (string arbitrario de DB): fail-safe al piso de free de ESE mundo.
        return PRE_CUTOVER_TIER_MAX_CLIENTS[tier] ?? PRE_CUTOVER_TIER_MAX_CLIENTS.free
    }
    if (createdMs < PRICING_V3_CUTOVER_MS) {
        return V2_TIER_MAX_CLIENTS[tier] ?? V2_TIER_MAX_CLIENTS.free
    }
    return TIER_CONFIG[tier]?.maxClients ?? TIER_CONFIG.free.maxClients
}

/**
 * Capacidades del tier (nutrición, marca, ejercicios propios, importar, sello).
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 *
 * Consecuencia declarada (2.º orden): los azúcares de `apps/mobile/lib/coach-tiers.ts`
 * (`canUseNutrition`/`canUseBranding`/`canCreateCustomExercises`/`canImportClients`) eran
 * fail-closed por el `?.` sobre `undefined`; con este fallback pasan a ser fail-OPEN ante un tier
 * corrupto (free tiene las 4 en `true` desde pricing v3). Es inalcanzable en la práctica porque RN
 * normaliza antes con `parseSubscriptionTier` (`apps/mobile/lib/coach.ts`), pero queda declarado.
 */
export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
    return TIER_CAPABILITIES[tier] ?? TIER_CAPABILITIES.free
}

/**
 * ¿El tier puede usar branding (white-label)? Fuente ÚNICA del gate de marca: la consumen las 5
 * superficies (proxy, layout alumno, layout coach, login query, manifest/splash) + el write-path.
 *
 * Pricing v3 (owner 2026-08-21): free SÍ tiene marca propia. La regla vieja «branding = Pro+
 * ENTERO» (decision CEO 2026-06-21, white-label v2) está REVERTIDA. Tras el retiro de Starter (S2)
 * ningún tier del catálogo queda sin marca: los 5 vivos tienen `canUseBranding: true`.
 *
 * FAIL-CLOSED, y sigue siéndolo: un tier inválido (string arbitrario fuera del union) cae a false,
 * o sea NO ve marca propia — nunca se filtra la marca de nadie por un tier corrupto.
 */
export function isBrandingAllowed(tier: SubscriptionTier): boolean {
    return TIER_CAPABILITIES[tier]?.canUseBranding === true
}

/**
 * ¿Las superficies del ALUMNO llevan el sello «Hecho con EVA»? Gancho de Pro en pricing v3
 * (D3=A): free sí; pro/elite/growth/scale no. Superficies: shell del alumno `/c`, login
 * del alumno, PDF de nutrición, correos al alumno y export de RN.
 *
 * FAIL-OPEN (a propósito, al revés que isBrandingAllowed): un tier inválido MUESTRA el sello. Ante
 * un tier corrupto preferimos regalar atribución de EVA antes que regalar el beneficio pago.
 */
export function showsEvaBadge(tier: SubscriptionTier): boolean {
    return TIER_CAPABILITIES[tier]?.showsEvaBadge !== false
}

// ── Sello «Hecho con EVA» (pricing v3, D3=A) ──────────────────────────────────
//
// Fuente ÚNICA del texto y del link para web + RN: nadie hardcodea la cadena ni la URL.

/** Texto del sello, tal cual se pinta en las superficies del alumno. */
export const EVA_BADGE_LABEL = 'Hecho con EVA'

/** Superficie donde se pinta el sello — viaja como `utm_medium` para medir de dónde llegan. */
export type EvaBadgeMedium =
    | 'student_app'
    | 'student_login'
    | 'nutrition_pdf'
    | 'student_email'
    | 'rn_export'

/**
 * Ruta de aterrizaje del sello. NO es la home: la home monta `PreciosSection` («Elegir Pro»,
 * precios por ciclo) y el sello se pinta DENTRO de la app del alumno, iOS incluido — un toque
 * llevaría a comprar fuera de la tienda (guideline 3.1.1). `/hecho-con-eva` cuenta la misma
 * historia SIN precios ni planes; la venta sigue viviendo en correo y web (embudo-free-pro W5.1).
 */
export const EVA_BADGE_PATH = '/hecho-con-eva'

/** URL del sello con UTMs por superficie (campaña única `free_badge`). */
export function getEvaBadgeUrl(medium: EvaBadgeMedium = 'student_app'): string {
    return `https://www.eva-app.cl${EVA_BADGE_PATH}?utm_source=badge&utm_medium=${medium}&utm_campaign=free_badge`
}

// ── Ciclos de cobro ───────────────────────────────────────────────────────────

export const BILLING_CYCLE_CONFIG: Record<
    BillingCycle,
    { months: number; label: string; discountPercent: number }
> = {
    monthly: { months: 1, label: 'Mensual', discountPercent: 0 },
    quarterly: { months: 3, label: 'Trimestral', discountPercent: 10 },
    annual: { months: 12, label: 'Anual', discountPercent: 20 },
}

/**
 * Sufijo del precio que devuelve `getTierPriceClp`, por ciclo.
 *
 * `getTierPriceClp` devuelve el TOTAL del período (mensual ×3 −10 % / ×12 −20 %), NO el mensual
 * equivalente. Cualquier UI que lo pinte con «/mes» miente: con Anual la card de Pro mostraba
 * «$287.904 /mes» (embudo-free-pro W5.4). Fuente única del sufijo para no volver a hardcodearlo.
 */
export const BILLING_CYCLE_PRICE_SUFFIX: Record<BillingCycle, string> = {
    monthly: '/mes',
    quarterly: '/trimestre',
    annual: '/año',
}

export const TIER_ALLOWED_BILLING_CYCLES: Record<SubscriptionTier, BillingCycle[]> = {
    free:    [],
    pro:     ['monthly', 'quarterly', 'annual'],
    elite:   ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth:  ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale:   ['monthly', 'quarterly', 'annual'],
}

/**
 * Ciclos de cobro habilitados para el tier.
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 */
export function getTierAllowedBillingCycles(tier: SubscriptionTier): BillingCycle[] {
    return TIER_ALLOWED_BILLING_CYCLES[tier] ?? []
}

/**
 * ¿El ciclo está habilitado para el tier? Es el que decide el retorno del checkout cuando un
 * `external_reference` legacy trae un tier fuera del catálogo (`confirm-subscription/route.ts`).
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 */
export function isBillingCycleAllowedForTier(
    tier: SubscriptionTier,
    cycle: BillingCycle
): boolean {
    return (TIER_ALLOWED_BILLING_CYCLES[tier] ?? []).includes(cycle)
}

/**
 * Ciclo por defecto del tier. Free devuelve `'monthly'` como placeholder — en la práctica no cobra.
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 */
export function getDefaultBillingCycleForTier(tier: SubscriptionTier): BillingCycle {
    return TIER_ALLOWED_BILLING_CYCLES[tier]?.[0] ?? 'monthly'
}

/**
 * Texto corto para badges: cobro permitido por plan.
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 */
export function getTierBillingCycleSummary(tier: SubscriptionTier): string {
    const cycles = TIER_ALLOWED_BILLING_CYCLES[tier] ?? []
    if (cycles.length === 0) return 'Plan gratuito'
    if (cycles.includes('monthly') && cycles.includes('quarterly') && cycles.includes('annual')) {
        return 'Cobro mensual, trimestral o anual'
    }
    // Genérica — solo alcanzable por tiers legacy con un subconjunto distinto de ciclos.
    return 'Solo cobro trimestral o anual'
}

/**
 * Texto corto para badges: nutrición en el plan.
 *
 * La superficie de nutrición V2 no tiene gate de tier — está incluida en TODOS los
 * planes, Free incluido (pricing v2 además puso `canUseNutrition` de free en true,
 * así el copy y la capability ya no se contradicen). El resumen es constante y NO
 * deriva de `canUseNutrition`, que solo gateaba la COMPRA del add-on en billing
 * (compra que se retira de la UI en la wave A2).
 *
 * Se mantiene el parámetro `tier` para no romper a los consumidores existentes
 * (`/pricing`, onboarding, reactivate) y por si algún plan vuelve a diferenciarse.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTierNutritionSummary(_tier: SubscriptionTier): string {
    return 'Incluye planes de nutrición'
}

export function getRecommendedTier(clientCount: number): SubscriptionTier {
    // Solo recomendamos tiers a la venta. "Más de elite" lo maneja la UI con el puente Teams, no un tier.
    return SALE_TIERS.find(t => TIER_CONFIG[t].maxClients >= clientCount) ?? 'elite'
}

/**
 * Recomendación de tier para UN coach concreto (pricing v2, waves B): igual que
 * `getRecommendedTier` pero midiendo cada tier con SU límite real vía `tierMaxClientsFor`
 * (grandfather P2). Un coach VIEJO con 28 alumnos debe recibir «Pro (hasta 30)», no «Elite»:
 * si compra Pro, el write-path le fija 30. Para un coach nuevo (o fecha desconocida ⇒ fail-safe
 * viejo/generoso) la recomendación coincide con la del catálogo que le aplica.
 * Consumidores: emails de trial-expiry y el envío manual del panel admin.
 */
export function getRecommendedTierFor(
    clientCount: number,
    coachCreatedAt: string | Date | null | undefined
): SubscriptionTier {
    return SALE_TIERS.find(t => tierMaxClientsFor(t, coachCreatedAt) >= clientCount) ?? 'elite'
}

// ── Dirección del cambio de plan (upgrade/downgrade) ──────────────────────────
//
// Orden total de los tiers para decidir la dirección de un cambio de plan (plan
// estrategia 06 — comportamiento de cambio de plan decidido por el dueño). Cubre los
// 5 tiers vivos (incluidos los LEGACY growth/scale) para que un coach grandfathered nunca
// produzca rank `undefined` al comparar contra un tier a la venta.

/**
 * Orden total de tiers (precio/capacidad creciente). free < pro < elite < growth < scale.
 *
 * El `1` quedó VACANTE al retirar starter (S2) y NO se renumera a propósito: el orden solo
 * necesita ser creciente, y renumerar movería valores que otros pines comparan.
 */
export const TIER_RANK: Record<SubscriptionTier, number> = {
    free: 0,
    pro: 2,
    elite: 3,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    growth: 4,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    scale: 5,
}

/**
 * Rango del tier en el orden total (free 0 … scale 5).
 *
 * Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).
 *
 * Consecuencia declarada: un tier desconocido cuenta como free en `comparePlanDirection` y en el
 * correo de cupo lleno (`services/billing/sales-emails.service.ts` ⇒ recomienda Pro). Es el
 * comportamiento deseado; sin la red el bug era SILENCIOSO (`undefined < 2` es `false`).
 */
export function getTierRank(tier: SubscriptionTier): number {
    return TIER_RANK[tier] ?? 0
}

/**
 * Dirección de un cambio de plan según el orden total de tiers:
 *   - `'upgrade'`   → el tier destino es mayor (rank next > current).
 *   - `'downgrade'` → el tier destino es menor (rank next < current).
 *   - `'same'`      → mismo tier (un cambio de ciclo se trata aparte por el llamador).
 */
export function comparePlanDirection(
    current: SubscriptionTier,
    next: SubscriptionTier
): 'upgrade' | 'downgrade' | 'same' {
    const c = getTierRank(current)
    const n = getTierRank(next)
    if (n > c) return 'upgrade'
    if (n < c) return 'downgrade'
    return 'same'
}

// ── Cupones: motor de precio puro (F2a, specs/discount-codes/EXECUTION-PLAN.md) ──
//
// El cupon se aplica SOBRE el composite ya con descuento de ciclo (COMPONE — decision CEO O8
// 2026-06-20). target='total' = % sobre toda la cuenta (base + add-ons vivos); 'base' = solo el
// plan; 'module' = solo los add-ons indicados. El neto nunca baja de DISCOUNT_NET_FLOOR_CLP
// (piso de margen). La expiracion/decremento de ciclos vive en F4 (webhook); aca, si
// remainingCycles <= 0 el descuento NO se aplica. PURO: corre igual en web y mobile.

export type DiscountType = 'percent' | 'fixed_clp'
export type DiscountTarget = 'base' | 'module' | 'total'

export type DiscountSpec = {
    type: DiscountType
    value: number                       // percent: 1..100 ; fixed_clp: CLP entero >= 0
    target: DiscountTarget
    moduleKeys?: string[]               // requerido para target='module'
    remainingCycles?: number | null     // null = forever/once vigente ; <= 0 = expirado (sin descuento)
}

export type CompositeLineAddon = { moduleKey: string; cycleAmountClp: number }

export type DiscountResult = {
    baseBeforeDiscountClp: number       // composite (base + add-ons) ANTES del cupon
    discountClp: number                 // descuento efectivo aplicado (>= 0)
    netClp: number                      // composite - discount, con piso >= DISCOUNT_NET_FLOOR_CLP
}

/**
 * Piso del neto cobrado (CLP) por DEFECTO. El neto nunca baja de aca tras aplicar un cupon. Default 0
 * (solo no-negativo); el path pago ADEMAS rechaza netClp === 0 (decision O1: 100%-off-N-ciclos
 * no va por el path pago — va por admin_grant). Subir si se define un costo/margen minimo GLOBAL.
 * Es CONFIGURABLE por llamada via input.floorClp (decision O8: margin floor configurable);
 * el default mantiene el comportamiento historico (solo no-negativo) hasta que el CEO fije un costo.
 */
export const DISCOUNT_NET_FLOOR_CLP = 0

/**
 * Aplica un cupon a un composite (base + add-ons) ya con descuento de ciclo. PURO, sin DB.
 * Compone sobre el composite (O8). Redondeo Math.round (espejo de applyDiscount). Clamp al piso
 * (configurable via floorClp, default DISCOUNT_NET_FLOOR_CLP). El neto nunca supera el composite
 * (un cupon nunca sube el precio). Devuelve siempre el composite como baseBeforeDiscountClp (evidencia SERNAC).
 */
export function computeDiscountedClp(input: {
    baseClp: number
    addons?: CompositeLineAddon[]
    spec: DiscountSpec | null | undefined
    floorClp?: number                   // piso de margen configurable (O8); default DISCOUNT_NET_FLOOR_CLP
}): DiscountResult {
    const addons = input.addons ?? []
    const base = Math.max(0, Math.round(input.baseClp))
    const addonsTotal = addons.reduce((s, a) => s + Math.max(0, Math.round(a.cycleAmountClp)), 0)
    const composite = base + addonsTotal

    const spec = input.spec
    const active = !!spec && (spec.remainingCycles == null || spec.remainingCycles > 0)
    if (!spec || !active) {
        return { baseBeforeDiscountClp: composite, discountClp: 0, netClp: composite }
    }

    // Monto sobre el que aplica el descuento, segun el target.
    let targetAmount: number
    if (spec.target === 'base') {
        targetAmount = base
    } else if (spec.target === 'module') {
        const keys = new Set(spec.moduleKeys ?? [])
        targetAmount = addons.reduce(
            (s, a) => s + (keys.has(a.moduleKey) ? Math.max(0, Math.round(a.cycleAmountClp)) : 0),
            0
        )
    } else {
        targetAmount = composite // 'total'
    }

    let rawDiscount: number
    if (spec.type === 'percent') {
        const pct = Math.min(100, Math.max(0, spec.value))
        rawDiscount = Math.round(targetAmount * (pct / 100))
    } else {
        // fixed_clp: nunca descuenta mas que el monto del target
        rawDiscount = Math.min(Math.max(0, Math.round(spec.value)), targetAmount)
    }

    // El neto no baja del piso (margin floor, O8) ni sube del composite; el descuento efectivo
    // se recalcula desde el neto (consistencia). floor clampeado a >= 0 por seguridad.
    const floor = Math.max(0, Math.round(input.floorClp ?? DISCOUNT_NET_FLOOR_CLP))
    const net = Math.min(composite, Math.max(floor, composite - rawDiscount))
    return { baseBeforeDiscountClp: composite, discountClp: composite - net, netClp: net }
}
