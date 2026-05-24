'use client'

import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteOrgNutritionTemplateAction } from '../_actions/nutrition-templates.actions'

interface Props {
    orgSlug: string
    templateId: string
}

export function DeleteOrgNutritionTemplateButton({ orgSlug, templateId }: Props) {
    const [pending, start] = useTransition()

    const handle = () => {
        if (!confirm('Eliminar este template?')) return
        start(async () => {
            await deleteOrgNutritionTemplateAction(orgSlug, templateId)
        })
    }

    return (
        <button
            onClick={handle}
            disabled={pending}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-red-400/20 px-3 text-xs font-bold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
            title="Eliminar template"
        >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            Eliminar
        </button>
    )
}
