'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { deleteAssessmentAction } from '../_actions/movement.actions'

/** Final inmutable: corregir = eliminar (queda `delete` en bitacora) + re-evaluar.
 *  Confirmacion inline (Cancelar / Eliminar) como en el diseno. */
export function DeleteAssessmentButton({
    clientId,
    assessmentId,
}: {
    clientId: string
    assessmentId: string
}) {
    const { t, language } = useTranslation()
    const router = useRouter()
    const [confirming, setConfirming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleDelete() {
        setError(null)
        startTransition(async () => {
            const res = await deleteAssessmentAction({ client_id: clientId, assessment_id: assessmentId })
            if (res.error) {
                setError(res.error)
                setConfirming(false)
                return
            }
            router.refresh()
        })
    }

    if (confirming) {
        return (
            <span className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isPending}
                    className="rounded-[8px] border-[1.5px] border-default bg-surface-card px-2.5 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-surface-sunken disabled:opacity-50"
                >
                    {language === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-[8px] bg-[var(--danger-500)] px-2.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                    {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {language === 'es' ? 'Eliminar' : 'Delete'}
                </button>
            </span>
        )
    }

    return (
        <span className="inline-flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={t('assessment.report.delete')}
                className="flex size-[34px] items-center justify-center rounded-[8px] bg-surface-sunken text-[color:var(--danger-600)] transition-colors hover:bg-[var(--danger-100)]"
            >
                <Trash2 className="size-4" aria-hidden />
            </button>
            {error && <span className="text-[10px] text-[color:var(--danger-600)]">{error}</span>}
        </span>
    )
}
