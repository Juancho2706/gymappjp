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
 * - Estructura de venta Free / Pro / Elite. starter SALE de la venta (SALE_TIERS) pero QUEDA
 *   en el union, en TIER_CONFIG y en el CHECK de DB — mismo trato que growth/scale.
 * - TIER_CONFIG.maxClients = catálogo de VENTA (coaches NUEVOS): free 2 / pro 25 / elite 60.
 * - Los coaches EXISTENTES conservan sus límites viejos (free 3 / pro 30 / elite 100) vía
 *   `tierMaxClientsFor(tier, coachCreatedAt)` con corte en PRICING_V2_CUTOVER. Todo sitio con
 *   el coach a mano usa ESE helper; getTierMaxClients queda solo como catálogo de venta.
 * - Los PRECIOS CLP no cambian en esta tanda (el estudio de IVA va aparte).
 */

// ── Tipos de negocio ────────────────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'quarterly' | 'annual'

/** Union completo (CHECK de DB). growth/scale LEGACY pero vivos en runtime — NO borrar. */
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'

/**
 * Tiers estructuralmente vendibles. Subconjunto de SubscriptionTier; growth/scale quedan fuera (grandfathered).
 * Pricing v2: starter QUEDA en este TIPO (compat con superficies que aún lo referencian: register,
 * reactivate, cupones históricos) pero ya NO está en SALE_TIERS — la venta real es free/pro/elite.
 * `isSaleTier('starter')` devuelve false; las superficies se limpian en la wave D.
 */
export type SaleTier = 'free' | 'starter' | 'pro' | 'elite'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    features: string[]
    isMostAffordable?: boolean
}

export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canUseAdvancedReports: boolean
    canCreateCustomExercises: boolean
    canImportClients: boolean
}

// ── Listas de venta / legacy ──────────────────────────────────────────────────

/**
 * Tiers a la venta (orden de menor a mayor). Fuente única para selectores y recomendación.
 * Pricing v2: starter FUERA de venta (patrón growth/scale — sigue en el union, TIER_CONFIG y el
 * CHECK de DB para el histórico; compras/cupones nuevos de starter se rechazan en waves C).
 */
export const SALE_TIERS: readonly SaleTier[] = ['free', 'pro', 'elite'] as const

/** Tiers fuera de venta, conservados en runtime/DB/admin para coaches grandfathered. */
export const LEGACY_TIERS = ['growth', 'scale'] as const

/** Type guard: ¿el tier (string arbitrario, ej. query param) es uno de los tiers a la venta? */
export function isSaleTier(tier: string): tier is SaleTier {
    return (SALE_TIERS as readonly string[]).includes(tier)
}

// ── Catálogo + display testeable ──────────────────────────────────────────────

const QUARTERLY_DISCOUNT = 0.1
const ANNUAL_DISCOUNT = 0.2
// 'Branding personalizado' YA NO es shared: branding = Pro+ ENTERO (decision CEO 2026-06-21,
// white-label v2). Se agrega solo a pro/elite/growth/scale, no a starter.
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
 * Rango de alumnos por tier (copy marketing / UI de VENTA — catálogo nuevo pricing v2).
 * Un coach grandfathered ve SU límite real vía tierMaxClientsFor(), no este label.
 */
export const TIER_STUDENT_RANGE_LABEL: Record<SubscriptionTier, string> = {
    free: 'Hasta 2 alumnos',
    // Fuera de venta desde pricing v2 (grandfathered) — label solo para display de cuentas históricas.
    starter: '1–10 alumnos',
    pro: 'Hasta 25 alumnos',
    // Contrato de venta pricing v2: Elite = el tramo 26–60 (Pro cubre hasta 25).
    elite: '26–60 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: '61–120 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: 'Hasta 500 alumnos',
}

/** Etiqueta corta por tier (espejo único web + mobile). */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
    free: 'Gratis',
    starter: 'Starter',
    pro: 'Pro',
    elite: 'Elite',
    growth: 'Growth',
    scale: 'Scale',
}

// Pricing v2: maxClients = catálogo de VENTA (coaches NUEVOS, creados >= PRICING_V2_CUTOVER):
// free 2 / pro 25 / elite 60. Los coaches existentes conservan sus límites viejos (3/30/100) vía
// tierMaxClientsFor(); las filas existentes de coaches.max_clients NO se tocan (la columna gana).
export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
    free: {
        label: 'Free',
        maxClients: 2,
        monthlyPriceClp: 0,
        // Pricing v2 (P1): free = TODO EVA (módulos y nutrición incluidos — el gate server ya los
        // libera, waves A2/A1) EXCEPTO white-label. Los bullets de venta salen de esta lista.
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE, 'Planes de nutrición'],
    },
    starter: {
        label: 'Starter',
        maxClients: 10,
        monthlyPriceClp: 19990,
        isMostAffordable: true,
        features: [...SHARED_TIER_FEATURES, MODULES_INCLUDED_FEATURE],
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
 * Pricing v2 (P1/P4): free = TODO liberado (nutrición, ejercicios custom, importar alumnos)
 * EXCEPTO branding. starter (fuera de venta) conserva su set histórico grandfathered.
 * Branding (color/logo/loader + white-label v2: color2/font/dark) sigue siendo Pro+ ENTERO
 * (decision CEO 2026-06-21, white-label v2). El gate único es isBrandingAllowed().
 * canUseAdvancedReports reserved for future implementation — gate not active yet.
 */
const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
    free: {
        canUseNutrition: true,
        canUseBranding: false,
        canUseAdvancedReports: false,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    starter: {
        canUseNutrition: false,
        canUseBranding: false,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    pro: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    elite: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
}

// ── Helpers de precio / límites / capacidades ─────────────────────────────────

function applyDiscount(price: number, discount: number) {
    return Math.round(price * (1 - discount))
}

export function getTierPriceClp(tier: SubscriptionTier, cycle: BillingCycle) {
    const monthly = TIER_CONFIG[tier].monthlyPriceClp
    if (cycle === 'monthly') return monthly
    if (cycle === 'quarterly') return applyDiscount(monthly * 3, QUARTERLY_DISCOUNT)
    // anual = ×12 −20% para todo tier (la rama especial annualPriceClp de scale se eliminó — D3)
    return applyDiscount(monthly * 12, ANNUAL_DISCOUNT)
}

/**
 * Catálogo de VENTA: límite de alumnos para coaches NUEVOS (creados >= PRICING_V2_CUTOVER).
 * NO usar cuando hay un coach concreto a mano — ahí manda `tierMaxClientsFor(tier, created_at)`
 * (grandfather de pricing v2). Los callers con coach migran al helper en waves B.
 */
export function getTierMaxClients(tier: SubscriptionTier) {
    return TIER_CONFIG[tier].maxClients
}

// ── Grandfather pricing v2 (specs/pricing-v2, P2) ────────────────────────────

/**
 * Fecha de corte de pricing v2 (el deploy de la reestructura Free/Pro/Elite).
 * Coaches creados ANTES de este instante conservan los límites viejos; los creados
 * DESPUÉS (>=) entran con el catálogo nuevo. ISO UTC, comparable vía Date.parse.
 */
export const PRICING_V2_CUTOVER = '2026-08-18T00:00:00Z'

const PRICING_V2_CUTOVER_MS = Date.parse(PRICING_V2_CUTOVER)

/**
 * Límites de alumnos PRE pricing-v2 (los que regían hasta PRICING_V2_CUTOVER).
 * starter conserva 10 en ambos mundos (fuera de venta, no cambia); growth/scale
 * son legacy puros y mantienen su techo en ambos lados del corte.
 */
const PRE_CUTOVER_TIER_MAX_CLIENTS: Record<SubscriptionTier, number> = {
    free: 3,
    starter: 10,
    pro: 30,
    elite: 100,
    growth: 120,
    scale: 500,
}

/**
 * Límite de alumnos para UN coach concreto (grandfather de pricing v2 — P2).
 *
 * Regla del dueño (2026-08-17, literal): «los pro actuales retienen sus 30; los free
 * actuales retienen sus 3; y los demás archivados igual». Es decir: NINGÚN coach
 * existente pierde capacidad — un coach viejo que se archiva y reactiva, o un pro
 * viejo que cae y vuelve, conserva su límite de siempre.
 *
 * - Coach creado ANTES de PRICING_V2_CUTOVER ⇒ límites viejos (free 3 / starter 10 /
 *   pro 30 / elite 100).
 * - Coach creado DESPUÉS (>= corte) ⇒ catálogo nuevo (free 2 / starter 10 / pro 25 /
 *   elite 60).
 * - Fecha null/undefined/ inválida ⇒ se trata como coach VIEJO (fail-safe GENEROSO:
 *   ante la duda jamás se le quita capacidad a nadie).
 *
 * Este helper es el fallback/write-path canónico; la columna `coaches.max_clients`
 * sigue GANANDO cuando existe (las filas existentes no se tocan).
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
    // Solo una fecha VÁLIDA y >= corte da los límites nuevos; todo lo demás cae al mundo viejo.
    const isPostCutover = Number.isFinite(createdMs) && createdMs >= PRICING_V2_CUTOVER_MS
    if (isPostCutover) {
        // Tier fuera del union (string arbitrario de DB): fail-safe al piso nuevo de free.
        return TIER_CONFIG[tier]?.maxClients ?? TIER_CONFIG.free.maxClients
    }
    return PRE_CUTOVER_TIER_MAX_CLIENTS[tier] ?? PRE_CUTOVER_TIER_MAX_CLIENTS.free
}

export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
    return TIER_CAPABILITIES[tier]
}

/**
 * ¿El tier puede usar branding (white-label)? Fuente ÚNICA del gate de marca: la consumen las 5
 * superficies (proxy, layout alumno, layout coach, login query, manifest/splash) + el write-path.
 * Branding = Pro+ ENTERO (decision CEO 2026-06-21): free/starter ven TODO EVA system (color/logo/
 * loader EVA); pro/elite/growth/scale ven su marca. Fail-closed: un tier inválido (string arbitrario
 * fuera del union) cae a false.
 */
export function isBrandingAllowed(tier: SubscriptionTier): boolean {
    return TIER_CAPABILITIES[tier]?.canUseBranding === true
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

export const TIER_ALLOWED_BILLING_CYCLES: Record<SubscriptionTier, BillingCycle[]> = {
    free:    [],
    starter: ['monthly', 'quarterly', 'annual'],
    pro:     ['monthly', 'quarterly', 'annual'],
    elite:   ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth:  ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale:   ['monthly', 'quarterly', 'annual'],
}

export function getTierAllowedBillingCycles(tier: SubscriptionTier): BillingCycle[] {
    return TIER_ALLOWED_BILLING_CYCLES[tier]
}

export function isBillingCycleAllowedForTier(
    tier: SubscriptionTier,
    cycle: BillingCycle
): boolean {
    return TIER_ALLOWED_BILLING_CYCLES[tier].includes(cycle)
}

// Free tier returns 'monthly' as placeholder — it has no billing cycle in practice
export function getDefaultBillingCycleForTier(tier: SubscriptionTier): BillingCycle {
    return TIER_ALLOWED_BILLING_CYCLES[tier][0] ?? 'monthly'
}

/** Texto corto para badges: cobro permitido por plan. */
export function getTierBillingCycleSummary(tier: SubscriptionTier): string {
    const cycles = TIER_ALLOWED_BILLING_CYCLES[tier]
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
// 6 tiers (incluidos los LEGACY growth/scale) para que un coach grandfathered nunca
// produzca rank `undefined` al comparar contra un tier a la venta.

/** Orden total de tiers (precio/capacidad creciente). free < starter < pro < elite < growth < scale. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    elite: 3,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    growth: 4,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    scale: 5,
}

export function getTierRank(tier: SubscriptionTier): number {
    return TIER_RANK[tier]
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
