/**
 * Microcopy canonico del modo edicion (quick-edit) del plan V2 — tabla §1.4 del diseno QE.
 * Espanol latam neutro (con tildes). El coach NUNCA ve jerga interna ("version", "draft",
 * "supersede"): solo "cambios sin publicar" / "Publicar cambios". RN espeja esta misma tabla.
 */

function cambios(n: number): string {
  return `${n} ${n === 1 ? 'cambio' : 'cambios'}`
}

export const QE_COPY = {
  /** edit.enter */
  enter: 'Editar plan',
  /** edit.redo */
  redo: 'Rehacer con el asistente',
  /** edit.dirtyBar */
  dirtyBar: (n: number) => `${cambios(n)} sin publicar`,
  /** edit.publish */
  publish: 'Publicar cambios',
  /** edit.discard */
  discard: 'Descartar',
  /** edit.confirmTitle */
  confirmTitle: 'Publicar cambios del plan',
  /**
   * edit.confirmBody — `futureDateLabel` viene solo si la version vigente arranca en el futuro
   * (dd-mm-yyyy); en ese caso los cambios aplican desde esa fecha, no desde hoy.
   */
  confirmBody: (studentName: string, futureDateLabel: string | null) =>
    futureDateLabel
      ? `Los cambios aplican desde el ${futureDateLabel} y ${studentName} verá el plan actualizado de inmediato.`
      : `Los cambios aplican desde hoy y ${studentName} verá el plan actualizado de inmediato. Lo que ya registró hoy no se modifica.`,
  /** edit.confirmCta */
  confirmCta: 'Publicar ahora',
  keepEditing: 'Seguir editando',
  /** edit.success */
  success: (studentName: string) => `Plan actualizado. ${studentName} ya ve la nueva versión.`,
  /** edit.deletedUndo (snackbar: texto + accion) */
  deletedUndo: 'Alimento eliminado',
  slotDeletedUndo: 'Franja eliminada',
  undo: 'Deshacer',
  /** edit.stale */
  stale:
    'Este plan cambió en otra sesión. Recarga para ver la versión vigente; tus cambios de esta pantalla se perderán.',
  reload: 'Recargar',
  /** edit.offline */
  offline: 'Sin conexión. Tus cambios siguen aquí; reintenta cuando vuelvas a tener señal.',
  /** edit.leaveGuard */
  leaveGuard: 'Tienes cambios sin publicar. ¿Salir y descartarlos?',
  /** edit.restoreBanner — respaldo local: hay un borrador de una sesion anterior sin publicar. */
  restoreBanner: 'Tienes cambios sin publicar de una sesión anterior.',
  restoreCta: 'Restaurar',
  restoreDismiss: 'Descartar borrador',
  /** edit.readonlyHint — solo estrategia y permisos quedan fuera del quick-edit. */
  readonlyHint: 'Para cambiar la estrategia o los permisos, usa Rehacer con el asistente.',
  /** edit.notesLabel — visible_notes editable (el alumno las ve en su plan). */
  notesLabel: 'Notas para tu alumno',
  notesPlaceholder: 'Escribe indicaciones visibles para tu alumno (bienvenida, comida libre, recordatorios…).',
  /** Error red/servidor en la barra: el draft NO se pierde; reintento reusa la misma clave. */
  publishFailed: 'No se pudo publicar. Reintentar',
  /**
   * NUT-008: no pudimos leer los reemplazos autorizados de la version vigente. Publicar
   * ahora los borraria (la publicacion reescribe el plan completo), asi que se bloquea.
   */
  substitutionsFailed:
    'No pudimos cargar los reemplazos autorizados de este plan. Recarga antes de publicar: si publicas ahora, tu alumno los perdería.',
  substitutionsRetry: 'Reintentar',
  discardConfirm: (n: number) => `¿Descartar ${cambios(n)}? Esta acción no se puede deshacer.`,
  emptySlot: 'Franja sin alimentos',
  addFood: 'Agregar alimento',
  // ── Menú ⋮ del item: agrupa lo que antes eran dos botones sueltos (reemplazar / eliminar) y
  //    suma mover de franja (BD7) y guardar en el catálogo (BD5).
  itemMenu: (name: string) => `Opciones de ${name}`,
  replaceFood: 'Reemplazar alimento',
  removeFood: 'Quitar alimento',
  moveFood: 'Mover a otra franja',
  moveFoodHint: 'Elige la comida que lo recibe. Conserva su cantidad, su unidad y sus macros.',
  moveFoodDone: (slotName: string) => `Alimento movido a ${slotName}`,
  moveFoodSingleSlot: 'Este día tiene una sola franja.',
  // ── "Guardar en mi catálogo": promueve un alimento libre (nombre + macros, sin food_id) al
  //    catálogo del coach y deja el item apuntando al alimento creado.
  saveFood: 'Guardar en mi catálogo',
  saveFoodDone: 'Guardado en tu catálogo.',
  saveFoodNoMacros: 'Este alimento libre no trae macros, así que no hay qué guardar.',
  saveFoodNoName: 'Ponle un nombre al alimento antes de guardarlo.',
  saveFoodBadUnit: 'Solo se pueden guardar alimentos medidos en gramos o mililitros.',
  addSlot: 'Agregar franja',
  removeSlot: 'Eliminar franja',
  // ── Copiar una franja a otros días (P0-4). El destino se empareja por NOMBRE: si el día ya
  //    tiene una franja homónima la reemplaza (misma posición), y si no la agrega al final.
  copySlot: 'Copiar a otros días…',
  copySlotAll: 'Aplicar a todos los días',
  copySlotTitle: 'Copiar la franja a otros días',
  copySlotHint:
    'Reemplaza la franja del mismo nombre en cada día elegido. Si ese día no la tiene, se agrega al final.',
  copySlotReplaces: 'Reemplaza',
  copySlotCta: (n: number) => (n === 0 ? 'Elige al menos un día' : `Copiar a ${n} ${n === 1 ? 'día' : 'días'}`),
  copySlotDone: (n: number) => `Franja copiada a ${n} ${n === 1 ? 'día' : 'días'}`,
  // ── Porciones que se quedaron SOLO en el día base (defecto B4). Las porciones pertenecen
  //    a la franja de UN día: cargarlas en el base y publicar deja a los días asignados sin
  //    ninguna. `dias` llega ya formateado ("Sábado, Domingo") y `n` es cuántos son.
  //    Claves propias (no se reusa `copySlotAll`) porque es OTRA acción: acá se bajan las
  //    porciones del base, allá se copia una franja completa elegida por el coach.
  portionsGapTitle: 'Tus porciones están solo en el día base.',
  portionsGapDays: (dias: string, n: number) =>
    `${dias} no ${n === 1 ? 'las mostrará' : 'las mostrarán'} a tu alumno.`,
  portionsGapUnmatched: (dias: string, n: number) =>
    n === 1
      ? `${dias} no tiene ninguna comida: tu alumno verá ese día vacío. Agrégale comidas o elimínalo para que herede el día base.`
      : `${dias} no tienen ninguna comida: tu alumno verá esos días vacíos. Agrégales comidas o elimínalos para que hereden el día base.`,
  portionsGapApply: 'Aplicar a todos los días',
  portionsGapApplied: 'Porciones aplicadas a los días del plan.',
  /**
   * Nota estática de la sección "Porciones a elección": los targets congelan sus valores al
   * publicar, así que lo que se edita acá viaja recién con esta publicación y los planes que
   * ya salieron no se mueven solos. Reformulación del aviso del editor de grupos del builder
   * para el contexto del quick-edit (acá el coach edita el PLAN, no el grupo).
   */
  portionsPublishNotice:
    'Tus cambios de porciones se aplican al publicar esta edición. Los planes que ya publicaste mantienen los valores con los que salieron.',
  /**
   * Ayuda del picker "Agregar grupo": desde 08-04 la lista ofrece TODO el catálogo de grupos
   * del coach y no solo los que el plan ya usaba, así que conviene decir de dónde sale y por
   * qué algunos están desactivados (antes la lista completa venía deshabilitada y parecía rota).
   */
  portionsPickerHint: 'Elige cualquier grupo de tu catálogo. Los que ya están en esta comida aparecen desactivados.',
  // ── Multi-día (FD5): menú por día en el modo edición. El alta vive en `AddDayPopover`
  //    (compartido con el builder), que trae su propio copy y su upsell del gate Pro.
  baseDayEyebrow: 'Día base',
  baseDayHint: 'Se aplica en los días que no tienen plan propio.',
  specificDayEyebrow: 'Día específico',
  dayMenu: (label: string) => `Opciones del día ${label}`,
  changeDay: 'Cambiar día',
  changeDayTitle: 'Cambiar el día',
  changeDayHint: 'Elige el día de la semana que sigue este plan.',
  renameDay: 'Renombrar',
  renameDayTitle: 'Renombrar el día',
  dayNameLabel: 'Nombre del día',
  dayNamePlaceholder: 'Sábado, Día de entrenamiento...',
  removeDay: 'Eliminar día',
  dayRemovedUndo: 'Día eliminado',
  dayTaken: 'Ya tiene plan propio',
  // ── W2 (editor unico): capacidades del wizard migradas; solo con `state.meta`.
  duplicateDay: 'Duplicar como…',
  duplicateDayTitle: 'Duplicar este día como',
  duplicateDayHint: 'El día nuevo copia las comidas y metas de este día.',
  duplicateDayDone: (label: string) => `Día duplicado como ${label}`,
  substitutionsMenu: (n: number) => (n > 0 ? `Reemplazos autorizados (${n})` : 'Reemplazos autorizados'),
  substitutionsTitle: (name: string) => `Reemplazos de ${name}`,
  substitutionsHint: 'El alumno puede registrar cualquiera de estos en lugar del alimento prescrito.',
  substitutionsEmpty: 'Este alimento aún no tiene reemplazos autorizados.',
  addSubstitution: 'Agregar reemplazo',
  substitutionLimit: (max: number) => `Máximo ${max} reemplazos por alimento.`,
  substitutionDuplicate: 'Ese alimento ya está como reemplazo.',
  substitutionRemovedUndo: 'Reemplazo quitado',
  editMacros: 'Editar macros',
  // ── W3a (editor unico): copiar dia a varios dias (T2.6 F2, quick-select + modo D2).
  copyDayMenu: 'Copiar a otros días…',
  copyDayTitle: (label: string) => `Copiar ${label} a`,
  copyDayHint: 'Elige los días destino. Reemplazar los deja iguales a este día; Sumar agrega estas franjas a lo que ya tienen.',
  copyDayModeReplace: 'Reemplazar',
  copyDayModeAppend: 'Sumar',
  copyDayNextDays: (n: number) => `Próximos ${n}`,
  copyDayCta: (n: number) => (n === 1 ? 'Copiar a 1 día' : `Copiar a ${n} días`),
  copyDayDone: (n: number) => (n === 1 ? 'Día copiado a 1 destino' : `Día copiado a ${n} destinos`),
  copyDayNothing: 'Elige al menos un día destino.',
  // ── W3b (editor unico): reorden dentro de la franja + capsula de dia activo.
  moveItemUp: 'Subir',
  moveItemDown: 'Bajar',
  daySwitcherLabel: 'Día del plan en edición',
  paletteTitle: 'Agregar alimentos',
  paletteSlotLabel: 'A la franja',
  paletteNoSlots: 'Este día no tiene franjas: crea una para agregar alimentos.',
  // ── W4 (corte 1): el par viejo pasa a camino secundario del menu de la ficha.
  classicQuickEdit: 'Edición rápida (clásica)',
  // ── Índice de días (P1-1): anclas arriba de la pila para no scrollear a ciegas.
  dayIndexLabel: 'Ir a un día del plan',
  dayIndexJump: (label: string) => `Ir a ${label}`,
  baseDayShort: 'Base',
  dayAppliesToday: 'Aplica hoy',
  freeFood: 'Alimento libre',
  upgradeRequired: 'Este cambio viene incluido en cualquier plan pago de EVA.',
  invalidDraft: 'Hay campos con valores inválidos. Revisa las cantidades y nombres marcados.',
  /**
   * Día sin ninguna comida: el servidor lo rechaza (el alumno vería el día entero vacío) y
   * antes eso llegaba como "No se pudo publicar" a secas. Se usa como respaldo cuando el
   * servidor no manda su propio mensaje con el nombre del día.
   */
  emptyDayPublish:
    'Hay un día del plan sin ninguna comida. Tu alumno lo vería vacío: agrégale una franja o elimina el día.',
  /** Aviso en la card del día vacío (marcado tras un intento de publicar). */
  emptyDayVariant: 'Este día no tiene ninguna comida. Agrégale una franja o elimina el día.',
  /** Franja colapsada: acciones del chevron (una sola card, dos estados). */
  collapseSlot: (slotName: string) => `Contraer ${slotName}`,
  expandSlot: (slotName: string) => `Expandir ${slotName}`,
  flexibleTargetsOnly:
    'Plan flexible: sin franjas prescritas. Ajusta las metas diarias; el alumno registra libremente contra ellas.',
} as const

/** 'YYYY-MM-DD' → 'dd-mm-yyyy' (solo presentacion del confirm sheet). */
export function formatIsoDateDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}
