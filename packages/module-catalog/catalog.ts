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
    },
    body_composition: {
        label: 'Composición corporal',
        pitch:
            'Antropometría ISAK de 5 componentes y bioimpedancia en un mismo historial: mediciones comparables en el tiempo, sin planillas.',
        surfaces: [
            'Sección Composición corporal en la ficha del alumno (pestañas BIA / ISAK)',
        ],
    },
    nutrition_exchanges: {
        label: 'Nutrición por intercambios',
        pitch:
            'Pautas por porciones e intercambios — el método de los nutricionistas — dentro de tu plan nutricional, exportables a PDF con tu marca.',
        surfaces: [
            'Modo Intercambios dentro del plan nutricional',
            'PDF de pauta con tu marca',
        ],
    },
}

/** Lookup helper — devuelve la entrada del catálogo para una key. */
export function getModuleCatalogEntry(key: ModuleKey): ModuleCatalogEntry {
    return MODULE_CATALOG[key]
}
