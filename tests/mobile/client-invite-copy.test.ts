// Copy del acceso por WhatsApp/compartir en mobile (auditoría onboarding v2, 22-08). El módulo
// bajo test no importa react-native, así que corre con el runner del repo aunque viva en apps/mobile.
import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@eva/schemas'
import { clientInviteMessage, DEFAULT_INVITE_PERSONA } from '../../apps/mobile/lib/client-invite-copy'

const LINK = 'https://www.eva-app.cl/c/QAEMB/login'

describe('clientInviteMessage', () => {
  it('usa la plantilla de la persona del coach con nombre y link', () => {
    const msg = clientInviteMessage({ persona: 'nutrition', clientName: 'Iván García', loginUrl: LINK })
    expect(msg).toContain('Hola Iván García')
    expect(msg).toContain(LINK)
    expect(msg).toContain('pauta')
  })

  it('sin persona cae a la plantilla neutra (`other`), no a un texto propio', () => {
    const fallback = clientInviteMessage({ persona: null, clientName: 'Ana', loginUrl: LINK })
    const other = clientInviteMessage({ persona: DEFAULT_INVITE_PERSONA, clientName: 'Ana', loginUrl: LINK })
    expect(fallback).toBe(other)
    expect(clientInviteMessage({ persona: undefined, clientName: 'Ana', loginUrl: LINK })).toBe(other)
  })

  it('ninguna persona menciona a EVA: el mensaje es white-label por construcción', () => {
    for (const persona of PERSONAS) {
      const msg = clientInviteMessage({ persona, clientName: 'Ana', loginUrl: LINK })
      expect(msg).not.toMatch(/\bEVA\b/)
      expect(msg).toContain('mi app')
    }
  })

  it('el nombre vacío no deja un «Hola ,» colgando', () => {
    const msg = clientInviteMessage({ persona: 'strength', clientName: '   ', loginUrl: LINK })
    expect(msg.startsWith('Hola hola')).toBe(true)
  })
})
