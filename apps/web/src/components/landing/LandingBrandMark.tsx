'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BRAND_APP_ICON, LANDING_LOGO_LIGHT_MARK } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'

type EvaBrandIconProps = {
    /** Clases del contenedor del pictograma (tamaño, shrink) */
    className?: string
}

/** Pictograma EVA (claro/oscuro) sin texto — mismo asset que el landing. */
export function EvaBrandIcon({ className }: EvaBrandIconProps) {
    return (
        <span className={cn('relative h-9 w-9 shrink-0 sm:h-10 sm:w-10', className)}>
            <Image
                src={LANDING_LOGO_LIGHT_MARK}
                alt=""
                fill
                sizes="40px"
                className="object-contain dark:hidden"
                priority
            />
            <Image
                src={BRAND_APP_ICON}
                alt=""
                fill
                sizes="40px"
                className="object-contain hidden dark:block"
                priority
            />
        </span>
    )
}

type LandingBrandMarkProps = {
    className?: string
    /** Altura del pictograma (el wordmark EVA escala con tipografía) */
    iconClassName?: string
}

export function LandingBrandMark({ className, iconClassName }: LandingBrandMarkProps) {
    return (
        <Link
            href="/"
            className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className
            )}
            aria-label="EVA — inicio"
        >
            <EvaBrandIcon className={iconClassName} />
            <span className="font-display text-lg font-black leading-none tracking-tight text-foreground sm:text-xl">
                EVA
            </span>
        </Link>
    )
}

/** Alias semántico fuera de la landing. */
export { LandingBrandMark as EvaBrandMark }
