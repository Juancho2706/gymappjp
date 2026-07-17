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
  /** edit.readonlyHint */
  readonlyHint: 'Para cambiar la estrategia o las notas, usa Rehacer con el asistente.',
  /** Error red/servidor en la barra: el draft NO se pierde; reintento reusa la misma clave. */
  publishFailed: 'No se pudo publicar. Reintentar',
  discardConfirm: (n: number) => `¿Descartar ${cambios(n)}? Esta acción no se puede deshacer.`,
  emptySlot: 'Franja sin alimentos',
  addFood: 'Agregar alimento',
  addSlot: 'Agregar franja',
  removeSlot: 'Eliminar franja',
  freeFood: 'Alimento libre',
  upgradeRequired: 'Este cambio requiere Nutrición Pro.',
  invalidDraft: 'Hay campos con valores inválidos. Revisa las cantidades y nombres marcados.',
  flexibleTargetsOnly:
    'Plan flexible: sin franjas prescritas. Ajusta las metas diarias; el alumno registra libremente contra ellas.',
} as const

/** 'YYYY-MM-DD' → 'dd-mm-yyyy' (solo presentacion del confirm sheet). */
export function formatIsoDateDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}
