import { describe, it, expect } from 'vitest'
import { passwordRejectionMessage } from './auth-errors'

describe('passwordRejectionMessage', () => {
    // Incidente 2026-07-25: alumna de dudu intento "Jungkook1997!" (1.003 apariciones en HIBP).
    // GoTrue 422 weak_password llegaba crudo en ingles y contradecia los chips verdes del form.
    it('traduce el rechazo HIBP (pwned) con code + reasons', () => {
        const msg = passwordRejectionMessage({
            code: 'weak_password',
            message: 'Password is known to be weak and easy to guess, please choose a different one.',
            reasons: ['pwned'],
        })
        expect(msg).toMatch(/filtraciones de datos/)
    })

    it('traduce el rechazo HIBP solo con el mensaje (sin code, supabase-js viejo)', () => {
        const msg = passwordRejectionMessage({
            message: 'Password is known to be weak and easy to guess, please choose a different one.',
        })
        expect(msg).toMatch(/filtraciones de datos/)
    })

    it('traduce weak_password por largo', () => {
        const msg = passwordRejectionMessage({
            code: 'weak_password',
            message: 'Password should be at least 8 characters.',
            reasons: ['length'],
        })
        expect(msg).toBe('La contraseña debe tener al menos 8 caracteres.')
    })

    it('traduce same_password', () => {
        const msg = passwordRejectionMessage({
            code: 'same_password',
            message: 'New password should be different from the old password.',
        })
        expect(msg).toBe('La nueva contraseña debe ser distinta a la actual.')
    })

    it('weak_password sin razon reconocible cae al generico de debilidad', () => {
        const msg = passwordRejectionMessage({ code: 'weak_password', message: 'Signup requires a valid password' })
        expect(msg).toMatch(/demasiado débil/)
    })

    // Errores que NO son rechazo de la contraseña: cada flujo conserva su fallback
    // (reset => "el link puede haber expirado", perfil => "intenta de nuevo").
    it('devuelve null para errores de sesion/red/rate-limit y entradas vacias', () => {
        expect(passwordRejectionMessage({ code: 'session_expired', message: 'Session expired' })).toBeNull()
        expect(passwordRejectionMessage({ message: 'Request rate limit reached' })).toBeNull()
        expect(passwordRejectionMessage({})).toBeNull()
        expect(passwordRejectionMessage(null)).toBeNull()
        expect(passwordRejectionMessage(undefined)).toBeNull()
    })
})
