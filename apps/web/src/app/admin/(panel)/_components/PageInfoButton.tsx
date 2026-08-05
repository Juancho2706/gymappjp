'use client'

import { HelpCircle } from 'lucide-react'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export interface InfoSection {
    heading: string
    body: string
}

interface Props {
    title: string
    sections: InfoSection[]
}

export function PageInfoButton({ title, sections }: Props) {
    return (
        <Sheet>
            <SheetTrigger
                title="Ayuda de esta página"
                aria-label="Ayuda de esta página"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-sunken text-muted transition-colors hover:border-[var(--sport-500)] hover:text-strong focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
                <HelpCircle className="h-4 w-4" />
            </SheetTrigger>

            <SheetContent side="right" className="border-subtle bg-surface-card">
                <SheetHeader className="pr-12">
                    <SheetTitle className="flex items-center gap-2 text-sm text-strong">
                        <HelpCircle className="h-4 w-4 shrink-0 text-[var(--sport-500)]" />
                        {title}
                    </SheetTitle>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {sections.map(s => (
                        <div key={s.heading}>
                            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--sport-500)]">
                                {s.heading}
                            </h3>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-body">
                                {s.body}
                            </p>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    )
}
