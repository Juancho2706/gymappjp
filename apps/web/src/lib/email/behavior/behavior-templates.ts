import { PERSONA_COPY, type Persona } from '@eva/schemas'
import { wrapEmailLayout, ctaButton, divider, badge } from '../base-layout'
import type { BehaviorTemplateKey } from './behavior-triggers'

/**
 * Plantillas de los «correos por comportamiento» (W6 / F6.2), UNA por señal y POR PERSONA.
 *
 * Reglas de contenido (heredadas de `drip-templates.ts` y `checkout-abandoned-template.ts`):
 * - Español latam neutro CON tildes, corto, sin marketing agresivo ni promesas que no sostenemos.
 * - CERO precios: el precio vive en `/coach/subscription`, que es la única fuente viva.
 * - UN solo CTA. El link de invitación (`/join/{código}`) NO es un CTA: viaja dentro del bloque
 *   de WhatsApp, que es texto para COPIAR, no para que lo toque el coach.
 * - Sin `brand`: es un correo de EVA AL COACH, jamás white-label (igual que el drip).
 * - Pie «Enviado por EVA» + la salida en texto plano (Ley 19.496 art. 28 B: es correo que EVA
 *   inicia sola, no una respuesta).
 *
 * RAMA «SIN PERSONA» (W8.4.4): `persona = null` es un caso de primera clase, no un fallback
 * accidental. 48 de 51 coaches del padrón no tienen persona escrita, así que la rama sin
 * especialidad es la MÁS usada de todas: habla de «tu primer alumno» y de «tu primer plan», sin
 * inventar una especialidad que el coach no eligió.
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
    persona: Persona | null
    /** `coaches.invite_code`. `null` ⇒ el correo sale sin el bloque de WhatsApp. */
    inviteCode: string | null
    /** `siteBaseUrl()`. Producción como fallback: un correo con `localhost` es un correo perdido. */
    baseUrl: string
    /**
     * WhatsApp del owner para el correo de +7 d (D13). Llega por `OWNER_WHATSAPP_URL`; mientras el
     * owner no fije el número el correo NO inventa uno: cae al «responde este correo», que es una
     * puerta real, y el CTA vuelve a la guía.
     */
    ownerWhatsappUrl?: string | null
}

export interface BehaviorEmail {
    key: BehaviorTemplateKey
    subject: string
    /** Cuerpo en texto plano — el mismo mensaje, sin HTML. Lo pinnean los tests del copy. */
    text: string
    html: string
}

/**
 * Pie de TODOS los correos de comportamiento. Texto plano a propósito: el único `<a>` del correo ya
 * lo gasta el CTA.
 *
 * NO repite «Enviado por EVA»: esa línea la pone `wrapEmailLayout` sola (el `senderLine` del footer
 * identifica al remitente real del dominio en todos los correos). Acá va solo la salida, que la Ley
 * 19.496 art. 28 B exige porque esta es una serie que EVA inicia sola, no una respuesta.
 */
export const BEHAVIOR_FOOTER =
    'Recibes este correo porque creaste tu cuenta de coach en EVA. Si no quieres recibirlos, responde este mensaje y los cortamos.'

/** Firma del remitente en la versión de TEXTO (en el HTML ya la pone `wrapEmailLayout`). */
const BEHAVIOR_TEXT_SIGNATURE = 'Enviado por EVA Fitness Platform.'

/** Escapa texto controlado por el coach (nombre, marca) antes de interpolarlo en el HTML. */
function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface PersonaBehaviorCopy {
    /** Cómo se llama a la gente que atiende. Espejo de `PERSONA_COPY[...].noun`. */
    noun: { singular: string; plural: string }
    /** El artefacto que el coach le deja: «rutina», «pauta», «semana de entrenamiento»… */
    artifact: string
    /** Qué puede hacer en 5 minutos (correo de +24 h, SPEC §8 fila 2). Concreto, no genérico. */
    quickWin: string
    /** Frase del mensaje reenviable: qué va a encontrar el alumno adentro. */
    whatsappPromise: string
}

/**
 * Copy por rama. `noun` se copia de `PERSONA_COPY` (una sola fuente del vocabulario, con test
 * cruzado que falla si se desincronizan); lo demás es propio de los correos.
 */
const BEHAVIOR_COPY: Record<BehaviorPersonaKey, PersonaBehaviorCopy> = {
    strength: {
        noun: PERSONA_COPY.strength.noun,
        artifact: 'rutina',
        quickWin: 'armar una rutina de 3 días en el constructor y dejarla asignada',
        whatsappPromise: 'ahí te dejo tu rutina y vamos siguiendo tus avances',
    },
    nutrition: {
        noun: PERSONA_COPY.nutrition.noun,
        artifact: 'pauta',
        quickWin: 'armar una pauta con sus porciones e intercambios y dejarla guardada como plantilla',
        whatsappPromise: 'ahí te dejo tu pauta y vamos siguiendo cómo te va',
    },
    rehab: {
        noun: PERSONA_COPY.rehab.noun,
        artifact: 'pauta de ejercicios',
        quickWin: 'hacer un screening de movimiento y dejar la pauta que sale de ahí',
        whatsappPromise: 'ahí te dejo tus ejercicios y vamos registrando cómo avanzas',
    },
    endurance: {
        noun: PERSONA_COPY.endurance.noun,
        artifact: 'semana de entrenamiento',
        quickWin: 'calcular sus zonas y dejar armada la primera semana',
        whatsappPromise: 'ahí te dejo tus zonas, tus ritmos y la semana de entrenamiento',
    },
    other: {
        noun: PERSONA_COPY.other.noun,
        artifact: 'plan',
        quickWin: 'armar su primer plan y dejarlo asignado',
        whatsappPromise: 'ahí te dejo tu plan y vamos siguiendo tus avances',
    },
    sin_persona: {
        // Sin especialidad elegida se usa el vocabulario neutro de `other`: «alumno».
        noun: PERSONA_COPY.other.noun,
        artifact: 'plan',
        quickWin: 'armar su primer plan y dejarlo asignado',
        whatsappPromise: 'ahí te dejo tu plan y vamos siguiendo tus avances',
    },
}

function coachDisplayName(ctx: BehaviorEmailContext): string {
    return ctx.coachName?.trim().split(' ')[0] || 'Coach'
}

/** Fallback «tu app», NO «tu marca»: el coach sin `brand_name` todavía no eligió una (ver el drip). */
function brandDisplayName(ctx: BehaviorEmailContext): string {
    return ctx.brandName?.trim() || 'tu app'
}

/** Link público del coach para que su alumno entre. `null` sin código de invitación. */
export function joinUrl(ctx: BehaviorEmailContext): string | null {
    return ctx.inviteCode ? `${ctx.baseUrl}/join/${ctx.inviteCode}` : null
}

/**
 * El mensaje que el coach COPIA y le manda a su alumno por WhatsApp. Va en texto plano: es para
 * pegar en otra app, no para leer.
 *
 * No reusa `formatWhatsappInvite` de `@eva/schemas` a propósito: esa plantilla es del alta DIRECTA
 * (el coach le crea la cuenta y le manda usuario y clave) y su variante sin credencial dice «te
 * mandé tu clave al correo». Acá el link es `/join/{código}`, donde el alumno se registra solo: no
 * hay clave que mandarle y decir que sí la hay sería falso.
 */
export function buildWhatsappForwardText(ctx: BehaviorEmailContext): string | null {
    const url = joinUrl(ctx)
    if (!url) return null
    const copy = BEHAVIOR_COPY[behaviorPersonaKey(ctx.persona)]
    const brand = brandDisplayName(ctx)
    return `Hola, te invité a ${brand}: ${copy.whatsappPromise}. Entra acá y creas tu cuenta: ${url}`
}

/** Bloque HTML del mensaje reenviable. Sin `<a>`: es texto para copiar, no un link para tocar. */
function whatsappBlock(ctx: BehaviorEmailContext, intro: string): string {
    const message = buildWhatsappForwardText(ctx)
    if (!message) return ''
    return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#065f46;">${escHtml(intro)}</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escHtml(message)}</p>
    </td>
  </tr>
</table>`
}

function paragraph(text: string): string {
    return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${text}</p>`
}

function heading(text: string): string {
    return `<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">${text}</h1>`
}

interface BuiltBody {
    subject: string
    badgeLabel: string
    previewText: string
    headerTitle: string
    /** Cuerpo del correo en texto plano, sin el pie (lo agrega `assemble`). */
    text: string
    /** Cuerpo HTML sin el CTA (lo agrega `assemble`). */
    html: string
    cta: { label: string; url: string }
}

/**
 * Arma el correo final. El CTA y el pie se agregan acá para que ninguna rama pueda olvidarse del
 * pie legal ni meter un segundo botón.
 */
function assemble(key: BehaviorTemplateKey, built: BuiltBody): BehaviorEmail {
    const html = wrapEmailLayout(
        `${badge(built.badgeLabel)}
${built.html}
<div style="margin:8px 0 12px;">${ctaButton(`${built.cta.label} →`, built.cta.url)}</div>`,
        {
            previewText: built.previewText,
            headerTitle: built.headerTitle,
            footerText: BEHAVIOR_FOOTER,
        }
    )
    return {
        key,
        subject: built.subject,
        text: `${built.text}\n\n${built.cta.label}: ${built.cta.url}\n\n${BEHAVIOR_TEXT_SIGNATURE}\n${BEHAVIOR_FOOTER}`,
        html,
    }
}

export function buildBehaviorEmail(key: BehaviorTemplateKey, ctx: BehaviorEmailContext): BehaviorEmail {
    const copy = BEHAVIOR_COPY[behaviorPersonaKey(ctx.persona)]
    const coach = coachDisplayName(ctx)
    const brand = brandDisplayName(ctx)
    const noun = copy.noun.singular
    const forward = buildWhatsappForwardText(ctx)

    switch (key) {
        // ── +2 h: la cuenta existe, la marca está, y todavía no hay nadie adentro ──
        case 'behavior_no_client_2h': {
            const text = [
                // «tu marca» NO se escribe nunca: el coach sin `brand_name` todavía no eligió una,
                // y `brand` ya cae a «tu app». Lo que sí tiene desde el minuto cero son su nombre
                // y sus colores.
                `${coach}: ${brand} ya está lista con tu nombre y tus colores.`,
                '',
                `Lo único que falta es tu primer ${noun}. Le creas la cuenta desde tu panel en menos de un minuto, o le pasas tu link y se registra solo.`,
                forward ? `\nMensaje listo para mandarle por WhatsApp:\n${forward}` : '',
            ]
                .filter(Boolean)
                .join('\n')
            return assemble(key, {
                subject: `${coach}, tu app ya está lista — falta tu primer ${noun}`,
                badgeLabel: 'Tu app ya está lista',
                previewText: `Invita a tu primer ${noun}: el mensaje ya está escrito.`,
                headerTitle: 'Tu app ya está lista — EVA',
                text,
                html: `${heading(`${escHtml(coach)}, ${escHtml(brand)} ya está lista`)}
${paragraph(`Está armada con tu nombre y tus colores. Lo único que falta es tu primer <strong>${escHtml(noun)}</strong>.`)}
${whatsappBlock(ctx, 'Este mensaje ya está escrito: cópialo y mándaselo')}
${paragraph(`Si prefieres, le creas la cuenta tú desde tu panel y le llega su acceso listo. Toma menos de un minuto.`)}`,
                cta: { label: `Dar de alta a mi primer ${noun}`, url: `${ctx.baseUrl}/coach/clients?invite=1` },
            })
        }

        // ── +24 h: qué puede hacer en 5 minutos, concreto y por especialidad ──
        case 'behavior_no_return_24h': {
            const text = [
                `${coach}: si tienes 5 minutos, esto es lo que rinde más.`,
                '',
                `Puedes ${copy.quickWin}. Queda guardado y lo reusas con cada ${noun} nuevo.`,
                '',
                `Está todo en tu guía: son pasos cortos y puedes dejarlos a medias.`,
            ].join('\n')
            return assemble(key, {
                subject: `${coach}, algo que puedes dejar listo en 5 minutos`,
                badgeLabel: 'Cinco minutos',
                previewText: `${copy.quickWin.charAt(0).toUpperCase()}${copy.quickWin.slice(1)}.`,
                headerTitle: 'Tus primeros pasos — EVA',
                text,
                html: `${heading(`${escHtml(coach)}, cinco minutos y queda listo`)}
${paragraph(`Puedes <strong>${escHtml(copy.quickWin)}</strong>. Queda guardado y lo reusas con cada ${escHtml(copy.noun.singular)} nuevo.`)}
${divider()}
${paragraph('Está todo en tu guía: son pasos cortos y puedes dejarlos a medias sin perder nada.')}`,
                cta: { label: 'Abrir mi guía', url: `${ctx.baseUrl}/coach/guia` },
            })
        }

        // ── +48 h: el coach hizo su parte; el trabajo está trabado del otro lado ──
        case 'behavior_client_not_entered_48h': {
            const text = [
                `${coach}: tu ${noun} todavía no entró a ${brand}.`,
                '',
                'Casi siempre es que el mensaje quedó enterrado en el chat. Este texto está listo para reenviárselo:',
                forward ? `\n${forward}` : '\n(Tu link de invitación aparece en tu panel, en «Alumnos».)',
            ].join('\n')
            return assemble(key, {
                subject: `Tu ${noun} todavía no entró`,
                badgeLabel: 'Falta que entre',
                previewText: 'El mensaje para reenviarle ya está escrito.',
                headerTitle: 'Falta que entre — EVA',
                text,
                html: `${heading(`Tu ${escHtml(noun)} todavía no entró`)}
${paragraph(`Le creaste la cuenta en <strong>${escHtml(brand)}</strong> y del otro lado todavía no hay nadie. Casi siempre es que el mensaje quedó enterrado en el chat.`)}
${whatsappBlock(ctx, 'Reenvíale este mensaje')}
${paragraph('Cuando entre lo vas a ver en tu panel, con la fecha de su primer ingreso.')}`,
                cta: { label: `Ver a mi ${noun}`, url: `${ctx.baseUrl}/coach/clients` },
            })
        }

        // ── Aha: pasó de verdad. Felicitación única, sin vender nada. ──
        case 'behavior_aha': {
            const text = [
                `${coach}: tu ${noun} ya está usando ${brand}.`,
                '',
                'Eso es lo que hace la diferencia: cuando registra lo que hace, tú ves la semana completa sin preguntar.',
                '',
                `Así sigue la semana: revisa su registro, ajusta su ${copy.artifact} si hace falta y déjale un comentario. Eso basta.`,
            ].join('\n')
            return assemble(key, {
                subject: `${coach}, tu ${noun} ya está adentro`,
                badgeLabel: 'Ya está pasando',
                previewText: 'Así sigue la semana, sin complicarla.',
                headerTitle: 'Ya está pasando — EVA',
                text,
                html: `${heading(`${escHtml(coach)}, tu ${escHtml(noun)} ya está adentro`)}
${paragraph(`Registró lo que hizo en <strong>${escHtml(brand)}</strong>. Desde acá ves su semana completa sin tener que preguntar.`)}
${divider()}
${paragraph(`<strong>Así sigue la semana:</strong> revisa su registro, ajusta su ${escHtml(copy.artifact)} si hace falta y déjale un comentario. Con eso basta.`)}`,
                cta: { label: 'Ver su avance', url: `${ctx.baseUrl}/coach/clients` },
            })
        }

        // ── +7 d sin activar: último toque, con una persona del otro lado ──
        case 'behavior_help_7d': {
            const wa = ctx.ownerWhatsappUrl?.trim() || null
            const salida = wa
                ? 'Escríbeme por WhatsApp y lo vemos juntos, sin vueltas.'
                : 'Responde este correo y lo vemos juntos, sin vueltas.'
            const text = [
                `${coach}: pasó una semana y todavía no hay ningún ${noun} usando ${brand}.`,
                '',
                'No te vamos a escribir más por esta serie. Antes de dejarte tranquilo: si algo no te cuadró o te trabaste en un paso, quiero saberlo.',
                '',
                salida,
            ].join('\n')
            return assemble(key, {
                subject: `${coach}, ¿te ayudo con algo?`,
                badgeLabel: 'Último de la serie',
                previewText: 'Si te trabaste en algo, lo vemos juntos.',
                headerTitle: 'Último de la serie — EVA',
                text,
                html: `${heading(`${escHtml(coach)}, ¿te ayudo con algo?`)}
${paragraph(`Pasó una semana y todavía no hay ningún ${escHtml(noun)} usando <strong>${escHtml(brand)}</strong>. Puede ser que no era el momento, y está perfecto.`)}
${paragraph('Este es el último correo de la serie. Antes de dejarte tranquilo: si algo no te cuadró o te trabaste en un paso, quiero saberlo.')}
${divider()}
${paragraph(escHtml(salida))}`,
                cta: wa
                    ? { label: 'Escribirme por WhatsApp', url: wa }
                    : { label: 'Volver a mi guía', url: `${ctx.baseUrl}/coach/guia` },
            })
        }
    }
}
