'use client'

import { useState, useTransition } from 'react'
import { Megaphone, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { sendAnnouncementEmailAction } from '../_actions/coach-actions'

export function AnnouncementEmailButton() {
    const [isPending, startTransition] = useTransition()
    const [result, setResult] = useState<{ sent: number; failed: number } | { error: string } | null>(null)
    const [confirmed, setConfirmed] = useState(false)

    function handleClick() {
        if (!confirmed) {
            setConfirmed(true)
            return
        }
        startTransition(async () => {
            const res = await sendAnnouncementEmailAction()
            setResult(res)
            setConfirmed(false)
        })
    }

    const isSuccess = result && 'sent' in result
    const isError = result && 'error' in result

    return (
        <div className="flex items-center gap-2">
            {isSuccess && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {result.sent} enviados{result.failed > 0 ? `, ${result.failed} fallidos` : ''}
                </span>
            )}
            {isError && (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <XCircle className="h-3.5 w-3.5" />
                    Error: {result.error}
                </span>
            )}
            <button
                type="button"
                onClick={handleClick}
                disabled={isPending}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    confirmed
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-2] hover:text-[--admin-accent] hover:border-[--admin-accent]'
                } disabled:opacity-50`}
            >
                {isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                    : confirmed
                    ? <><Megaphone className="h-3.5 w-3.5" /> ¿Confirmar envío a todos?</>
                    : <><Megaphone className="h-3.5 w-3.5" /> Anunciar novedades</>
                }
            </button>
        </div>
    )
}
