import { describe, expect, it } from 'vitest'
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'
import {
    DOMAIN_LABELS,
    DOMAIN_OFF_NOTICE,
    FUNCIONES_LABEL,
    FUNCIONES_PATH,
    domainOffRedirectPath,
    isFeatureDomain,
} from './domain-off'

describe('domain-off — contrato del aviso «dominio apagado» (W1.3)', () => {
    it('la URL del redirect lleva el notice y el dominio', () => {
        expect(domainOffRedirectPath('nutrition')).toBe(
            '/coach/dashboard?notice=domain_off&domain=nutrition',
        )
        expect(DOMAIN_OFF_NOTICE).toBe('domain_off')
    })

    it('`isFeatureDomain` acepta los 5 dominios y rechaza cualquier otra cosa', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) expect(isFeatureDomain(domain)).toBe(true)
        expect(isFeatureDomain('cardio')).toBe(true)
        // `workouts` es el nombre viejo del modulo, no un dominio: el query param no se confia.
        expect(isFeatureDomain('workouts')).toBe(false)
        expect(isFeatureDomain('')).toBe(false)
        expect(isFeatureDomain(null)).toBe(false)
        expect(isFeatureDomain(undefined)).toBe(false)
        expect(isFeatureDomain(1)).toBe(false)
    })

    it('hay label para los 5 dominios y la pantalla de funciones vive en un solo lugar', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            expect(DOMAIN_LABELS[domain]).toBeTruthy()
        }
        expect(DOMAIN_LABELS.bodycomp).toBe('Composición corporal')
        expect(FUNCIONES_PATH).toBe('/coach/settings/funciones')
        expect(FUNCIONES_LABEL).toBe('Mi panel')
    })
})
