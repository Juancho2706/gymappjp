'use client'

import { saveNutritionTemplate } from './actions'
import { NutritionMasterEditor } from './NutritionMasterEditor'
import { triggerSuccessAnimation } from '@/components/SuccessAnimationProvider'

interface Client {
    id: string
    full_name: string
}

interface Props {
    coachId: string
    availableClients: Client[]
    initialData?: any
    onCancel?: () => void
}

/**
 * Componente Wrapper para la creación/edición de plantillas nutricionales.
 * Utiliza el NutritionMasterEditor unificado.
 */
export function NutritionPlanBuilder({ coachId, availableClients, initialData, onCancel }: Props) {
    const handleSave = async (formData: FormData) => {
        const result = await saveNutritionTemplate(coachId, {}, formData)
        if (result?.success) {
            triggerSuccessAnimation(() => {
                if (onCancel) onCancel()
                else window.location.href = '/coach/nutrition-plans'
            })
        }
        return result
    }

    return (
        <NutritionMasterEditor
            mode="template"
            coachId={coachId}
            availableClients={availableClients}
            initialData={initialData}
            onSave={handleSave}
            onCancel={onCancel}
        />
    )
}
