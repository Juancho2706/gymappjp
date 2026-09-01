import { describe, expect, it } from 'vitest'
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'
import { DOMAIN_OPEN_ROUTES, domainOpenHref } from './domain-open-routes'

/**
 * W3.1 (Ola de orden) — contrato del boton «Abrir» de Funciones.
 *
 * El mapa reemplaza al launcher `/coach/tools`: si alguien agrega un dominio y se olvida de su
 * destino, el coach se queda sin puerta de entrada a esa area. Por eso el primer caso cruza las
 * keys contra `FEATURE_DOMAIN_KEYS` (ni una mas, ni una menos).
 */
describe('domain-open-routes', () => {
    it('cubre exactamente los 5 dominios de @eva/feature-prefs', () => {
        expect(Object.keys(DOMAIN_OPEN_ROUTES).sort()).toEqual([...FEATURE_DOMAIN_KEYS].sort())
    })

    it('entrenamiento abre el planificador', () => {
        expect(domainOpenHref('training')).toBe('/coach/workout-programs')
    })

    it('nutricion abre el hub V2', () => {
        expect(domainOpenHref('nutrition')).toBe('/coach/nutrition-v2')
    })

    it('cardio abre su modulo', () => {
        expect(domainOpenHref('cardio')).toBe('/coach/cardio')
    })

    it('movimiento abre su modulo', () => {
        expect(domainOpenHref('movement')).toBe('/coach/movement')
    })

    it('composicion corporal NO tiene ruta: abre el selector de alumno', () => {
        expect(domainOpenHref('bodycomp')).toBeNull()
    })
})
