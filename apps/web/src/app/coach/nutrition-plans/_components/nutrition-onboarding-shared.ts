import type { LucideIcon } from 'lucide-react'
import { Apple, BookOpen, Users } from 'lucide-react'

export type CoachNutritionOnboardingStep = {
  number: 1 | 2 | 3
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  description: string
  cta: string
  href: string | null
}

export const COACH_NUTRITION_ONBOARDING_STEPS: readonly CoachNutritionOnboardingStep[] = [
  {
    number: 1,
    icon: Apple,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-500/10',
    title: 'Agrega tus alimentos',
    description:
      'Busca en el catálogo (~250 alimentos chilenos y globales) o crea los tuyos propios. Los alimentos son la base de todos tus planes.',
    cta: 'Ir al catálogo',
    href: '/coach/foods',
  },
  {
    number: 2,
    icon: BookOpen,
    iconColor: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    title: 'Crea tu primera plantilla',
    description:
      'Una plantilla es un modelo de plan reutilizable. Arma las comidas con sus alimentos y cantidades. Tarda menos de 5 minutos.',
    cta: 'Crear plantilla',
    href: '/coach/nutrition-plans/new',
  },
  {
    number: 3,
    icon: Users,
    iconColor: 'text-sky-500',
    iconBg: 'bg-sky-500/10',
    title: 'Asigna el plan a un alumno',
    description:
      'Una vez tengas una plantilla lista, asígnala a tus alumnos. Puedes asignar la misma plantilla a varios a la vez.',
    cta: 'Asignar plan',
    href: null,
  },
] as const
