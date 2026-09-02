// @vitest-environment jsdom
// Opt-in por archivo: desde el reparto por projects (vitest.config.ts, 2026-09-02) los
// `*.test.ts` corren en `node`, y este ejercita DOM real (window/document/localStorage).
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'
import { useDomainGuard } from '../../apps/mobile/lib/domain-guard'

/**
 * `useDomainGuard` (`apps/mobile/lib/domain-guard.ts`, Ola de orden W1.13b) — el master switch por
 * DOMINIO del lado de RN, leido del store de entitlements que hidrata `/api/mobile/config`.
 *
 * Lo que este test pinnea:
 *  - FAIL-OPEN: solo el `false` EXPLICITO apaga. Un payload viejo (sin la key), un dominio nuevo o
 *    un config a medio hidratar dejan el dominio PRENDIDO. Al reves seria un apagon: el coach
 *    perderia su panel porque el server todavia no le contesto.
 *  - `ready` se propaga tal cual. La pantalla lo necesita para NO pegarle a la DB antes de saber si
 *    el dominio esta prendido (money-safety del contrato de consumo, ver el JSDoc del modulo).
 *  - cada dominio lee SU key: apagar Cardio no puede apagar Nutricion.
 *
 * El store se mockea entero (`vi.mock` sobre `apps/mobile/lib/entitlements`), asi el hook se ejerce
 * sin AsyncStorage, sin Supabase y sin nada de react-native — el guard es logica pura sobre un
 * `{ ready, domains }`.
 */

const store = vi.hoisted(() => ({
    ready: true as boolean,
    domains: {} as Partial<Record<FeatureDomain, boolean>>,
}))

// `domain-guard` solo importa esto en runtime (lo demas es `import type`), asi que mockearlo deja
// al hook aislado: cero AsyncStorage, cero Supabase, cero react-native.
vi.mock('../../apps/mobile/lib/entitlements', () => ({
    useEntitlements: () => ({ ready: store.ready, domains: store.domains }),
}))

/** Payload completo con los 5 dominios en el mismo valor (el caso normal del server). */
function allDomains(value: boolean): Record<FeatureDomain, boolean> {
    return Object.fromEntries(FEATURE_DOMAIN_KEYS.map((d) => [d, value])) as Record<
        FeatureDomain,
        boolean
    >
}

/** Monta el hook con el store en el estado dado y devuelve su resultado. */
function guard(
    domain: FeatureDomain,
    state: { ready?: boolean; domains: Partial<Record<FeatureDomain, boolean>> },
) {
    store.ready = state.ready ?? true
    store.domains = state.domains
    return renderHook(() => useDomainGuard(domain)).result.current
}

describe('useDomainGuard', () => {
    describe.each(FEATURE_DOMAIN_KEYS)('%s', (domain) => {
        it('apagado explicito (false) => enabled false', () => {
            expect(guard(domain, { domains: { ...allDomains(true), [domain]: false } })).toEqual({
                ready: true,
                enabled: false,
            })
        })

        it('prendido (true) => enabled true', () => {
            expect(guard(domain, { domains: allDomains(true) })).toEqual({
                ready: true,
                enabled: true,
            })
        })
    })

    it('propaga ready:false para que la pantalla no fetchee antes de saber', () => {
        // `enabled` ya vale lo optimista (fail-open) pero la pantalla NO debe decidir con esto:
        // hasta `ready:true` no hay respuesta del server.
        expect(guard('cardio', { ready: false, domains: {} })).toEqual({
            ready: false,
            enabled: true,
        })
    })

    it('ready:false no invierte un apagado ya conocido (cache hidratada)', () => {
        expect(guard('nutrition', { ready: false, domains: { nutrition: false } })).toEqual({
            ready: false,
            enabled: false,
        })
    })

    it('fail-open: un dominio ausente del payload queda PRENDIDO', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            expect(guard(domain, { domains: {} }).enabled).toBe(true)
        }
    })

    it('apagar un dominio no apaga a los demas', () => {
        const domains = { ...allDomains(true), cardio: false }
        expect(guard('cardio', { domains }).enabled).toBe(false)
        for (const domain of FEATURE_DOMAIN_KEYS.filter((d) => d !== 'cardio')) {
            expect(guard(domain, { domains }).enabled).toBe(true)
        }
    })
})
