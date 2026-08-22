import { formatWhatsappInvite, personaNoun, type Persona } from '@eva/schemas'

/**
 * Contratos PUROS del alta guiada «Sumar un {alumno} en 3 pasos»
 * (docs/specs/coach-onboarding-v2/SPEC.md §Diseño v2 / TASKS F4.1).
 *
 * Vive separado del componente a propósito: la decisión «primer alta ⇒ stepper, siguientes ⇒
 * modal», el mensaje de WhatsApp por persona y el copy del primer contenido son reglas de
 * producto que se testean sin montar React ni tocar la base.
 *
 * Nada de este archivo autoriza nada: el cupo, el scope y la validación real viven en
 * `createClientAction` (servidor). Acá solo se decide QUÉ se pinta.
 */

/** Los tres canales de la columna «Cómo le llega» (SPEC, artboard T1). */
export type InviteChannel = 'whatsapp' | 'email' | 'code'

/** Orden de las tarjetas de canal. WhatsApp primero: es el canal real de los coaches en LATAM. */
export const INVITE_CHANNELS = ['whatsapp', 'email', 'code'] as const satisfies readonly InviteChannel[]

/** Canal por defecto cuando el coach todavía no elige. Elegir canal = acción, pero el CTA nunca queda sin destino. */
export const DEFAULT_INVITE_CHANNEL: InviteChannel = 'whatsapp'

/**
 * Alumnos REALES del coach: el alumno de ejemplo (`clients.is_demo`) no cuenta.
 *
 * Misma definición que la señal `real_client` de la guía v2 (`@eva/onboarding`): un demo sembrado
 * en el alta no es un alta. Los archivados SÍ cuentan — el coach que archivó a su único alumno ya
 * pasó por el alta una vez y no necesita que le expliquen el flujo de nuevo.
 */
export function countRealClients(
    clients: readonly { is_demo?: boolean | null }[] | null | undefined,
): number {
    if (!clients?.length) return 0
    return clients.reduce((n, c) => (c.is_demo === true ? n : n + 1), 0)
}

/**
 * Decisión del W4.1: el PRIMER alta real va por el stepper guiado; las siguientes por el modal
 * de siempre (que conserva su escape «Hazlo paso a paso»).
 */
export function shouldUseGuidedStepper(realClientCount: number): boolean {
    return realClientCount <= 0
}

/**
 * Forma mínima de correo para habilitar el CTA. NO es la validación: el boundary real es
 * `CreateClientSchema` en el servidor (Zod) y GoTrue. Acá solo evita que el coach dispare un
 * alta que va a rebotar seguro.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidStudentEmail(value: string): boolean {
    return EMAIL_SHAPE.test(value.trim())
}

export interface InviteDraft {
    fullName: string
    email: string
    /** Ley 21.719 — el alta no existe sin esta confirmación (la exige el schema del servidor). */
    ageConfirmed: boolean
}

/** ¿El CTA «Invitar a {nombre}» puede dispararse? */
export function isReadyToInvite(draft: InviteDraft): boolean {
    return (
        draft.fullName.trim().length >= 2 &&
        isValidStudentEmail(draft.email) &&
        draft.ageConfirmed === true
    )
}

/**
 * Placeholder del nombre mientras el coach todavía no lo escribió: la vista previa del mensaje
 * tiene que leerse como una plantilla, no como un mensaje roto («Hola , te invité…»).
 */
export const NAME_PLACEHOLDER = '[nombre]'

/** Mensaje de WhatsApp de ESA persona, con el nombre y el link ya puestos (`@eva/schemas`). */
export function buildInviteMessage(
    persona: Persona,
    vars: { name: string; link: string },
): string {
    return formatWhatsappInvite(persona, {
        nombre: vars.name.trim() || NAME_PLACEHOLDER,
        link: vars.link,
    })
}

/**
 * `wa.me` con el mensaje ya redactado.
 *
 * Sin teléfono se abre el selector de contactos de WhatsApp (`wa.me/?text=`), que es el mismo
 * patrón de `InviteStudentSheet`: el teléfono es opcional en el alta y no queremos bloquear el
 * canal más usado por un campo que el alumno todavía no dio.
 */
export function buildWhatsappUrl(input: {
    persona: Persona
    name: string
    link: string
    phone?: string | null
}): string {
    const digits = (input.phone ?? '').replace(/\D/g, '')
    const text = encodeURIComponent(buildInviteMessage(input.persona, { name: input.name, link: input.link }))
    return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}

/**
 * Cómo se llama el primer contenido en el mundo de esa persona. El vocabulario global es deuda
 * declarada (D3 = A): acá se usa solo en el alta, igual que el `noun`.
 */
export function artifactNoun(persona: Persona): string {
    switch (persona) {
        case 'nutrition':
            return 'su pauta'
        case 'rehab':
            return 'sus ejercicios'
        case 'endurance':
            return 'su semana de entrenamiento'
        case 'strength':
            return 'su rutina'
        default:
            return 'su plan'
    }
}

export interface FirstContentCopy {
    /** Nombre del contenido que YA existe (plantilla aplicada o programa del demo). `null` = todavía nada. */
    title: string | null
    /** Una línea honesta: qué va a ver el alumno el día 1. */
    body: string
}

/**
 * Copy de la tercera columna, «Lo que va a ver».
 *
 * Con plantilla aplicada o demo sembrado mostramos el contenido REAL (es el «wow» del día 1);
 * sin nada, se dice la verdad — el alumno entra a su app con la marca del coach y el contenido
 * aparece cuando se lo asignen. Nunca se promete algo que no existe (riesgo declarado en la SPEC).
 */
export function firstContentCopy(
    persona: Persona,
    input: { programName?: string | null; demoName?: string | null },
): FirstContentCopy {
    const program = input.programName?.trim()
    if (program) {
        return {
            title: program,
            body: `Ya la tienes armada${input.demoName ? ` con ${input.demoName}` : ''}. Asígnasela y la ve en su primer ingreso.`,
        }
    }
    const artifact = artifactNoun(persona)
    return {
        title: null,
        body: `${artifact.charAt(0).toUpperCase()}${artifact.slice(1)} aparece acá cuando se la asignes. Entrar con tu marca ya funciona desde hoy.`,
    }
}

/** Título del alta guiada («Suma tu primer alumno / paciente / atleta en 3 pasos»). */
export function stepperTitle(persona: Persona): string {
    return `Suma tu primer ${personaNoun(persona)} en 3 pasos`
}
