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
  generateGuidedTempPassword,
  guidedAhaNote,
  guidedCapNote,
  guidedChannelCopy,
  guidedFormHint,
  guidedInviteMessage,
  guidedPreviewTitle,
  guidedStepLabel,
  guidedTitle,
  hasShareableLink,
  isSubscriptionTier,
  nextGuidedStep,
  shouldEmitInviteSent,
  type GuidedInviteChannel,
} from '../../apps/mobile/components/coach/directory/guided-invite'

const LINK = 'https://www.eva-app.cl/c/QAEMB/login'

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
})

describe('nota de cupo del paso 1', () => {
  it('en Free con demo dice que el alumno de ejemplo no ocupa cupo', () => {
    const note = guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: 'Matías' })
    expect(note).toBe('Tu plan incluye 1 alumno real con tu marca; Matías no ocupa ese cupo.')
  })

  it('concuerda el plural con el cupo y con la persona', () => {
    expect(guidedCapNote({ tier: 'free', maxClients: 2, persona: 'nutrition', demoName: 'Ana' })).toBe(
      'Tu plan incluye 2 pacientes reales con tu marca; Ana no ocupa ese cupo.',
    )
  })

  it('no inventa nada: sin demo, fuera de Free o sin cupo utilizable no hay nota', () => {
    expect(guidedCapNote({ tier: 'free', maxClients: 1, persona: 'strength', demoName: null })).toBeNull()
    expect(guidedCapNote({ tier: 'pro', maxClients: 25, persona: 'strength', demoName: 'Matías' })).toBeNull()
    expect(guidedCapNote({ tier: 'free', maxClients: 0, persona: 'strength', demoName: 'Matías' })).toBeNull()
    expect(guidedCapNote({ tier: null, maxClients: null, persona: null, demoName: 'Matías' })).toBeNull()
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
