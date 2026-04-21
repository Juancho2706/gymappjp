'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const liquidbuttonVariants = cva(
    'relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    {
        variants: {
            variant: {
                default: 'bg-transparent text-primary transition duration-300 hover:scale-105',
                destructive:
                    'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
                outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-9 px-4 py-2 has-[>svg]:px-3',
                sm: 'h-8 gap-1.5 px-4 text-xs has-[>svg]:px-4',
                lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
                xl: 'h-12 rounded-md px-8 has-[>svg]:px-6',
                xxl: 'h-14 rounded-md px-10 has-[>svg]:px-8',
                icon: 'size-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'xxl',
        },
    }
)

function GlassFilter({ filterId }: { filterId: string }) {
    return (
        <svg className="hidden" aria-hidden>
            <defs>
                <filter
                    id={filterId}
                    x="0%"
                    y="0%"
                    width="100%"
                    height="100%"
                    colorInterpolationFilters="sRGB"
                >
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.05 0.05"
                        numOctaves={1}
                        seed={1}
                        result="turbulence"
                    />
                    <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
                    <feDisplacementMap
                        in="SourceGraphic"
                        in2="blurredNoise"
                        scale={70}
                        xChannelSelector="R"
                        yChannelSelector="B"
                        result="displaced"
                    />
                    <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
                    <feComposite in="finalBlur" in2="finalBlur" operator="over" />
                </filter>
            </defs>
        </svg>
    )
}

function LiquidChrome({ filterId, children }: { filterId: string; children: React.ReactNode }) {
    return (
        <>
            <div
                className={cn(
                    'absolute top-0 left-0 z-0 h-full w-full rounded-full',
                    'shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(0,0,0,0.9),inset_-3px_-3px_0.5px_-3px_rgba(0,0,0,0.85),inset_1px_1px_1px_-0.5px_rgba(0,0,0,0.6),inset_-1px_-1px_1px_-0.5px_rgba(0,0,0,0.6),inset_0_0_6px_6px_rgba(0,0,0,0.12),inset_0_0_2px_2px_rgba(0,0,0,0.06),0_0_12px_rgba(255,255,255,0.15)]',
                    'transition-all',
                    'dark:shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)]'
                )}
            />
            <div
                className="absolute top-0 left-0 isolate -z-10 h-full w-full overflow-hidden rounded-md"
                style={{ backdropFilter: `url("#${filterId}")` }}
            />
            <span className="pointer-events-none relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
            <GlassFilter filterId={filterId} />
        </>
    )
}

export type LiquidButtonProps = Omit<React.ComponentProps<'button'>, 'children'> &
    VariantProps<typeof liquidbuttonVariants> & {
        asChild?: boolean
        children?: React.ReactNode
    }

function LiquidButton({ className, variant, size, asChild = false, children, ...props }: LiquidButtonProps) {
    const filterId = React.useId().replace(/:/g, '')
    const shellClass = cn(liquidbuttonVariants({ variant, size }), className)

    if (asChild) {
        const child = React.Children.only(children) as React.ReactElement<{
            children?: React.ReactNode
            className?: string
        }>
        const label = child.props.children
        return React.cloneElement(child, {
            className: cn(shellClass, child.props.className),
            children: <LiquidChrome filterId={filterId}>{label}</LiquidChrome>,
        })
    }

    return (
        <button type="button" className={shellClass} {...props}>
            <LiquidChrome filterId={filterId}>{children}</LiquidChrome>
        </button>
    )
}

export { LiquidButton, liquidbuttonVariants }
