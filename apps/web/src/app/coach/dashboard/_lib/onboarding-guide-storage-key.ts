/**
 * Clave del espejo local de la guía, POR COACH: el dismiss de otra cuenta en el mismo navegador no
 * puede ocultar esta guía. Módulo sin dependencias a propósito: lo importan el hook
 * (`use-onboarding-guide.ts`) y el «Volver a mostrar la píldora» de `/coach/guia`
 * (`guide-pill-restore.ts`), que no puede arrastrar el hook ni sus server actions. Antes eran dos
 * copias del mismo string (W8.6.5).
 */
export function onboardingGuideStorageKey(coachId: string): string {
    return `eva:coach-onboarding:v2:${coachId}`
}
