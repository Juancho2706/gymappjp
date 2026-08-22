import { ONBOARDING_STEPS } from '@eva/onboarding'
import { personaNoun, type Persona } from '@eva/schemas'
import type { SubscriptionTier } from '@eva/tiers'
import { clientInviteMessage, DEFAULT_INVITE_PERSONA } from '../../../lib/client-invite-copy'

/**
 * Alta guiada del paso 4 de la guía («Invita a tu primer {alumno}») en RN — parte PURA.
 *
 * Espejo semántico del `AddStudentStepper` de la web
 * (`apps/web/src/app/coach/clients/_components/AddStudentStepper.tsx` + `_lib/add-student-invite.ts`):
 * los mismos 3 pasos (datos mínimos → cómo le llega → así la ve), el mismo mensaje por persona y
 * el mismo criterio de «primer contenido». Lo que cambia es el envase: en la app el alta ya vive
 * dentro de `CreateClientModal` (con su muro de cupo y su share nativo), así que el modo guiado se
 * monta ENCIMA de ese modal en vez de abrir una pantalla nueva.
 *
 * QA del owner 22-08 (hallazgo 5): «los pasos 3 y 4 me mandan al área pero no me guían a hacer
 * otra cosa». En RN el paso 4 aterrizaba en el directorio y ahí terminaba el acompañamiento.
 *
 * Vive separado del componente porque es lo TESTEABLE: el texto por canal/persona, la nota de cupo
 * y qué paso sigue son reglas de producto que no necesitan montar react-native
 * (`tests/mobile/guided-invite.test.ts`). Nada de acá autoriza nada: el cupo, la unicidad del
 * correo y el alta real siguen validándose en el servidor.
 */

/** Los 3 pasos del alta guiada. */
export type GuidedStep = 1 | 2 | 3

/** Total de pasos — el indicador («Paso 2 de 3») nunca lo escribe a mano. */
export const GUIDED_STEP_COUNT = 3

const STEP_TITLES: Record<GuidedStep, string> = {
    1: 'Datos',
    2: 'Cómo le llega',
    3: 'Así la ve',
}

/** «Paso 2 de 3 · Cómo le llega». */
export function guidedStepLabel(step: GuidedStep): string {
    return `Paso ${step} de ${GUIDED_STEP_COUNT} · ${STEP_TITLES[step]}`
}

/**
 * Canales del paso 2. En la app son los tres que EXISTEN de verdad en el teléfono: WhatsApp
 * (mensaje ya escrito), la hoja de compartir del sistema y copiar el link. El «correo» no es un
 * canal a elegir acá porque el alta ya lo manda sola desde el servidor — ofrecerlo como opción
 * prometería un segundo envío que nadie hace.
 */
export type GuidedInviteChannel = 'whatsapp' | 'share' | 'link'

export const GUIDED_INVITE_CHANNELS = ['whatsapp', 'share', 'link'] as const satisfies readonly GuidedInviteChannel[]

export interface GuidedChannelCopy {
    id: GuidedInviteChannel
    title: string
    body: string
}

/**
 * Copy de las tres tarjetas de canal, con el sustantivo de la persona («alumno» / «paciente» /
 * «atleta»). Sin iconos: los pone la UI, acá solo vive el texto.
 */
export function guidedChannelCopy(persona: Persona | null | undefined): GuidedChannelCopy[] {
    const noun = personaNoun(persona ?? DEFAULT_INVITE_PERSONA)
    return [
        {
            id: 'whatsapp',
            title: 'Por WhatsApp',
            body: 'Le mandas el mensaje ya escrito con su link de acceso.',
        },
        {
            id: 'share',
            title: 'Compartir',
            body: 'Eliges desde dónde mandarlo con la hoja de tu teléfono.',
        },
        {
            id: 'link',
            title: 'Copiar el link',
            body: `Lo pegas donde quieras y tu ${noun} entra a tu app.`,
        },
    ]
}

/** Mensaje con el que se invita: la plantilla de la persona (`@eva/schemas`), nunca un texto propio. */
export function guidedInviteMessage(input: {
    persona: Persona | null | undefined
    clientName: string
    loginUrl: string
}): string {
    return clientInviteMessage(input)
}

/** Bajada del paso 1: lo mínimo que hace falta, dicho con el vocabulario de la persona. */
export function guidedFormHint(persona: Persona | null | undefined): string {
    const noun = personaNoun(persona ?? DEFAULT_INVITE_PERSONA)
    return `Con el nombre y el correo alcanza: el resto lo completa tu ${noun} al entrar.`
}

/** Título del alta guiada, espejo de `stepperTitle` de la web. */
export function guidedTitle(persona: Persona | null | undefined): string {
    return `Suma tu primer ${personaNoun(persona ?? DEFAULT_INVITE_PERSONA)}`
}

/**
 * Nota de cupo del paso 1 — SOLO cuando hay algo honesto que decir: plan Free con cupo conocido y
 * un alumno de ejemplo sembrado. El demo no ocupa cupo y el coach nuevo no tiene cómo saberlo:
 * sin esta línea cree que ya gastó su único lugar.
 *
 * QA del owner 22-08: la línea decía «…; Matías no ocupa ese cupo» y el owner leyó un nombre
 * suelto («¿siempre es Matías?»). Regla que queda para TODO copy de cupo/plan: el sujeto es
 * **«tu {alumno} de ejemplo»** (el concepto, con el sustantivo de la persona), y el nombre real va
 * entre paréntesis como apoyo para reconocerlo en la lista. Distinto de los pasos de la guía
 * («Entra como Pedro», «Arma la rutina de Matías»), donde el nombre ES la instrucción.
 *
 * `null` = no hay nota (otro plan, sin demo o sin cupo utilizable). Nunca se inventa un número:
 * sin demo sembrado no existe «tu alumno de ejemplo» y la nota no se escribe.
 */
export function guidedCapNote(input: {
    tier?: string | null
    maxClients?: number | null
    persona: Persona | null | undefined
    demoName?: string | null
}): string | null {
    if (input.tier !== 'free') return null
    const demo = input.demoName?.trim()
    if (!demo) return null
    const max = input.maxClients
    if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return null
    const persona = input.persona ?? DEFAULT_INVITE_PERSONA
    const noun = personaNoun(persona, max !== 1)
    const adjective = max === 1 ? 'real' : 'reales'
    // Singular siempre: el demo es UNO, aunque el cupo del plan sea de varios.
    const demoNoun = personaNoun(persona)
    return `Tu plan incluye ${max} ${noun} ${adjective} con tu marca; tu ${demoNoun} de ejemplo (${demo}) no ocupa ese cupo.`
}

/**
 * Línea del paso 3 sobre lo que viene después. La segunda mitad NO se redacta acá: sale del paso 5
 * («el aha») de la MISMA guía compartida, así el alta y la guía no pueden prometer cosas distintas.
 */
export function guidedAhaNote(persona: Persona | null | undefined, clientName: string): string {
    const name = clientName.trim() || personaNoun(persona ?? DEFAULT_INVITE_PERSONA)
    const steps = ONBOARDING_STEPS[persona ?? DEFAULT_INVITE_PERSONA]
    const aha = steps.find((step) => step.key === 'aha')
    const second = aha ? `${aha.label} es el paso 5 de tu guía.` : 'El paso 5 de tu guía lo completa quien entrena.'
    return `Cuando ${name} entre por primera vez, lo ves en tu panel. ${second}`
}

/** Título de la tarjeta de vista previa del paso 3. */
export function guidedPreviewTitle(clientName: string): string {
    const name = clientName.trim()
    return name ? `Así la ve ${name}` : 'Así la ve tu alumno'
}

/**
 * Qué paso corresponde después de cada hito del alta guiada.
 *
 * `created` = el servidor ya creó la cuenta (paso 1 resuelto). `channel_chosen` = el coach ya
 * eligió por dónde lo invita. La regla vive acá y no en el componente para que el orden se pueda
 * pinnear sin montar el modal.
 */
export function nextGuidedStep(current: GuidedStep, event: 'created' | 'channel_chosen'): GuidedStep {
    if (event === 'created') return current === 1 ? 2 : current
    return current === 2 ? 3 : current
}

/**
 * Contraseña temporal del alta guiada: en modo guiado el coach NO inventa una clave (el formulario
 * completo se la pedía). Mismo patrón `Eva{pin}!` que ya usan el alta corta del panel y el reset de
 * la web: dictable, y con prefijo + símbolo para no gatillar la protección de contraseñas filtradas
 * de Supabase Auth (un PIN puramente numérico devuelve 422). 10 caracteres ⇒ pasa el mínimo de 8
 * de `CreateClientSchema`.
 */
export function generateGuidedTempPassword(): string {
    const pin = Math.floor(100000 + Math.random() * 900000)
    return `Eva${pin}!`
}

/**
 * ¿Hay link de acceso para ofrecer canales? Sin `loginUrl` (respuesta vieja del endpoint, coach sin
 * slug público) el paso 2 no puede mandar nada: se dice la verdad —el acceso ya salió por correo—
 * en vez de pintar botones que compartirían un mensaje sin link.
 */
export function hasShareableLink(loginUrl: string | null | undefined): loginUrl is string {
    return typeof loginUrl === 'string' && loginUrl.trim().length > 0
}

/**
 * ¿Corresponde emitir `invite_sent` por este canal?
 *
 * El evento contesta «por dónde eligió mandar la invitación», no «cuántas veces tocó la tarjeta»:
 * copiar el link tres veces sigue siendo UN canal elegido, y contarlo tres veces infla la
 * comparación de conversión por canal contra la web (que emite uno por elección).
 *
 * Vive acá, puro, porque es la regla de la métrica; el componente solo guarda la lista.
 */
export function shouldEmitInviteSent(
    already: readonly GuidedInviteChannel[],
    channel: GuidedInviteChannel,
): boolean {
    return !already.includes(channel)
}

/**
 * Guarda de tipo del tier — el branding del contexto lo trae como `string | null` (viene del
 * servidor) y `showsEvaBadge` pide el union. Un `as SubscriptionTier` haría pasar cualquier basura
 * y el sello «Hecho con EVA» se decidiría con un valor que nadie validó.
 *
 * El Record fuerza la exhaustividad: si mañana `SubscriptionTier` suma un plan, este objeto no
 * compila hasta que se lo agregue acá.
 */
const SUBSCRIPTION_TIER_FLAGS: Record<SubscriptionTier, true> = {
    free: true,
    starter: true,
    pro: true,
    elite: true,
    growth: true,
    scale: true,
}

const SUBSCRIPTION_TIER_KEYS = Object.keys(SUBSCRIPTION_TIER_FLAGS)

export function isSubscriptionTier(value: unknown): value is SubscriptionTier {
    return typeof value === 'string' && SUBSCRIPTION_TIER_KEYS.includes(value)
}
