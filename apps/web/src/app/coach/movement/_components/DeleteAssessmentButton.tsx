'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { deleteAssessmentAction } from '../_actions/movement.actions'

/** Final inmutable: corregir = eliminar (queda `delete` en bitacora) + re-evaluar. */
export function DeleteAssessmentButton({
    clientId,
    assessmentId,
}: {
    clientId: string
    assessmentId: string
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleDelete() {
        if (!window.confirm(t('assessment.report.deleteConfirm'))) return
        setError(null)
        startTransition(async () => {
            const res = await deleteAssessmentAction({ client_id: clientId, assessment_id: assessmentId })
            if (res.error) {
                setError(res.error)
                return
            }
            router.refresh()
        })
    }

    return (
        <span className="inline-flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border-[1.5px] border-[color:var(--danger-500)]/30 px-3 py-2 text-xs font-bold text-[color:var(--danger-600)] transition-colors hover:bg-[var(--danger-100)] disabled:opacity-50"
            >
                {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                )}
                {t('assessment.report.delete')}
            </button>
            {error && <span className="text-[10px] text-[color:var(--danger-600)]">{error}</span>}
        </span>
    )
}
