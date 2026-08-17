/**
 * Notas del coach («el globito» — SPEC nutrition-coach-notes N3): texto que el
 * alumno VE bajo la franja (`slot.instructions`) y bajo el grupo de porciones
 * (`target.notes`) en el Hoy, web y RN.
 *
 * El contrato guarda `null` cuando la nota queda vacía (invariante N-A), pero el
 * dato viaja congelado en snapshots históricos: esta única función decide qué se
 * pinta — texto recortado o NADA — para que ambas superficies no dupliquen (ni
 * driften) la regla "whitespace ⇒ cero render".
 */
export function coachNoteDisplayText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}
