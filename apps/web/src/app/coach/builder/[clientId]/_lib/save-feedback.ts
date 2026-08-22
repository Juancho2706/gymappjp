/**
 * Copy de la confirmación de guardado del builder de programas.
 *
 * QA del owner (22-08, port de RN): guardar un plan no daba señal de que algo pasó — la píldora
 * «Guardando…» quedaba semitransparente y el aviso no nombraba lo guardado. En web la confirmación
 * es un TOAST (no una pantalla completa: el coach sigue en el editor), y tiene que decir QUÉ se
 * guardó, con su nombre.
 *
 * PURA a propósito: el mensaje es una regla de producto que se testea sin montar el builder
 * (~1.900 líneas de componente cliente).
 */

export interface SavedProgramToastInput {
    /** `programName` tal como está en el editor (sin recortar). */
    programName: string
    /** ¿El programa es de un alumno? Sin alumno, lo que se guarda es una PLANTILLA de la biblioteca. */
    hasClient: boolean
}

/**
 * «Plan guardado: Fuerza 4 días» / «Plantilla guardada: Full body». Sin nombre utilizable se cae
 * al sustantivo solo: nunca se pinta un `: ` colgando ni comillas vacías.
 */
export function savedProgramToast({ programName, hasClient }: SavedProgramToastInput): string {
    const noun = hasClient ? 'Plan guardado' : 'Plantilla guardada'
    const name = programName.trim()
    return name ? `${noun}: ${name}` : noun
}
