/**
 * Microcopy canonico de la capa de porciones (intercambios) V2 — tabla exacta de
 * specs/nutrition-portions/SPEC.md §UX-d. Espanol latam neutro (con tildes). El alumno
 * NUNCA ve jerga interna ("target", "snapshot", "intake"). RN espeja esta misma tabla en
 * `apps/mobile/lib/nutrition-portions-copy.ts`.
 *
 * Cantidades de porciones SIEMPRE pre-formateadas por `formatPortions` de
 * `@eva/nutrition-engine` (coma decimal es-CL: "1,5"; singular/plural: "1 porción" /
 * "2 porciones") — estas funciones reciben el string ya formateado, nunca el number.
 */

export const PORTIONS_COPY = {
  builder: {
    sectionTitle: 'Porciones a elección',
    sectionHint: 'El alumno elige qué comer dentro de cada grupo.',
    addGroup: 'Agregar grupo',
    groupUsed: 'Ya está en esta comida',
    referentialBadge: 'Valores referenciales',
    /** kcal/p/c/g ya redondeados para display (enteros). */
    deriveCard: (kcal: string, p: string, c: string, g: string) =>
      `Tus porciones suman ~${kcal} kcal · ${p} P · ${c} C · ${g} G`,
    deriveCta: 'Usar como objetivos',
    unconfirmedBanner: 'Algunos grupos tienen macros referenciales. Los totales son aproximados.',
    /** Fix QA F1-2: nota bajo el subtotal de franja cuando incluye porciones. kcal ya redondeada (entero). */
    subtotalPortionsNote: (kcal: string) => `Incluye ~${kcal} kcal de porciones a elección`,
    /** Toast al quitar un grupo en el quick-edit (web toast / snackbar RN) — con Deshacer. */
    groupRemoved: (grupo: string) => `Grupo ${grupo} eliminado`,
    /** Estados del picker de grupos (web builder; el RN usa el dict del plan, sin red). */
    pickerLoading: 'Cargando grupos…',
    pickerError: 'No pudimos cargar los grupos.',
    pickerRetry: 'Reintentar',
    /** Labels a11y del stepper 0,5 y de la nota del target (quick-edit RN). */
    stepDownAria: (grupo: string) => `Restar media porción de ${grupo}`,
    stepUpAria: (grupo: string) => `Sumar media porción de ${grupo}`,
    noteFor: (grupo: string) => `Nota para ${grupo}`,
    notePlaceholder: 'Nota (opcional)',
  },
  student: {
    coverageTitle: 'Porciones de hoy',
    slotHint: 'Marca cada porción cuando la comas',
    /** n/N pre-formateados ("2", "1,5"). */
    chipAria: (grupo: string, n: string, total: string) =>
      `Marcar 1 porción de ${grupo}. Llevas ${n} de ${total}.`,
    halfChipAria: (grupo: string, n: string, total: string) =>
      `Marcar media porción de ${grupo}. Llevas ${n} de ${total}.`,
    marked: 'Porción marcada',
    markedHalf: 'Media porción marcada',
    undo: 'Deshacer',
    extraConfirm: (grupo: string) => `Ya completaste ${grupo}. ¿Marcar una porción extra?`,
    /** Botones del confirm de exceso (unificados web/RN — H3). */
    extraConfirmYes: 'Marcar extra',
    extraCancel: 'Cancelar',
    extraCancelAria: 'Cancelar porción extra',
    extraBadge: (n: string) => `+${n}`,
    equivalences: 'Equivalencias',
    sheetTitle: (grupo: string) => `Equivalencias de ${grupo}`,
    sheetSubtitle: '1 porción equivale a:',
    sheetMark: 'Marcar 1 porción',
    sheetRegister: 'Registrar alimento',
    /** Sheet de equivalencias: buscador + estados vacios (unificados web/RN — H3). */
    sheetSearchAria: 'Buscar alimento equivalente',
    sheetSearchPlaceholder: 'Buscar alimento',
    sheetNoResults: 'Sin resultados para tu búsqueda.',
    sheetEmpty:
      'Aún no hay alimentos clasificados en este grupo. Igual puedes marcar tu porción o registrar lo que comiste.',
    close: 'Cerrar',
    saving: 'Guardando…',
    undoFailed: 'No se pudo deshacer la porción.',
    undoFailedOffline: 'No se pudo deshacer la porción. Revisa tu conexión.',
    coveredBy: (alimento: string) => `Cubierta por ${alimento}`,
    /** n pre-formateado con `formatPortions` ("2 porciones"). */
    dupWarning: (n: string, grupo: string) =>
      `Ya marcaste ${n} de ${grupo} en esta comida. Si ahora registras ese alimento, deshaz la porción marcada para no contarla dos veces.`,
    offline: 'Sin conexión. Tus porciones se guardarán cuando vuelva la señal.',
    markFailed: 'No se pudo marcar la porción. Reintentar',
  },
  /**
   * Grupos PROPIOS del coach (porciones propias — specs/nutrition-custom-portions §P-A).
   * Vive en el mismo popover/sheet del picker. RN espeja esta tabla cuando llegue FD6a.
   */
  groupEditor: {
    createRow: 'Crear grupo nuevo',
    createTitle: 'Nuevo grupo de porciones',
    editTitle: 'Editar grupo',
    nameLabel: 'Nombre',
    namePlaceholder: 'Batido, Colación…',
    codeLabel: 'Código',
    codeHint: '1 a 3 letras. Es lo que ve el alumno en el círculo.',
    macrosLabel: 'Macros de 1 porción',
    proteinLabel: 'Proteínas (g)',
    carbsLabel: 'Carbohidratos (g)',
    fatsLabel: 'Grasas (g)',
    kcalLabel: 'Calorías',
    kcalHint: 'Se calculan solas (4/4/9). Puedes ajustarlas.',
    colorLabel: 'Color',
    colorOption: (n: number) => `Color ${n}`,
    referentialNotice: 'Tus grupos siempre quedan marcados como valores referenciales.',
    save: 'Guardar grupo',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    manageAria: (grupo: string) => `Opciones de ${grupo}`,
    edit: 'Editar',
    delete: 'Eliminar',
    deleteConfirmTitle: (grupo: string) => `¿Eliminar ${grupo}?`,
    deleteInUseNotice:
      'Los planes publicados conservan su versión congelada. Se quitará de las franjas que estés editando.',
    deleteConfirm: 'Eliminar grupo',
    nameRequired: 'Escribe un nombre para el grupo.',
    codeRequired: 'Escribe un código de 1 a 3 letras.',
    macrosRequired: 'Revisa las macros: deben ser números mayores o iguales a 0.',
    writeFailed: 'No pudimos guardar el grupo. Intenta nuevamente.',
  },
  /**
   * Bloque opcional "Equivalencia de porciones" del alta/edición de alimentos del coach
   * (clasificar alimentos propios — specs/nutrition-custom-portions §P-B). Vive colapsado:
   * la enorme mayoría de las altas no clasifica nada. RN espeja esta tabla en su ola.
   */
  foodEquivalence: {
    sectionTitle: 'Equivalencia de porciones',
    sectionHint: 'Opcional: permite que este alimento cuente en las porciones a elección del plan.',
    expand: 'Agregar equivalencia',
    collapse: 'Quitar equivalencia',
    groupLabel: 'Grupo de porciones',
    groupPlaceholder: 'Sin clasificar',
    gramsLabel: 'Gramos que equivalen a 1 porción',
    gramsPlaceholder: 'Ej: 120',
    labelLabel: 'Medida casera (opcional)',
    labelPlaceholder: 'Ej: 1 taza',
    /** grupo = nombre del grupo; gramos ya formateados. */
    preview: (grupo: string, gramos: string, medida: string | null) =>
      medida
        ? `1 porción de ${grupo} = ${gramos} g (${medida})`
        : `1 porción de ${grupo} = ${gramos} g`,
    groupsLoading: 'Cargando grupos…',
    groupsError: 'No pudimos cargar los grupos de porciones.',
    groupsEmpty: 'Todavía no hay grupos de porciones disponibles.',
    groupRequired: 'Elige el grupo de porciones al que equivale este alimento.',
    gramsRequired: 'Indica cuántos gramos equivalen a 1 porción.',
    groupUnavailable: 'Ese grupo de porciones ya no está disponible.',
    saved: 'Equivalencia guardada',
  },
  coach: {
    dayCoverage: 'Porciones',
    derivedNote:
      'La cobertura derivada de alimentos usa el catálogo vigente y puede ajustarse si un alimento se reclasifica.',
  },
} as const
