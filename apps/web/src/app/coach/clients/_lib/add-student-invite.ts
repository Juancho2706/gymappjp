import { formatWhatsappInvite, personaNoun, type Persona } from '@eva/schemas'
import { normalizePlatformEmail } from '@/lib/auth/platform-email'

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
    /**
     * Correo de la sesión del coach. `null`/ausente = no se sabe (fuera del directorio, o la
     * página no lo leyó): entonces NADA se bloquea. Nunca se usa para autorizar — el servidor
     * repite la comparación con su propio `user.email` (`clients.actions.ts`).
     */
    coachEmail?: string | null
}

/**
 * ¿El correo tipeado ES el del coach? (caso Job Palacios, 23-08: se agregó a sí mismo y quemó su
 * único cupo Free por no saber que el alumno de ejemplo ya era su forma de probar la app).
 *
 * Comparación LOCAL `trim().toLowerCase()` — exactamente la misma que hace el servidor con
 * `sanitizePlatformEmail`, para que el CTA no bloquee un alta que el servidor sí dejaría pasar.
 */
export function isCoachOwnEmail(value: string, coachEmail?: string | null): boolean {
    const coach = (coachEmail ?? '').trim().toLowerCase()
    if (!coach) return false
    return value.trim().toLowerCase() === coach
}

/**
 * ¿El correo tipeado cae en el MISMO buzón del coach (`+alias`, puntos de Gmail)?
 *
 * Solo para AVISAR: `check_platform_email_availability` ignora esas variantes (deuda declarada en
 * la SPEC), así que el servidor crea un alumno real con `coach+x@gmail.com`. Bloquear el CTA acá
 * mentiría sobre lo que el servidor va a hacer; decirle al coach «ese buzón es el tuyo» no.
 */
export function isCoachOwnInbox(value: string, coachEmail?: string | null): boolean {
    const coach = (coachEmail ?? '').trim().toLowerCase()
    if (!coach) return false
    const typed = value.trim().toLowerCase()
    if (!typed) return false
    if (typed === coach) return true
    return normalizePlatformEmail(typed) === normalizePlatformEmail(coach)
}

/** ¿El CTA «Invitar a {nombre}» puede dispararse? */
export function isReadyToInvite(draft: InviteDraft): boolean {
    return (
        draft.fullName.trim().length >= 2 &&
        isValidStudentEmail(draft.email) &&
        draft.ageConfirmed === true &&
        !isCoachOwnEmail(draft.email, draft.coachEmail)
    )
}

/**
 * Por QUÉ el CTA está apagado. Hasta acá el texto era uno solo («Falta el nombre, el correo o la
 * confirmación de edad»), que para el coach que escribió SU correo era mentira: no le falta nada,
 * está por gastar su cupo en sí mismo.
 *
 * `null` = el CTA se puede disparar.
 */
export type InviteBlockReason = 'missing' | 'own_email'

export function inviteBlockReason(draft: InviteDraft): InviteBlockReason | null {
    if (isCoachOwnEmail(draft.email, draft.coachEmail)) return 'own_email'
    return isReadyToInvite(draft) ? null : 'missing'
}

/** Mensaje inline cuando el correo tipeado es el del propio coach (V3.8). */
export const SELF_INVITE_BLOCKED_ES = 'Ese es tu correo de coach. Para probar la app usa Vive tu app.'

/**
 * Nota preventiva del paso 1 «Datos mínimos», SOLO cuando hay alumno de ejemplo sembrado: sin demo
 * la frase mandaría al coach a un botón que no tiene.
 *
 * `showsCupo` = Free standalone con demo. Fuera de Free el remate sobra, y para un coach
 * administrado (team/org) el endpoint del link responde 403 y la frase mentiría.
 *
 * El sustantivo lo pone la persona (`personaNoun`): regla 8 de la SPEC, nada de «alumno»
 * hardcodeado en copy nuevo.
 */
export function selfInviteNote(noun: string, options: { showsCupo: boolean }): string {
    const base = `¿Quieres probar la app tú? No hace falta agregarte como ${noun}: usa Vive tu app desde tu panel.`
    return options.showsCupo ? `${base} No gasta cupo.` : base
}

/**
 * Placeholder del nombre mientras el coach todavía no lo escribió: la vista previa del mensaje
 * tiene que leerse como una plantilla, no como un mensaje roto («Hola , te invité…»).
 */
export const NAME_PLACEHOLDER = '[nombre]'

/**
 * Mensaje de WhatsApp de ESA persona, con el nombre y el link ya puestos (`@eva/schemas`).
 *
 * `email` y `tempPassword` son OPCIONALES a propósito: con los dos presentes sale la variante que
 * lleva el acceso adentro; sin alguno, la que manda al alumno a buscar la clave en su correo. Este
 * builder **no** decide cuál corresponde — lo decide quien sabe si hay teléfono
 * (`buildWhatsappUrl`, o la pantalla cuando pinta la vista previa).
 */
export function buildInviteMessage(
    persona: Persona,
    vars: { name: string; link: string; email?: string | null; tempPassword?: string | null },
): string {
    return formatWhatsappInvite(persona, {
        nombre: vars.name.trim() || NAME_PLACEHOLDER,
        link: vars.link,
        correo: vars.email,
        clave: vars.tempPassword,
    })
}

/**
 * Dígitos del teléfono del alumno, o `''` si no dio ninguno. Es el destinatario del `wa.me`.
 *
 * Existe como export para que la pantalla y `buildWhatsappUrl` decidan la variante del mensaje con
 * la MISMA cuenta: si la vista previa mostrara la clave y el link enviado no la llevara (o al
 * revés), el coach mandaría algo distinto de lo que leyó.
 */
/**
 * Umbral espejo del RN (`MIN_PHONE_DIGITS` en `temp-password-copy.ts` / `guided-invite.ts`): menos
 * de 10 dígitos no es un número marcable — es un tipeo a medias, y `wa.me/<basura>` abriría un chat
 * inválido CON la credencial en la URL. Un número corto degrada al selector sin clave, igual que
 * ningún número.
 */
const MIN_PHONE_DIGITS = 10

export function whatsappRecipientDigits(phone?: string | null): string {
    const digits = (phone ?? '').replace(/\D/g, '')
    return digits.length >= MIN_PHONE_DIGITS ? digits : ''
}

/**
 * **Regla dura (SPEC §5, regla 4):** una credencial nunca viaja a un destinatario sin nombre.
 *
 * Con teléfono el mensaje va a `wa.me/<digits>`: un chat concreto. Sin teléfono va a
 * `wa.me/?text=`, que abre el **selector de contactos**, y un toque equivocado entrega acceso a
 * datos de salud de un tercero (Ley 21.719). Ahí el mensaje sale sin credencial.
 */
export function canSendCredentialByWhatsapp(phone?: string | null): boolean {
    return whatsappRecipientDigits(phone).length > 0
}

/**
 * `wa.me` con el mensaje ya redactado.
 *
 * Sin teléfono se abre el selector de contactos de WhatsApp (`wa.me/?text=`), que es el mismo
 * patrón de `InviteStudentSheet`: el teléfono es opcional en el alta y no queremos bloquear el
 * canal más usado por un campo que el alumno todavía no dio. Lo que SÍ cambia sin teléfono es el
 * contenido: la credencial se cae del mensaje (regla 4), y por eso el filtro vive acá y no en el
 * call site — que se olviden de aplicarlo es exactamente la fuga que la regla prohíbe.
 *
 * **Regla dura (SPEC §5, regla 10):** el resultado de esta función NO se renderiza como `href`.
 * La pantalla del alta guiada se graba en PostHog cuando el coach aceptó cookies, y el default
 * enmascara *inputs*, no `href`s: se arma en el handler del click y se abre ahí mismo.
 */
export function buildWhatsappUrl(input: {
    persona: Persona
    name: string
    link: string
    phone?: string | null
    email?: string | null
    tempPassword?: string | null
}): string {
    const digits = whatsappRecipientDigits(input.phone)
    const text = encodeURIComponent(
        buildInviteMessage(input.persona, {
            name: input.name,
            link: input.link,
            email: digits ? input.email : null,
            tempPassword: digits ? input.tempPassword : null,
        })
    )
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
