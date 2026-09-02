import { BRAND_APP_ICON } from '@/lib/brand-assets'

/**
 * Ejecutor V3 (QA6 · morph de lanzamiento) — resolución de la MARCA del coach para el splash y el
 * loader morph, leída del wrapper `/c` (layout.tsx expone `data-primary-color` / `data-logo-url` /
 * `data-logo-dark` / `data-brand-name`). El COLOR visual del morph/splash NO sale de aquí: se toma como `--exec-brand =
 * var(--theme-primary)` (misma fórmula que el splash V3, white-label safe). Aquí sólo resolvemos el
 * LOGO real y la inicial de respaldo para que el handoff dashboard→ejecutor sea idéntico.
 */
export interface LaunchBrand {
    /** Logo real del coach (URL) o `null` cuando es el ícono EVA de respaldo / sin logo propio. */
    logoUrl: string | null
    /** Inicial de respaldo (primera letra del nombre de marca), o `null` si no hay nombre. */
    initial: string | null
    /** Nombre de marca crudo (por si el call site lo necesita para aria-label). */
    brandName: string | null
}

/**
 * Último eslabón de la cadena del círculo de marca del Despegue: `logoUrl → initial → ícono EVA`.
 * Vive acá (y no como campo de `LaunchBrand`) porque es una decisión de RENDER del overlay, no del
 * resolutor: el splash `SessionIntro` comparte este módulo pero su avatar de 116 px se queda en la
 * inicial. El call site que lo quiera lo importa explícitamente.
 */
export const LAUNCH_BRAND_FALLBACK_LOGO = BRAND_APP_ICON

/**
 * Sube por el DOM hasta el wrapper `/c` (`[data-primary-color]`) y devuelve el logo del coach + la
 * inicial. El layout cae a `BRAND_APP_ICON` (ícono EVA) cuando el coach no tiene logo propio: eso NO
 * es "logo del coach", así que lo tratamos como ausente para caer a la inicial — igual que el splash.
 *
 * La ceremonia y el splash son DARK-ONLY (fondo oscuro sin importar el tema del sistema), así que la
 * variante oscura del logo manda y el logo claro queda como respaldo — misma regla que
 * `resolveThemedLogoSrcs` / `resolveShareCardLogo`.
 */
export function resolveLaunchBrand(el: Element | null): LaunchBrand {
    // El trigger puede vivir en un PORTAL: el bottom-sheet de «Revisar y editar» / «Repetir hoy»
    // (Base UI monta el popup en `document.body`, HERMANO del wrapper `/c`, no descendiente). Ahí
    // `closest` devolvía `null` y el Despegue perdía el logo Y la inicial, cayendo al glifo genérico.
    // El wrapper es único por documento, así que buscarlo a nivel documento es el MISMO host, no una
    // heurística; `closest` conserva la prioridad y esto sólo actúa de último recurso (si algún día
    // hubiera dos `[data-primary-color]`, se tomaría el primero).
    const doc = el?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
    const host =
        el?.closest<HTMLElement>('[data-primary-color]') ??
        doc?.querySelector<HTMLElement>('[data-primary-color]') ??
        null
    const ownLogo = (raw: string | undefined) => {
        const value = raw?.trim() || null
        return value && value !== BRAND_APP_ICON ? value : null
    }
    const logoUrl = ownLogo(host?.dataset.logoDark) ?? ownLogo(host?.dataset.logoUrl)
    const brandName = host?.dataset.brandName?.trim() || null
    const initial = brandName ? brandName.charAt(0).toUpperCase() : null
    return { logoUrl, initial, brandName }
}
