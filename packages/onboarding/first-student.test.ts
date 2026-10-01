import { describe, expect, it } from 'vitest'
import { PERSONA_COPY } from '@eva/schemas'
import {
    FIRST_STUDENT_RN_ROUTE,
    FIRST_STUDENT_WEB_HREF,
    firstStudentCardCopy,
    shouldShowFirstStudentCard,
} from './index'

/**
 * Tarjeta «Tu primer alumno» (plan B «Activación», owner 01-10). Se pinnea: cuándo se muestra (solo
 * con 0 alumnos reales), que el CTA va al alta guiada y NUNCA a `/join` (deja una solicitud), y que
 * el sustantivo de la persona llega al copy.
 */
describe('shouldShowFirstStudentCard', () => {
    it('solo con 0 alumnos reales', () => {
        expect(shouldShowFirstStudentCard(0)).toBe(true)
        expect(shouldShowFirstStudentCard(1)).toBe(false)
        expect(shouldShowFirstStudentCard(null)).toBe(false)
        expect(shouldShowFirstStudentCard(undefined)).toBe(false)
    })
})

describe('firstStudentCardCopy', () => {
    it('usa el sustantivo de la persona', () => {
        const copy = firstStudentCardCopy(PERSONA_COPY.nutrition.noun.singular)
        expect(copy.eyebrow).toBe(`Tu primer ${PERSONA_COPY.nutrition.noun.singular}`)
        expect(copy.cta).toBe(`Dar de alta a mi primer ${PERSONA_COPY.nutrition.noun.singular}`)
        expect(copy.steps).toHaveLength(3)
    })

    it('los destinos son el alta guiada (`?invite=1`), nunca `/join`', () => {
        expect(FIRST_STUDENT_WEB_HREF).toBe('/coach/clients?invite=1')
        expect(FIRST_STUDENT_RN_ROUTE).toBe('/coach/(tabs)/clientes?invite=1')
        expect(`${FIRST_STUDENT_WEB_HREF}${FIRST_STUDENT_RN_ROUTE}`).not.toContain('/join')
    })
})
