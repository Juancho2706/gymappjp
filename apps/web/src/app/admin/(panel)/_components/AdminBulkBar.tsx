'use client'

import { X } from 'lucide-react'

interface BulkAction {
    label: string
    onClick: () => void
    variant?: 'default' | 'danger'
}

interface Props {
    count: number
    actions: BulkAction[]
    onClear: () => void
}

export function AdminBulkBar({ count, actions, onClear }: Props) {
    if (count === 0) return null

    return (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+8px)] left-1/2 z-50 -translate-x-1/2 md:bottom-6">
            <div className="flex items-center gap-2 rounded-lg border border-[--admin-border] bg-[--admin-bg-elevated] px-3 py-2 shadow-2xl shadow-black/50">
                <span className="font-mono text-xs text-[--admin-text-2] pr-2 border-r border-[--admin-border]">
                    {count} seleccionado{count !== 1 ? 's' : ''}
                </span>
                {actions.map(a => (
                    <button
                        key={a.label}
                        onClick={a.onClick}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                            a.variant === 'danger'
                                ? 'bg-[--admin-red]/15 text-[--admin-red] hover:bg-[--admin-red]/25'
                                : 'bg-[--admin-bg-surface] text-[--admin-text-1] hover:bg-[--admin-accent]/15 hover:text-[--admin-accent]'
                        }`}
                    >
                        {a.label}
                    </button>
                ))}
                <button
                    onClick={onClear}
                    className="ml-1 rounded p-1 text-[--admin-text-3] hover:text-[--admin-text-2] transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}
