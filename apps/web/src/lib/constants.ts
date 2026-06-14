// MODULE_KEYS / ModuleKey: fuente canónica en entitlements.service (array plano +
// tipo derivado, sin acoplar Supabase/Next). Mismo patrón que admin/module-labels.ts.
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
// BillingCycle se RE-EXPORTA más abajo desde @eva/tiers; acá lo importamos como
// binding local porque `getAddonPaymentRulesForCycle` lo usa en su firma (un
// re-export `export type {}` no crea binding utilizable dentro del módulo).
import type { BillingCycle } from '@eva/tiers'

export const MUSCLE_GROUPS = [
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Antebrazos',
    'Cuádriceps',
    'Glúteos',
    'Abductores',
    'Aductores',
    'Pantorrillas',
    'Lumbar',
    'Abdominales',
    'Cardio',
    'Dorsales',
    'Espalda Alta',
    'Isquiotibiales',
    'Pectorales',
    'Trapecios'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];

export const MUSCLE_MAPPING: Record<string, string[]> = {
    'hombros': ['delts', 'shoulders', 'deltoides'],
    'biceps': ['biceps', 'bíceps'],
    'triceps': ['triceps', 'tríceps'],
    'antebrazos': ['forearms', 'antebrazos'],
    'cuadriceps': ['quads', 'cuadriceps', 'cuádriceps'],
    'gluteos': ['glutes', 'glúteos'],
    'abductores': ['abductors', 'abductores'],
    'aductores': ['adductors', 'aductores'],
    'pantorrillas': ['calves', 'pantorrillas', 'gemelos'],
    'lumbar': ['lower back', 'lumbar'],
    'abdominales': ['abs', 'core', 'abdominales', 'abdomen'],
    'cardio': ['cardio', 'cardiovascular system'],
    'dorsales': ['lats', 'dorsales'],
    'espalda alta': ['upper back', 'espalda alta'],
    'isquiotibiales': ['hamstrings', 'isquiotibiales', 'isquios'],
    'pectorales': ['pectoral', 'pecho', 'chest', 'pectorales'],
    'trapecios': ['traps', 'trapecios', 'trapecio']
};

// ── Tiers / ciclos: fuente única en @eva/tiers (paquete puro, compartido web+mobile — plan 04 F6).
// lib/constants RE-EXPORTA del paquete: los call sites (import desde '@/lib/constants') NO cambian.
// Mismo patrón que packages/schemas / packages/brand-kit. Cero lógica nueva acá — solo re-export.
export type {
    BillingCycle,
    SubscriptionTier,
    SaleTier,
    TierConfig,
    TierCapabilities,
} from '@eva/tiers'
// SubscriptionStatus / PaymentProvider viven en domain (no son del catálogo de tiers).
export type { PaymentProvider, SubscriptionStatus } from '@/domain/coach/types'

export {
    SALE_TIERS,
    LEGACY_TIERS,
    isSaleTier,
    TIER_STUDENT_RANGE_LABEL,
    TIER_LABELS,
    TIER_CONFIG,
    getTierPriceClp,
    getTierMaxClients,
    getTierCapabilities,
    BILLING_CYCLE_CONFIG,
    TIER_ALLOWED_BILLING_CYCLES,
    getTierAllowedBillingCycles,
    isBillingCycleAllowedForTier,
    getDefaultBillingCycleForTier,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getRecommendedTier,
    getTierRank,
    comparePlanDirection,
} from '@eva/tiers'


// Note: 'canceled' is NOT in this list. A canceled coach still has access until
// current_period_end. The gate in coach-subscription-gate.ts handles that date check.
// 'org_managed' is NOT in this list — org coaches always have access (plan managed by org).
export const SUBSCRIPTION_BLOCKED_STATUSES = [
    'pending_payment',
    'expired',
    'past_due',
    'paused',
] as const

// ── Módulos add-on: compra self-service (plan estrategia 03 / D4) ────────────
// Interruptor de feature para la compra self-service de módulos add-on. Mientras
// esté en `false`, el catálogo (Settings > Módulos) muestra el CTA interino
// (mailto contacto@eva-app.cl) en vez de un link a /coach/subscription#modulos —
// esa sección la construye el plan 05, que prende esta constante y activa el link.
// Una sola constante evita un deploy coordinado entre planes (D4).
//
// ⚠️ DEJAR EN false. Prenderla es el SWITCH DE LANZAMIENTO de los add-ons
// self-service (plan 05): la UI y los endpoints se construyen detrás de esta
// lógica, pero el lanzamiento es MANUAL y solo ocurre POST-gate + sandbox MP
// verde + hardening RLS del plan 03 confirmado en prod (doc fuente §2.2).
export const SELF_SERVICE_ADDONS_ENABLED = true // ⚠️ PREVIEW-ONLY (rama preview/addons-test, QA de pago real). NO mergear a master — en master DEBE quedar false hasta el flip de lanzamiento.

// ── Add-ons: catálogo de precios + reglas de pago (plan estrategia 05, F0) ────
// MODULE_KEYS / ModuleKey vienen de entitlements.service (import al tope del módulo,
// junto al resto de re-exports) — mismo patrón que admin/_components/module-labels.ts.
export type AddonConfigEntry = {
    /** Precio MENSUAL de lista, CLP. UNIFORME para los 4 módulos (decisión dueño, 2026-06-11). */
    priceClpMensual: number
    /** Etiqueta corta del módulo (catálogo / desglose). */
    label: string
    /** Descripción comercial breve (catálogo / modal de alta). Cero mención de IVA (D5 del dueño). */
    description: string
}

/**
 * ADDON_CONFIG — precio mensual de lista + label + descripción por `ModuleKey`.
 *
 * Decisión del dueño (2026-06-11, NO re-litigar): **$9.990/mes UNIFORME** para los
 * 4 módulos (la propuesta diferenciada del doc fuente §2.8 queda descartada — D3 del
 * dueño). El monto por ciclo se deriva con los MISMOS descuentos del plan
 * (trimestral −10%, anual −20%, `BILLING_CYCLE_CONFIG`) vía `getAddonCycleAmountClp`
 * en `services/billing/addons.service.ts` (F2) — acá solo vive el mensual congelable.
 *
 * CERO mención de IVA en estos textos (decisión D5 del dueño: silencio total sobre
 * IVA hasta que se constituya EVAapp SpA — tarea de revisión del copy en MANUAL_TASKS).
 *
 * Fuente única que consumen: catálogo Settings > Módulos (plan 03), sección Add-ons de
 * /coach/subscription (plan 05 F5), pricing page (plan 02) y mobile.
 */
export const ADDON_MONTHLY_PRICE_CLP = 9990 as const

export const ADDON_CONFIG: Record<ModuleKey, AddonConfigEntry> = {
    cardio: {
        priceClpMensual: ADDON_MONTHLY_PRICE_CLP,
        label: 'Cardio',
        description:
            'Prescribe y hace seguimiento de trabajo cardiovascular: zonas, duración e intensidad, integrado al plan del alumno.',
    },
    movement_assessment: {
        priceClpMensual: ADDON_MONTHLY_PRICE_CLP,
        label: 'Evaluación de movimiento',
        description:
            'Screening de movilidad y patrones de movimiento para personalizar la prescripción y detectar limitaciones.',
    },
    body_composition: {
        priceClpMensual: ADDON_MONTHLY_PRICE_CLP,
        label: 'Composición corporal',
        description:
            'Antropometría y composición corporal (protocolo ISAK completo): medidas, pliegues y seguimiento de progreso.',
    },
    nutrition_exchanges: {
        priceClpMensual: ADDON_MONTHLY_PRICE_CLP,
        label: 'Nutrición por intercambios',
        description:
            'Pautas de nutrición por porciones de intercambio (método chileno) con equivalencias y PDF con tu marca. Requiere un plan con nutrición (Pro o superior).',
    },
}

/** Lista de módulos disponibles como add-on (espejo de MODULE_KEYS, para iterar el catálogo). */
export const ADDON_MODULE_KEYS = MODULE_KEYS

/**
 * ADDON_PAYMENT_RULES — las 5 reglas de pago (doc fuente §2.3) como TEXTO versionado.
 *
 * Es la evidencia de consentimiento informado que exige la normativa chilena de
 * renovación automática (Ley 19.496 / SERNAC): condiciones de cobro, renovación y
 * término informadas ANTES de contratar, sin letra chica. Se muestran textuales en:
 *   - el modal de confirmación de alta,
 *   - la sección Add-ons de /coach/subscription,
 *   - el paso de add-ons del signup,
 *   - (vía plan 02) la página de precios.
 * El checkbox de aceptación persiste `terms_version` + `terms_accepted_at`, y el
 * evento de alta guarda el TEXTO ÍNTEGRO de la variante aceptada (plan 05 F3.4).
 *
 * Reglas 1-3 conservan variantes por ciclo (decisión final del dueño, 2026-06-12): TODOS
 * los ciclos —mensual incluido— cobran de inmediato un pago único prorrateado por la
 * fracción restante del ciclo actual (alineado al corte) y desde la siguiente renovación
 * suman el valor completo del módulo al cobro habitual; el compromiso mínimo queda
 * cubierto por ese cobro inicial. El texto mensual usa fraseo "mes/mensual" y el de
 * trimestral/anual "ciclo", pero ambos describen el MISMO modelo de cobro inmediato
 * prorrateado. Las variantes viven bajo la MISMA versión (`terms_version`); la UI
 * muestra la que corresponde al ciclo del coach.
 *
 * CERO mención de IVA (decisión D5 del dueño). Español latam neutro.
 */
export type AddonPaymentRule = {
    /** Número de regla (1-5), estable a través de versiones. */
    number: 1 | 2 | 3 | 4 | 5
    /** Título corto de la regla. */
    title: string
    /** Texto visible para ciclo mensual. */
    monthly: string
    /**
     * Texto visible para ciclo trimestral/anual. `null` cuando la regla no bifurca
     * (el texto mensual aplica igual) — la UI usa `monthly` como fallback.
     */
    quarterlyAnnual: string | null
}

export const ADDON_PAYMENT_RULES: {
    version: string
    rules: readonly AddonPaymentRule[]
} = {
    version: 'v2-2026-06',
    rules: [
        {
            number: 1,
            title: 'Activación inmediata',
            monthly:
                'El módulo se activa apenas se aprueba el pago inicial prorrateado. Queda disponible en tu cuenta una vez confirmado ese pago.',
            quarterlyAnnual:
                'El módulo se activa apenas se aprueba el pago inicial prorrateado. Queda disponible en tu cuenta una vez confirmado ese pago.',
        },
        {
            number: 2,
            title: 'Cobro y prorrateo',
            monthly:
                'Al activar el módulo se cobra de inmediato un pago único por la fracción que resta del mes actual (proporcional a los días restantes). Desde tu próxima renovación mensual, el valor completo del módulo se suma a tu cobro habitual.',
            quarterlyAnnual:
                'Al activar el módulo se cobra de inmediato un pago único por la fracción que resta de tu ciclo actual (proporcional a los días restantes, con el mismo descuento de tu ciclo). Desde la siguiente renovación, el valor del módulo se suma a tu cobro habitual.',
        },
        {
            number: 3,
            title: 'Compromiso mínimo de 1 ciclo',
            monthly:
                'El compromiso mínimo de un ciclo queda cubierto por el pago inicial prorrateado que ya realizaste al activar el módulo.',
            quarterlyAnnual:
                'El compromiso mínimo de un ciclo queda cubierto por el pago inicial prorrateado que ya realizaste al activar el módulo.',
        },
        {
            number: 4,
            title: 'Cancelación sin reembolso de fracciones',
            monthly:
                'Puedes cancelar el módulo cuando quieras. La cancelación se hace efectiva al final del período que ya pagaste: conservas el acceso hasta esa fecha y no hay reembolsos por fracciones no usadas.',
            quarterlyAnnual:
                'Puedes cancelar el módulo cuando quieras. La cancelación se hace efectiva al final del ciclo que ya pagaste: conservas el acceso hasta esa fecha y no hay reembolsos por fracciones no usadas.',
        },
        {
            number: 5,
            title: 'Precios de lista',
            monthly:
                'Estas condiciones aplican a los precios de lista. Los acuerdos comerciales a medida (contratos de equipo) se rigen por su propio contrato.',
            quarterlyAnnual: null,
        },
    ],
} as const

/** Devuelve el texto de cada regla según el ciclo del coach (mensual vs trimestral/anual). */
export function getAddonPaymentRulesForCycle(
    cycle: BillingCycle
): { version: string; rules: { number: number; title: string; text: string }[] } {
    const isMonthly = cycle === 'monthly'
    return {
        version: ADDON_PAYMENT_RULES.version,
        rules: ADDON_PAYMENT_RULES.rules.map((r) => ({
            number: r.number,
            title: r.title,
            text: isMonthly ? r.monthly : r.quarterlyAnnual ?? r.monthly,
        })),
    }
}
