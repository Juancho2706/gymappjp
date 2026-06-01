'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
    title: string
    icon: React.ReactNode  // pre-rendered icon element (RSC can't pass component fns to client)
    children: React.ReactNode
    defaultOpen?: boolean
}

/**
 * On mobile (<md): shows as a tap-to-expand accordion.
 * On desktop (md+): always expanded, no accordion chrome.
 */
export function SettingsAccordion({
    title,
    icon,
    children,
    defaultOpen = false,
}: Props) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            {/* Mobile toggle header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="md:hidden w-full flex items-center justify-between gap-3 p-4"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-sm font-black text-white">{title}</span>
                </div>
                <ChevronDown
                    className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Desktop: always visible header */}
            <div className="hidden md:flex items-center gap-2 p-5 pb-0">
                {icon}
                <h2 className="text-lg font-black text-white">{title}</h2>
            </div>

            {/* Content: hidden on mobile when closed, always visible on desktop */}
            <div className={`${open ? 'block' : 'hidden'} md:block p-4 pt-3 md:p-5 md:pt-3`}>
                {children}
            </div>
        </section>
    )
}
