import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG, MODULE_CATALOG_KEYS, getModuleCatalogEntry } from './catalog'
// Fuente de verdad de las keys (la app es la dueña; el paquete es puro y la espeja).
import { MODULE_KEYS } from '@/services/entitlements.service'

describe('@eva/module-catalog', () => {
    it('cubre EXACTAMENTE MODULE_KEYS (ni una más, ni una menos)', () => {
        const catalogKeys = [...MODULE_CATALOG_KEYS].sort()
        const sourceKeys = [...MODULE_KEYS].sort()
        expect(catalogKeys).toEqual(sourceKeys)
    })

    it('MODULE_CATALOG tiene una entrada por cada key (sin huérfanas)', () => {
        const entryKeys = Object.keys(MODULE_CATALOG).sort()
        const declaredKeys = [...MODULE_CATALOG_KEYS].sort()
        expect(entryKeys).toEqual(declaredKeys)
    })

    it.each(MODULE_CATALOG_KEYS)('módulo "%s": label, pitch y surfaces no vacíos', (key) => {
        const entry = getModuleCatalogEntry(key)
        expect(entry.label.trim().length).toBeGreaterThan(0)
        expect(entry.pitch.trim().length).toBeGreaterThan(0)
        expect(entry.surfaces.length).toBeGreaterThan(0)
        for (const surface of entry.surfaces) {
            expect(surface.trim().length).toBeGreaterThan(0)
        }
    })
})
