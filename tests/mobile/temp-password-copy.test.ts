/**
 * Copy de la clave temporal en mobile (queja del coach 22-08: «no me deja copiar el código»).
 *
 * Lo que se pinnea es el CONTRATO de producto: el texto exacto que sale por WhatsApp / hoja de
 * compartir, la ausencia de la marca EVA (white-label) y cuándo hay link de WhatsApp. El módulo
 * bajo test no importa react-native, así que corre con el runner del repo aunque viva en
 * `apps/mobile`.
 */
import { describe, expect, it } from 'vitest'
import {
  tempPasswordFirstName,
  tempPasswordMessage,
  tempPasswordWhatsappUrl,
} from '../../apps/mobile/lib/temp-password-copy'

const PASSWORD = 'Ab3-9k2Q'

describe('tempPasswordMessage', () => {
  it('saluda por el primer nombre, dice la clave y pide cambiarla', () => {
    const msg = tempPasswordMessage({ clientName: 'Ana María Pérez', password: PASSWORD })
    expect(msg).toBe(
      `Hola Ana, tu clave temporal para entrar a la app es ${PASSWORD}. Cámbiala al ingresar.`,
    )
  })

  it('no menciona a EVA: el mensaje es white-label por construcción', () => {
    const msg = tempPasswordMessage({ clientName: 'Iván', password: PASSWORD })
    expect(msg).not.toMatch(/\bEVA\b/i)
  })

  it('el nombre vacío no deja un «Hola ,» colgando', () => {
    const msg = tempPasswordMessage({ clientName: '   ', password: PASSWORD })
    expect(msg.startsWith('Hola hola,')).toBe(true)
  })

  it('la clave viaja sin espacios de borde (se pega tal cual en el login)', () => {
    expect(tempPasswordMessage({ clientName: 'Ana', password: `  ${PASSWORD}  ` })).toContain(
      `es ${PASSWORD}.`,
    )
  })
})

describe('tempPasswordFirstName', () => {
  it('colapsa espacios repetidos antes de cortar', () => {
    expect(tempPasswordFirstName('  Ana   María  ')).toBe('Ana')
  })
})

describe('tempPasswordWhatsappUrl', () => {
  it('arma wa.me con el mismo texto, ya percent-encoded', () => {
    const url = tempPasswordWhatsappUrl({
      phone: '+56 9 1234 5678',
      clientName: 'Ana Pérez',
      password: PASSWORD,
    })
    expect(url).not.toBeNull()
    expect(url).toContain('https://wa.me/56912345678?text=')
    const text = decodeURIComponent(url!.split('?text=')[1])
    expect(text).toBe(tempPasswordMessage({ clientName: 'Ana Pérez', password: PASSWORD }))
  })

  it('sin teléfono usable devuelve null (el diálogo cae a compartir del sistema)', () => {
    for (const phone of [null, undefined, '', '  ', '12345']) {
      expect(tempPasswordWhatsappUrl({ phone, clientName: 'Ana', password: PASSWORD })).toBeNull()
    }
  })
})
