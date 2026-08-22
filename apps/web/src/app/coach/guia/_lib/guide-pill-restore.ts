import { parseOnboardingGuide } from '../../dashboard/_lib/onboarding-guide-state'

/**
 * «Volver a mostrar la píldora» — el camino de vuelta después de apagar la guía.
 *
 * Contexto (QA del owner 22-08): la pantalla `/coach/guia` sigue siendo accesible por URL aunque
 * el coach haya tocado «No mostrar la guía en mi panel», pero hasta ahora ese botón era de ida
 * sola: `onboarding_guide.hidden` quedaba en `true` para siempre y la píldora no volvía nunca.
 *
 * Apagar la guía deja rastro en DOS lados y hay que limpiar los dos:
 *
 *  1. `coaches.onboarding_guide` (servidor) — lo limpia `persistOnboardingGuideAction`, que
 *     mergea sobre el jsonb existente.
 *  2. `localStorage` (navegador) — el espejo que escribe `useOnboardingGuide`. Si se limpia solo
 *     el servidor, la próxima hidratación hace `fromServer.hidden || local.hidden` y el `true`
 *     local revive el apagado. De ahí este módulo.
 *
 * Vive acá y no en `dashboard/_lib` porque el único disparador es la pantalla de la guía, y se
 * escribió con la `Storage` inyectable para poder probarlo sin jsdom global.
 */

/**
 * Clave del espejo local, POR COACH. Es la misma que produce `onboardingGuideStorageKey` en
 * `dashboard/_lib/use-onboarding-guide.ts`; se repite acá a propósito para no importar ese módulo
 * (arrastra server actions y el hook entero a un helper que solo toca `localStorage`).
 * Si aquella cambia, esta tiene que cambiar con ella.
 */
export function guideMirrorStorageKey(coachId: string): string {
    return `eva:coach-onboarding:v2:${coachId}`
}

/**
 * Payload para el servidor: apaga las DOS banderas. `dismissed` también, porque
 * `shouldShowGuidePill` mira las dos y dejar `dismissed: true` mantendría la píldora apagada
 * aunque `hidden` sea `false`.
 */
export function guidePillRestorePayload(): { dismissed: false; hidden: false } {
    return { dismissed: false, hidden: false }
}

/** Interfaz mínima de `localStorage` — lo justo para poder inyectar un doble en los tests. */
export interface GuideMirrorStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/**
 * Limpia `dismissed`/`hidden` del espejo local sin tocar el resto del estado (pasos tildados,
 * `emitted`, el confeti ya lanzado): perder eso re-emitiría eventos y volvería a disparar el
 * confeti del aha. Nunca lanza — en modo privado el servidor sigue siendo la fuente.
 */
export function restoreGuidePillLocally(coachId: string, storage?: GuideMirrorStorage | null): void {
    const store = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
    if (!store) return
    const key = guideMirrorStorageKey(coachId)
    try {
        const raw = store.getItem(key)
        const state = parseOnboardingGuide(raw == null ? {} : JSON.parse(raw))
        store.setItem(key, JSON.stringify({ ...state, dismissed: false, hidden: false }))
    } catch {
        /* JSON corrupto o cuota llena: el servidor ya quedó limpio */
    }
}
