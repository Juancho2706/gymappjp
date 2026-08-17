/**
 * Superficies de PORCIONES (intercambios) del alumno RN — SPEC nutrition-portions
 * UX-b/UX-c. Capa 100% opcional: sin targets en el plan, nada de esto se monta.
 */
export { PortionChip, GroupDot } from './PortionChip'
export {
  PortionSlotSection,
  coverageViewFor,
  portionTargetColor,
  type PortionSlotSectionProps,
} from './PortionSlotSection'
export { PortionDayCoverageRow } from './PortionDayCoverageRow'
export { PortionEquivalencesSheet } from './PortionEquivalencesSheet'
export { PortionSnackbar, type PortionSnackbarState } from './PortionSnackbar'
export { usePortionMarks, type UsePortionMarksResult } from './usePortionMarks'

/**
 * Semana Lu-Do del alumno (SPEC nutrition-week-view): el día que no es hoy se muestra en SOLO
 * lectura — pasado con sus resultados congelados, futuro como vista previa del plan.
 */
export { PastDaySummary, type PastDaySummaryProps } from './PastDaySummary'

/**
 * Nota del coach por franja/grupo en el Hoy (SPEC nutrition-coach-notes N3):
 * banda 💬 tenue de marca; sin nota, cero render.
 */
export { CoachNoteBand } from './CoachNoteBand'
export { LegacyHistoryDetail } from './LegacyHistoryDetail'
export { ReadOnlyDayBanner, type ReadOnlyDayBannerProps } from './ReadOnlyDayBanner'
export { useNutritionWeekHistory, type NutritionWeekHistory } from './useNutritionWeekHistory'
