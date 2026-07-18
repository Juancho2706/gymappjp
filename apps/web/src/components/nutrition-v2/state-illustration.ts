/**
 * Mapeo puro estado-vacío → ilustración (Tanda 10 · assets del CEO).
 *
 * Los assets viven en `apps/web/public/illustrations/<key>.webp` (+ `@2x` retina).
 * Este módulo es 100% puro (sin React, sin DOM) para poder testear el mapeo aislado
 * y para reusarlo desde cualquier superficie V2 (coach / alumno) que tenga un
 * estado en runtime (ej. el scanner, cuyo `status` es un enum).
 */

/** Nombres base de archivo en `/illustrations/` (los 8 estados vacíos). */
export const NUTRITION_ILLUSTRATIONS = [
  'sin-plan',
  'dia-completado',
  'sin-conexion',
  'sin-resultados',
  'catalogo-vacio',
  'sin-alumnos',
  'historial-vacio',
  'error-amable',
] as const

export type NutritionIllustration = (typeof NUTRITION_ILLUSTRATIONS)[number]

/**
 * Estados semánticos de las superficies V2. Cada uno cae en exactamente una
 * ilustración. Nombrados por intención (no por archivo) para que los call-sites
 * lean como negocio y el mapeo quede centralizado y testeable.
 */
export type NutritionEmptyState =
  | 'no-plan' // alumno sin plan V2 publicado / coach sin plan vigente
  | 'day-complete' // día registrado / cerrado, nada por hacer
  | 'offline' // sin conexión / error de red al sincronizar
  | 'no-results' // búsqueda sin coincidencias (catálogo o roster filtrado)
  | 'empty-catalog' // catálogo o cola de curación sin ítems
  | 'no-clients' // roster sin alumnos en el scope activo
  | 'empty-history' // historial de días vacío
  | 'error' // error genérico / código inválido

const STATE_TO_ILLUSTRATION: Record<NutritionEmptyState, NutritionIllustration> = {
  'no-plan': 'sin-plan',
  'day-complete': 'dia-completado',
  offline: 'sin-conexion',
  'no-results': 'sin-resultados',
  'empty-catalog': 'catalogo-vacio',
  'no-clients': 'sin-alumnos',
  'empty-history': 'historial-vacio',
  error: 'error-amable',
}

/** Resuelve el estado semántico a su ilustración. Puro y total (todos los casos cubiertos). */
export function resolveNutritionIllustration(state: NutritionEmptyState): NutritionIllustration {
  return STATE_TO_ILLUSTRATION[state]
}

export interface NutritionIllustrationSource {
  /** Ruta 1x para `src`. */
  src: string
  /** `srcSet` con la variante @2x para retina (estático, sin Image Transformations). */
  srcSet: string
}

const ILLUSTRATION_BASE = '/illustrations'

/** Construye las rutas estáticas (1x + @2x) de una ilustración. Puro. */
export function nutritionIllustrationSource(
  illustration: NutritionIllustration,
): NutritionIllustrationSource {
  const src = `${ILLUSTRATION_BASE}/${illustration}.webp`
  const src2x = `${ILLUSTRATION_BASE}/${illustration}@2x.webp`
  return { src, srcSet: `${src} 1x, ${src2x} 2x` }
}
