'use client'

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthVariant } from './AuthFormField'

interface AuthErrorAlertProps {
    message: string | null | undefined
    variant?: AuthVariant
    className?: string
}

export function AuthErrorAlert({
    message,
    variant = 'coach',
    className,
}: AuthErrorAlertProps) {
    const alertRef = React.useRef<HTMLDivElement>(null)
    const isEnterprise = variant === 'enterprise'

    // Focus the alert whenever message changes so screen readers announce it immediately.
    React.useEffect(() => {
        if (message && alertRef.current) {
            alertRef.current.focus()
        }
    }, [message])

    if (!message) return null

    return (
        <div
            ref={alertRef}
            role="alert"
            aria-live="polite"
            aria-atomic="true"
            tabIndex={-1}
            className={cn(
                'flex items-start gap-2.5 rounded-control border px-4 py-3 text-sm font-semibold outline-none',
                isEnterprise
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-transparent bg-[var(--danger-100)] text-[var(--danger-600)]',
                className,
            )}
        >
            <AlertCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{message}</span>
        </div>
    )
}
