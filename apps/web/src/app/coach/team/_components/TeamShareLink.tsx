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
            className="flex h-7 w-7 items-center justify-center rounded-pill text-on-dark/80 transition-colors hover:bg-white/10 hover:text-on-dark"
            title={title}
            aria-label={title}
        >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
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
            <div className="flex min-w-0 items-center gap-1.5 rounded-pill border border-[var(--border-inverse)] bg-white/10 py-1 pl-3 pr-1">
                <span className="truncate font-mono text-[11px] text-on-dark-muted">/t/{teamSlug}</span>
                <CopyButton value={fullLogin} title="Copiar link de alumnos" />
                <a
                    href={path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-pill text-on-dark/80 transition-colors hover:bg-white/10 hover:text-on-dark"
                    title="Abrir login de alumnos"
                    aria-label="Abrir login de alumnos"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>
            {inviteCode && fullJoin && (
                <div className="flex min-w-0 items-center gap-1.5 rounded-pill border border-[var(--border-inverse)] bg-white/10 py-1 pl-3 pr-1">
                    <Ticket className="h-3.5 w-3.5 shrink-0 text-on-dark-muted" aria-hidden />
                    <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-on-dark">{inviteCode}</span>
                    <CopyButton value={fullJoin} title="Copiar link de invitación al pool" />
                </div>
            )}
        </div>
    )
}
