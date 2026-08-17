/**
 * Guía Viva — barrel de la carpeta (SPEC `nutrition-onboarding-tour`).
 *
 * Motor propio de spotlight para el onboarding de Nutrición: overlay + «?» + guiones cerrados +
 * memoria local por coach. Cero dependencias nuevas, cero backend.
 */
export {
  TourOverlay,
  TOUR_COPY,
  TOUR_HELP_Z,
  useTourController,
  useTourWideViewport,
  type TourController,
  type TourControllerOptions,
  type TourEndReason,
  type TourOverlayProps,
} from './tour-engine'
export {
  TourHelpButton,
  type TourHelpButtonProps,
  type TourHelpButtonVariant,
} from './TourHelpButton'
export {
  TOUR_FLAG_VERSION,
  clearTourSeen,
  hasSeenTour,
  markTourSeen,
  tourFlagKey,
  useHasSeenTour,
} from './tour-flags'
export {
  EDITOR_TOUR_STEPS,
  EDITOR_TOUR_STEPS_COMPACT,
  HUB_TOUR_STEPS,
  TOUR_FOOD_ICONS,
  tourIconSrc,
  tourSteps,
  type TourFoodIcon,
  type TourIcon,
  type TourId,
  type TourStep,
} from './tours'
export {
  TOUR_CARD_WIDTH,
  TOUR_DOCK_MAX_WIDTH,
  TOUR_HOLE_PADDING,
  TOUR_TARGET_GAP,
  TOUR_VIEWPORT_MARGIN,
  clampToRange,
  computeCardPlacement,
  computeSpotlight,
  needsScrollIntoView,
  rectContainsRect,
  rectsIntersect,
  viewportRect,
  type TourCardPlacement,
  type TourCardSide,
  type TourRect,
  type TourSpotlight,
  type TourViewport,
} from './tour-geometry'
