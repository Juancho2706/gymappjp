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
    leadingIcon?: React.ReactNode
}

export function AuthSubmitButton({
    label,
    pendingLabel,
    variant = 'coach',
    leadingIcon,
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
                'w-full min-h-[48px] rounded-xl text-base font-semibold transition-all duration-200',
                'flex items-center justify-center gap-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                isEnterprise
                    ? [
                          'bg-amber-500 hover:bg-amber-400 text-zinc-950',
                          'shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30',
                          'focus-visible:ring-amber-400 focus-visible:ring-offset-zinc-950',
                      ]
                    : [
                          'bg-primary hover:opacity-90 text-primary-foreground',
                          'shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
                          'focus-visible:ring-primary/60 focus-visible:ring-offset-background',
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
                </>
            )}
        </button>
    )
}
