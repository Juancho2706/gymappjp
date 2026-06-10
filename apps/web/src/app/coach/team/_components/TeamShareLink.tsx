'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'

/** Link de acceso de alumnos (/t/[slug]/login) con copy en un tap. */
export function TeamShareLink({ teamSlug }: { teamSlug: string }) {
    const [copied, setCopied] = useState(false)
    const path = `/t/${teamSlug}/login`
    const full = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

    return (
        <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/70 py-1 pl-3 pr-1 backdrop-blur">
            <span className="truncate font-mono text-[11px] text-muted-foreground">/t/{teamSlug}</span>
            <button
                type="button"
                onClick={() => {
                    navigator.clipboard?.writeText(full).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1600)
                    })
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Copiar link de alumnos"
                aria-label="Copiar link de alumnos"
            >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Abrir login de alumnos"
                aria-label="Abrir login de alumnos"
            >
                <ExternalLink className="h-3.5 w-3.5" />
            </a>
        </div>
    )
}
