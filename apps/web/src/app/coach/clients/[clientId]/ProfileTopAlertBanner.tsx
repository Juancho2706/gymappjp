'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ProfileTopAlert } from './getProfileTopAlert'

export function ProfileTopAlertBanner({ alert }: { alert: ProfileTopAlert | null }) {
    if (!alert) return null

    // Tinted left-border card per the design (border-left 3px tone-500 +
    // tone-100 tint bg + tone-700 text + tone-600 icon). Tones flip in dark mode.
    const styles: Record<
        ProfileTopAlert['type'],
        { border: string; bg: string; text: string; icon: ReactNode }
    > = {
        danger: {
            border: 'var(--danger-500)',
            bg: 'var(--danger-100)',
            text: 'text-[var(--danger-700)]',
            icon: <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--danger-600)]" />,
        },
        warning: {
            border: 'var(--warning-500)',
            bg: 'var(--warning-100)',
            text: 'text-[var(--warning-700)]',
            icon: <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--warning-600)]" />,
        },
        info: {
            border: 'var(--sport-500)',
            bg: 'var(--sport-100)',
            text: 'text-[var(--sport-700)]',
            icon: <Info className="h-5 w-5 shrink-0 text-[var(--sport-600)]" />,
        },
        success: {
            border: 'var(--success-500)',
            bg: 'var(--success-100)',
            text: 'text-[var(--success-700)]',
            icon: <Sparkles className="h-5 w-5 shrink-0 text-[var(--success-600)]" />,
        },
    }

    const s = styles[alert.type]

    return (
        <Card
            padding="md"
            className="w-full max-w-full min-w-0 items-center gap-3 border-l-[3px] sm:flex-row"
            style={{ borderLeftColor: s.border, background: s.bg }}
        >
            <div className="relative z-10 flex min-w-0 items-center gap-3">
                {s.icon}
                <p
                    className={cn(
                        'min-w-0 flex-1 text-sm leading-snug font-bold break-words [overflow-wrap:anywhere]',
                        s.text
                    )}
                >
                    {alert.message}
                </p>
            </div>
        </Card>
    )
}
