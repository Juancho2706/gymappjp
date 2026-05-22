'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteOrgNutritionTemplateAction } from '../_actions/nutrition-templates.actions'

interface Props {
    orgSlug: string
    templateId: string
}

export function DeleteOrgNutritionTemplateButton({ orgSlug, templateId }: Props) {
    const [pending, start] = useTransition()

    const handle = () => {
        if (!confirm('¿Eliminar este template?')) return
        start(async () => { await deleteOrgNutritionTemplateAction(orgSlug, templateId) })
    }

    return (
        <button
            onClick={handle}
            disabled={pending}
            className="shrink-0 text-zinc-400 hover:text-red-500 disabled:opacity-50 transition-colors"
            title="Eliminar template"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    )
}
