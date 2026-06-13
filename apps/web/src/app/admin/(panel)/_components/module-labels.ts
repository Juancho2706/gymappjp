import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'

export const MODULE_LABELS: Record<ModuleKey, string> = {
    cardio: 'Cardio',
    movement_assessment: 'Evaluación de movimiento',
    body_composition: 'Composición corporal',
    nutrition_exchanges: 'Nutrición por intercambios',
}

export { MODULE_KEYS }
export type { ModuleKey }
