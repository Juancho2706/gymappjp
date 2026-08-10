/**
 * Microcopy canonico del modo edicion (qe-design.md §1.4) — misma tabla que la web
 * para paridad exacta. Espanol latam neutro, con tildes, sin jerga interna: el coach
 * nunca ve "version"/"draft"/"supersede" (ajuste CSM §4).
 */

export const QUICK_EDIT_COPY = {
  enter: 'Editar plan',
  redo: 'Rehacer con el asistente',
  publish: 'Publicar cambios',
  discard: 'Descartar',
  confirmTitle: 'Publicar cambios del plan',
  confirmCta: 'Publicar ahora',
  keepEditing: 'Seguir editando',
  deletedUndo: 'Alimento eliminado',
  slotDeletedUndo: 'Franja eliminada',
  undo: 'Deshacer',
  stale:
    'Este plan cambió en otra sesión. Recarga para ver la versión vigente; los cambios de esta pantalla se perderán.',
  reload: 'Recargar',
  offline: 'Sin conexión. Tus cambios siguen aquí; reintenta cuando vuelvas a tener señal.',
  leaveGuardTitle: '¿Salir del modo edición?',
  leaveGuard: 'Tienes cambios sin publicar. ¿Salir y descartarlos?',
  // Respaldo local (F2): banner "Restaurar" al reabrir el modo edicion con un borrador guardado.
  restoreBanner: 'Tienes cambios sin publicar de una sesión anterior.',
  restoreCta: 'Restaurar',
  restoreDismiss: 'Descartar borrador',
  readonlyHint: 'Para cambiar la estrategia o los permisos, usa Rehacer con el asistente.',
  notesPermissionsTitle: 'Notas y permisos',
  notesLabel: 'Notas para tu alumno',
  notesPlaceholder: 'Escribe indicaciones visibles para tu alumno (bienvenida, comida libre, recordatorios…).',
  permRegisterFreely: 'Registro libre',
  permAdjustQuantity: 'Ajusta cantidades',
  // `permSubstitute` se retiro con la decision D4 (T2.5): el permiso no lo lee ningun camino de
  // autorizacion desde T2.4, asi que la pastilla le decia al coach que habia bloqueado algo que
  // nunca estuvo bloqueado. El builder ya lo habia sacado en la poda de la ola 3.
  publishError: 'No se pudo publicar.',
  retry: 'Reintentar',
  /**
   * NUT-008: el carry-over de reemplazos autorizados no esta resuelto. Publicar los borraria
   * (la publicacion reescribe el plan completo), asi que se bloquea hasta tenerlos.
   */
  substitutionsLoading: 'Estamos cargando los reemplazos autorizados. Espera un segundo antes de publicar.',
  substitutionsFailed:
    'No pudimos cargar los reemplazos autorizados de este plan. Reintenta antes de publicar: si publicas ahora, tu alumno los perdería.',
  emptySlot: 'Franja sin alimentos.',
  addFood: 'Agregar alimento',
  addSlot: 'Agregar franja',
  swapFood: 'Reemplazar alimento',
  freeFood: 'Alimento libre',
  targetsTitle: 'Metas diarias',
  flexibleHint: 'Plan flexible: el alumno registra libre contra estas metas. Ajusta y publica.',
  lastSlotBlocked: 'El plan estructurado necesita al menos una franja.',
  // ── Multi-día (FD5): alta/baja/cambio de día desde el modo edición (espejo web) ──
  baseDayEyebrow: 'Día base',
  baseDayHint: 'Se aplica en los días que no tienen plan propio.',
  specificDayEyebrow: 'Día específico',
  addDay: 'Agregar día',
  addDayTitle: 'Agregar días al plan',
  addDayHint: 'Elige uno o más días. Los días que no elijas siguen con el día base.',
  addDaySourceLabel: 'Contenido del día nuevo',
  addDaySourceClone: 'Copiar el día base',
  addDaySourceEmpty: 'Empezar vacío',
  addDayEmptySelection: 'Elige al menos un día.',
  dayTaken: 'Ya tiene plan propio',
  dayMenuTitle: 'Opciones del día',
  changeDay: 'Cambiar día',
  changeDayTitle: 'Cambiar el día',
  changeDayHint: 'Elige el día de la semana que sigue este plan.',
  renameDay: 'Renombrar',
  renameDayTitle: 'Renombrar el día',
  dayNameLabel: 'Nombre del día',
  dayNamePlaceholder: 'Sábado, Día de entrenamiento...',
  removeDay: 'Eliminar día',
  removeDayTitle: '¿Eliminar el día?',
  dayRemovedUndo: 'Día eliminado',
  // ── Índice de días (P1-1): anclas arriba de la pila para no scrollear a ciegas. Mismas
  //    cadenas que la web (`QE_COPY.dayIndex*`) — el copy del quick-edit es paritario. ──
  dayIndexLabel: 'Ir a un día del plan',
  baseDayShort: 'Base',
  dayAppliesToday: 'Aplica hoy',
  // ── Copiar una franja a otros días (P0-4). El destino se empareja por NOMBRE: si el día ya
  //    tiene una franja homónima la reemplaza (misma posición), y si no la agrega al final. ──
  slotMenuTitle: 'Opciones de la franja',
  copySlot: 'Copiar a otros días…',
  copySlotAll: 'Aplicar a todos los días',
  copySlotTitle: 'Copiar la franja a otros días',
  copySlotHint:
    'Reemplaza la franja del mismo nombre en cada día elegido. Si ese día no la tiene, se agrega al final.',
  copySlotReplaces: 'Reemplaza',
  /** Gate Pro `multi_variant`: el server rechaza igual; el candado evita el callejón. */
  multiDayLocked:
    'Armar días distintos (por ejemplo el fin de semana) es parte de Nutrición Pro, no incluido en tu plan actual.',
  discardTitle: '¿Descartar los cambios?',
  editingEyebrow: 'Modo edición',
  editingHint: 'Toca una cantidad para ajustarla. Publica cuando termines.',
} as const

export function dirtyBarLabel(n: number): string {
  return `${n} ${n === 1 ? 'cambio' : 'cambios'} sin publicar`
}

export function discardConfirmBody(n: number): string {
  return `¿Descartar ${n} ${n === 1 ? 'cambio' : 'cambios'}? Esta acción no se puede deshacer.`
}

/** Cuerpo del sheet de confirmacion. `futureDate` = vigencia futura de la version base. */
export function publishConfirmBody(studentName: string, futureDate: string | null): string {
  const cuando = futureDate ? `desde el ${futureDate}` : 'desde hoy'
  return `Los cambios aplican ${cuando} y ${studentName} verá el plan actualizado de inmediato. Lo que ya registró hoy no se modifica.`
}

/** CTA del sheet de alta de días: "Agregar día" / "Agregar 2 días". */
export function addDayCta(n: number): string {
  return n <= 1 ? 'Agregar día' : `Agregar ${n} días`
}

/** CTA de la hoja de copia de franja (misma cadena que la web `QE_COPY.copySlotCta`). */
export function copySlotCta(n: number): string {
  return n === 0 ? 'Elige al menos un día' : `Copiar a ${n} ${n === 1 ? 'día' : 'días'}`
}

/** Snackbar de la copia de franja (deshacer = el árbol previo). Espejo de `copySlotDone`. */
export function copySlotDone(n: number): string {
  return `Franja copiada a ${n} ${n === 1 ? 'día' : 'días'}`
}

/** Etiqueta accesible del ancla de un día del índice (espejo de `QE_COPY.dayIndexJump`). */
export function dayIndexJump(label: string): string {
  return `Ir a ${label}`
}

/** Cuerpo del confirm de baja de un día específico. */
export function removeDayConfirmBody(label: string): string {
  return `Se quitará "${label}" con sus franjas. Ese día vuelve a seguir el día base.`
}

export function publishSuccessToast(studentName: string): string {
  return `Plan actualizado. ${studentName} ya ve la nueva versión.`
}
