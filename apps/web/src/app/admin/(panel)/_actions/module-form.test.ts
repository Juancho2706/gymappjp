import { describe, expect, it } from 'vitest'
import { readModules } from './module-form'
import { MODULE_KEYS } from '@/services/entitlements.service'

/**
 * Unit del helper compartido `readModules` (plan estrategia 03 F1.3 / D6).
 * Lo consumen el bloque de módulos de teams (teams.actions) y el override del CEO
 * en coaches (coach-actions). Garantiza el mapeo checkbox -> boolean para los 3
 * estados que produce un <form>: 'on' (checkbox marcado), ausente (desmarcado),
 * y 'true' (compat por si un caller programático lo setea explícito).
 */
describe('readModules', () => {
    it('mapea "on" (checkbox marcado) a true', () => {
        const fd = new FormData()
        fd.set('module_cardio', 'on')
        const mods = readModules(fd)
        expect(mods.cardio).toBe(true)
    })

    it('mapea "true" a true (caller programático)', () => {
        const fd = new FormData()
        fd.set('module_body_composition', 'true')
        const mods = readModules(fd)
        expect(mods.body_composition).toBe(true)
    })

    it('un módulo ausente (checkbox desmarcado) queda en false', () => {
        const fd = new FormData()
        fd.set('module_cardio', 'on')
        const mods = readModules(fd)
        expect(mods.movement_assessment).toBe(false)
        expect(mods.nutrition_exchanges).toBe(false)
    })

    it('devuelve SIEMPRE una entrada por cada MODULE_KEY (ni más ni menos)', () => {
        const mods = readModules(new FormData())
        expect(Object.keys(mods).sort()).toEqual([...MODULE_KEYS].sort())
    })

    it('un FormData vacío devuelve los 4 módulos en false (gatillo de la trampa D6)', () => {
        const mods = readModules(new FormData())
        for (const key of MODULE_KEYS) {
            expect(mods[key]).toBe(false)
        }
    })

    it('un valor arbitrario distinto de on/true no activa el módulo', () => {
        const fd = new FormData()
        fd.set('module_cardio', 'off')
        fd.set('module_movement_assessment', 'false')
        const mods = readModules(fd)
        expect(mods.cardio).toBe(false)
        expect(mods.movement_assessment).toBe(false)
    })
})
