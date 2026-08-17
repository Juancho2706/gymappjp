export {
  BuilderInspector,
  BuilderStepList,
  FoodRow,
  FoodThumbnail,
  MealSlotCard,
  MealTimeline,
  NutritionCard,
  NutritionHeader,
  NutritionPageShell,
  NutritionRefreshButton,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionToolbar,
  ResponsiveDataAdapter,
  StrategyBadge,
  SyncOfflineState,
  type NutritionCardProps,
} from './NutritionV2Kit'
export {
  CoachAttentionCard,
  MacroBudget,
  MacroProgress,
  StudentPreview,
} from './NutritionV2Overrides'
export { MacroChipRow, type MacroChipRowProps } from './MacroChipRow'
// T3.v Cabina: el par MacroSpark + su popover de gramos (reemplaza a MacroChipRow SOLO en las
// superficies del editor único / picker / publish — el builder y el área del alumno siguen con
// MacroChipRow, ver SPEC D2).
export { MacroSpark, type MacroSparkProps, type MacroSparkSize } from './MacroSpark'
export { MacroSparkPopover, type MacroSparkPopoverProps } from './MacroSparkPopover'
export { DayVariantWeekStrip } from './DayVariantWeekStrip'
export { WeekDayNav, type WeekDayNavProps } from './WeekDayNav'
export { PlanDowSelector } from './PlanDowSelector'
export { PrescribedPortionChips } from './PrescribedPortionChips'
// NutritionDomainOff NO se re-exporta aca a proposito: es un Server Component que lee
// `next/headers` via getClientBasePath, y este barrel lo consumen componentes 'use client'
// (NutritionTabV2). Importarlo por ruta directa: '@/components/nutrition-v2/NutritionDomainOff'.
export * from './NutritionV2Motion'
export {
  NUTRITION_ILLUSTRATIONS,
  resolveNutritionIllustration,
  nutritionIllustrationSource,
  type NutritionIllustration,
  type NutritionEmptyState,
  type NutritionIllustrationSource,
} from './state-illustration'
