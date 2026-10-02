import { describe, expect, it } from 'vitest'
import { getStudentLoginQueryNotice, STUDENT_LOGIN_ERROR_CODES } from './student-login-messages'

/**
 * `?error=` del login de alumno. Lo nuevo (02-10, caso Carolina/Movens): `google_solo_coach`, que
 * emite `resolvePostGoogleAuthUrl` cuando un alumno toca Google en el login de coach. Tiene salida
 * (recuperar la contraseña) ⇒ el bloque es neutro, no rojo, y la salida conserva la marca del coach.
 */
describe('getStudentLoginQueryNotice — google_solo_coach', () => {
    it('explica cómo entrar y ofrece recuperar la contraseña con la marca del coach', () => {
        const notice = getStudentLoginQueryNotice(STUDENT_LOGIN_ERROR_CODES.GOOGLE_SOLO_COACH, 'movens')

        expect(notice?.error).toContain('solo para cuentas de coach')
        expect(notice?.error).toContain('correo y tu contraseña')
        expect(notice?.action).toEqual({
            href: '/forgot-password?coach_slug=movens',
            label: '¿No recuerdas tu contraseña? Recupérala',
        })
    })

    it('sin slug, la salida sigue existiendo (sin marca)', () => {
        const notice = getStudentLoginQueryNotice(STUDENT_LOGIN_ERROR_CODES.GOOGLE_SOLO_COACH)

        expect(notice?.action?.href).toBe('/forgot-password')
    })

    it('el slug va codificado en la salida', () => {
        const notice = getStudentLoginQueryNotice(STUDENT_LOGIN_ERROR_CODES.GOOGLE_SOLO_COACH, 'a&b')

        expect(notice?.action?.href).toBe('/forgot-password?coach_slug=a%26b')
    })

    it('regla de producto 8: el copy no nombra al usuario como «alumno» ni «cliente»', () => {
        const notice = getStudentLoginQueryNotice(STUDENT_LOGIN_ERROR_CODES.GOOGLE_SOLO_COACH, 'movens')
        const copy = `${notice?.error} ${notice?.action?.label}`.toLowerCase()

        expect(copy).not.toMatch(/alumn|client/)
    })

    it('los códigos de siempre no cambian y un código inventado no pinta nada', () => {
        expect(getStudentLoginQueryNotice(STUDENT_LOGIN_ERROR_CODES.VIVE_TU_APP_EXPIRADO)?.action?.href).toBe(
            '/coach/guia'
        )
        expect(getStudentLoginQueryNotice('inventado', 'movens')).toBeNull()
        expect(getStudentLoginQueryNotice(null, 'movens')).toBeNull()
    })
})
