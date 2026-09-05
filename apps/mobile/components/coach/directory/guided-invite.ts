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

/**
 * Mensaje con el que se invita: la plantilla de la persona (`@eva/schemas`), nunca un texto propio.
 *
 * `email` + `tempPassword` producen la variante CON credencial. Quién los pasa NO es el componente:
 * es `guidedInvitePayload`, que aplica la regla del canal.
 */
export function guidedInviteMessage(input: {
    persona: Persona | null | undefined
    clientName: string
    loginUrl: string
    email?: string | null
    tempPassword?: string | null
}): string {
    return clientInviteMessage(input)
}

/**
 * Mínimo de dígitos para dar por bueno un teléfono como destinatario CON NOMBRE (`wa.me/<digits>`).
 * Mismo umbral que `lib/temp-password-copy.ts` y la barra flotante del detalle de alumno: un número
 * corto o a medio tipear no identifica a nadie, y errar hacia «sin credencial» solo cuesta una línea
 * del mensaje, mientras errar al revés cuesta la cuenta de un tercero.
 */
const MIN_PHONE_DIGITS = 10

/** Dígitos tal como los pide `wa.me`: sin `+`, sin espacios ni guiones. */
function phoneDigits(phone: string | null | undefined): string {
    return (phone ?? '').replace(/\D/g, '')
}

/**
 * ¿Este canal puede llevar la credencial adentro? — regla 4 de
 * `docs/specs/flujo-coach-nuevo/SPEC.md §5`: **una credencial nunca viaja a un destinatario sin
 * nombre.**
 *
 * `whatsapp` CON teléfono usable es el único destino con nombre: la URL queda `wa.me/<digits>` y el
 * mensaje llega a esa persona y a nadie más. Los otros tres casos no saben a quién le hablan:
 * - `share` abre la hoja del sistema y el destinatario se elige DESPUÉS (puede ser un grupo, o el
 *   chat equivocado);
 * - `link` deja el texto en el portapapeles, que se pega donde sea;
 * - `whatsapp` sin teléfono cae en `wa.me/?text=`, que abre el selector de contactos — un toque
 *   equivocado entrega acceso a datos de salud de un tercero (Ley 21.719).
 *
 * En esos tres el mensaje igual sale: pierde la clave, no el link. La clave ya viajó por el correo
 * de bienvenida, que el alta manda sola.
 */
export function channelCarriesCredential(channel: GuidedInviteChannel, phone?: string | null): boolean {
    return channel === 'whatsapp' && phoneDigits(phone).length >= MIN_PHONE_DIGITS
}

export interface GuidedInvitePayload {
    /** El texto que de verdad sale por ese canal. */
    message: string
    /**
     * ¿El mensaje lleva usuario y clave ADENTRO? No es «el canal lo permite»: es lo que de verdad
     * salió. Un canal habilitado sin credencial que mandar (respuesta vieja del alta, clave todavía
     * no generada) da `false`, porque el flag no puede prometer más de lo que dice el texto.
     */
    withCredential: boolean
    /**
     * `wa.me/<digits>?text=<mensaje>` — SOLO del canal `whatsapp`; `null` en los otros dos. El
     * mensaje entero pasa por `encodeURIComponent`, igual que `lib/client-actions.ts`.
     */
    whatsappUrl: string | null
}

/**
 * Qué se manda por cada canal. Es la regla 4 hecha función: el componente pide un payload y no tiene
 * cómo filtrar una credencial por el canal equivocado — no hay un `if` suyo que pueda salir mal.
 *
 * La URL vive acá y no en el componente por el mismo motivo que `tempPasswordWhatsappUrl`
 * (`lib/temp-password-copy.ts`, el otro camino que manda una clave a un teléfono): si el destino y
 * el texto se arman juntos, un test puede pinnear que la clave y el `wa.me/<digits>` aparecen
 * SIEMPRE de a dos, sin montar react-native.
 */
export function guidedInvitePayload(input: {
    channel: GuidedInviteChannel
    phone?: string | null
    persona: Persona | null | undefined
    clientName: string
    loginUrl: string
    email?: string | null
    tempPassword?: string | null
}): GuidedInvitePayload {
    const permitida = channelCarriesCredential(input.channel, input.phone)
    const correo = permitida ? (input.email ?? '').trim() : ''
    const clave = permitida ? (input.tempPassword ?? '').trim() : ''
    // Los dos o ninguno, igual que `clientInviteMessage`: acá solo se adelanta para que el flag
    // diga lo mismo que el texto.
    const withCredential = Boolean(correo && clave)
    const message = guidedInviteMessage({
        persona: input.persona,
        clientName: input.clientName,
        loginUrl: input.loginUrl,
        email: correo || null,
        tempPassword: clave || null,
    })
    const whatsappUrl =
        input.channel === 'whatsapp'
            ? `https://wa.me/${phoneDigits(input.phone)}?text=${encodeURIComponent(message)}`
            : null
    return { message, withCredential, whatsappUrl }
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
 * Nota preventiva del campo de correo: el coach NO necesita agregarse para ver su app
 * (SPEC «Vive tu app» directo §5, caso Job Palacios 23-08 — se agregó a sí mismo con un segundo
 * correo y quemó su único cupo Free antes de ver nada).
 *
 * Es INDEPENDIENTE de `guidedCapNote`: aquella solo existe en Free con demo y habla del cupo; esta
 * habla del camino («Vive tu app»). `showsCupo` agrega el remate solo donde es verdad —Free
 * standalone con demo— y el llamador lo apaga si `guidedCapNote` ya dijo lo del cupo, para no
 * decirlo dos veces en la misma pantalla.
 *
 * Copy sin «plan», sin «eva-app.cl» y sin precios (regla de tiendas, `apps/mobile/AGENTS.md`).
 */
export function selfInviteNote(noun: string, options: { showsCupo: boolean }): string {
    const base = `¿Quieres probar la app tú? No hace falta agregarte como ${noun}: usa Vive tu app desde tu panel.`
    return options.showsCupo ? `${base} No gasta cupo.` : base
}

/** Mensaje inline cuando el correo tipeado es el del propio coach. Espejo del web. */
export const SELF_INVITE_BLOCKED_ES = 'Ese es tu correo de coach. Para probar la app usa Vive tu app.'

/**
 * ¿El correo tipeado ES el del coach? Comparación LOCAL `trim().toLowerCase()`, la misma que hace
 * el servidor con `sanitizePlatformEmail` antes de responder 409 `OWN_EMAIL`.
 *
 * El correo del coach sale de la sesión YA cargada (`getSession`, sin round-trip): un `getUser()`
 * de red por cada tecla sería una llamada por carácter. Nada de esto autoriza: el servidor repite
 * la comparación con su propio `user.email`.
 */
export function isCoachOwnEmail(value: string, coachEmail?: string | null): boolean {
    const coach = (coachEmail ?? '').trim().toLowerCase()
    if (!coach) return false
    return value.trim().toLowerCase() === coach
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
    pro: true,
    elite: true,
    growth: true,
    scale: true,
}

const SUBSCRIPTION_TIER_KEYS = Object.keys(SUBSCRIPTION_TIER_FLAGS)

export function isSubscriptionTier(value: unknown): value is SubscriptionTier {
    return typeof value === 'string' && SUBSCRIPTION_TIER_KEYS.includes(value)
}
