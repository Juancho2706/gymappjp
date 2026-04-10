'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProfileTopAlert } from './getProfileTopAlert'

export function ProfileTopAlertBanner({ alert }: { alert: ProfileTopAlert | null }) {
    if (!alert) return null

    const styles: Record<
        ProfileTopAlert['type'],
        { border: string; bg: string; text: string; icon: ReactNode }
    > = {
        danger: {
            border: 'border-rose-500/40',
            bg: 'from-rose-500/15 to-transparent',
            text: 'text-rose-700 dark:text-rose-300',
            icon: <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />,
        },
        warning: {
            border: 'border-amber-500/40',
            bg: 'from-amber-500/15 to-transparent',
            text: 'text-amber-900 dark:text-amber-200',
            icon: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
        },
        info: {
            border: 'border-sky-500/35',
            bg: 'from-sky-500/12 to-transparent',
            text: 'text-sky-900 dark:text-sky-200',
            icon: <Info className="h-5 w-5 text-sky-500 shrink-0" />,
        },
        success: {
            border: 'border-emerald-500/35',
            bg: 'from-emerald-500/12 to-transparent',
            text: 'text-emerald-900 dark:text-emerald-200',
            icon: <Sparkles className="h-5 w-5 text-emerald-500 shrink-0" />,
        },
    }

    const s = styles[alert.type]

    return (
        <div
            className={cn(
                'relative w-full max-w-full min-w-0 overflow-hidden rounded-2xl border p-4 md:p-5',
                'bg-gradient-to-br',
                s.border,
                s.bg
            )}
        >
            <div className="relative z-10 flex min-w-0 gap-3">
                {s.icon}
                <p
                    className={cn(
                        'min-w-0 flex-1 text-sm font-bold leading-snug break-words [overflow-wrap:anywhere] md:text-base',
                        s.text
                    )}
                >
                    {alert.message}
                </p>
            </div>
        </div>
    )
}
