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
// T3.v Cabina «Familia N»: la pastilla única de alta (franja/porciones/día/plantilla/versión/libre
// y alimento) + el lector del hex de marca que necesita su variante `primary` (white-label).
export { useBrandPrimaryHex } from './useBrandPrimaryHex'
export {
  ADD_ACTION_DARK_INK,
  ADD_ACTION_DEFAULT_BRAND,
  ADD_ACTION_ICONS,
  AddActionButton,
  addActionIconSrc,
  addActionInk,
  type AddActionButtonProps,
  type AddActionIcon,
  type AddActionInk,
  type AddActionVariant,
} from './AddActionButton'
