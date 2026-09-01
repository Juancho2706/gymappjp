import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    DOMAIN_LABELS as PKG_DOMAIN_LABELS,
    FEATURE_DOMAIN_KEYS,
    FUNCIONES_BREADCRUMB as PKG_FUNCIONES_BREADCRUMB,
    FUNCIONES_LABEL as PKG_FUNCIONES_LABEL,
    domainOffCopy as pkgDomainOffCopy,
} from '@eva/feature-prefs'
import {
    DOMAIN_LABELS,
    FUNCIONES_BREADCRUMB,
    FUNCIONES_LABEL,
    MI_PANEL_PATH,
    domainOffCopy,
} from '../../apps/mobile/lib/domain-off'

/**
 * `apps/mobile/lib/domain-off.ts` (Ola de orden W1.6c) — ruta local de «Mi panel» + re-export del
 * copy compartido del aviso «dominio apagado».
 *
 * Lo que este test pinnea:
 *  - la PUREZA del modulo: si alguien le agrega un import de react-native / expo / supabase, este
 *    archivo deja de cargar en el runner de la raiz y CI lo muestra (el componente y su copy tienen
 *    que poder testearse sin el bundle nativo);
 *  - la PARIDAD web/RN del copy: `domainOffCopy` re-exportado es EL MISMO del paquete, no una
 *    copia. Es la garantia de que el coach no lee «Mi panel» en un lado y otra cosa en el otro;
 *  - el literal de la ruta y su coincidencia con `MI_PANEL_ROUTE` (`lib/mi-panel.ts`), duplicado a
 *    proposito porque ese modulo habla con Supabase. Si uno de los dos cambia, esto se pone rojo.
 */

describe('apps/mobile/lib/domain-off', () => {
    it('MI_PANEL_PATH apunta a la pantalla de Expo Router de «Mi panel»', () => {
        expect(MI_PANEL_PATH).toBe('/coach/settings/mi-panel')
    })

    it('MI_PANEL_PATH no diverge de MI_PANEL_ROUTE (lib/mi-panel.ts)', () => {
        // Se lee como TEXTO a proposito: importar `lib/mi-panel.ts` arrastraria `./api` y
        // `./supabase` al runner, que es justo lo que este modulo evita.
        const source = readFileSync(
            path.resolve(__dirname, '..', '..', 'apps', 'mobile', 'lib', 'mi-panel.ts'),
            'utf8',
        )
        const match = source.match(/export const MI_PANEL_ROUTE = '([^']+)'/)
        expect(match?.[1]).toBe(MI_PANEL_PATH)
    })

    it('re-exporta los nombres compartidos sin reescribirlos', () => {
        expect(FUNCIONES_LABEL).toBe(PKG_FUNCIONES_LABEL)
        expect(FUNCIONES_BREADCRUMB).toBe(PKG_FUNCIONES_BREADCRUMB)
        expect(DOMAIN_LABELS).toBe(PKG_DOMAIN_LABELS)
    })

    it.each(FEATURE_DOMAIN_KEYS)(
        'domainOffCopy(%s) es identico al del paquete (paridad web/RN)',
        (domain) => {
            const copy = domainOffCopy(domain)
            expect(copy).toEqual(pkgDomainOffCopy(domain))
            // El aviso es una preferencia del coach, nunca un upsell: cero plan, cero precio.
            expect(copy.title).toContain(PKG_DOMAIN_LABELS[domain])
            expect(copy.body).toContain(PKG_FUNCIONES_BREADCRUMB)
            expect(copy.cta).toBe(`Prender en ${PKG_FUNCIONES_LABEL}`)
        },
    )
})
