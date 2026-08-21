import { describe, expect, it } from 'vitest'
import { toWhatsAppDigits, waMeUrl } from './whatsapp'

describe('toWhatsAppDigits', () => {
    it('deja el número chileno completo en solo dígitos', () => {
        expect(toWhatsAppDigits('+56 9 1234 5678')).toBe('56912345678')
        expect(toWhatsAppDigits('(+56) 9-1234-5678')).toBe('56912345678')
    })

    it('agrega el 56 cuando el móvil chileno viene sin país', () => {
        expect(toWhatsAppDigits('912345678')).toBe('56912345678')
        expect(toWhatsAppDigits('9 1234 5678')).toBe('56912345678')
    })

    it('quita el cero de salida nacional antes de decidir', () => {
        expect(toWhatsAppDigits('0912345678')).toBe('56912345678')
    })

    it('no toca un número extranjero que ya trae su país', () => {
        expect(toWhatsAppDigits('5491112345678')).toBe('5491112345678')
        expect(toWhatsAppDigits('+1 415 555 0123')).toBe('14155550123')
    })

    it('devuelve null cuando no hay nada marcable', () => {
        expect(toWhatsAppDigits(null)).toBeNull()
        expect(toWhatsAppDigits(undefined)).toBeNull()
        expect(toWhatsAppDigits('')).toBeNull()
        expect(toWhatsAppDigits('sin número')).toBeNull()
        expect(toWhatsAppDigits('000')).toBeNull()
    })

    // Un fijo de 9 dígitos que NO empieza con 9 no se toca: adivinar el país ahí sería inventar.
    it('no antepone país a un largo de 9 que no empieza con 9', () => {
        expect(toWhatsAppDigits('223456789')).toBe('223456789')
    })
})

describe('waMeUrl', () => {
    it('arma el link con los dígitos normalizados', () => {
        expect(waMeUrl('+56 9 1234 5678')).toBe('https://wa.me/56912345678')
        expect(waMeUrl('912345678')).toBe('https://wa.me/56912345678')
    })

    it('codifica el mensaje sugerido', () => {
        expect(waMeUrl('912345678', 'Hola Ana')).toBe('https://wa.me/56912345678?text=Hola%20Ana')
    })

    it('sin teléfono utilizable no hay link', () => {
        expect(waMeUrl(null)).toBeNull()
        expect(waMeUrl('  ')).toBeNull()
    })
})
