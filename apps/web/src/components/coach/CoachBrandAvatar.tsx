'use client'

import { useEffect, useState } from 'react'

import { ThemedLogo } from '@/components/brand/ThemedLogo'
import { cn } from '@/lib/utils'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

/**
 * Avatar de IDENTIDAD DEL COACH — el logo de su marca cuando existe, EVA cuando no.
 *
 * Contrato único para los círculos de identidad del panel /coach (topbar, sidebar, header
 * móvil del dashboard, hero de Opciones). Antes cada superficie repetía el ternario
 * `logoUrl ? <span+ThemedLogo> : <Avatar name>` y NINGUNA tenía red de seguridad: si la URL
 * del logo moría (bucket borrado, offline, formato que el optimizador rechaza) quedaba el
 * hueco roto de la imagen en vez de las iniciales. Acá el fallo de carga cae a las iniciales.
 *
 * - `object-contain` + fondo neutro: un logo rectangular NO se recorta ni se deforma.
 * - Sin gate de tier: es el panel PROPIO del coach viéndose a sí mismo (el gate de white-label
 *   aplica a lo que ve el ALUMNO, no acá).
 * - `fallback` permite conservar el marco propio de una superficie (p.ej. el círculo sport con
 *   anillo del hero de Opciones) en vez del fallback EVA por defecto.
 */

type CoachBrandAvatarSize = 'sm' | 'md' | 'lg'

/** Caja del marco + `sizes` de next/image por tamaño. sm 32 · md 40 · lg 56 (DS). */
const FRAME: Record<CoachBrandAvatarSize, { box: string; sizes: string; pad: string }> = {
    sm: { box: 'size-8', sizes: '32px', pad: 'p-1' },
    md: { box: 'size-10', sizes: '40px', pad: 'p-1.5' },
    lg: { box: 'size-14', sizes: '56px', pad: 'p-2' },
}

/** Fallback de identidad EVA para un coach sin white-label visible (tier sin marca). */
export function EvaBrandFallback({
    size = 'sm',
    className,
}: {
    size?: CoachBrandAvatarSize
    className?: string
}) {
    const frame = FRAME[size]
    return (
        <span className={cn('relative block shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-card', frame.box, className)}>
            <ThemedLogo
                light={BRAND_APP_ICON}
                dark={BRAND_APP_ICON}
                alt="EVA"
                fill
                sizes={frame.sizes}
                className={cn('object-contain eva-system-mark', frame.pad)}
            />
        </span>
    )
}

export function CoachBrandAvatar({
    name,
    logoUrl,
    logoDarkUrl,
    size = 'sm',
    className,
    fallback,
}: {
    /** Nombre de marca / del coach — alt del logo y origen de las iniciales. */
    name: string
    logoUrl?: string | null
    logoDarkUrl?: string | null
    size?: CoachBrandAvatarSize
    /** Clases extra del marco del logo (no afectan al fallback). */
    className?: string
    /** Qué mostrar sin logo o si la imagen falla. Por defecto, el fallback EVA. */
    fallback?: React.ReactNode
}) {
    const [failed, setFailed] = useState(false)
    const src = logoUrl?.trim() || null
    const darkSrc = logoDarkUrl?.trim() || null

    // Si el coach cambia su logo (Mi Marca) el error previo ya no aplica.
    useEffect(() => {
        setFailed(false)
    }, [src, darkSrc])

    if (!src || failed) {
        return <>{fallback ?? <EvaBrandFallback size={size} />}</>
    }

    const frame = FRAME[size]
    return (
        // `block` obligatorio: un span inline ignora el size-* y colapsa a ~2px (el Image `fill`
        // queda sin área) — así "desaparecía" el chip del workspace en el header móvil.
        <span
            className={cn(
                'relative block shrink-0 overflow-hidden rounded-full border border-subtle bg-white dark:bg-[var(--surface-sunken)]',
                frame.box,
                className
            )}
        >
            <ThemedLogo
                light={src}
                dark={darkSrc}
                alt={name}
                fill
                sizes={frame.sizes}
                className={cn('object-contain', frame.pad)}
                onError={() => setFailed(true)}
            />
        </span>
    )
}
