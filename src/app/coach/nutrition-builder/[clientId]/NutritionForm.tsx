'use client'

import { useRouter } from 'next/navigation'
import { saveNutritionPlan } from './actions'
import { NutritionMasterEditor } from '../../nutrition-plans/NutritionMasterEditor'
import { triggerSuccessAnimation } from '@/components/SuccessAnimationProvider'

interface Props {
    clientId: string
    coachId: string
    initialData?: any
}

/**
 * Componente Wrapper para la creación/edición de planes individuales de alumnos.
 * Utiliza el NutritionMasterEditor unificado.
 */
export function NutritionForm({ clientId, coachId, initialData }: Props) {
    const router = useRouter()

    const handleSave = async (formData: FormData) => {
        const result = await saveNutritionPlan(clientId, coachId, {}, formData)
        if (result?.success) {
            triggerSuccessAnimation(() => {
                router.push(`/coach/clients/${clientId}`)
            })
        }
        return result
    }

    return (
        <NutritionMasterEditor
            mode="individual"
            coachId={coachId}
            clientId={clientId}
            initialData={initialData}
            onSave={handleSave}
            onCancel={() => router.push(`/coach/clients/${clientId}`)}
        />
    )
}
