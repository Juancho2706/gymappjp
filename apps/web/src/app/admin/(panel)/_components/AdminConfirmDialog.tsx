'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    /**
     * Alcance REAL de la accion, en numeros: "Deja sin acceso a 6 coaches y 84 alumnos".
     * Obligatorio moralmente para suspender teams/orgs y borrados — el CEO decide viendo
     * el costo, no adivinandolo (F3 08-05).
     */
    blastRadius?: string
    severity?: 'danger' | 'warning'
    confirmLabel?: string
    /** Acciones irreversibles: exige tipear este texto exacto para habilitar Confirmar. */
    requireText?: string
    onConfirm: () => void | Promise<void>
}

/**
 * Confirmacion unica del panel CEO. Reemplaza los 4 patrones que convivian
 * (confirm() nativo, dialogo inline, doble-click, nada) — F3 08-05.
 */
export function AdminConfirmDialog({
    open, onOpenChange, title, description, blastRadius,
    severity = 'danger', confirmLabel = 'Confirmar', requireText, onConfirm,
}: Props) {
    const [typed, setTyped] = useState('')
    const [pending, setPending] = useState(false)
    const accent = severity === 'danger' ? 'var(--danger-500)' : 'var(--warning-500)'
    const blocked = Boolean(requireText) && typed.trim() !== requireText

    async function handleConfirm() {
        if (blocked || pending) return
        setPending(true)
        try {
            await onConfirm()
        } finally {
            setPending(false)
            setTyped('')
            onOpenChange(false)
        }
    }

    function handleOpenChange(next: boolean) {
        if (pending) return
        if (!next) setTyped('')
        onOpenChange(next)
    }

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="border-subtle bg-surface-card">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-sm text-strong">
                        <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: accent }} />
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-xs text-body">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {blastRadius && (
                    <p
                        className="rounded-lg border px-3 py-2 text-xs font-medium"
                        style={{
                            borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                            color: accent,
                        }}
                    >
                        {blastRadius}
                    </p>
                )}

                {requireText && (
                    <div>
                        <label className="text-[11px] text-muted">
                            Escribe <span className="font-mono font-bold text-strong">{requireText}</span> para confirmar
                        </label>
                        <input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            autoFocus
                            className="mt-1 w-full rounded-md border border-subtle bg-surface-sunken px-3 py-2 text-xs text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        />
                    </div>
                )}

                <AlertDialogFooter>
                    <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        disabled={pending}
                        className="rounded-lg border border-subtle bg-surface-sunken px-4 py-2 text-xs text-body transition-colors hover:text-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={blocked || pending}
                        className={cn(
                            'rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
                        )}
                        style={{ background: accent }}
                    >
                        {pending ? 'Procesando…' : confirmLabel}
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
