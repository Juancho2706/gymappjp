'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type AuthVariant = 'coach' | 'enterprise'

interface AuthFormFieldProps extends Omit<React.ComponentProps<'input'>, 'id'> {
    id: string
    label: string
    labelEnd?: React.ReactNode
    error?: string
    hint?: string
    variant?: AuthVariant
    leadingIcon?: React.ReactNode
    trailingSlot?: React.ReactNode
}

export function AuthFormField({
    id,
    label,
    labelEnd,
    error,
    hint,
    variant = 'coach',
    leadingIcon,
    trailingSlot,
    className,
    ...inputProps
}: AuthFormFieldProps) {
    const errorId = error ? `${id}-error` : undefined
    const hintId = hint ? `${id}-hint` : undefined
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

    const isEnterprise = variant === 'enterprise'

    return (
        <div className="flex flex-col gap-1.5">
            <div className={cn('flex items-center', labelEnd ? 'justify-between' : '')}>
                <label
                    htmlFor={id}
                    className={cn(
                        'text-sm font-medium',
                        isEnterprise ? 'text-zinc-300' : 'text-foreground',
                    )}
                >
                    {label}
                </label>
                {labelEnd}
            </div>

            <div className="relative flex items-center">
                {leadingIcon && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            'pointer-events-none absolute left-3 flex items-center',
                            isEnterprise ? 'text-zinc-500' : 'text-muted-foreground',
                        )}
                    >
                        {leadingIcon}
                    </span>
                )}

                <input
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        'w-full min-h-[48px] rounded-xl border px-4 py-3 text-base outline-none transition-all',
                        'placeholder:text-muted-foreground',
                        'disabled:pointer-events-none disabled:opacity-50',
                        // focus ring
                        'focus-visible:ring-2 focus-visible:ring-offset-2',
                        // leading icon padding
                        leadingIcon && 'pl-10',
                        // trailing slot padding
                        trailingSlot && 'pr-12',
                        // coach variant
                        !isEnterprise && [
                            'bg-background border-input text-foreground',
                            'focus-visible:ring-primary/50 focus-visible:ring-offset-background',
                            error && 'border-destructive focus-visible:ring-destructive/50',
                        ],
                        // enterprise variant
                        isEnterprise && [
                            'bg-zinc-900 border-zinc-700 text-zinc-100',
                            'focus-visible:border-amber-500 focus-visible:ring-amber-500/30 focus-visible:ring-offset-zinc-950',
                            error && 'border-red-500 focus-visible:ring-red-500/30',
                        ],
                        className,
                    )}
                    {...inputProps}
                />

                {trailingSlot && (
                    <div className="absolute right-1 flex items-center">{trailingSlot}</div>
                )}
            </div>

            {error && (
                <p
                    id={errorId}
                    role="alert"
                    className={cn(
                        'text-xs',
                        isEnterprise ? 'text-red-400' : 'text-destructive',
                    )}
                >
                    {error}
                </p>
            )}

            {hint && !error && (
                <p
                    id={hintId}
                    className={cn(
                        'text-xs',
                        isEnterprise ? 'text-zinc-500' : 'text-muted-foreground',
                    )}
                >
                    {hint}
                </p>
            )}
        </div>
    )
}
