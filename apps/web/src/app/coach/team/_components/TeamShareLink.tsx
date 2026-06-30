'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check, ExternalLink, Link2, Ticket } from 'lucide-react'

/**
 * Accesos de alumnos del team dentro del hero: fila de login (/t/[slug]/login, con copiar + abrir)
 * y fila de código de invitación (A.bis2 — registro self-service vía /join/[code], entra directo al pool).
 * Filas full-width apiladas sobre el fondo oscuro del hero (diseño 1:1 eva-app).
 */
function AccessRow({ icon, label, value, copyValue, openHref }: {
    icon: ReactNode
    label: string
    value: string
    copyValue: string
    openHref?: string
}) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="flex items-center gap-2.5 rounded-control border border-[var(--border-inverse)] bg-white/[0.06] px-3 py-2.5">
            <span className="shrink-0 text-sport-300">{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-on-dark-muted">{label}</div>
                <div className="truncate font-mono text-[12.5px] font-semibold text-on-dark">{value}</div>
            </div>
            <button
                type="button"
                onClick={() => {
                    navigator.clipboard?.writeText(copyValue).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1400)
                    })
                }}
                aria-label="Copiar"
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] ${copied ? 'text-sport-300' : 'text-on-dark'}`}
            >
                {copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}
            </button>
            {openHref && (
                <a
                    href={openHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir"
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-on-dark"
                >
                    <ExternalLink className="h-[15px] w-[15px]" />
                </a>
            )}
        </div>
    )
}

export function TeamShareLink({ teamSlug, inviteCode }: { teamSlug: string; inviteCode?: string | null }) {
    const path = `/t/${teamSlug}/login`
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eva-app.cl'
    const fullLogin = `${origin}${path}`
    const fullJoin = inviteCode ? `${origin}/join/${inviteCode}` : null

    return (
        <div className="flex flex-col gap-2">
            <AccessRow
                icon={<Link2 className="h-4 w-4" />}
                label="Login de alumnos"
                value={path}
                copyValue={fullLogin}
                openHref={path}
            />
            {inviteCode && fullJoin && (
                <AccessRow
                    icon={<Ticket className="h-4 w-4" />}
                    label="Código de invitación"
                    value={inviteCode}
                    copyValue={fullJoin}
                />
            )}
        </div>
    )
}
