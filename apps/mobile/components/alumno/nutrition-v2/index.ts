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
