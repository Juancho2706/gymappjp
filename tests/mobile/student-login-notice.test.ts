/**
 * VTA-3.12 — espejo RN del aviso `coach_account` del login de alumno.
 *
 * El guard que importa es de PARIDAD: la primera oración tiene que ser literalmente la misma que
 * emite la web (`coachAccountMessage`, apps/web/src/lib/auth/student-login-messages.ts). Si un día
 * alguien cambia el copy de un lado, este test se cae en vez de dejar dos mensajes distintos para
 * el mismo hecho.
 */
import { describe, expect, it } from 'vitest'
import { coachAccountLoginMessage, COACH_ACCOUNT_LOGIN_EXIT } from '../../apps/mobile/lib/student-login-notice'
import { coachAccountMessage } from '@/lib/auth/student-login-messages'

describe('coachAccountLoginMessage', () => {
    it('usa el vocabulario de la persona del coach', () => {
        expect(coachAccountLoginMessage('nutrition')).toContain('no una cuenta de paciente')
        expect(coachAccountLoginMessage('nutrition')).toContain('tus pacientes')
    })

    it('una persona nula o desconocida cae a `strength`, igual que la web', () => {
        expect(coachAccountLoginMessage(null)).toBe(coachAccountLoginMessage('strength'))
        expect(coachAccountLoginMessage('marciano')).toBe(coachAccountLoginMessage('strength'))
    })

    it('siempre ofrece una salida concreta de la app', () => {
        expect(coachAccountLoginMessage('rehab').endsWith(COACH_ACCOUNT_LOGIN_EXIT)).toBe(true)
    })

    it('PARIDAD con la web: el mensaje RN es el de la web + la salida de la app', () => {
        for (const persona of ['strength', 'nutrition', 'rehab', 'endurance', 'other', null]) {
            expect(coachAccountLoginMessage(persona)).toBe(
                `${coachAccountMessage(persona)} ${COACH_ACCOUNT_LOGIN_EXIT}`,
            )
        }
    })
})
