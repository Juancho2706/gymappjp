import { describe, expect, it } from 'vitest'
import { NAV_MODULES } from '@eva/coach-nav'
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'
import { domainHasNavItem, domainToggleMessage } from '../../apps/mobile/lib/funciones-copy'

/**
 * `apps/mobile/lib/funciones-copy.ts` (Ola de orden W2.8 + W3.3) — el toast que confirma el master
 * switch de un dominio en «Opciones › Funciones».
 *
 * Lo que este test pinnea:
 *  - la PUREZA del módulo: si alguien le agrega un import de react-native / expo / supabase, este
 *    archivo deja de cargar en el runner de la raíz y CI lo muestra;
 *  - la HONESTIDAD del copy: «ya se ve» SOLO para los dominios que de verdad tienen entrada en el
 *    menú, y la fuente de esa respuesta es `NAV_MODULES`, no una lista cableada a mano (el `Set`
 *    `DOMAINS_VISIBLE_IN_NAV` de `mi-panel.tsx` mentía desde que W2.1B le dio ítem a Cardio y
 *    Movimiento);
 *  - los 3 literales, que son los MISMOS de `domainToggleMessage` de la web
 *    (`funciones/_actions/mi-panel.actions.ts`): paridad de palabras web ↔ RN.
 */

describe('apps/mobile/lib/funciones-copy', () => {
    it('apagar dice siempre lo mismo, sea cual sea el dominio', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            expect(domainToggleMessage(domain, false)).toBe('Listo, lo ocultamos.')
        }
    })

    it.each(FEATURE_DOMAIN_KEYS)('prender %s promete lo que el registro del nav sostiene', (domain) => {
        const hasNavItem = NAV_MODULES.some((item) => item.featureDomain === domain)
        expect(domainHasNavItem(domain)).toBe(hasNavItem)
        expect(domainToggleMessage(domain, true)).toBe(
            hasNavItem ? 'Listo, ya se ve.' : 'Listo, lo activamos.',
        )
    })

    it('hoy los 4 dominios con menú prometen «ya se ve» y bodycomp no', () => {
        // Foto del registro POST-W2 (cardio y movimiento ganaron entrada propia). Si mañana el
        // registro cambia, este caso se pone rojo a propósito: el copy es una promesa de producto.
        expect(domainHasNavItem('nutrition')).toBe(true)
        expect(domainHasNavItem('training')).toBe(true)
        expect(domainHasNavItem('cardio')).toBe(true)
        expect(domainHasNavItem('movement')).toBe(true)
        expect(domainHasNavItem('bodycomp')).toBe(false)
        expect(domainToggleMessage('bodycomp', true)).toBe('Listo, lo activamos.')
    })

    it('ningún mensaje habla de plan, precio ni upgrade', () => {
        const all = FEATURE_DOMAIN_KEYS.flatMap((domain) => [
            domainToggleMessage(domain, true),
            domainToggleMessage(domain, false),
        ])
        for (const message of all) {
            expect(message).not.toMatch(/plan|precio|pro\b|módulo/i)
        }
    })
})
