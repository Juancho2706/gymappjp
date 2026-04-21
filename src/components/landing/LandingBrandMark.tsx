'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BRAND_APP_ICON, LANDING_LOGO_LIGHT_MARK } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'

type LandingBrandMarkProps = {
    className?: string
    /** Altura del pictograma (el wordmark EVA escala con tipografía) */
    iconClassName?: string
}

export function LandingBrandMark({ className, iconClassName }: LandingBrandMarkProps) {
    return (
        <Link
            href="/"
            className={cn('flex items-center gap-2.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md', className)}
            aria-label="EVA — inicio"
        >
            <span className={cn('relative h-9 w-9 sm:h-10 sm:w-10 shrink-0', iconClassName)}>
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
            <span className="font-display font-black text-lg sm:text-xl tracking-tight text-foreground leading-none">
                EVA
            </span>
        </Link>
    )
}
