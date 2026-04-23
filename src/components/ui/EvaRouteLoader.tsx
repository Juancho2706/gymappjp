'use client'

import Image from 'next/image'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'
import { EvaTreefrogLoader } from '@/components/loaders/EvaTreefrogLoader'

type EvaRouteLoaderProps = {
    /** Texto secundario bajo la marca */
    subtitle?: string
    className?: string
    /** Tamaño del bloque de marca (icono + EVA) */
    size?: 'md' | 'lg'
}

/**
 * Marca EVA destacada + animación ligera (sin styled-components).
 * Respetar `prefers-reduced-motion` vía CSS en globals.
 */
export function EvaRouteLoader({
    subtitle,
    className,
    size = 'lg',
}: EvaRouteLoaderProps) {
    const iconPx = size === 'lg' ? 56 : 44
    const wordClass =
        size === 'lg'
            ? 'text-4xl sm:text-5xl tracking-tight'
            : 'text-3xl sm:text-4xl tracking-tight'

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 text-center',
                'eva-route-loader-motion',
                className
            )}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:gap-4">
                <div className="eva-loader-icon-wrap relative shrink-0">
                    <Image
                        src={BRAND_APP_ICON}
                        alt=""
                        width={iconPx}
                        height={iconPx}
                        className="drop-shadow-md"
                        priority={false}
                    />
                </div>
                <span
                    className={cn(
                        'font-display font-extrabold leading-none',
                        'bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500 bg-clip-text text-transparent',
                        'eva-loader-word-shine',
                        wordClass
                    )}
                >
                    EVA
                </span>
            </div>
            {subtitle ? (
                <p className="text-muted-foreground text-sm font-medium max-w-xs">{subtitle}</p>
            ) : null}
        </div>
    )
}

/** Marca EVA / treefrog sin contenedor tipo “card” (solo animación). */
function BrandMarkSlot({
    subtitle,
    top,
    compact,
}: {
    subtitle?: string
    top: 'route' | 'treefrog'
    compact?: boolean
}) {
    return (
        <div className={cn('relative flex flex-col items-center justify-center', compact ? 'py-2' : 'py-3')}>
            {top === 'route' ? (
                <EvaRouteLoader subtitle={subtitle} size="lg" className="py-1" />
            ) : (
                <EvaTreefrogLoader compact={Boolean(compact)} subtitle={subtitle} className="py-1" />
            )}
        </div>
    )
}

/** Altura útil aproximada entre chrome móvil y barra inferior (coach y alumno comparten vars). */
const routeLoaderMinHeightClass =
    'min-h-[calc(100svh-var(--mobile-content-top-offset)-var(--mobile-content-bottom-offset)-3rem)] md:min-h-[min(85dvh,820px)]'

export type CoachLoadingShellProps = {
    /** Skeletons u otro contenido bajo la marca; si se omite, solo se muestra la marca centrada. */
    children?: React.ReactNode
    /** Subtítulo bajo la marca */
    subtitle?: string
    /**
     * Bloque superior: icono EVA clásico o animación treefrog (uiverse).
     * Por defecto `treefrog` para unificar marca en transiciones de ruta.
     */
    top?: 'route' | 'treefrog'
    /**
     * `default`: franja de marca + children en flujo normal.
     * `fullscreen`: viewport fijo con marca arriba y children ocupando el resto (p. ej. entreno alumno).
     */
    layout?: 'default' | 'fullscreen'
}

/**
 * Bloque de marca arriba + contenido opcional debajo para `loading.tsx` del coach.
 */
export function CoachLoadingShell({
    children,
    subtitle,
    top = 'treefrog',
    layout = 'default',
}: CoachLoadingShellProps) {
    const hasChildren = children != null && children !== false

    if (layout === 'fullscreen') {
        return (
            <div className="fixed inset-0 z-50 flex animate-in flex-col bg-background fade-in duration-300">
                <div className="flex shrink-0 justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
                    <BrandMarkSlot subtitle={subtitle} top={top} compact />
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
        )
    }

    if (!hasChildren) {
        return (
            <div
                className={cn(
                    'flex w-full flex-col items-center justify-center px-4 animate-in fade-in duration-300',
                    routeLoaderMinHeightClass,
                    'max-md:-my-6 max-md:py-6'
                )}
            >
                <BrandMarkSlot subtitle={subtitle} top={top} compact />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex justify-center">
                <BrandMarkSlot subtitle={subtitle} top={top} compact />
            </div>
            {children}
        </div>
    )
}

/** Misma UI que coach para `loading.tsx` del portal alumno (`/c/...`). */
export function ClientLoadingShell(props: CoachLoadingShellProps) {
    return <CoachLoadingShell {...props} />
}
