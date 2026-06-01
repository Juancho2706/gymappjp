'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, X, Copy, Check } from 'lucide-react'

interface Props {
    inviteCode: string
    coachName: string
    siteUrl: string
}

export function CoachQRButton({ inviteCode, coachName, siteUrl }: Props) {
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const joinUrl = `${siteUrl}/join/${inviteCode}`

    const copy = async () => {
        await navigator.clipboard.writeText(joinUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Ver QR de registro"
                aria-label="Ver QR de registro"
            >
                <QrCode className="w-4 h-4" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pl-safe pr-safe" onClick={() => setOpen(false)}>
                    <div
                        className="w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl flex flex-col items-center gap-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex w-full items-center justify-between">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{coachName}</p>
                            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-500">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <QRCodeSVG value={joinUrl} size={200} level="M" />
                        <p className="text-xs text-zinc-500 text-center break-all">{joinUrl}</p>
                        <button
                            onClick={copy}
                            className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copiado' : 'Copiar enlace'}
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
