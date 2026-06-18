/**
 * Shared, presentational nutrition UI primitives used by both coach and alumno
 * surfaces. All components are 'use client', data-agnostic (props only), and
 * use the canonical `--color-macro-*` tokens with full a11y (role +
 * aria-valuetext, never color-alone). Wiring into pages happens in the
 * Consolidate phase — these are the building blocks.
 */
export { AdherenceRing, type AdherenceRingProps } from './AdherenceRing'
export {
  MacroRings,
  macroRingAriaLabel,
  type MacroRingsProps,
  type MacroDatum,
} from './MacroRings'
export {
  MacroBars,
  MacroBarRow,
  macroBarAriaText,
  type MacroBarsProps,
  type MacroBarRowProps,
  type MacroBarDatum,
} from './MacroBars'
export { ConsumedVsTarget, type ConsumedVsTargetProps } from './ConsumedVsTarget'
export {
  MealAdherenceList,
  type MealAdherenceListProps,
  type MealAdherenceItem,
} from './MealAdherenceList'
export {
  NutritionProgressZone,
  type NutritionProgressZoneProps,
} from './NutritionProgressZone'
export {
  MACRO_META,
  MACRO_OVER_COLOR,
  MACRO_GOAL_COLOR,
  RING_TRACK,
  RING_TRACK_STRONG,
  macroRatio,
  macroPct,
  type MacroKey,
  type MacroMeta,
} from './macro-tokens'
