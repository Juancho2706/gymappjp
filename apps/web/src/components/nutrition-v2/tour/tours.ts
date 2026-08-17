import { addActionIconSrc, type AddActionIcon } from '../AddActionButton'

/**
 * Guiones de la Guía Viva (SPEC `nutrition-onboarding-tour`, D1 y D6).
 *
 * ⚠️ LOS COPYS ESTÁN CERRADOS. Los textos del editor (8 pasos desktop, 6 en móvil) son LITERALES
 * de la sección «Guiones» de la SPEC; cambiarlos es una decisión del dueño, no de quien toca este
 * archivo (D6: «Copy = beneficio, no instrucción»). Si un texto se ve mal en pantalla, se arregla la
 * tarjeta, no el texto.
 *
 * Los `target` son valores de `data-tour="…"` que las superficies reales ponen sobre elementos que
 * YA existen (SPEC, «Alcance»): un `data-tour` no cambia comportamiento ni estilos de lo que decora.
 */

/* ------------------------------------------------------------------------------------------------
 * Íconos
 * ---------------------------------------------------------------------------------------------- */

/**
 * Los íconos clay de las tarjetas salen de los DOS sets que ya están bundleados y aprobados por el
 * dueño: `public/action-icons/` (la «Familia N») y `public/food-icons/` (las categorías del picker).
 * Cero assets nuevos.
 *
 * El prefijo (`action:` / `food:`) existe porque los dos sets viven en carpetas distintas y comparten
 * la misma pinta: sin él, un `porciones` suelto no dice de qué carpeta sale y el 404 aparecería recién
 * en pantalla. Así el nombre inválido rompe en `tsc`.
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

export function tourIconSrc(icon: TourIcon): string {
  const [kind, name] = icon.split(':')
  return kind === 'action'
    ? addActionIconSrc(name as AddActionIcon)
    : `/food-icons/${name as TourFoodIcon}.webp`
}

/* ------------------------------------------------------------------------------------------------
 * Contrato de un paso
 * ---------------------------------------------------------------------------------------------- */

export type TourStep = {
  /** Valor de `data-tour` del elemento a iluminar. Si no existe en pantalla, el paso va al centro. */
  readonly target: string
  readonly icon: TourIcon
  /** 3-5 palabras (D5). */
  readonly title: string
  /** Máximo 2 líneas en la tarjeta (D5). */
  readonly body: string
}

/** Las cuatro superficies comparten tres guiones (D1); el id también es la llave del flag (D4). */
export type TourId = 'editor' | 'hub'

/* ------------------------------------------------------------------------------------------------
 * Editor — 8 pasos (desktop web ≥768)
 * ---------------------------------------------------------------------------------------------- */

export const EDITOR_TOUR_STEPS: readonly TourStep[] = [
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
    target: 'rail',
    icon: 'action:dia',
    title: 'Días del plan',
    body: 'Un BASE que aplica siempre + días propios (sábado libre, carga). El punto ámbar te avisa qué día quedó a medias.',
  },
  {
    target: 'slot',
    icon: 'action:franja',
    title: 'Franjas que se leen solas',
    body: 'Foto real + barrita P·C·G por alimento. ¿Gramos exactos? Pasa el cursor por la barrita.',
  },
  {
    target: 'item-menu',
    icon: 'food:proteina',
    title: 'El ⋮ guarda los superpoderes',
    body: 'Reemplazos autorizados ⇄, corrección de macros, mover de franja y quitar — todo por alimento.',
  },
  {
    target: 'porciones',
    icon: 'action:porciones',
    title: 'Porciones a elección',
    body: 'Grupos como “Verduras · 7,5”: el alumno elige QUÉ comer dentro de tu marco. Control sin microgestión.',
  },
  {
    target: 'paleta',
    icon: 'food:carbohidrato',
    title: 'Tu catálogo, con memoria',
    body: 'Miles de alimentos con foto y marca + los tuyos. “Sueles usar” aprende de ti; las cantidades se recuerdan solas.',
  },
  {
    target: 'publicar',
    icon: 'action:version',
    title: 'Publica y ya llegó',
    body: 'El alumno ve la versión nueva al instante. Lo que ya registró hoy, jamás se pisa.',
  },
]

/* ------------------------------------------------------------------------------------------------
 * Editor — 6 pasos (web <768 y RN)
 * ---------------------------------------------------------------------------------------------- */

/**
 * SPEC: «mini-cinta → metas → franja+spark (tap) → agregar/stack → porciones → publicar (mismos
 * copys del artifact aprobado, ajustados a tap en el paso del spark)».
 *
 * O sea: los MISMOS textos del guion de 8, quedándose con los seis pasos que existen en móvil. La
 * única letra que cambia en todo el archivo es «Pasa el cursor por la barrita» → «Toca la barrita»,
 * que es la adaptación a tap que la SPEC autoriza explícitamente (en un teléfono no hay cursor que
 * pasar, y prometer un hover sería enseñar algo falso).
 *
 * El paso 4 hereda el copy de la paleta: en móvil no hay paleta de 3 zonas, el catálogo se abre por
 * el botón de alta con stack de categorías, pero lo que hay que enseñar es lo mismo — el catálogo y
 * su memoria.
 */
export const EDITOR_TOUR_STEPS_COMPACT: readonly TourStep[] = [
  EDITOR_TOUR_STEPS[0],
  EDITOR_TOUR_STEPS[1],
  {
    ...EDITOR_TOUR_STEPS[3],
    body: 'Foto real + barrita P·C·G por alimento. ¿Gramos exactos? Toca la barrita.',
  },
  { ...EDITOR_TOUR_STEPS[6], target: 'agregar' },
  EDITOR_TOUR_STEPS[5],
  EDITOR_TOUR_STEPS[7],
]

/* ------------------------------------------------------------------------------------------------
 * Centro de Nutrición (hub) — 6 pasos, web y RN
 * ---------------------------------------------------------------------------------------------- */

/**
 * Cuerpos LITERALES del artifact «Guía Viva EVA» aprobado por el dueño (cotejo del jefe,
 * 2026-08-17) — la deuda declarada por G1.1 quedó saldada; este bloque está tan cerrado como el
 * del editor. Nótese que el paso 1 nombra las pestañas reales (incluida Curación).
 *
 * Los íconos del hub no están fijados por la SPEC; se eligieron del set bundleado por lo que
 * cada uno muestra: la tablilla con la lista para el índice de secciones, el documento con barras
 * para los números, el plato con reloj para lo que está atrasado, el calendario para la semana y el
 * plato con destello para lo nuevo.
 */
export const HUB_TOUR_STEPS: readonly TourStep[] = [
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
 * El guion que corresponde a una superficie. `compact` = ancho <768 (web) o RN; solo el editor
 * cambia de largo — el hub es el mismo en las cuatro superficies (D1).
 */
export function tourSteps(tourId: TourId, compact: boolean): readonly TourStep[] {
  if (tourId === 'hub') return HUB_TOUR_STEPS
  return compact ? EDITOR_TOUR_STEPS_COMPACT : EDITOR_TOUR_STEPS
}
