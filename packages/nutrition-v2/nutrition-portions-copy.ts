/**
 * Microcopy CANONICO de la capa de porciones (intercambios) V2 — tabla exacta de
 * specs/nutrition-portions/SPEC.md §UX-d y UNICA fuente para todas las superficies. Espanol latam
 * neutro (con tildes). El alumno NUNCA ve jerga interna ("target", "snapshot", "intake").
 *
 * Vivia duplicada en `apps/web/src/lib/nutrition-portions-copy.ts` y
 * `apps/mobile/lib/nutrition-portions-copy.ts`: dos copias de la misma tabla que ya habian
 * driftado (un hint que nombraba un punto de entrada inexistente en la otra superficie, un error
 * partido en dos claves de un lado y en una sola del otro). Ese drift es INVISIBLE en review
 * porque los archivos nunca se leen juntos, asi que la tabla se muda aca y cada app deja un
 * wrapper en su ruta vieja.
 *
 * Los wrappers por superficie solo pueden OVERRIDEAR claves con una divergencia de INTERACCION
 * documentada (otro punto de entrada, otro gesto, otro layout de boton). Jamas se agrega aca
 * texto que la tabla no refleje, ni se overridea "porque suena mejor": si el texto tiene que
 * cambiar, cambia aca y cambia para todos.
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
    /**
     * Equivalencias por grupo: cuantos alimentos vera el alumno en "1 porción equivale a".
     * El estado vacio se nombra en terminos del ALUMNO, no del sistema ("no verá ejemplos"),
     * y va acompañado de la accion, porque un grupo propio nace siempre en cero.
     */
    groupFoodCount: (n: number) => (n === 1 ? '1 alimento equivalente' : `${n} alimentos equivalentes`),
    groupFoodsEmpty: 'Sin alimentos: tu alumno no verá ejemplos',
    /** RN lo overridea en su wrapper (el punto de entrada nativo es la pantalla Porciones). */
    groupFoodsEmptyHint: 'Clasifica alimentos en este grupo desde Mis alimentos.',
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
    /** Solo la usa RN: el long-press no existe en web, donde el chip es un botón visible. */
    equivalencesHint: 'Mantén presionado para ver equivalencias.',
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
    /** RN lo overridea en su wrapper (allá el reintento es un botón separado: `retry`). */
    markFailed: 'No se pudo marcar la porción. Reintentar',
    /** Solo la usa RN: el snackbar nativo separa el mensaje de la acción de reintento. */
    retry: 'Reintentar',
  },
  /**
   * Grupos PROPIOS del coach (porciones propias — specs/nutrition-custom-portions §P-A).
   * Vive en el mismo popover/sheet del picker.
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
    /**
     * Los grupos del sistema no se editan (RLS los niega): se duplican. Es la salida al caso
     * real "el cereal aporta 15 g de carbos y yo trabajo con 20" sin tocar el grupo compartido
     * ni los planes publicados que lo usan.
     */
    duplicate: 'Duplicar y ajustar',
    duplicateAria: (grupo: string) => `Duplicar ${grupo} y ajustar sus valores`,
    duplicateSuffix: (grupo: string) => `${grupo} (ajustado)`,
    duplicateTitle: 'Duplicar grupo',
    /**
     * Los targets congelan `snapshot_ref_*` al publicar, pero la lista de alimentos se lee
     * viva: editar un grupo NO cambia los planes ya publicados y hasta ahora nada lo decia.
     */
    publishedFrozenNotice:
      'Los planes ya publicados mantienen los valores con los que se publicaron. Vuelve a publicar el plan del alumno para aplicarles el cambio.',
    duplicateHint:
      'Es una copia tuya: puedes cambiarle los valores sin afectar el grupo original ni a los planes que ya lo usan.',
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
   * la enorme mayoría de las altas no clasifica nada.
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
  /**
   * Lista de equivalencias del grupo (F2 — specs/nutrition-exchange-lists). Es la pantalla
   * donde el coach responde la pregunta que hacen los alumnos: "¿qué cuenta como 1 porción?".
   * Se habla en gramos y en medidas caseras, nunca en "filas" ni "registros".
   */
  exchangeList: {
    sectionTitle: '¿Qué cuenta como 1 porción?',
    sectionHint: 'Define cuántos gramos de cada alimento equivalen a 1 porción de este grupo.',
    manageEntry: 'Porciones',
    manageEntryHint: 'Crea grupos y decide qué alimentos equivalen a 1 porción.',
    pickGroup: 'Elige un grupo para ver su lista',
    searchPlaceholder: 'Buscar en todo el catálogo',
    searchAria: 'Buscar alimento para clasificar en este grupo',
    addFood: 'Agregar alimento',
    gramsLabel: 'Gramos que equivalen a 1 porción',
    labelLabel: 'Medida casera (opcional)',
    labelPlaceholder: 'Ej: 1 taza',
    /** La sugerencia es un punto de partida: se dice explícito para que el coach la corrija. */
    suggested: (gramos: string) => `Sugerido: ${gramos} g según sus macros`,
    suggestedApply: 'Usar sugerencia',
    suggestedNone: 'No podemos sugerir gramos para este alimento: escríbelos tú.',
    previewTitle: 'Tu alumno verá',
    save: 'Guardar equivalencia',
    saving: 'Guardando…',
    saved: 'Equivalencia guardada',
    /** Origen de cada fila: el coach tiene que distinguir lo suyo de lo heredado. */
    badgeOwn: 'Tuyo',
    badgeCatalog: 'Del catálogo',
    /** Sacar un alimento de MI lista sin tocarlo en el catálogo. */
    exclude: 'Quitar de mi lista',
    excludeAria: (alimento: string) => `Quitar ${alimento} de mi lista`,
    excluded: 'Quitado de tu lista',
    restore: 'Volver al valor del catálogo',
    restoreAria: (alimento: string) => `Devolver ${alimento} al valor del catálogo`,
    restored: 'Volvió al valor del catálogo',
    removeFailed: 'No pudimos actualizar la lista. Intenta nuevamente.',
    empty: 'Este grupo todavía no tiene alimentos: tu alumno no verá ejemplos.',
    emptySearch: 'Ningún alimento de este grupo coincide con tu búsqueda.',
    loadFailed: 'No pudimos cargar la lista.',
    /** Duplicar copiando la lista: sin esto el grupo nuevo nace vacío (defecto que dejó F1). */
    copyListLabel: 'Copiar también su lista de alimentos',
    copyListHint: 'Los gramos se ajustan solos a las macros que definas.',
    copied: (n: number) => (n === 1 ? 'Se copió 1 alimento' : `Se copiaron ${n} alimentos`),
    copyPartial: (n: number, total: number) => `Se copiaron ${n} de ${total} alimentos`,
    copyFailed: 'El grupo se creó, pero no pudimos copiar su lista.',
    groupUnavailable: 'Ese grupo de porciones ya no está disponible.',
    foodUnavailable: 'Ese alimento ya no está disponible.',
  },
  coach: {
    dayCoverage: 'Porciones',
    derivedNote:
      'La cobertura derivada de alimentos usa el catálogo vigente y puede ajustarse si un alimento se reclasifica.',
  },
} as const
