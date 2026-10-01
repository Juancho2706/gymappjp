/**
 * Tarjeta «Tu primer alumno» del panel del coach (plan B «Activación», aprobado por el owner el
 * 01-10 con la maqueta del artifact `F1yd1V2b`).
 *
 * POR QUÉ: de 57 coaches registrados desde el 06-09, 43 (75 %) nunca sumaron un alumno. Con 0
 * alumnos, el panel felicitaba («Ningún alumno en riesgo · Todo al día. Buen trabajo.») y no tenía
 * ningún botón para sumar a alguien. Con 0 alumnos REALES (el de ejemplo no cuenta) esta tarjeta va
 * primera y abre el alta directa en 3 pasos, nunca el link `/join` (deja una solicitud).
 *
 * Copy y destinos en UN solo lugar para web y RN. El sustantivo («alumno» / «paciente» /
 * «atleta») lo resuelve quien llama con `personaNoun` de `@eva/schemas`: este paquete solo importa
 * el tipo de ese paquete (ver la cabecera de `index.ts`).
 */

export interface FirstStudentStep {
    title: string
    hint: string
}

export interface FirstStudentCardCopy {
    eyebrow: string
    title: string
    /** Los 3 pasos del alta guiada (`AddStudentStepper` web / `GuidedInviteSteps` RN). */
    steps: readonly [FirstStudentStep, FirstStudentStep, FirstStudentStep]
    cta: string
    hint: string
}

/** Destino del CTA: el alta guiada de 3 pasos de cada plataforma. */
export const FIRST_STUDENT_WEB_HREF = '/coach/clients?invite=1' as const
export const FIRST_STUDENT_RN_ROUTE = '/coach/(tabs)/clientes?invite=1' as const

/**
 * ¿Se muestra la tarjeta? Solo con 0 alumnos reales. El conteo que llega tiene que excluir al
 * alumno de ejemplo (`is_demo`) y a los archivados: es el mismo `kpi.totalClients` que ya usa el
 * panel para pintar «—» en la adherencia.
 */
export function shouldShowFirstStudentCard(realClientCount: number | null | undefined): boolean {
    return realClientCount === 0
}

export function firstStudentCardCopy(noun: string): FirstStudentCardCopy {
    return {
        eyebrow: `Tu primer ${noun}`,
        title: 'Dale de alta y mándale su acceso por WhatsApp',
        steps: [
            { title: 'Sus datos', hint: 'Nombre y teléfono.' },
            { title: 'La invitación', hint: 'Por WhatsApp, correo o en persona.' },
            { title: 'Lo que ve', hint: 'Su app con tu marca.' },
        ],
        cta: `Dar de alta a mi primer ${noun}`,
        hint: 'Toma un minuto. Empieza por alguien con quien ya trabajas.',
    }
}
