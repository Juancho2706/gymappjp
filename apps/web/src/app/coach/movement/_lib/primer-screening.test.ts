import { describe, expect, it } from 'vitest'
import { primerScreeningCards, resolvePrimerScreeningEntry } from './primer-screening'

describe('resolvePrimerScreeningEntry — screening existente vs nuevo', () => {
    it('sin ?primera=1 no hay entrada guiada', () => {
        expect(
            resolvePrimerScreeningEntry({ primera: false, hasFinal: false, hasDraft: false }),
        ).toBeNull()
    })

    it('sin screening ni borrador manda al wizard', () => {
        expect(resolvePrimerScreeningEntry({ primera: true, hasFinal: false, hasDraft: false })).toEqual({
            mode: 'wizard',
            goesToWizard: true,
        })
    })

    it('con borrador a medias RETOMA el wizard (borrador único por alumno)', () => {
        expect(resolvePrimerScreeningEntry({ primera: true, hasFinal: false, hasDraft: true })).toEqual({
            mode: 'resume',
            goesToWizard: true,
        })
    })

    it('con screening final ya hecho (alumno de ejemplo) se queda en el semáforo y salta a la pauta', () => {
        expect(resolvePrimerScreeningEntry({ primera: true, hasFinal: true, hasDraft: false })).toEqual({
            mode: 'pauta',
            goesToWizard: false,
        })
    })

    it('el final manda sobre el borrador: no se reevalúa a quien ya tiene screening', () => {
        expect(
            resolvePrimerScreeningEntry({ primera: true, hasFinal: true, hasDraft: true })?.mode,
        ).toBe('pauta')
    })
})

describe('primerScreeningCards', () => {
    it('son tres y en el orden de la spec: puntúa · dolor · guarda', () => {
        expect(primerScreeningCards('Pedro').map((card) => card.id)).toEqual([
            'puntua',
            'dolor',
            'guarda',
        ])
    })

    it('sin nombre habla sin sujeto propio', () => {
        const cards = primerScreeningCards(null)
        expect(cards[0].body).toContain('tu paciente')
        expect(cards[0].body).not.toContain('null')
    })
})
