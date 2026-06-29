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
                        isEnterprise
                            ? 'text-sm font-medium text-zinc-300'
                            : 'text-[13px] font-semibold text-text-strong',
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
                            'pointer-events-none absolute left-3.5 flex items-center',
                            isEnterprise ? 'text-zinc-500' : 'text-text-muted',
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
                        'w-full min-h-[48px] border px-4 py-3 outline-none transition-all',
                        'disabled:pointer-events-none disabled:opacity-50',
                        // leading icon padding
                        leadingIcon && 'pl-10',
                        // trailing slot padding
                        trailingSlot && 'pr-12',
                        // coach variant — EVA Design System control (sport focus ring)
                        !isEnterprise && [
                            'rounded-control border-[1.5px] bg-surface-card border-border-default text-text-strong text-[15px] font-medium',
                            'placeholder:text-text-muted',
                            'focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]',
                            error &&
                                'border-[var(--danger-500)] focus-visible:border-[var(--danger-500)]',
                        ],
                        // enterprise variant (preserved)
                        isEnterprise && [
                            'rounded-xl text-base bg-zinc-900 border-zinc-700 text-zinc-100',
                            'placeholder:text-muted-foreground',
                            'focus-visible:ring-2 focus-visible:ring-offset-2',
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
                        isEnterprise ? 'text-xs text-red-400' : 'text-[12px] text-[var(--danger-600)]',
                    )}
                >
                    {error}
                </p>
            )}

            {hint && !error && (
                <p
                    id={hintId}
                    className={cn(
                        isEnterprise ? 'text-xs text-zinc-500' : 'text-[12px] text-text-muted',
                    )}
                >
                    {hint}
                </p>
            )}
        </div>
    )
}
