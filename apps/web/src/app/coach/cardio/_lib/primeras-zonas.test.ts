import { describe, expect, it } from 'vitest'
import { cardioProfileGapCopy, resolvePrimerasZonasEntry } from './primeras-zonas'

describe('resolvePrimerasZonasEntry — perfil completo vs incompleto', () => {
    it('sin ?primera=1 no hay entrada guiada', () => {
        expect(
            resolvePrimerasZonasEntry({
                primera: false,
                hasZones: true,
                hasRestingHr: true,
                hasRef5k: true,
            }),
        ).toBeNull()
    })

    it('perfil completo (el del alumno de ejemplo): zonas a la vista y nada que pedir', () => {
        expect(
            resolvePrimerasZonasEntry({
                primera: true,
                hasZones: true,
                hasRestingHr: true,
                hasRef5k: true,
            }),
        ).toEqual({ hasZones: true, missing: [] })
    })

    it('perfil vacío: faltan los tres, en el orden del formulario', () => {
        expect(
            resolvePrimerasZonasEntry({
                primera: true,
                hasZones: false,
                hasRestingHr: false,
                hasRef5k: false,
            }),
        ).toEqual({ hasZones: false, missing: ['fcmax', 'reposo', 'ref5k'] })
    })

    it('con FCmax pero sin marca de 5K, las zonas ya salen: solo falta el ritmo', () => {
        expect(
            resolvePrimerasZonasEntry({
                primera: true,
                hasZones: true,
                hasRestingHr: true,
                hasRef5k: false,
            }),
        ).toEqual({ hasZones: true, missing: ['ref5k'] })
    })
})

describe('cardioProfileGapCopy', () => {
    it('sin huecos no inventa trabajo', () => {
        expect(cardioProfileGapCopy([])).toContain('Ya está completo')
    })

    it('un solo hueco se dice sin lista', () => {
        expect(cardioProfileGapCopy(['ref5k'])).toBe(
            'Carga su marca de 5K: de ahí salen las zonas y los ritmos.',
        )
    })

    it('varios huecos se enumeran con «y» al final', () => {
        expect(cardioProfileGapCopy(['fcmax', 'reposo', 'ref5k'])).toBe(
            'Carga su fecha de nacimiento o su FCmax medida, su FC de reposo y su marca de 5K: de ahí salen las zonas y los ritmos.',
        )
    })
})
