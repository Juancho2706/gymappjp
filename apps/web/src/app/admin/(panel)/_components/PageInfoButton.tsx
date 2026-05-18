'use client'

import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

export interface InfoSection {
    heading: string
    body: string
}

interface Props {
    title: string
    sections: InfoSection[]
}

export function PageInfoButton({ title, sections }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-3] hover:text-[--admin-text-1] hover:border-[--admin-accent] transition-colors shrink-0"
                title="Información sobre esta sección"
                aria-label="Información sobre esta sección"
            >
                <HelpCircle className="h-4 w-4" />
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-[--admin-border] bg-[--admin-bg-surface] shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-[--admin-border] px-5 py-4">
                            <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-[--admin-accent]" />
                                <h2 className="text-sm font-semibold text-[--admin-text-1]">{title}</h2>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="flex h-6 w-6 items-center justify-center rounded text-[--admin-text-3] hover:text-[--admin-text-1] hover:bg-[--admin-bg-elevated] transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-5">
                            {sections.map(s => (
                                <div key={s.heading}>
                                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[--admin-accent]">
                                        {s.heading}
                                    </h3>
                                    <p className="text-sm text-[--admin-text-2] leading-relaxed whitespace-pre-line">
                                        {s.body}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Close button mobile */}
                        <div className="border-t border-[--admin-border] px-5 py-3 sm:hidden">
                            <button
                                onClick={() => setOpen(false)}
                                className="w-full rounded-lg bg-[--admin-bg-elevated] py-2.5 text-sm font-medium text-[--admin-text-2] hover:text-[--admin-text-1] transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
