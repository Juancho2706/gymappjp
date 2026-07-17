import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Resuelve qué logo de marca mostrar por tema. Regla única (espejo de
 * `resolveShareCardLogo` para el canvas): modo claro → logo claro; modo oscuro →
 * logo oscuro con FALLBACK al claro cuando el coach no subió variante dark.
 *
 * Devuelve ambas fuentes ya normalizadas (trim + null si vacías) para que el
 * render pueda decidir entre una sola imagen o el swap de dos imágenes.
 */
export function resolveThemedLogoSrcs(
    light: string | null | undefined,
    dark: string | null | undefined,
): { light: string | null; dark: string | null } {
    const l = light?.trim() || null
    const d = dark?.trim() || null
    // dark cae al claro cuando no hay variante oscura → nunca queda sin logo en dark.
    return { light: l, dark: d || l }
}

type ThemedLogoBase = {
    /** Logo modo claro (marca del coach/team/org). */
    light: string | null | undefined
    /** Logo modo oscuro. Ausente/vacío ⇒ cae al claro. */
    dark?: string | null
    alt: string
    className?: string
    style?: React.CSSProperties
    priority?: boolean
    sizes?: string
}

type ThemedLogoProps = ThemedLogoBase &
    (
        | { fill: true; width?: never; height?: never }
        | { fill?: false; width: number; height: number }
    )

/**
 * Logo de marca theme-aware, SSR-safe. Renderiza DOS imágenes con `dark:hidden` /
 * `hidden dark:block` (variante Tailwind por clase `.dark` de next-themes) — se
 * resuelve por CSS, sin `resolvedTheme` client-side, así que no hay flash de
 * hidratación. Si no hay variante dark distinta, cae a una sola imagen (sin DOM
 * duplicado). White-label: recibe las URLs ya resueltas por coach/team/org.
 */
export function ThemedLogo({
    light,
    dark,
    alt,
    className,
    style,
    priority,
    sizes,
    fill,
    width,
    height,
}: ThemedLogoProps) {
    const { light: lightSrc, dark: darkSrc } = resolveThemedLogoSrcs(light, dark)
    if (!lightSrc) return null

    const dims = fill
        ? ({ fill: true } as const)
        : ({ width: width as number, height: height as number } as const)
    const common = { sizes, priority, style, ...dims }

    // Sin variante dark real → una sola imagen (comportamiento idéntico al previo).
    if (!darkSrc || darkSrc === lightSrc) {
        return <Image src={lightSrc} alt={alt} className={className} {...common} />
    }

    return (
        <>
            <Image src={lightSrc} alt={alt} className={cn(className, 'dark:hidden')} {...common} />
            <Image src={darkSrc} alt={alt} className={cn(className, 'hidden dark:block')} {...common} />
        </>
    )
}
