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

const FOCUS_RING =
    'focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none'

export function AdminBulkBar({ count, actions, onClear }: Props) {
    if (count === 0) return null

    return (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+8px)] left-1/2 z-50 -translate-x-1/2 md:bottom-6">
            <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-sunken px-3 py-2 shadow-2xl shadow-black/50">
                <span
                    role="status"
                    aria-live="polite"
                    className="font-mono text-xs text-body pr-2 border-r border-subtle"
                >
                    {count} seleccionado{count !== 1 ? 's' : ''}
                </span>
                {actions.map(a => (
                    <button
                        key={a.label}
                        type="button"
                        onClick={a.onClick}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${FOCUS_RING} ${
                            a.variant === 'danger'
                                ? 'bg-[var(--danger-500)]/15 text-[var(--danger-500)] hover:bg-[var(--danger-500)]/25'
                                : 'bg-surface-card text-strong hover:bg-sport-500/15 hover:text-[var(--sport-500)]'
                        }`}
                    >
                        {a.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={onClear}
                    aria-label="Limpiar selección"
                    className={`ml-1 rounded p-1 text-muted transition-colors hover:text-body ${FOCUS_RING}`}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}
