import { describe, expect, it } from 'vitest'

/**
 * Unit del armado puro de `updateData` del override del CEO.
 *
 * Plan 05 / F6.1 / D2: el override de módulos pasó a WRITE-THROUGH de `coach_addons`
 * (filas `admin_grant`, el trigger D1 recomputa `enabled_modules`). Por eso
 * `buildCoachUpdateData` ya NO emite `enabled_modules` — escribir el jsonb directo lo
 * pisaría el trigger. La rama de módulos vive en `updateCoachAction` vía `syncAdminGrants`,
 * que diffea `readModules(formData)` contra las filas grant vivas.
 *
 * `buildCoachUpdateData` vive en `_actions/module-form` (módulo puro, sin 'use server') —
 * `coach-actions.ts` es un módulo Server Actions y solo puede exportar funciones async.
 */
import { buildCoachUpdateData } from '../../_actions/module-form'

describe('buildCoachUpdateData (D2 — modules via write-through, NO jsonb directo)', () => {
    it('NUNCA incluye enabled_modules, aunque vengan modules_present + checkboxes', () => {
        const fd = new FormData()
        fd.set('full_name', 'Ana Coach')
        fd.set('subscription_tier', 'pro')
        fd.set('modules_present', '1')
        fd.set('module_cardio', 'on')

        const updateData = buildCoachUpdateData(fd)

        // El jsonb ya no se escribe directo (lo sincroniza el trigger desde coach_addons).
        expect('enabled_modules' in updateData).toBe(false)
        expect(updateData.full_name).toBe('Ana Coach')
        expect(updateData.subscription_tier).toBe('pro')
    })

    it('un override SOLO de módulos deja updateData VACÍO (no toca la fila coaches)', () => {
        const fd = new FormData()
        fd.set('modules_present', '1')
        fd.set('module_cardio', 'on')

        const updateData = buildCoachUpdateData(fd)

        // updateCoachAction salta el UPDATE de coaches cuando no hay campos no-módulo.
        expect(Object.keys(updateData)).toHaveLength(0)
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
