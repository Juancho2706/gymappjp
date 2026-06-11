'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink, Ticket } from 'lucide-react'

function CopyButton({ value, title }: { value: string; title: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            type="button"
            onClick={() => {
                navigator.clipboard?.writeText(value).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                })
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={title}
            aria-label={title}
        >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    )
}

/**
 * Accesos de alumnos del team: link de login (/t/[slug]/login) + código de invitación
 * (A.bis2 — registro self-service vía /join/[code], entra directo al pool).
 */
export function TeamShareLink({ teamSlug, inviteCode }: { teamSlug: string; inviteCode?: string | null }) {
    const path = `/t/${teamSlug}/login`
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const fullLogin = `${origin}${path}`
    const fullJoin = inviteCode ? `${origin}/join/${inviteCode}` : null

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/70 py-1 pl-3 pr-1 backdrop-blur">
                <span className="truncate font-mono text-[11px] text-muted-foreground">/t/{teamSlug}</span>
                <CopyButton value={fullLogin} title="Copiar link de alumnos" />
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
            {inviteCode && fullJoin && (
                <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/70 py-1 pl-3 pr-1 backdrop-blur">
                    <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-foreground">{inviteCode}</span>
                    <CopyButton value={fullJoin} title="Copiar link de invitación al pool" />
                </div>
            )}
        </div>
    )
}
