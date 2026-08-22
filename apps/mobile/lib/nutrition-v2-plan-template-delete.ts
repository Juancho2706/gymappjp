/**
 * Eliminar una plantilla de plan V2 desde la app: PREDICADO y COPY, puros.
 *
 * Origen: feedback del coach en iOS (22-08) — «¿No puedo eliminar plantillas ya creadas? Si no me
 * sirven quedan ahí para siempre». La web ya tenía la baja (`PlanTemplatesLibrary`), la app solo
 * sabía abrir y editar.
 *
 * Sin imports (ni siquiera de tipos de otro módulo) a propósito: así el criterio de "qué se puede
 * borrar y qué se le dice al coach" se puede pinear en `tests/mobile` sin arrastrar react-native.
 */

/** Lo mínimo de una fila de la biblioteca que esta decisión necesita. */
export interface DeletablePlanTemplate {
  name: string
  /** false ⇒ el draft guardado ya no valida contra el contrato: no se puede abrir ni editar. */
  readable: boolean
}

/**
 * ¿Se le ofrece la papelera a esta fila?
 *
 * SIEMPRE que sea una plantilla de la biblioteca del coach — y todas lo son: la lista sale de
 * `/api/mobile/nutrition-v2/plan-templates`, acotada por la RLS de la tabla, y el catálogo no tiene
 * plantillas "de sistema" (`source` solo puede ser `builder` | `plan` | `import_v1`, y las tres son
 * material del propio coach).
 *
 * En particular `readable` NO entra en la decisión: una plantilla ilegible se borra igual, aunque
 * el lápiz no se le ofrezca. Es justamente la fila del feedback —rescatada de la V1, imposible de
 * abrir y de editar—, y esconderle también la baja la deja ahí para siempre. La web toma la misma
 * decisión (su rama `force`, con confirmación explícita en vez de deshacer); este predicado existe
 * para que la próxima persona que lea `readable === false` no lo "arregle" escondiendo la acción.
 */
export function canDeletePlanTemplate(template: DeletablePlanTemplate | null | undefined): boolean {
  return template != null
}

/** Nombre para el diálogo. El alta exige nombre, pero el cable puede llegar con basura. */
export function planTemplateDisplayName(name: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? 'esta plantilla' : trimmed
}

export interface PlanTemplateDeleteCopy {
  title: string
  /** Pregunta + la garantía que el coach necesita antes de tocar «Eliminar». */
  body: string
  /** Segunda línea, más apagada: en RN no hay «Deshacer» (la web sí lo tiene). */
  note: string
  confirmLabel: string
  busyLabel: string
}

/**
 * Copy del diálogo de confirmación.
 *
 * La garantía «los alumnos que ya la tienen aplicada no cambian» no es tranquilizadora vacía: el
 * borrado es SOFT y, sobre todo, aplicar una plantilla PUBLICA una versión propia en el plan del
 * alumno — no deja un puntero a la plantilla. Borrarla no toca ni un plan vigente.
 *
 * `note` dice la verdad que la web no necesita decir: allá el toast trae «Deshacer» (re-crea la
 * plantilla desde un caché del contenido); acá no hay ese camino, así que la confirmación es la
 * única red.
 */
export function planTemplateDeleteCopy(template: DeletablePlanTemplate): PlanTemplateDeleteCopy {
  return {
    title: 'Eliminar plantilla',
    body: `¿Eliminar «${planTemplateDisplayName(template.name)}»? Los alumnos que ya la tienen aplicada no cambian.`,
    note: 'Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    busyLabel: 'Eliminando…',
  }
}
