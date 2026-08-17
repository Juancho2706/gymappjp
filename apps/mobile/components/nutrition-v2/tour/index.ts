/**
 * Guía Viva RN — barrel de la carpeta (SPEC `nutrition-onboarding-tour`).
 *
 * Motor propio de spotlight para el onboarding de Nutrición en el teléfono: overlay + «?» + registro
 * de targets + guiones cerrados + memoria local por coach. Cero dependencias nuevas, cero backend.
 * Espejo de `apps/web/src/components/nutrition-v2/tour/index.ts`.
 */
export {
  TourOverlay,
  TOUR_COPY,
  useTourController,
  type TourController,
  type TourControllerOptions,
  type TourEndReason,
  type TourOverlayProps,
} from './TourOverlay'
export {
  TourHelpButton,
  type TourHelpButtonProps,
  type TourHelpButtonVariant,
} from './TourHelpButton'
export {
  TourScrollHostBinder,
  TourTarget,
  TourTargetsProvider,
  useTourScrollHost,
  useTourTarget,
  useTourTargets,
  type TourRect,
  type TourScrollHost,
} from './TourTargets'
export {
  TOUR_FLAG_VERSION,
  clearTourSeen,
  hasSeenTour,
  markTourSeen,
  tourFlagKey,
  useHasSeenTour,
} from './tour-flags'
export {
  EDITOR_TOUR_STEPS_COMPACT,
  HUB_TOUR_STEPS,
  TOUR_FOOD_ICONS,
  tourIconSource,
  tourSteps,
  type TourFoodIcon,
  type TourIcon,
  type TourId,
  type TourStep,
} from './tours'
