// Meta visual por tipo de ejercicio para RN (label corto + color + icono lucide-react-native).
// Presentacion mobile-local: el mapa de iconos NO viaja al paquete puro @eva/workout-engine
// (que se mantiene sin dependencias de UI). Espeja EXERCISE_TYPE_META de la web
// (apps/web/src/lib/workout-exercise-type.ts): mismos colores (cardio = --ember-500 #FF6A3D,
// movilidad = teal #14B8A6, roller = violeta #8B5CF6) y semantica de iconos. `color: null` en
// strength ⇒ brand-aware: el consumidor usa theme.primary (hereda la marca del coach).
import type { ComponentType } from 'react'
import { Dumbbell, GitCommit, HeartPulse, Move } from 'lucide-react-native'
import type { ExerciseType } from '@eva/workout-engine'

export interface ExerciseTypeMeta {
  label: string
  /** Color fijo, o `null` para heredar la marca (theme.primary) — solo strength. */
  color: string | null
  Icon: ComponentType<{ size?: number; color?: string }>
}

export const EXERCISE_TYPE_META: Record<ExerciseType, ExerciseTypeMeta> = {
  strength: { label: 'Fuerza', color: null, Icon: Dumbbell },
  cardio: { label: 'Cardio', color: '#FF6A3D', Icon: HeartPulse },
  mobility: { label: 'Movilidad', color: '#14B8A6', Icon: Move },
  roller: { label: 'Roller', color: '#8B5CF6', Icon: GitCommit },
}

/** Color efectivo del tipo (strength ⇒ brand primary; resto ⇒ color fijo del META). */
export function exerciseTypeColor(type: ExerciseType, primary: string): string {
  return EXERCISE_TYPE_META[type].color ?? primary
}
