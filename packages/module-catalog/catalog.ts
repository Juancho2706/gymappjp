/**
 * @eva/module-catalog — copy canónico (label + pitch + superficies) de los 4 módulos
 * de pago de EVA, indexado por ModuleKey.
 *
 * Paquete PURO TypeScript: CERO Next.js / Supabase / React / RN. Por eso la MISMA copy
 * corre en web (Settings > Módulos, catálogo read-only) y en la app RN futura — mata el
 * drift de tener los strings duplicados a mano (ver plan estrategia 03, F1.2 / D3).
 *
 * Estrategia i18n (D3): la copy base vive acá en español latam neutro indexada por
 * ModuleKey. Las traducciones futuras se agregan como mapas de locale paralelos con las
 * MISMAS keys (p. ej. `CATALOG_EN: Record<ModuleKey, ModuleCatalogEntry>`), sin tocar a
 * los consumidores (web `ModulesForm`, RN). NO publica precios: solo describe valor y
 * dónde viven las utilidades (los precios llegan recién con el plan 05, post-cierre Movida).
 *
 * Fuente de verdad de las keys: `MODULE_KEYS` en
 * apps/web/src/services/entitlements.service.ts. Este paquete es puro y no puede importar
 * de la app; el test `catalog.test.ts` cruza las keys de este catálogo contra `MODULE_KEYS`
 * y falla si divergen (ni una más, ni una menos).
 */

/** Las 4 keys de módulos de pago. Debe coincidir EXACTAMENTE con MODULE_KEYS (verificado en test). */
export const MODULE_CATALOG_KEYS = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export type ModuleKey = (typeof MODULE_CATALOG_KEYS)[number]

export interface ModuleCatalogEntry {
    /** Nombre comercial del módulo (latam neutro). */
    label: string
    /** 2-3 frases comerciales-honestas: qué hace, sin letra chica ni hostigamiento. */
    pitch: string
    /** Dónde viven sus utilidades cuando el módulo está activo. */
    surfaces: string[]
    /**
     * Precio mensual de lista LEGACY en CLP (era del self-service de add-ons).
     * Decisión CEO 2026-07-17: los módulos vienen INCLUIDOS en los planes pagos y la UI ya
     * NO renderiza este precio en ninguna superficie. El campo se conserva solo para el riel
     * de billing histórico (`coach_addons.price_clp` congelado por compra) y el admin.
     */
    priceClp: number
}

/** Copy base — español latam neutro. Indexado por ModuleKey (D3 i18n: locales paralelos por key). */
export const MODULE_CATALOG: Record<ModuleKey, ModuleCatalogEntry> = {
    cardio: {
        label: 'Cardio / Resistencia',
        pitch:
            'Prescribe cardio como prescribes fuerza: bloques por tiempo, ritmo o distancia con zonas de frecuencia cardíaca. ' +
            'Tu alumno lo ejecuta con timers guiados y tú ves el cumplimiento real.',
        surfaces: [
            'Ítem Cardio en el menú',
            'Bloques de cardio en el builder',
            'Timers y registro de cardio en la app del alumno',
        ],
        priceClp: 9990,
    },
    movement_assessment: {
        label: 'Evaluación de movimiento',
        pitch:
            'Screening de ingreso con 7 patrones de movimiento y reporte semáforo para priorizar el trabajo de cada alumno y mostrar su evolución. ' +
            'El diferenciador kine de tu servicio.',
        surfaces: [
            'Ítem Movimiento en el menú (wizard 7 patrones + reporte semáforo)',
            'Card de última evaluación en la ficha del alumno',
            'Pestaña de resultados en la app del alumno',
        ],
        priceClp: 9990,
    },
    body_composition: {
        label: 'Composición corporal',
        pitch:
            'Antropometría ISAK de 5 componentes y bioimpedancia en un mismo historial: mediciones comparables en el tiempo, sin planillas.',
        surfaces: [
            'Sección Composición corporal en la ficha del alumno (pestañas BIA / ISAK)',
        ],
        priceClp: 9990,
    },
    nutrition_exchanges: {
        label: 'Nutrición Pro',
        pitch:
            'El plan de nutrición a nivel profesional: desde pautas por porciones e intercambios (el método de los nutricionistas) hasta planes híbridos que combinan franjas guiadas con libertad de registro. ' +
            'Suma variantes de día, micronutrientes avanzados, objetivos finos por alumno y notas clínicas privadas y de protocolo que solo ves tú.',
        surfaces: [
            'Estrategias avanzadas del plan (intercambios y plan híbrido)',
            'Variantes de día en un mismo plan',
            'Micronutrientes avanzados en la ficha del alumno',
            'Notas clínicas privadas y de protocolo',
            'Histórico completo de nutrición del alumno',
        ],
        priceClp: 9990,
    },
}

/** Lookup helper — devuelve la entrada del catálogo para una key. */
export function getModuleCatalogEntry(key: ModuleKey): ModuleCatalogEntry {
    return MODULE_CATALOG[key]
}
