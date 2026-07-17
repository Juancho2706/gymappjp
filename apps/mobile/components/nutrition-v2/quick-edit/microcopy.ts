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
  readonlyHint: 'Para cambiar la estrategia o las notas, usa Rehacer con el asistente.',
  publishError: 'No se pudo publicar.',
  retry: 'Reintentar',
  emptySlot: 'Franja sin alimentos.',
  addFood: 'Agregar alimento',
  addSlot: 'Agregar franja',
  swapFood: 'Reemplazar alimento',
  freeFood: 'Alimento libre',
  targetsTitle: 'Metas diarias',
  flexibleHint: 'Plan flexible: el alumno registra libre contra estas metas. Ajusta y publica.',
  lastSlotBlocked: 'El plan estructurado necesita al menos una franja.',
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

export function publishSuccessToast(studentName: string): string {
  return `Plan actualizado. ${studentName} ya ve la nueva versión.`
}
