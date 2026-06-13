import { describe, expect, it } from 'vitest'

/**
 * Unit del armado puro de `updateData` del override del CEO (plan estrategia 03 F1.3 / D6).
 *
 * El bug que evita: `updateCoachAction` se invoca desde formularios variados
 * (`coaches/update/route.ts`). Si `enabled_modules` se incluyera siempre, cualquier caller
 * que no mande checkboxes `module_*` apagaría los 4 módulos del coach (readModules → todo
 * false). El fix es el hidden `modules_present`: SOLO con ese flag se toca `enabled_modules`.
 *
 * `buildCoachUpdateData` vive en `_actions/module-form` (módulo puro, sin 'use server') —
 * `coach-actions.ts` es un módulo Server Actions y solo puede exportar funciones async.
 */
import { buildCoachUpdateData } from '../../_actions/module-form'

describe('buildCoachUpdateData (D6 — modules_present)', () => {
    it('SIN modules_present el updateData NO incluye enabled_modules', () => {
        const fd = new FormData()
        fd.set('full_name', 'Ana Coach')
        fd.set('subscription_tier', 'pro')
        // Aun trayendo checkboxes module_*, sin el flag no se tocan los módulos:
        fd.set('module_cardio', 'on')

        const updateData = buildCoachUpdateData(fd)

        expect('enabled_modules' in updateData).toBe(false)
        expect(updateData.full_name).toBe('Ana Coach')
        expect(updateData.subscription_tier).toBe('pro')
    })

    it('CON modules_present incluye enabled_modules con el mapa de checkboxes', () => {
        const fd = new FormData()
        fd.set('modules_present', '1')
        fd.set('module_cardio', 'on')
        fd.set('module_nutrition_exchanges', 'on')

        const updateData = buildCoachUpdateData(fd)

        expect(updateData.enabled_modules).toEqual({
            cardio: true,
            movement_assessment: false,
            body_composition: false,
            nutrition_exchanges: true,
        })
    })

    it('CON modules_present y CERO checkboxes apaga los 4 módulos (desactivar todo)', () => {
        const fd = new FormData()
        fd.set('modules_present', '1')

        const updateData = buildCoachUpdateData(fd)

        expect(updateData.enabled_modules).toEqual({
            cardio: false,
            movement_assessment: false,
            body_composition: false,
            nutrition_exchanges: false,
        })
    })

    it('campos vacíos no se incluyen y max_clients se castea a número', () => {
        const fd = new FormData()
        fd.set('full_name', '')
        fd.set('max_clients', '42')

        const updateData = buildCoachUpdateData(fd)

        expect('full_name' in updateData).toBe(false)
        expect(updateData.max_clients).toBe(42)
    })
})
