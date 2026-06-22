/**
 * modules-catalog (mobile) — espejo inline de @eva/module-catalog (paquete puro TS que NO
 * está en las deps de apps/mobile). Mantiene la MISMA copy canónica (label + pitch +
 * superficies) de los 4 módulos de pago de EVA, indexada por ModuleKey. Si cambia el
 * catálogo web (packages/module-catalog/catalog.ts), reflejar acá a mano.
 *
 * Keys: deben coincidir con MODULE_KEYS de lib/entitlements.ts (las 4 keys de pago).
 */

import { MODULE_KEYS, type ModuleKey } from './entitlements'

export interface ModuleCatalogEntry {
  /** Nombre comercial del módulo (latam neutro). */
  label: string
  /** 2-3 frases comerciales-honestas: qué hace, sin letra chica ni hostigamiento. */
  pitch: string
  /** Dónde viven sus utilidades cuando el módulo está activo. */
  surfaces: string[]
}

/** Orden canónico de display (espejo de MODULE_CATALOG_KEYS). */
export const MODULE_CATALOG_KEYS = MODULE_KEYS

/** Copy base — español latam neutro. Indexado por ModuleKey. */
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
    label: 'Nutrición Pro',
    pitch:
      'El plan de nutrición a nivel profesional: pautas por porciones e intercambios (el método de los nutricionistas), plantillas reutilizables, micronutrientes avanzados y objetivos por composición corporal. ' +
      'Todo exportable a PDF con tu marca.',
    surfaces: [
      'Modo Intercambios dentro del plan nutricional',
      'Plantillas de plan reutilizables',
      'Micronutrientes avanzados en el plan',
      'Objetivos por composición corporal',
      'PDF de pauta con tu marca',
    ],
  },
}

/**
 * Precio MENSUAL de lista de un add-on, CLP. UNIFORME para los 4 módulos (decisión dueño 2026-06-11,
 * NO re-litigar) — espejo de ADDON_MONTHLY_PRICE_CLP en apps/web/src/lib/constants.ts (ADDON_CONFIG).
 * Mobile NO arrastra @/lib/constants (acopla Next/Supabase); se inlinea el mismo número canónico.
 * Display informativo: la compra/baja sigue web-only.
 */
export const ADDON_MONTHLY_PRICE_CLP = 9990 as const

/**
 * ¿La key de add-on requiere un plan con nutrición (Pro+)? Solo `nutrition_exchanges` (D8 web).
 * Espejo del gate `requiresNutritionTier` de /coach/subscription: cuando es true y el tier del coach
 * NO soporta nutrición, el catálogo muestra "Requiere plan Pro+" en vez de "Disponible".
 */
export function addonRequiresNutritionTier(key: ModuleKey): boolean {
  return key === 'nutrition_exchanges'
}
