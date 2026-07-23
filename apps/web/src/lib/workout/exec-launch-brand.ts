import { BRAND_APP_ICON } from '@/lib/brand-assets'

/**
 * Ejecutor V3 (QA6 · morph de lanzamiento) — resolución de la MARCA del coach para el splash y el
 * loader morph, leída del wrapper `/c` (layout.tsx expone `data-primary-color` / `data-logo-url` /
 * `data-brand-name`). El COLOR visual del morph/splash NO sale de aquí: se toma como `--exec-brand =
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
 * Sube por el DOM hasta el wrapper `/c` (`[data-primary-color]`) y devuelve el logo del coach + la
 * inicial. El layout cae a `BRAND_APP_ICON` (ícono EVA) cuando el coach no tiene logo propio: eso NO
 * es "logo del coach", así que lo tratamos como ausente para caer a la inicial — igual que el splash.
 */
export function resolveLaunchBrand(el: Element | null): LaunchBrand {
    const host = el?.closest<HTMLElement>('[data-primary-color]') ?? null
    const rawLogo = host?.dataset.logoUrl?.trim() || null
    const logoUrl = rawLogo && rawLogo !== BRAND_APP_ICON ? rawLogo : null
    const brandName = host?.dataset.brandName?.trim() || null
    const initial = brandName ? brandName.charAt(0).toUpperCase() : null
    return { logoUrl, initial, brandName }
}
