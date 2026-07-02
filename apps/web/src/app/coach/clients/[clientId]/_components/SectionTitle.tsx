import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ---- Section heading de la ficha (kit shared.jsx: font-display 800 · 17px · -0.02em · text-strong) ---- */
export function SectionTitle({
    children,
    className,
    style,
}: {
    children: ReactNode
    className?: string
    style?: CSSProperties
}) {
    return (
        <h3
            className={cn('font-display font-extrabold tracking-[-0.02em] text-strong', className)}
            style={{ fontSize: 17, margin: '4px 0 10px', ...style }}
        >
            {children}
        </h3>
    )
}
