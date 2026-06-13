import { MODULE_KEYS } from '@/services/entitlements.service'

/**
 * Lee los checkboxes `module_<key>` de un FormData del panel admin y devuelve el mapa
 * `enabled_modules` completo (una entrada por cada MODULE_KEY, true/false explícito).
 *
 * Compartido por el bloque "Módulos habilitados" de teams (`teams.actions.ts`) y de
 * coaches (`coach-actions.ts`, override del CEO — plan estrategia 03 F1.3 / D6).
 *
 * OJO (D6): devuelve TODOS los módulos en `false` si no vienen checkboxes. El caller que
 * arma un `updateData` parcial (updateCoachAction) DEBE gatear con un flag `modules_present`
 * antes de incluir el resultado, o apagaría los 4 módulos de cualquier coach editado sin
 * tocar el bloque de módulos.
 */
export function readModules(formData: FormData): Record<string, boolean> {
    const mods: Record<string, boolean> = {}
    for (const key of MODULE_KEYS) {
        const v = formData.get(`module_${key}`)
        mods[key] = v === 'on' || v === 'true'
    }
    return mods
}

/**
 * Armado PURO del payload de UPDATE del override del CEO (`updateCoachAction`),
 * unit-testeable sin server context. Vive acá (módulo sin `'use server'`) y no en
 * `coach-actions.ts`: un módulo Server Actions ('use server') solo puede exportar
 * funciones async, así que un helper síncrono exportado desde ahí rompe el build.
 *
 * ⚠️ NO incluye `enabled_modules` (plan 05 / F6.1 / D2): el override de módulos del CEO
 * para standalone pasó a WRITE-THROUGH de `coach_addons` (filas `admin_grant`, price 0) —
 * el trigger D1 recomputa `coaches.enabled_modules`. Escribir el jsonb directo acá lo
 * pisaría el trigger en la próxima mutación de add-ons. La rama de módulos vive ahora en
 * `updateCoachAction` (lee `modules_present` + `readModules` y llama `syncAdminGrants`).
 */
export function buildCoachUpdateData(formData: FormData): Record<string, unknown> {
    const updateData: Record<string, unknown> = {}
    const fields = ['full_name', 'brand_name', 'subscription_tier', 'subscription_status', 'billing_cycle', 'current_period_end', 'trial_ends_at', 'admin_notes', 'payment_provider', 'primary_color'] as const
    for (const f of fields) {
        const v = formData.get(f)
        if (v) updateData[f] = v as string
    }
    const maxClients = formData.get('max_clients')
    if (maxClients) updateData.max_clients = Number(maxClients)
    return updateData
}
