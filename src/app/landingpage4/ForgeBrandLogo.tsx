'use client'

import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const LOGO_LIGHT = `/LOGOS/${encodeURIComponent('LOGO NEGRO SIN LETRAS SIN BG BORDE BLANCO.png')}`
const LOGO_DARK = '/LOGOS/eva-icon.png'

const sizePx = {
    header: 36,
    hero: 128,
    footer: 64,
} as const

export function ForgeBrandLogo({
    variant,
    className,
    priority = false,
}: {
    variant: 'header' | 'hero' | 'footer'
    className?: string
    priority?: boolean
}) {
    const { resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const px = sizePx[variant]
    const isDark = mounted && resolvedTheme === 'dark'
    const src = isDark ? LOGO_DARK : LOGO_LIGHT

    const dim =
        variant === 'header'
            ? 'h-9 w-9 rounded-lg'
            : variant === 'footer'
              ? 'h-16 w-16 rounded-xl'
              : 'h-24 w-24 rounded-xl sm:h-32 sm:w-32'

    return (
        <span
            className={cn(
                'relative inline-block shrink-0 overflow-hidden border border-[var(--forge-border)] bg-[var(--forge-surface-alt)]',
                dim,
                className
            )}
        >
            {!mounted ? (
                <span className="block size-full bg-[var(--forge-surface-alt)]" aria-hidden />
            ) : (
                <Image
                    src={src}
                    alt="EVA"
                    fill
                    className="object-contain p-1"
                    sizes={`${px}px`}
                    priority={priority}
                />
            )}
        </span>
    )
}
