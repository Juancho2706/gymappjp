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
   * Barra cuando el publish se corta por validación y las marcas YA están a la vista (o el
   * error no vive en ningún día). Cuando sí hay días con error fuera del que se está editando,
   * la barra nombra esos días — `qePublishBlockedBar` — y esta cadena es solo el respaldo.
   */
  invalidDraft: 'Revisa los campos marcados antes de publicar.',
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
  /**
   * Aviso ANTES de crear el día: un día vacío no valida al publicar («Este día no tiene
   * ninguna comida…») y, con el editor pintando un solo día, ese error quedaba en un día que
   * el coach no estaba mirando. Se avisa acá para que la elección sea informada.
   */
  addDayEmptyHint: 'El día nace sin comidas. Agrégale al menos una franja antes de publicar.',
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
  /** Sufijo accesible del chip en ámbar: el día tiene algo que corregir antes de publicar. */
  dayNeedsAttention: 'Necesita atención',
  // ── Copiar una franja a otros días (P0-4). El destino se empareja por NOMBRE: si el día ya
  //    tiene una franja homónima la reemplaza (misma posición), y si no la agrega al final. ──
  slotMenuTitle: 'Opciones de la franja',
  copySlot: 'Copiar a otros días…',
  copySlotAll: 'Aplicar a todos los días',
  copySlotTitle: 'Copiar la franja a otros días',
  copySlotHint:
    'Reemplaza la franja del mismo nombre en cada día elegido. Si ese día no la tiene, se agrega al final.',
  copySlotReplaces: 'Reemplaza',
  // OB3 (regla D1 del owner: todo está en todos los planes, solo se cobra el cupo de alumnos):
  // `multiDayLocked` se retiró. Anunciaba «Nutrición Pro, no incluido en tu plan actual» antes de
  // dejar agregar días distintos; hoy la hoja de alta de días se abre siempre.
  discardTitle: '¿Descartar los cambios?',
  editingEyebrow: 'Modo edición',
  editingHint: 'Toca una cantidad para ajustarla. Publica cuando termines.',
  // ── T3.v (Cabina) V3.2: fila v2 del item y franja contraible. Mismas cadenas que el editor
  //    web (`QE_COPY`), para que un coach que arma en el telefono y revisa en el escritorio lea
  //    exactamente lo mismo. El `MacroSparkPopover` mantiene sus propios textos internos
  //    (limite de capas: el componente compartido no importa el copy del quick-edit).
  /** Densidad del alimento: "402 kcal / 100 g" (o la base declarada si es `per_serving`). */
  itemDensity: (calories: number, amount: string, unit: string) => `${calories} kcal / ${amount} ${unit}`,
  /** Badge de reemplazos autorizados de la fila: "⇄ 2" (su nombre accesible es `substitutionsMenu`). */
  itemBadgeSubstitutions: (n: number) => `⇄ ${n}`,
  itemBadgeMacrosEdited: 'macros editadas',
  itemBadgeFree: 'libre',
  itemFreeHint: 'alimento libre del coach',
  collapseSlot: (slotName: string) => `Contraer ${slotName}`,
  expandSlot: (slotName: string) => `Expandir ${slotName}`,
  // ── Notas del coach por franja y por grupo («el globito», SPEC nutrition-coach-notes). El 📝
  //    del header de la franja y de la fila de grupo abre un sheet con textarea + contador +
  //    limpiar. La nota del grupo reutiliza `PORTIONS_COPY.builder.noteFor`/`notePlaceholder`
  //    (tabla canonica compartida); aca vive solo lo que esa tabla no tiene. La nota viaja CON
  //    el plan al publicar — no es mensajeria (regla N4: el canal de conversacion es WhatsApp).
  slotNote: (slotName: string) => `Nota para ${slotName}`,
  slotNotePlaceholder: 'Escribe una indicación de esta comida para tu alumno…',
  slotNoteHint: 'Tu alumno la verá bajo el título de esta comida.',
  groupNoteHint: 'Tu alumno la verá junto a las porciones de este grupo.',
  noteClear: 'Limpiar nota',
  noteDone: 'Listo',
  /** Contador del textarea: «123/2000». El maxLength del input ya corta en el tope. */
  noteCounter: (n: number, max: number) => `${n}/${max}`,
} as const

/**
 * EDITOR UNICO (T3.3b) — copy de lo que el quick-edit clasico no tiene: metadatos del plan,
 * creacion y degradacion de origen. Mismas cadenas que el editor web (`QE_COPY`), para que un
 * coach que arma en el telefono y revisa en el escritorio lea lo mismo.
 */
export const EDITOR_COPY = {
  eyebrow: 'Editor de plan',
  /**
   * T3.v Cabina (V3.3): título del botón/hoja «Metas ▾» del header — hospeda el MISMO
   * `TargetsEditorCard` que antes vivía en el lienzo (espejo del `QE_COPY.metasPopover` web).
   */
  metasPopover: 'Metas del día',
  /** Modo creacion: no hay plan previo que "editar" — se esta armando uno. */
  createEyebrow: 'Nuevo plan',
  /** Vocabulario de CREACION: "Publicar cambios" prometia tocar algo que el alumno ya veia. */
  createPublish: 'Publicar plan',
  createConfirmTitle: 'Publicar el plan',
  createConfirmBody: (studentName: string, dateLabel: string | null) =>
    `${studentName} verá este plan ${dateLabel ? `desde el ${dateLabel}` : 'desde hoy'} y pasa a ser su plan vigente.`,
  planTitle: 'Plan',
  planNameLabel: 'Nombre del plan',
  planNamePlaceholder: 'Ej: Plan definición 2026',
  strategyLabel: 'Estrategia',
  flexibleBlocked:
    'Flexible solo está disponible sin franjas: en esa estrategia el alumno ve metas, no comidas.',
  hybridLocked: 'Híbrido viene incluido en Nutrición Pro.',
  effectiveFromLabel: 'Vigente desde',
  effectiveFromFormat: 'Formato AAAA-MM-DD. No puede ser anterior a hoy.',
  effectiveFromHint: (whenLabel: string) => `Empieza a regir ${whenLabel}.`,
  adjustPercentLabel: 'Tope de ajuste (±%)',
  adjustPercentHint: 'Vacío = sin tope.',
  footerCreation: 'Al publicar, el plan rige desde la fecha elegida (hoy por defecto).',
  footerToday: 'Al publicar, los cambios rigen desde hoy.',
  footerFuture: (dateLabel: string) =>
    `La versión vigente aplica desde el ${dateLabel}; al publicar, los cambios rigen desde hoy.`,
  // ── Capacidades que el editor trae del wizard (W2/W3 del editor web) ──
  itemMenuTitle: 'Opciones del alimento',
  substitutionsMenu: (n: number) => (n > 0 ? `Reemplazos autorizados (${n})` : 'Reemplazos autorizados'),
  substitutionsTitle: (name: string) => `Reemplazos de ${name}`,
  substitutionsHint:
    'El alumno puede registrar cualquiera de estos en lugar del alimento prescrito.',
  substitutionsEmpty: 'Este alimento aún no tiene reemplazos autorizados.',
  addSubstitution: 'Agregar reemplazo',
  substitutionLimit: (max: number) => `Máximo ${max} reemplazos por alimento.`,
  substitutionDuplicate: 'Ese alimento ya está como reemplazo.',
  substitutionRemovedUndo: 'Reemplazo quitado',
  moveItemUp: 'Subir',
  moveItemDown: 'Bajar',
  duplicateDay: 'Duplicar como…',
  duplicateDayTitle: 'Duplicar este día como',
  duplicateDayHint: 'El día nuevo copia las comidas y metas de este día.',
  duplicateDayDone: (label: string) => `Día duplicado como ${label}`,
  copyDayMenu: 'Copiar a otros días…',
  copyDayTitle: (label: string) => `Copiar ${label} a`,
  copyDayHint:
    'Elige los días destino. Reemplazar los deja iguales a este día; Sumar agrega estas franjas a lo que ya tienen.',
  copyDayModeReplace: 'Reemplazar',
  copyDayModeAppend: 'Sumar',
  copyDayNextDays: (n: number) => `Próximos ${n}`,
  copyDayCta: (n: number) => (n === 1 ? 'Copiar a 1 día' : `Copiar a ${n} días`),
  copyDayDone: (n: number) => (n === 1 ? 'Día copiado a 1 destino' : `Día copiado a ${n} destinos`),
  copyDayNothing: 'Elige al menos un día destino.',
  /** Degradacion de origen AVISADA (leccion JP 2026-08-11): jamas en silencio. */
  originUnavailableCreate:
    'No se pudo abrir el origen pedido (plantilla o plan). Estás viendo un plan en blanco.',
  originUnavailableEdit:
    'No se pudo abrir el origen pedido (plantilla o plan). Estás viendo el plan vigente del alumno.',
  // ── Modo PLANTILLA: el arbol es el mismo, pero no se PUBLICA nada — se GUARDA material
  //    reutilizable del coach. "Publicar" aca seria mentirle que algo le llego a un alumno.
  templateTitle: 'Plantilla',
  templateEyebrow: 'Editor de plantilla',
  templateNameLabel: 'Nombre de la plantilla',
  templateNamePlaceholder: 'Ej: Definición 1800 kcal',
  templateDescriptionLabel: 'Descripción (opcional)',
  templateDescriptionPlaceholder: 'Para qué sirve esta plantilla, a quién aplicarla…',
  templateSave: 'Guardar plantilla',
  templateDirtyBar: (n: number) => `${n} ${n === 1 ? 'cambio' : 'cambios'} sin guardar`,
  templateConfirmTitle: 'Guardar la plantilla',
  templateConfirmBody:
    'La plantilla se actualiza solo para ti. No le llega a ningún alumno hasta que la apliques.',
  templateConfirmCta: 'Guardar ahora',
  templateLeaveGuard: 'Tienes cambios sin guardar. ¿Salir y descartarlos?',
  templateBanner: 'Esto es una plantilla: no le llega a ningún alumno hasta que la apliques.',
  templateFooterInfo: 'Al guardar, la plantilla se actualiza solo para ti.',
  templateSuccess: 'Plantilla guardada.',
  templateUnavailable:
    'No se pudo abrir esa plantilla. Estás viendo una plantilla en blanco: al guardar se creará una nueva.',
  templateLoading: 'Abriendo la plantilla…',
  loading: 'Abriendo el editor…',
  loadFailed: 'No pudimos abrir el editor. Reintenta cuando tengas señal.',
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
