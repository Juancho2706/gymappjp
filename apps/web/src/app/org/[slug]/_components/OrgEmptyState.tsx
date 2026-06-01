import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

interface Props {
    icon: LucideIcon
    headline: string
    description: string
    cta?: { label: string; href: string }
    tone?: 'neutral' | 'amber' | 'emerald' | 'sky'
}

const TONE = {
    neutral: { iconBg: 'bg-zinc-800 text-zinc-400', cta: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100' },
    amber:   { iconBg: 'bg-amber-400/10 text-amber-300', cta: 'bg-amber-400 hover:bg-amber-300 text-zinc-950' },
    emerald: { iconBg: 'bg-emerald-400/10 text-emerald-300', cta: 'bg-emerald-500 hover:bg-emerald-400 text-white' },
    sky:     { iconBg: 'bg-sky-400/10 text-sky-300', cta: 'bg-sky-400 hover:bg-sky-300 text-zinc-950' },
} as const

/**
 * Reusable empty state — 2026 B2B pattern: one idea per screen.
 * Icon + headline (what's empty) + description (why/next) + optional CTA.
 * Monochromatic, blends with the dark enterprise shell.
 */
export function OrgEmptyState({ icon: Icon, headline, description, cta, tone = 'neutral' }: Props) {
    const t = TONE[tone]
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-10 text-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.iconBg}`}>
                <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="max-w-sm">
                <p className="text-sm font-bold text-zinc-200">{headline}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
            </div>
            {cta && (
                <Link
                    href={cta.href}
                    className={`mt-1 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${t.cta}`}
                >
                    {cta.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            )}
        </div>
    )
}
