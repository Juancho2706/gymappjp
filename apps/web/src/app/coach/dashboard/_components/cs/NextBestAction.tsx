'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { NextBestAction as NBAType } from '../../_lib/nextBestAction.rules'

export function NextBestAction({ action }: { action: NBAType }) {
    const tint =
        action.tone === 'warn'
            ? 'from-[var(--warning-100)]'
            : action.tone === 'positive'
              ? 'from-[var(--success-100)]'
              : 'from-[var(--sport-100)]'

    return (
        <Card padding="none" className="h-full">
            <div className={`flex h-full flex-col gap-3 bg-gradient-to-br ${tint} to-transparent p-5`}>
                <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-sport-500" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Proxima accion
                    </span>
                </div>
                <h3 className="font-display text-xl font-black tracking-[-0.02em] text-[var(--text-strong)]">
                    {action.title}
                </h3>
                <p className="flex-1 text-sm text-[var(--text-muted)]">{action.description}</p>
                <Link
                    href={action.ctaHref}
                    className="inline-flex w-fit items-center gap-2 rounded-control bg-sport-500 px-4 py-2.5 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] [transition:transform_var(--dur-fast)_var(--ease-out)] hover:-translate-y-0.5"
                >
                    {action.ctaLabel}
                    <ArrowRight className="size-4" />
                </Link>
            </div>
        </Card>
    )
}
