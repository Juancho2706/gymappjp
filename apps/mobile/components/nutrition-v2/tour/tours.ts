import { addActionIconSource, type AddActionIcon } from '../AddActionButton'
import { foodCategoryIconSource } from '../NutritionV2Kit'

/**
 * Guiones de la Guía Viva en RN (SPEC `nutrition-onboarding-tour`, D1 y D6).
 *
 * ⚠️ LOS COPYS ESTÁN CERRADOS y son LITERALES de la sección «Guiones» de la SPEC (los mismos que
 * `apps/web/src/components/nutrition-v2/tour/tours.ts`); cambiarlos es una decisión del dueño, no de
 * quien toca este archivo (D6: «Copy = beneficio, no instrucción»). Si un texto se ve mal en
 * pantalla, se arregla la tarjeta, no el texto.
 *
 * Diferencia con el archivo web, y es de ALCANCE, no de contenido: la web tiene tres guiones
 * (editor 8 en desktop, editor 6 en <768, hub 6) porque tiene dos anchos; el teléfono es SIEMPRE el
 * caso compacto, así que acá viven solo dos — editor 6 y hub 6. El guion de 8 pasos no se porta
 * porque ninguno de sus dos pasos extra (el rail de días y la paleta de 3 zonas) existe en RN:
 * enseñarlos sería enseñar una pantalla que el coach no tiene.
 *
 * Los `target` son los nombres con los que las superficies registran sus elementos en
 * `TourTargets.tsx` — el equivalente RN de los `data-tour` de web. Registrar un target no cambia
 * comportamiento ni estilos de lo que decora (solo agrega `collapsable={false}`, que en Android es
 * lo que impide que Yoga aplane la vista y la vuelva imposible de medir).
 */

/* ------------------------------------------------------------------------------------------------
 * Íconos
 * ---------------------------------------------------------------------------------------------- */

/**
 * Los íconos clay de las tarjetas salen de los DOS sets que YA están bundleados y aprobados por el
 * dueño: `assets/action-icons/` (la «Familia N», vía `AddActionButton`) y `assets/food-icons/` (las
 * categorías del catálogo, vía `NutritionV2Kit`). Cero assets nuevos, cero red.
 *
 * Se consumen por sus resolutores existentes y NO por `require` propio: Metro exige literales, así
 * que un `require` acá duplicaría la tabla de rutas y el día que un asset se renombre quedaría
 * arreglado en un solo lado. Mismo criterio que el `stack` de «Agregar alimento».
 *
 * El prefijo (`action:` / `food:`) existe porque los dos sets comparten la misma pinta: sin él, un
 * `porciones` suelto no diría de qué carpeta sale. Así el nombre inválido rompe en `tsc`.
 */
export const TOUR_FOOD_ICONS = [
  'bebida',
  'carbohidrato',
  'fruta',
  'grasa',
  'lacteo',
  'legumbre',
  'otro',
  'proteina',
  'snack',
  'verdura',
] as const

export type TourFoodIcon = (typeof TOUR_FOOD_ICONS)[number]

export type TourIcon = `action:${AddActionIcon}` | `food:${TourFoodIcon}`

/** `expo-image` acepta el número que devuelve `require`; es el mismo tipo que usa la Familia N. */
export function tourIconSource(icon: TourIcon): ReturnType<typeof require> {
  const separator = icon.indexOf(':')
  const kind = icon.slice(0, separator)
  const name = icon.slice(separator + 1)
  return kind === 'action'
    ? addActionIconSource(name as AddActionIcon)
    : foodCategoryIconSource(name as TourFoodIcon)
}

/* ------------------------------------------------------------------------------------------------
 * Contrato de un paso
 * ---------------------------------------------------------------------------------------------- */

export type TourStep = {
  /** Nombre del target registrado. Si no existe en pantalla, el paso pinta el velo liso (sin hueco). */
  readonly target: string
  readonly icon: TourIcon
  /** 3-5 palabras (D5). */
  readonly title: string
  /** Máximo 2 líneas en la tarjeta (D5). */
  readonly body: string
}

/** Las cuatro superficies comparten los guiones (D1); el id también es la llave del flag (D4). */
export type TourId = 'editor' | 'hub'

/* ------------------------------------------------------------------------------------------------
 * Editor — 6 pasos (el guion compacto de la SPEC: «mini-cinta → metas → franja+spark (tap) →
 * agregar/stack → porciones → publicar»)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Los MISMOS textos del guion de 8 de la SPEC, quedándose con los seis pasos que existen en el
 * teléfono. La ÚNICA letra que cambia en todo el archivo es «Pasa el cursor por la barrita» →
 * «Toca la barrita», que es la adaptación a tap que la SPEC autoriza explícitamente (en un teléfono
 * no hay cursor que pasar, y prometer un hover sería enseñar algo falso).
 *
 * El paso 4 hereda el copy de la paleta: en RN no hay paleta de 3 zonas, el catálogo se abre por la
 * pastilla de alta con el stack de categorías — pero lo que hay que enseñar es lo mismo: el catálogo
 * y su memoria.
 */
export const EDITOR_TOUR_STEPS_COMPACT: readonly TourStep[] = [
  {
    target: 'ribbon',
    icon: 'action:franja',
    title: 'Tu tablero de vuelo',
    body: 'Kcal y macros del día en vivo mientras editas. Verde en banda; ámbar si el día se pasa.',
  },
  {
    target: 'metas',
    icon: 'action:version',
    title: 'Metas sin salir del flujo',
    body: 'Kcal, P/C/G y fibra·sodio·agua del día activo — en un popover, la comida nunca se tapa.',
  },
  {
    target: 'slot',
    icon: 'action:franja',
    title: 'Franjas que se leen solas',
    body: 'Foto real + barrita P·C·G por alimento. ¿Gramos exactos? Toca la barrita.',
  },
  {
    target: 'agregar',
    icon: 'food:carbohidrato',
    title: 'Tu catálogo, con memoria',
    body: 'Miles de alimentos con foto y marca + los tuyos. “Sueles usar” aprende de ti; las cantidades se recuerdan solas.',
  },
  {
    target: 'porciones',
    icon: 'action:porciones',
    title: 'Porciones a elección',
    body: 'Grupos como “Verduras · 7,5”: el alumno elige QUÉ comer dentro de tu marco. Control sin microgestión.',
  },
  {
    target: 'publicar',
    icon: 'action:version',
    title: 'Publica y ya llegó',
    body: 'El alumno ve la versión nueva al instante. Lo que ya registró hoy, jamás se pisa.',
  },
]

/* ------------------------------------------------------------------------------------------------
 * Centro de Nutrición (hub) — 6 pasos
 * ---------------------------------------------------------------------------------------------- */

/**
 * ⚠️ DEUDA HEREDADA de G1.1 (misma nota que el archivo web, y a propósito: los dos guiones tienen
 * que decir LO MISMO): la SPEC cierra los TÍTULOS de los seis pasos del hub y remite los cuerpos al
 * artifact «Guía Viva EVA», que no está en el repo. Los `body` de abajo son copia literal de los que
 * G1.1 dejó en web — si el dueño los coteja contra el artifact y cambia uno, se cambia en los dos
 * archivos. Los títulos SÍ son literales de la SPEC y no se tocan.
 */
export const HUB_TOUR_STEPS: readonly TourStep[] = [
  // Cuerpos LITERALES del artifact «Guía Viva EVA» aprobado (cotejo del jefe 2026-08-17),
  // espejo exacto del guion web — la deuda de copy del hub quedó saldada.
  {
    target: 'tabs',
    icon: 'action:plantilla',
    title: 'Cuatro pestañas, todo tu mundo',
    body: 'Alumnos con su estado · Plantillas reutilizables · tu catálogo de Alimentos · y Curación para pulirlo.',
  },
  {
    target: 'stats',
    icon: 'action:version',
    title: 'La foto en 3 números',
    body: 'Cuántos tienen plan, quién no tiene, y quiénes registraron hoy. Tu semáforo de cartera.',
  },
  {
    target: 'filters',
    icon: 'action:franja',
    title: 'Filtros de atención',
    body: '«Por atender» y «Sin registrar 3+ días» ordenan tu día: primero quien más te necesita.',
  },
  {
    target: 'alumno-row',
    icon: 'action:dia',
    title: 'La semana de un vistazo',
    body: 'Siete puntos = siete días: verde registró en meta, ámbar registró lejos, gris nada. Sin preguntar por WhatsApp.',
  },
  {
    target: 'nueva-version',
    icon: 'action:libre',
    title: 'Nueva versión en 2 toques',
    body: 'Itera el plan sin partir de cero: se abre el editor sobre el plan vigente.',
  },
  {
    target: 'help',
    icon: 'food:fruta',
    title: '¿Y este «?»',
    body: 'Este mismo botoncito vive aquí siempre: cualquier día que lo necesites, la guía vuelve. Nunca sola, nunca encima.',
  },
]

/* ------------------------------------------------------------------------------------------------
 * Selector
 * ---------------------------------------------------------------------------------------------- */

/**
 * El guion que corresponde a una superficie. En RN no hay parámetro `compact` (ver la nota de
 * arriba: el teléfono es siempre el caso compacto), así que la firma es más corta que la de web a
 * propósito — un `compact` que solo pudiera valer `true` sería una mentira en el tipo.
 */
export function tourSteps(tourId: TourId): readonly TourStep[] {
  return tourId === 'hub' ? HUB_TOUR_STEPS : EDITOR_TOUR_STEPS_COMPACT
}
