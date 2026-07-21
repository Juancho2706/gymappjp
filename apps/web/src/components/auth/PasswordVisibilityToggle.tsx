'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasswordVisibilityToggleProps {
    /** Estado actual: true => el input muestra el texto en claro. */
    visible: boolean
    /** Alterna la visibilidad. El padre es dueño del estado y cambia el `type` del input. */
    onToggle: () => void
    /**
     * Override de color para contextos con tokens propios (p.ej. el login de team usa
     * los tokens shadcn `text-muted-foreground`). Default: tokens semánticos EVA.
     */
    className?: string
}

/**
 * Botón "ojito" para mostrar/ocultar contraseñas. Se coloca DENTRO del contenedor
 * `.relative` que envuelve al `<Input>` y queda absolute a la derecha; el padre debe
 * añadir `pr-11` al input para que el texto no quede bajo el botón. No controla el valor
 * del input — solo alterna un estado que el padre usa para el `type` (`text` | `password`),
 * de modo que la contraseña tipeada nunca se pierde al alternar.
 */
export function PasswordVisibilityToggle({
    visible,
    onToggle,
    className,
}: PasswordVisibilityToggleProps) {
    return (
        <button
            type="button"
            aria-pressed={visible}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={onToggle}
            className={cn(
                'absolute right-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control',
                'text-text-muted transition-colors hover:text-text-strong',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                className,
            )}
        >
            {visible ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
            )}
        </button>
    )
}
