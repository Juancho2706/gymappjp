'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { GitBranch, Layers3, Palette, Eye } from 'lucide-react'

const TABS = [
    { id: 'config',   label: 'Config',    icon: Palette },
    { id: 'preview',  label: 'Preview',   icon: Eye },
    { id: 'publish',  label: 'Publicar',  icon: Layers3 },
    { id: 'propagate', label: 'Propagar', icon: GitBranch },
] as const

interface Props {
    orgSlug: string
}

/**
 * Sticky tab bar for brand page — visible only on mobile (< md).
 * On desktop all sections are always visible.
 * Active tab = ?tab= URL param, defaults to 'config'.
 */
export function BrandMobileTabBar({ orgSlug }: Props) {
    const searchParams = useSearchParams()
    const active = searchParams.get('tab') ?? 'config'

    return (
        <div className="md:hidden sticky top-0 z-30 -mx-4 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-2">
            <div className="flex gap-1 overflow-x-auto pb-0.5">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <Link
                        key={id}
                        href={`/org/${orgSlug}/brand?tab=${id}`}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                            active === id
                                ? 'bg-amber-400/15 border border-amber-400/40 text-amber-300'
                                : 'border border-zinc-700 text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Icon className="h-3 w-3" />
                        {label}
                    </Link>
                ))}
            </div>
        </div>
    )
}
