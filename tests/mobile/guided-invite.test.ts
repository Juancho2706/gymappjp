/**
 * Alta guiada del paso 4 en RN («Invita a tu primer {alumno}») — parte PURA
 * (`apps/mobile/components/coach/directory/guided-invite.ts`).
 *
 * Lo que se pinnea es el CONTRATO de producto que el componente no puede decidir solo: el texto por
 * canal y por persona, la nota de cupo que solo aparece cuando es verdad, el orden de los 3 pasos y
 * la forma de la clave temporal. El módulo no importa react-native, así que corre con el runner de
 * la raíz aunque viva en `apps/mobile`.
 */
import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS } from '@eva/onboarding'
import { PERSONAS, personaNoun } from '@eva/schemas'
import {
  GUIDED_INVITE_CHANNELS,
  GUIDED_STEP_COUNT,
  channelCarriesCredential,
  generateGuidedTempPassword,
  guidedAhaNote,
  guidedCapNote,
  guidedChannelCopy,
  guidedFormHint,
  guidedInviteMessage,
  guidedInvitePayload,
  guidedPreviewTitle,
  guidedStepLabel,
  guidedTitle,
  hasShareableLink,
  isCoachOwnEmail,
  isSubscriptionTier,
  nextGuidedStep,
  selfInviteNote,
  SELF_INVITE_BLOCKED_ES,
  shouldEmitInviteSent,
  type GuidedInviteChannel,
} from '../../apps/mobile/components/coach/directory/guided-invite'

const LINK = 'https://www.eva-app.cl/c/QAEMB/login'
const CORREO = 'ana@correo.com'
const CLAVE = 'Eva123456!'
/** Teléfono chileno completo: 11 dígitos, el destino con nombre de `wa.me/<digits>`. */
const TELEFONO = '+56 9 1234 5678'

describe('indicador de pasos', () => {
  it('nombra el paso y el total sin escribirlos a mano', () => {
    expect(guidedStepLabel(1)).toBe('Paso 1 de 3 · Datos')
    expect(guidedStepLabel(2)).toBe('Paso 2 de 3 · Cómo le llega')
    expect(guidedStepLabel(3)).toBe('Paso 3 de 3 · Así la ve')
    expect(GUIDED_STEP_COUNT).toBe(3)
  })
})

describe('canales del paso 2', () => {
  it('WhatsApp va primero: es el canal real de los coaches en LATAM', () => {
    expect(GUIDED_INVITE_CHANNELS[0]).toBe('whatsapp')
    expect(guidedChannelCopy('strength').map((c) => c.id)).toEqual([...GUIDED_INVITE_CHANNELS])
  })

  it('habla con el sustantivo de la persona', () => {
    const nutrition = guidedChannelCopy('nutrition').find((c) => c.id === 'link')
    const endurance = guidedChannelCopy('endurance').find((c) => c.id === 'link')
    expect(nutrition?.body).toContain('paciente')
    expect(endurance?.body).toContain('atleta')
  })

  it('sin persona cae al vocabulario neutro, nunca a un texto roto', () => {
    const neutral = guidedChannelCopy(null).find((c) => c.id === 'link')
    expect(neutral?.body).toContain('alumno')
    expect(neutral?.body).not.toContain('undefined')
  })
})

describe('mensaje de la invitación', () => {
  it('usa la plantilla de la persona y jamás menciona a EVA (white-label)', () => {
    for (const persona of PERSONAS) {
      const msg = guidedInviteMessage({ persona, clientName: 'Ana', loginUrl: LINK })
      expect(msg).toContain(LINK)
      expect(msg).not.toMatch(/\bEVA\b/)
    }
  })

  it('con correo y clave lleva el bloque de acceso completo (SPEC §6, variante CON teléfono)', () => {
    const msg = guidedInviteMessage({
      persona: 'strength',
      clientName: 'Ana',
      loginUrl: LINK,
      email: CORREO,
      tempPassword: CLAVE,
    })
    expect(msg).toBe(
      'Hola Ana, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.\n' +
        `Entra acá: ${LINK}\n` +
        `Tu usuario: ${CORREO}\n` +
        `Tu clave temporal: ${CLAVE} — la cambias apenas entres.`,
    )
  })
})

/**
 * Regla 4 de `docs/specs/flujo-coach-nuevo/SPEC.md §5`: **una credencial nunca viaja a un
 * destinatario sin nombre.** Es la regla que el componente no puede decidir a mano —un `if` suyo
 * mal escrito manda la clave de un alumno al chat equivocado, con datos de salud de un tercero
 * adentro (Ley 21.719)—, así que vive en `guidedInvitePayload` y se pinnea acá.
 */
describe('credencial por canal (regla 4 de SPEC §5)', () => {
  const invitado = { persona: 'strength' as const, clientName: 'Ana', loginUrl: LINK, email: CORREO, tempPassword: CLAVE }

  it('WhatsApp CON teléfono es el único destino con nombre: ahí sí va la credencial', () => {
    expect(channelCarriesCredential('whatsapp', TELEFONO)).toBe(true)
    const payload = guidedInvitePayload({ channel: 'whatsapp', phone: TELEFONO, ...invitado })
    expect(payload.withCredential).toBe(true)
    expect(payload.message).toContain(LINK)
    expect(payload.message).toContain(CORREO)
    expect(payload.message).toContain(CLAVE)
    // El destino queda `wa.me/<digits>`: esa persona y nadie más.
    expect(payload.whatsappUrl?.startsWith('https://wa.me/56912345678?text=')).toBe(true)
  })

  it('WhatsApp SIN teléfono cae en el selector de contactos ⇒ mensaje sin clave', () => {
    for (const phone of [undefined, null, '', '   ', '123']) {
      expect(channelCarriesCredential('whatsapp', phone)).toBe(false)
      const payload = guidedInvitePayload({ channel: 'whatsapp', phone, ...invitado })
      expect(payload.withCredential).toBe(false)
      expect(payload.message).toContain(LINK)
      expect(payload.message).not.toContain(CLAVE)
      expect(payload.message).toContain('te mandé tu clave al correo')
    }
    // `wa.me/?text=` sin dígitos: exactamente el caso que la regla 4 obliga a mandar sin credencial.
    const sinNumero = guidedInvitePayload({ channel: 'whatsapp', phone: null, ...invitado })
    expect(sinNumero.whatsappUrl?.startsWith('https://wa.me/?text=')).toBe(true)
  })

  it('compartir y copiar el link van SIN credencial aunque haya teléfono', () => {
    // La hoja del sistema elige destinatario DESPUÉS de escribir el texto, y el portapapeles se
    // pega donde sea: en los dos casos el mensaje ya salió antes de saber a quién le habla.
    for (const channel of ['share', 'link'] as const) {
      expect(channelCarriesCredential(channel, TELEFONO)).toBe(false)
      const payload = guidedInvitePayload({ channel, phone: TELEFONO, ...invitado })
      expect(payload.withCredential).toBe(false)
      expect(payload.message).toContain(LINK)
      expect(payload.message).not.toContain(CLAVE)
      expect(payload.message).not.toContain(CORREO)
      // Solo el canal WhatsApp arma URL: los otros dos no tienen dónde meterla.
      expect(payload.whatsappUrl).toBeNull()
    }
  })

  it('sin credencial que mandar, WhatsApp con teléfono igual manda el link', () => {
    // El canal la permitiría, pero no hay nada que mandar (respuesta vieja del alta, clave todavía
    // sin generar): el flag dice `false` porque el texto tampoco la lleva.
    for (const credencial of [{}, { email: CORREO }, { tempPassword: CLAVE }]) {
      const payload = guidedInvitePayload({
        channel: 'whatsapp',
        phone: TELEFONO,
        persona: 'nutrition',
        clientName: 'Ana',
        loginUrl: LINK,
        ...credencial,
      })
      expect(channelCarriesCredential('whatsapp', TELEFONO)).toBe(true)
      expect(payload.withCredential).toBe(false)
      expect(payload.message).toContain(LINK)
      expect(payload.message).not.toContain(CLAVE)
      expect(payload.message).not.toContain('undefined')
    }
  })

  it('el mensaje entero va codificado: la URL no arrastra saltos de línea ni espacios crudos', () => {
    const { whatsappUrl, message } = guidedInvitePayload({ channel: 'whatsapp', phone: TELEFONO, ...invitado })
    expect(message).toContain('\n')
    expect(whatsappUrl).not.toMatch(/[\s\n]/)
    expect(decodeURIComponent((whatsappUrl ?? '').split('?text=')[1] ?? '')).toBe(message)
  })
})

describe('nota de cupo del paso 1', () => {
  it('en Free con demo dice que el alumno de ejemplo no ocupa cupo', () => {
    const note = guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: 'Matías' })
    expect(note).toBe(
      'Tu plan incluye 1 alumno real con tu marca; tu alumno de ejemplo (Matías) no ocupa ese cupo.',
    )
  })

  it('el sujeto es «tu {alumno} de ejemplo», nunca el nombre suelto (QA del owner 22-08)', () => {
    // El owner leyó «…; Matías no ocupa ese cupo» y preguntó «¿siempre es Matías?». La nota habla
    // del CONCEPTO; el nombre queda entre paréntesis, como apoyo para reconocerlo en la lista.
    for (const persona of PERSONAS) {
      const note = guidedCapNote({ tier: 'free', maxClients: 1, persona, demoName: 'Matías' })
      expect(note).toContain(`tu ${personaNoun(persona)} de ejemplo (Matías)`)
      expect(note).not.toMatch(/;\s*Matías\b/)
    }
  })

  it('concuerda el plural con el cupo y con la persona, pero el demo siempre es UNO', () => {
    expect(guidedCapNote({ tier: 'free', maxClients: 2, persona: 'nutrition', demoName: 'Ana' })).toBe(
      'Tu plan incluye 2 pacientes reales con tu marca; tu paciente de ejemplo (Ana) no ocupa ese cupo.',
    )
  })

  it('la persona «other» cae al vocabulario neutro sin romper la frase', () => {
    expect(guidedCapNote({ tier: 'free', maxClients: 1, persona: 'other', demoName: 'Pedro' })).toBe(
      'Tu plan incluye 1 alumno real con tu marca; tu alumno de ejemplo (Pedro) no ocupa ese cupo.',
    )
  })

  it('no inventa nada: sin demo, fuera de Free o sin cupo utilizable no hay nota', () => {
    // Sin demo sembrado no existe «tu alumno de ejemplo»: la nota entera se calla, no se degrada
    // a una frase genérica sobre un alumno que el coach no tiene.
    expect(guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: null })).toBeNull()
    expect(guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: '   ' })).toBeNull()
    expect(guidedCapNote({ tier: 'free', maxClients: 1, persona: 'other', demoName: null })).toBeNull()
    expect(guidedCapNote({ tier: 'pro', maxClients: 25, persona: 'strength', demoName: 'Matías' })).toBeNull()
    expect(guidedCapNote({ tier: 'free', maxClients: 0, persona: 'strength', demoName: 'Matías' })).toBeNull()
    expect(guidedCapNote({ tier: null, maxClients: null, persona: null, demoName: 'Matías' })).toBeNull()
  })
})

describe('nota de auto-alta', () => {
  it('manda a «Vive tu app» con el sustantivo de la persona, sin nombrar el plan', () => {
    for (const persona of PERSONAS) {
      const note = selfInviteNote(personaNoun(persona), { showsCupo: false })
      expect(note).toContain('Vive tu app')
      expect(note).toContain(personaNoun(persona))
      expect(note).not.toContain('undefined')
    }
  })

  it('el remate del cupo aparece SOLO cuando corresponde (Free standalone con demo)', () => {
    expect(selfInviteNote('alumno', { showsCupo: true })).toContain('No gasta cupo.')
    expect(selfInviteNote('alumno', { showsCupo: false })).not.toContain('cupo')
  })

  it('es independiente de guidedCapNote: ninguna repite a la otra palabra por palabra', () => {
    const cap = guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: 'Matías' })
    const self = selfInviteNote('alumno', { showsCupo: true })
    expect(cap).not.toBeNull()
    expect(self).not.toBe(cap)
    // La nota de auto-alta nunca nombra al alumno de ejemplo por su nombre: habla del camino.
    expect(self).not.toContain('Matías')
  })

  it('el copy de tiendas se respeta: sin «plan», sin «eva-app.cl», sin precios', () => {
    const textos = [
      selfInviteNote('paciente', { showsCupo: true }),
      selfInviteNote('atleta', { showsCupo: false }),
      SELF_INVITE_BLOCKED_ES,
    ]
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain('plan')
      expect(texto.toLowerCase()).not.toContain('eva-app.cl')
      expect(texto).not.toMatch(/\$|\/mes/)
    }
  })

  it('el correo propio se detecta con la misma comparación que hace el servidor', () => {
    expect(isCoachOwnEmail(' JP@Correo.com ', 'jp@correo.com')).toBe(true)
    expect(isCoachOwnEmail('ana@correo.com', 'jp@correo.com')).toBe(false)
    // Sin sesión cargada nada se bloquea: es una cortesía, no una autorización.
    expect(isCoachOwnEmail('jp@correo.com', null)).toBe(false)
    expect(isCoachOwnEmail('jp@correo.com', '   ')).toBe(false)
    expect(isCoachOwnEmail('', '')).toBe(false)
  })
})

describe('copy del paso 3', () => {
  it('la promesa del paso 5 sale de la guía compartida, no de un texto propio', () => {
    for (const persona of PERSONAS) {
      const aha = ONBOARDING_STEPS[persona].find((step) => step.key === 'aha')
      const note = guidedAhaNote(persona, 'Ana')
      expect(note).toContain('Cuando Ana entre por primera vez')
      expect(note).toContain(aha?.label ?? '')
      expect(note).toContain('paso 5')
    }
  })

  it('sin nombre no deja un título colgando', () => {
    expect(guidedPreviewTitle('  ')).toBe('Así la ve tu alumno')
    expect(guidedPreviewTitle('Ana')).toBe('Así la ve Ana')
    expect(guidedAhaNote('nutrition', '  ')).toContain(`Cuando ${personaNoun('nutrition')} entre`)
  })
})

describe('título y bajada del paso 1', () => {
  it('espejan el vocabulario del stepper web', () => {
    expect(guidedTitle('endurance')).toBe('Suma tu primer atleta')
    expect(guidedFormHint('rehab')).toBe(
      'Con el nombre y el correo alcanza: el resto lo completa tu paciente al entrar.',
    )
  })
})

describe('orden de los pasos', () => {
  it('crear la cuenta lleva al paso 2 y elegir canal al paso 3', () => {
    expect(nextGuidedStep(1, 'created')).toBe(2)
    expect(nextGuidedStep(2, 'channel_chosen')).toBe(3)
  })

  it('nunca retrocede ni salta pasos con un evento fuera de orden', () => {
    expect(nextGuidedStep(2, 'created')).toBe(2)
    expect(nextGuidedStep(3, 'created')).toBe(3)
    expect(nextGuidedStep(1, 'channel_chosen')).toBe(1)
    expect(nextGuidedStep(3, 'channel_chosen')).toBe(3)
  })
})

describe('clave temporal generada', () => {
  it('pasa el mínimo del schema y no es un PIN pelado (protección de contraseñas filtradas)', () => {
    for (let i = 0; i < 25; i += 1) {
      const password = generateGuidedTempPassword()
      expect(password).toMatch(/^Eva\d{6}!$/)
      expect(password.length).toBeGreaterThanOrEqual(8)
    }
  })
})

describe('link compartible', () => {
  it('sin link no se ofrece ningún canal', () => {
    expect(hasShareableLink(LINK)).toBe(true)
    expect(hasShareableLink(null)).toBe(false)
    expect(hasShareableLink(undefined)).toBe(false)
    expect(hasShareableLink('   ')).toBe(false)
  })
})

describe('invite_sent: una vez por canal elegido', () => {
  it('el primer toque de un canal emite; los siguientes del MISMO canal no', () => {
    expect(shouldEmitInviteSent([], 'link')).toBe(true)
    expect(shouldEmitInviteSent(['link'], 'link')).toBe(false)
    expect(shouldEmitInviteSent(['link', 'whatsapp'], 'link')).toBe(false)
  })

  it('cada canal distinto sí cuenta: la métrica compara canales, no toques', () => {
    expect(shouldEmitInviteSent(['link'], 'whatsapp')).toBe(true)
    expect(shouldEmitInviteSent(['link'], 'share')).toBe(true)
    expect(shouldEmitInviteSent(['link', 'whatsapp', 'share'], 'share')).toBe(false)
  })

  it('simula la sesión completa: N toques de N canales ⇒ N eventos, no más', () => {
    const toques: GuidedInviteChannel[] = ['link', 'link', 'link', 'whatsapp', 'link', 'whatsapp']
    const emitidos: GuidedInviteChannel[] = []
    for (const canal of toques) {
      if (!shouldEmitInviteSent(emitidos, canal)) continue
      emitidos.push(canal)
    }
    expect(emitidos).toEqual(['link', 'whatsapp'])
  })
})

describe('guarda de tipo del tier (sello «Hecho con EVA»)', () => {
  it('acepta los tiers reales, incluidos los legacy vivos en runtime', () => {
    for (const tier of ['free', 'starter', 'pro', 'elite', 'growth', 'scale']) {
      expect(isSubscriptionTier(tier)).toBe(true)
    }
  })

  it('rechaza lo que el servidor podría mandar sin ser un tier', () => {
    expect(isSubscriptionTier(null)).toBe(false)
    expect(isSubscriptionTier(undefined)).toBe(false)
    expect(isSubscriptionTier('')).toBe(false)
    expect(isSubscriptionTier('FREE')).toBe(false)
    expect(isSubscriptionTier('enterprise')).toBe(false)
    expect(isSubscriptionTier(3)).toBe(false)
  })
})
