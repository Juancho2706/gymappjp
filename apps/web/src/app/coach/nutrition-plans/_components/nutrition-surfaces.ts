import type { NutritionTier } from '@/components/nutrition/TierBadge'

/**
 * Claridad layer (§5b — no abrumar al coach): one short plain-language line per
 * nutrition surface, explaining what it is and whether it ships in the base tier
 * (canUseNutrition) or is the paid "Nutrición Pro" add-on. Single source of truth
 * shared by the coach guide dialog.
 */
export type NutritionSurface = {
  key: string
  label: string
  description: string
  tier: NutritionTier
}

export const NUTRITION_SURFACES: NutritionSurface[] = [
  {
    key: 'recetas',
    label: 'Recetas',
    description: 'Ideas de recetas para inspirar a tus alumnos. No afectan macros ni adherencia.',
    tier: 'base',
  },
  {
    key: 'micros',
    label: 'Micronutrientes',
    description: 'Vitaminas y minerales estimados del plan, sin trabajo extra de tu parte.',
    tier: 'base',
  },
  {
    key: 'notas',
    label: 'Notas',
    description: 'Notas y recordatorios que dejas a un alumno sobre su nutrición.',
    tier: 'base',
  },
  {
    key: 'lista',
    label: 'Lista de compras',
    description: 'Lista de compras generada desde el plan del alumno, agrupada por categoría.',
    tier: 'base',
  },
  {
    key: 'objetivos',
    label: 'Objetivos',
    description: 'Calorías y macros objetivo calculados a partir de los datos del alumno.',
    tier: 'base',
  },
  {
    key: 'intercambios',
    label: 'Intercambios',
    description: 'Sistema de equivalencias para que el alumno arme comidas con flexibilidad.',
    tier: 'pro',
  },
]
