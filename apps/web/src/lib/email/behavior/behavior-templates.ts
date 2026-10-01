import { PERSONA_COPY, type Persona } from '@eva/schemas'
import { wrapEmailLayout, ctaButton, brandCtaColors } from '../base-layout'
import type { BehaviorTemplateKey } from './behavior-triggers'

/**
 * Plantillas de los «correos por comportamiento» (W6 / F6.2), UNA por señal y POR PERSONA.
 *
 * VERSIÓN 2 (plan «Correos y activación», aprobada por el owner el 01-10 con el antes/después en el
 * artifact `8NRAZ75J`). Qué cambió y por qué:
 * - **Sin `/join`.** Desde el 21-08 ese link deja una SOLICITUD que el coach tiene que aceptar (en un
 *   mes llegó 1); «pásale tu link y se registra solo» era falso. El CTA del día 1 abre el alta
 *   directa en 3 pasos, que termina con el acceso listo para mandar por WhatsApp.
 * - **Vista previa de la app** con el nombre y el color del coach: muestra que la app existe.
 * - **Progreso de 3 pasos** que solo marca lo que el sistema sabe (nunca «Tu marca», que no se mide).
 * - **Firma «El equipo de EVA»**: el WhatsApp de EVA lo responde el socio hablando como EVA, y la
 *   respuesta del correo va a `contacto@eva-app.cl` (`BEHAVIOR_REPLY_TO`).
 * - **CTA en verde oscuro `#047857`**: el verde EVA con letra blanca da contraste 2,5 a 1; este da 5,5.
 * - Texto de 16 px y asuntos cortos con el nombre.
 *
 * Reglas de contenido que siguen vigentes:
 * - Español latam neutro CON tildes, corto, sin marketing agresivo ni promesas que no sostenemos.
 * - CERO precios: el precio vive en `/coach/subscription`, que es la única fuente viva.
 * - UN solo `<a>` por correo (el CTA o el botón de WhatsApp).
 * - Es un correo de EVA AL COACH, jamás white-label: la marca del coach solo aparece en la vista
 *   previa de SU app.
 * - Pie con la salida en texto plano (Ley 19.496 art. 28 B: es una serie que EVA inicia sola).
 *
 * RAMA «SIN PERSONA» (W8.4.4): `persona = null` es un caso de primera clase (la mayoría del padrón
 * no tiene persona escrita): habla de «tu primer alumno» y de «tu primer plan».
 *
 * EL VOCABULARIO SALE DE `PERSONA_COPY` (@eva/schemas): «alumno» / «paciente» / «atleta». No se
 * escribe a mano en ningún string de este archivo.
 */

/** Clave de copy: las 5 personas reales + la rama sin especialidad. */
export type BehaviorPersonaKey = Persona | 'sin_persona'

export function behaviorPersonaKey(persona: Persona | null | undefined): BehaviorPersonaKey {
    return persona ?? 'sin_persona'
}

export interface BehaviorEmailContext {
    /** `coaches.full_name`. Texto del coach ⇒ se escapa antes de interpolar. */
    coachName: string | null
    /** `coaches.brand_name`. Fallback «tu app», nunca «tu marca» (ver `drip-templates.ts`). */
    brandName: string | null
    /** `coaches.primary_color`. Pinta la vista previa; sin color válido cae al verde EVA. */
    brandColor?: string | null
    persona: Persona | null
    /** Plan Gratis ⇒ el correo del aha suma una línea sobre el cupo de 1 alumno. */
    isFree?: boolean
    /** Alumno que lleva más tiempo sin entrar: el correo de 48 h abre su ficha. */
    pendingClientId?: string | null
    /** `siteBaseUrl()`. Producción como fallback: un correo con `localhost` es un correo perdido. */
    baseUrl: string
    /**
     * WhatsApp de EVA para el correo de +7 d (D13). Sin él el correo no inventa uno: cae al
     * «responde este correo», que es una puerta real, y el botón vuelve a la guía.
     */
    ownerWhatsappUrl?: string | null
}

export interface BehaviorEmail {
    key: BehaviorTemplateKey
    subject: string
    /** Texto de la vista previa de la bandeja (completa el asunto, no lo repite). */
    preheader: string
    /** Cuerpo en texto plano — el mismo mensaje, sin HTML. Lo pinnean los tests del copy. */
    text: string
    html: string
}

/**
 * Pie de TODOS los correos de comportamiento. Texto plano a propósito: el único `<a>` del correo ya
 * lo gasta el CTA.
 *
 * NO repite «Enviado por EVA»: esa línea la pone `wrapEmailLayout` sola. Acá va solo la salida, que
 * la Ley 19.496 art. 28 B exige. «Responde y los cortamos» se cumple con la marca de baja del ledger.
 */
export const BEHAVIOR_FOOTER =
    'Recibes este correo porque creaste tu cuenta de coach en EVA. Si no quieres recibirlos, responde este mensaje y los cortamos.'

/** Quién firma. El WhatsApp y el correo los responde el equipo, hablando como EVA. */
export const BEHAVIOR_SIGNATURE_NAME = 'El equipo de EVA'

/** Verde del CTA con contraste AA sobre blanco (5,5 a 1). El verde EVA `#10B981` da 2,5 a 1. */
export const BEHAVIOR_CTA_GREEN = '#047857'

/** Remitente en la versión de TEXTO (en el HTML lo pone `wrapEmailLayout`). */
const BEHAVIOR_TEXT_SENDER = 'Enviado por EVA Fitness Platform.'

/** Escapa texto controlado por el coach (nombre, marca) antes de interpolarlo en el HTML. */
function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface PersonaBehaviorCopy {
    /** Cómo se llama a la gente que atiende. Espejo de `PERSONA_COPY[...].noun`. */
    noun: { singular: string; plural: string }
    /** El artefacto que el coach le deja: «rutina», «pauta», «semana de entrenamiento»… */
    artifact: string
    /** Género del artefacto: «primer plan» / «primera rutina», «armarlo» / «armarla». */
    masculine: boolean
    /** Qué arma en el correo del día 3. Concreto, no genérico. Sigue a «Arma …». */
    quickWin: string
    /** Línea de «hoy» en la vista previa de la app del alumno. */
    today: string
}

/**
 * Copy por rama. `noun` se copia de `PERSONA_COPY` (una sola fuente del vocabulario, con test
 * cruzado que falla si se desincronizan); lo demás es propio de los correos.
 */
const BEHAVIOR_COPY: Record<BehaviorPersonaKey, PersonaBehaviorCopy> = {
    strength: {
        noun: PERSONA_COPY.strength.noun,
        artifact: 'rutina',
        masculine: false,
        quickWin: 'una rutina de 3 días en el constructor',
        today: 'Fuerza · Día A · 45 min',
    },
    nutrition: {
        noun: PERSONA_COPY.nutrition.noun,
        artifact: 'pauta',
        masculine: false,
        quickWin: 'una pauta con porciones e intercambios',
        today: 'Tu pauta · 5 comidas',
    },
    rehab: {
        noun: PERSONA_COPY.rehab.noun,
        artifact: 'pauta de ejercicios',
        masculine: false,
        quickWin: 'un screening de movimiento y la pauta que sale de ahí',
        today: 'Tus ejercicios · 20 min',
    },
    endurance: {
        noun: PERSONA_COPY.endurance.noun,
        artifact: 'semana de entrenamiento',
        masculine: false,
        quickWin: 'sus zonas y la primera semana',
        today: 'Rodaje Z2 · 50 min',
    },
    other: {
        noun: PERSONA_COPY.other.noun,
        artifact: 'plan',
        masculine: true,
        quickWin: 'su primer plan',
        today: 'Tu plan de hoy',
    },
    sin_persona: {
        // Sin especialidad elegida se usa el vocabulario neutro de `other`: «alumno».
        noun: PERSONA_COPY.other.noun,
        artifact: 'plan',
        masculine: true,
        quickWin: 'su primer plan',
        today: 'Tu plan de hoy',
    },
}

function coachDisplayName(ctx: BehaviorEmailContext): string {
    return ctx.coachName?.trim().split(' ')[0] || 'Coach'
}

/** Fallback «tu app», NO «tu marca»: el coach sin `brand_name` todavía no eligió una (ver el drip). */
function brandDisplayName(ctx: BehaviorEmailContext): string {
    return ctx.brandName?.trim() || 'tu app'
}

// ── Bloques de HTML (estilos en línea: es lo único que respetan Gmail y Outlook) ──

function paragraph(html: string): string {
    return `<p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.65;">${html}</p>`
}

function heading(html: string): string {
    return `<h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:#111827;line-height:1.25;letter-spacing:-0.3px;">${html}</h1>`
}

function small(html: string): string {
    return `<p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;">${html}</p>`
}

function cta(label: string, url: string): string {
    return `<div style="margin:4px 0 14px;">${ctaButton(label, url, BEHAVIOR_CTA_GREEN)}</div>`
}

function whatsappButton(label: string, url: string): string {
    return `<div style="margin:4px 0 16px;"><a href="${url}" target="_blank" style="display:inline-block;padding:15px 26px;background-color:#25D366;color:#052e16;font-size:16px;font-weight:800;text-decoration:none;border-radius:10px;">${label}</a></div>`
}

/** Progreso real del arranque: 3 hitos, el primero pendiente resaltado. */
function progress(done: [boolean, boolean, boolean], labels: [string, string, string]): string {
    const firstPending = done.findIndex((d) => !d)
    const cell = (ok: boolean, label: string, current: boolean) => `<td style="padding:0 4px 0 0;" valign="top">
    <div style="font-size:12px;font-weight:700;color:${ok ? BEHAVIOR_CTA_GREEN : current ? '#111827' : '#9ca3af'};white-space:nowrap;">${ok ? '&#10003;' : current ? '&#9679;' : '&#9675;'} ${escHtml(label)}</div>
    <div style="height:4px;border-radius:4px;margin-top:6px;background:${ok ? '#10B981' : current ? '#111827' : '#e5e7eb'};"></div></td>`
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 22px;table-layout:fixed;"><tr>${labels
        .map((label, i) => cell(done[i], label, i === firstPending))
        .join('')}</tr></table>`
}

/** Mini vista de la app del alumno con la marca del coach: prueba visual de que la app existe. */
function appPreview(ctx: BehaviorEmailContext, copy: PersonaBehaviorCopy, brand: string): string {
    const colors = brandCtaColors(ctx.brandColor)
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 22px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="260" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;background:#ffffff;">
      <tr><td style="background:${colors.bg};padding:14px 16px;"><span style="font-size:15px;font-weight:800;color:${colors.text};">${escHtml(brand)}</span></td></tr>
      <tr><td style="padding:14px 16px 6px;"><div style="font-size:12px;color:#6b7280;">Hola, Martina</div><div style="font-size:15px;font-weight:700;color:#111827;margin-top:2px;">${escHtml(copy.today)}</div></td></tr>
      <tr><td style="padding:8px 16px 16px;"><div style="background:${colors.bg};color:${colors.text};font-size:13px;font-weight:700;text-align:center;border-radius:10px;padding:9px 0;">Empezar</div></td></tr>
    </table>
    <div style="font-size:12px;color:#9ca3af;margin-top:8px;">Así ve tu ${escHtml(copy.noun.singular)} tu app</div>
  </td></tr></table>`
}

/** Firma del equipo. Sin link: el único `<a>` del correo es el CTA. */
function signature(): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;"><tr>
  <td style="width:40px;height:40px;border-radius:20px;background:#0f172a;color:#10B981;font-weight:800;font-size:12px;text-align:center;line-height:40px;letter-spacing:0.3px;">EVA</td>
  <td style="padding-left:12px;"><div style="font-size:14px;font-weight:700;color:#111827;">${BEHAVIOR_SIGNATURE_NAME}</div><div style="font-size:13px;color:#6b7280;">Si te trabas, responde este correo y te ayudamos.</div></td></tr></table>`
}

interface BuiltBody {
    subject: string
    preheader: string
    /** Cuerpo HTML completo (CTA y firma incluidos). */
    html: string
    /** Líneas del texto plano, sin la firma ni el pie (los agrega `assemble`). */
    text: string[]
}

/** Arma el correo final. El pie y la firma se agregan acá para que ninguna rama los olvide. */
function assemble(key: BehaviorTemplateKey, built: BuiltBody): BehaviorEmail {
    const html = wrapEmailLayout(`${built.html}\n${signature()}`, {
        previewText: built.preheader,
        // El asunto lleva el nombre y la marca del coach, y `wrapEmailLayout` lo pega tal cual en el
        // `<title>`: se escapa acá.
        headerTitle: `${escHtml(built.subject)} — EVA`,
        footerText: BEHAVIOR_FOOTER,
    })
    const text = [...built.text, '', `${BEHAVIOR_SIGNATURE_NAME}. Si te trabas, responde este correo.`, '', BEHAVIOR_TEXT_SENDER, BEHAVIOR_FOOTER]
    return { key, subject: built.subject, preheader: built.preheader, text: text.join('\n'), html }
}

export function buildBehaviorEmail(key: BehaviorTemplateKey, ctx: BehaviorEmailContext): BehaviorEmail {
    const copy = BEHAVIOR_COPY[behaviorPersonaKey(ctx.persona)]
    const coach = coachDisplayName(ctx)
    const brand = brandDisplayName(ctx)
    const noun = copy.noun.singular
    const primer = copy.masculine ? 'primer' : 'primera'
    const listo = copy.masculine ? 'listo' : 'lista'
    const lo = copy.masculine ? 'lo' : 'la'
    const Lo = copy.masculine ? 'Lo' : 'La'

    switch (key) {
        // ── Día 1: la app existe y falta el primer alumno. CTA = alta directa, nunca `/join`. ──
        case 'behavior_no_client_2h': {
            const url = `${ctx.baseUrl}/coach/clients?invite=1`
            const label = `Dar de alta a mi primer ${noun}`
            return assemble(key, {
                subject: `${coach}, invita a tu primer ${noun}`,
                preheader: 'Le creas la cuenta en un minuto y le mandas el acceso por WhatsApp.',
                html: `${progress([true, true, false], ['Tu cuenta', 'Tu app', `Tu primer ${noun}`])}
${heading(`Tu app está lista. Falta tu primer ${escHtml(noun)}.`)}
${appPreview(ctx, copy, brand)}
${paragraph(`Le creas la cuenta en un minuto con su nombre y su teléfono. Al final, EVA te deja el mensaje con su acceso listo para mandárselo por WhatsApp, y entra directo a <strong>${escHtml(brand)}</strong>.`)}
${cta(label, url)}
${small('Consejo: empieza por alguien que ya entrenas hoy. Es quien más rápido la va a usar.')}`,
                text: [
                    `${coach}, tu app está lista. Falta tu primer ${noun}.`,
                    '',
                    'Le creas la cuenta en un minuto con su nombre y su teléfono. Al final, EVA te deja el mensaje con su acceso listo para mandárselo por WhatsApp.',
                    '',
                    `${label}: ${url}`,
                ],
            })
        }

        // ── Día 3, solo si no armó su primera rutina/pauta: que el alumno no entre a una app vacía. ──
        case 'behavior_no_return_24h': {
            const url = `${ctx.baseUrl}/coach/guia`
            const label = `Árma${lo} desde mi guía`
            const steps: Array<[string, string]> = [
                [`Arma ${copy.quickWin}`, 'Toma unos 5 minutos.'],
                [`Guárda${lo} como plantilla`, `${Lo} reusas con cada ${noun} nuevo.`],
                [`Asígna${lo} cuando entre`, 'Un toque desde su ficha.'],
            ]
            return assemble(key, {
                subject: `${coach}, deja ${listo} su ${primer} ${copy.artifact}`,
                preheader: '5 minutos hoy, y cuando entre ya tiene qué hacer.',
                html: `${progress([true, false, false], ['Tu cuenta', `Su ${copy.artifact}`, `Tu primer ${noun}`])}
${heading(`Que tu ${escHtml(noun)} entre y encuentre su ${escHtml(copy.artifact)}`)}
${paragraph(`Así, el día que tu ${escHtml(noun)} entre ya tiene qué hacer, en vez de encontrar la app vacía.`)}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
${steps
    .map(
        ([title, sub], i) =>
            `<tr><td width="34" valign="top" style="padding:0 12px 14px 0;"><div style="width:28px;height:28px;border-radius:14px;background:#ecfdf5;color:${BEHAVIOR_CTA_GREEN};font-weight:800;font-size:14px;text-align:center;line-height:28px;">${i + 1}</div></td><td valign="top" style="padding-bottom:14px;"><div style="font-size:15px;font-weight:700;color:#111827;">${escHtml(title)}</div><div style="font-size:14px;color:#6b7280;">${escHtml(sub)}</div></td></tr>`
    )
    .join('\n')}
</table>
${cta(label, url)}`,
                text: [
                    `${coach}: que tu ${noun} entre y encuentre su ${copy.artifact}.`,
                    '',
                    ...steps.map(([title], i) => `${i + 1}. ${title}.`),
                    '',
                    `${label}: ${url}`,
                ],
            })
        }

        // ── +48 h: el coach hizo su parte; el trabajo está trabado del otro lado ──
        case 'behavior_client_not_entered_48h': {
            // Con el alumno conocido, el botón abre SU ficha, donde «Reenviarle el acceso» está arriba
            // (plan B «Activación»). Sin él, el listado y el camino por las opciones.
            const url = ctx.pendingClientId
                ? `${ctx.baseUrl}/coach/clients/${encodeURIComponent(ctx.pendingClientId)}`
                : `${ctx.baseUrl}/coach/clients`
            const label = 'Reenviarle el acceso'
            const how = ctx.pendingClientId
                ? 'En su ficha, «Reenviarle el acceso» te deja el acceso nuevo listo para mandárselo por WhatsApp.'
                : 'En «Alumnos», abre sus opciones y toca «Resetear contraseña»: te queda el acceso nuevo listo para mandárselo por WhatsApp.'
            return assemble(key, {
                subject: `Tu ${noun} aún no entra a ${brand}`,
                preheader: 'Reenvíale el acceso en un minuto.',
                html: `${progress([true, true, false], ['Tu app', 'Lo invitaste', 'Que entre'])}
${heading(`Tu ${escHtml(noun)} todavía no entra`)}
${paragraph(`Le creaste la cuenta hace 2 días y aún no abre <strong>${escHtml(brand)}</strong>. Casi siempre el mensaje quedó abajo en el chat: un recordatorio corto lo resuelve.`)}
${cta(label, url)}
${small(`${how} Cuando entre, lo vas a ver en tu panel con la fecha de su primer ingreso.`)}`,
                text: [
                    `Tu ${noun} todavía no entra a ${brand}.`,
                    '',
                    'Le creaste la cuenta hace 2 días. Casi siempre el mensaje quedó abajo en el chat.',
                    '',
                    how,
                    '',
                    `${label}: ${url}`,
                ],
            })
        }

        // ── Aha: pasó de verdad. Felicitación única, sin vender nada. ──
        case 'behavior_aha': {
            const url = `${ctx.baseUrl}/coach/clients`
            const label = 'Ver su avance'
            const tips = [
                'Mira su registro una vez por semana.',
                `Ajusta su ${copy.artifact} si hace falta.`,
                'Déjale un comentario: es lo que más valoran.',
            ]
            // «en eva-app.cl» y no «en tu panel»: en la app de iPhone no puede haber nada de pago.
            const freeLine = `Tu plan Gratis incluye 1 ${noun}. Cuando quieras sumar al segundo, ves las opciones en eva-app.cl.`
            return assemble(key, {
                subject: `${coach}, tu ${noun} ya está usando ${brand}`,
                preheader: 'Lo que conviene hacer esta semana.',
                html: `${progress([true, true, true], ['Tu app', 'Lo invitaste', 'Ya la usa'])}
${heading(`Tu ${escHtml(noun)} ya está adentro`)}
${paragraph(`Registró lo que hizo en <strong>${escHtml(brand)}</strong>. Desde ahora ves su semana completa sin tener que preguntar.`)}
${paragraph('<strong>Para que siga usándola:</strong>')}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:-6px 0 18px;">${tips
                    .map(
                        (tip) =>
                            `<tr><td width="22" valign="top" style="color:#10B981;font-weight:800;padding-bottom:8px;">&#10003;</td><td style="font-size:15px;color:#374151;padding-bottom:8px;">${escHtml(tip)}</td></tr>`
                    )
                    .join('')}</table>
${cta(label, url)}
${ctx.isFree ? small(escHtml(freeLine)) : ''}`,
                text: [
                    `${coach}, tu ${noun} ya está usando ${brand}.`,
                    '',
                    'Para que siga usándola: mira su registro una vez por semana, ajusta lo que haga falta y déjale un comentario.',
                    '',
                    `${label}: ${url}`,
                    ...(ctx.isFree ? ['', freeLine] : []),
                ],
            })
        }

        // ── +7 d sin activar: último toque, con el equipo del otro lado ──
        case 'behavior_help_7d': {
            const base = ctx.ownerWhatsappUrl?.trim() || null
            const wa = base
                ? `${base}?text=${encodeURIComponent(`Hola, soy ${coach} de ${brand}. Necesito ayuda para partir con EVA.`)}`
                : null
            const guide = `${ctx.baseUrl}/coach/guia`
            return assemble(key, {
                subject: `${coach}, ¿te ayudamos a partir?`,
                preheader: 'Te respondemos por WhatsApp o por correo.',
                html: `${paragraph(`Hola ${escHtml(coach)}:`)}
${paragraph(`Creaste <strong>${escHtml(brand)}</strong> hace una semana y todavía ningún ${escHtml(noun)} la está usando. Puede que no fuera el momento, y está bien.`)}
${paragraph('Si algo no te cuadró o te trabaste en un paso, cuéntanos y lo vemos contigo por WhatsApp.')}
${wa ? whatsappButton('Escribirnos por WhatsApp', wa) : cta('Volver a mi guía', guide)}
${small(wa ? 'O responde este correo, también nos llega.' : 'O responde este correo y lo vemos contigo.')}
${small('Este es el último correo de esta serie.')}`,
                text: [
                    `Hola ${coach}:`,
                    '',
                    `Creaste ${brand} hace una semana y todavía ningún ${noun} la está usando. Puede que no fuera el momento, y está bien.`,
                    '',
                    'Si algo no te cuadró, cuéntanos y lo vemos contigo por WhatsApp.',
                    '',
                    wa ? `Escribirnos por WhatsApp: ${wa}` : `Volver a mi guía: ${guide}`,
                    '',
                    'O responde este correo. Este es el último de esta serie.',
                ],
            })
        }
    }
}
