'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { AuthVariant } from './AuthFormField'

export interface TrustItem {
    icon: React.ReactNode
    label: string
    tooltip?: string
    href?: string
}

interface TrustStripProps {
    items: TrustItem[]
    variant?: AuthVariant
    className?: string
}

export function TrustStrip({ items, variant = 'enterprise', className }: TrustStripProps) {
    const isEnterprise = variant === 'enterprise'

    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-center gap-x-3 gap-y-2',
                className,
            )}
            aria-label="Características de seguridad"
        >
            {items.map((item, i) => {
                const pill = (
                    <span
                        key={i}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                            isEnterprise
                                ? 'border-zinc-700 bg-zinc-800/60 text-zinc-400'
                                : 'border-border bg-muted text-muted-foreground',
                        )}
                        title={item.tooltip}
                    >
                        <span aria-hidden="true" className="flex items-center [&_svg]:h-3 [&_svg]:w-3">
                            {item.icon}
                        </span>
                        {item.label}
                    </span>
                )

                if (item.href) {
                    return (
                        <a
                            key={i}
                            href={item.href}
                            target={item.href.startsWith('http') ? '_blank' : undefined}
                            rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded-full"
                        >
                            {pill}
                        </a>
                    )
                }

                return pill
            })}
        </div>
    )
}
