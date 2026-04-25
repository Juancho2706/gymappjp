'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import type { NextBestAction as NBAType } from '../../_lib/nextBestAction.rules'

export function NextBestAction({ action }: { action: NBAType }) {
    const toneCls =
        action.tone === 'warn'
            ? 'from-amber-500/20 to-transparent'
            : action.tone === 'positive'
              ? 'from-emerald-500/20 to-transparent'
              : 'from-primary/20 to-transparent'

    return (
        <GlassCard className="h-full">
            <div className={`h-full bg-gradient-to-br ${toneCls} p-5`}>
                <div className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Proxima accion
                        </span>
                    </div>
                    <h3 className="font-display text-xl font-bold tracking-tight">{action.title}</h3>
                    <p className="flex-1 text-sm text-muted-foreground">{action.description}</p>
                    <Link
                        href={action.ctaHref}
                        className="inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
                        style={{
                            backgroundColor: 'var(--theme-primary, #007AFF)',
                            boxShadow: '0 0 20px -5px var(--theme-primary, rgba(0,122,255,0.4))',
                        }}
                    >
                        {action.ctaLabel}
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </GlassCard>
    )
}
