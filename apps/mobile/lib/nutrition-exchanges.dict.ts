/**
 * Diccionario de strings del modo intercambios ("Nutrición Pro" / módulo
 * `nutrition_exchanges`) para mobile. E6-13: portado 1:1 del bloque
 * `nutrition.exchange.*` del i18n web (apps/web/src/lib/i18n/es.json) — misma copy
 * exacta que ve el coach en la web, para paridad de términos.
 *
 * Mobile es español hardcodeado (sin i18n runtime salvo movement), así que estas
 * claves viven como constante compartible. Los CÓDIGOS de grupo ('C','P','LAC'...)
 * son término de dominio y NUNCA se traducen (ver ExchangeChips del alumno).
 *
 * Compartible con `components/alumno/nutrition/*` (E4): los términos "Porciones",
 * "Gramos", "Variante", "Equivalencias" deben ser idénticos en ambos lados.
 */
export const EXCHANGE_STRINGS = {
  modeTitle: 'Modo de prescripción',
  modeTooltip:
    'Gramos: alimentos con cantidades exactas. Porciones: asigna porciones de intercambio por grupo a cada comida (método chileno); el alumno elige equivalencias.',
  modeGrams: 'Gramos',
  modePortions: 'Porciones',
  savePlanFirst: 'Guarda el plan primero para activar el modo porciones y asignar grupos.',
  portionsPerGroup: 'Porciones por grupo',
  provisionalBadge: 'Macros referenciales',
  provisionalNotice:
    'Los macros por grupo son referenciales (en validación profesional). Los totales derivados son aproximados.',
  saving: 'Guardando…',
  saved: 'Guardado',
  saveError: 'Error al guardar',
  decrease: 'Quitar porción de',
  increase: 'Agregar porción de',
  noPortions: 'Sin porciones asignadas',
  derivedVsGoal: 'Derivado vs objetivo',
  wholeDay: 'Día completo',
  dayVariant: 'Variante',
  allVariants: 'Todas',
  dayVariants: 'Variantes de día',
  deleteVariant: 'Eliminar variante',
  variantPlaceholder: 'Nueva variante (ej: Entreno tarde)',
  addVariant: 'Agregar',
  pdfTitle: 'PDF de la pauta',
  pdfTooltip: 'Descarga la pauta con tu marca, lista para enviar por WhatsApp.',
  pdfCompact: 'Compacto',
  pdfEquivalences: 'Con equivalencias',
  pdfGenerating: 'Generando…',
  pdfDownload: 'Descargar PDF',
  pdfBrandPreview: 'Se genera con la marca de:',
  close: 'Cerrar',
  onePortion: '1 porción',
  searchFood: 'Buscar alimento…',
  noEquivalences: 'Este grupo aún no tiene equivalencias cargadas.',
} as const

export type ExchangeStringKey = keyof typeof EXCHANGE_STRINGS
