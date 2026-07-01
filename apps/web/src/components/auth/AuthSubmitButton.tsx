'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthVariant } from './AuthFormField'

interface AuthSubmitButtonProps
    extends Omit<React.ComponentProps<'button'>, 'type' | 'disabled'> {
    label: string
    pendingLabel?: string
    variant?: AuthVariant
    /** DS Button sizes: md = 48px/16px, lg = 56px/17px (CTA primario del funnel de auth) */
    size?: 'md' | 'lg'
    leadingIcon?: React.ReactNode
    trailingIcon?: React.ReactNode
}

export function AuthSubmitButton({
    label,
    pendingLabel,
    variant = 'coach',
    size = 'md',
    leadingIcon,
    trailingIcon,
    className,
    ...props
}: AuthSubmitButtonProps) {
    const { pending } = useFormStatus()
    const isEnterprise = variant === 'enterprise'

    return (
        <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={cn(
                'w-full rounded-control font-bold tracking-[-0.01em] transition-all duration-200',
                size === 'lg'
                    ? 'min-h-14 px-[22px] text-[17px]'
                    : 'min-h-[48px] text-base',
                'flex items-center justify-center gap-2',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                'active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed',
                isEnterprise
                    ? [
                          'bg-amber-500 hover:bg-amber-400 text-zinc-950 ring-offset-2',
                          'shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30',
                          'focus-visible:ring-amber-400 focus-visible:ring-offset-zinc-950',
                      ]
                    : [
                          'bg-[var(--cta-fill)] text-[var(--text-on-sport)] border-transparent',
                          'shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                      ],
                className,
            )}
            {...props}
        >
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {pendingLabel ?? 'Iniciando sesión...'}
                </>
            ) : (
                <>
                    {leadingIcon}
                    {label}
                    {trailingIcon}
                </>
            )}
        </button>
    )
}
