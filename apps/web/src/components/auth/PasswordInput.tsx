'use client'

import * as React from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { AuthFormField, type AuthVariant } from './AuthFormField'
import { cn } from '@/lib/utils'

interface PasswordInputProps
    extends Omit<React.ComponentProps<'input'>, 'id' | 'type'> {
    id: string
    label?: string
    labelEnd?: React.ReactNode
    error?: string
    hint?: string
    variant?: AuthVariant
}

export function PasswordInput({
    id,
    label = 'Contraseña',
    labelEnd,
    error,
    hint,
    variant = 'coach',
    onKeyUp,
    ...inputProps
}: PasswordInputProps) {
    const [visible, setVisible] = React.useState(false)
    const [capsLock, setCapsLock] = React.useState(false)
    const isEnterprise = variant === 'enterprise'

    function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
        if ('getModifierState' in e) {
            setCapsLock(e.getModifierState('CapsLock'))
        }
        onKeyUp?.(e)
    }

    const toggleButton = (
        <button
            type="button"
            aria-pressed={visible}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setVisible((v) => !v)}
            className={cn(
                'flex h-11 w-11 items-center justify-center rounded-control transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                isEnterprise
                    ? 'text-zinc-500 hover:text-zinc-300 focus-visible:ring-amber-500/50 focus-visible:ring-offset-zinc-900'
                    : 'text-text-muted hover:text-text-strong focus-visible:ring-[var(--focus-ring)]',
            )}
        >
            {visible ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
            )}
        </button>
    )

    return (
        <div className="flex flex-col gap-1">
            <AuthFormField
                id={id}
                label={label}
                labelEnd={labelEnd}
                type={visible ? 'text' : 'password'}
                error={error}
                hint={hint}
                variant={variant}
                leadingIcon={<Lock className="h-4 w-4" />}
                trailingSlot={toggleButton}
                autoComplete="current-password"
                onKeyUp={handleKeyUp}
                {...inputProps}
            />

            {capsLock && (
                <p
                    role="status"
                    aria-live="polite"
                    className={cn(
                        'text-xs flex items-center gap-1',
                        isEnterprise ? 'text-amber-400' : 'text-[var(--warning-600)]',
                    )}
                >
                    Bloq Mayús está activo
                </p>
            )}
        </div>
    )
}
