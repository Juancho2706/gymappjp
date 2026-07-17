import { BrandCoachLoadingShell } from '../../_components/BrandCoachLoadingShell'

/**
 * Skeleton de la ficha nutricional V2: sin este archivo la navegación desde la
 * ficha del alumno ("Abrir ficha nutrición completa") se quedaba congelada sin
 * feedback mientras el RSC resolvía (QA CEO 2026-07-17).
 */
export default function LoadingNutritionClientDetail() {
    return <BrandCoachLoadingShell />
}
