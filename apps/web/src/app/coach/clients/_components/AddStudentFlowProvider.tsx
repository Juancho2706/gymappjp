'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CreateClientModal } from '../CreateClientModal'
import { shouldUseGuidedStepper } from '../_lib/add-student-invite'
import { AddStudentStepper } from './AddStudentStepper'
import {
    AddStudentFlowContext,
    NOOP_ADD_STUDENT_FLOW,
    type AddStudentFlowConfig,
    type AddStudentFlowMode,
    type AddStudentFlowValue,
} from './add-student-flow-context'

export {
    useAddStudentFlow,
    type AddStudentFlowConfig,
} from './add-student-flow-context'

/**
 * Quién abre QUÉ cuando el coach toca «Nuevo alumno» (onboarding v2, TASKS F4.1).
 *
 * El directorio tiene CUATRO entradas al alta (FAB móvil, war room, rail del master-detail y el
 * estado vacío) y hasta acá cada una montaba su propio `CreateClientModal`. En vez de sumar una
 * quinta copia con el stepper, la decisión vive en un solo lugar:
 *
 *   - primer alta real (0 alumnos que no sean el demo) ⇒ **alta guiada** inline;
 *   - siguientes altas ⇒ el modal de siempre, con el escape «Hazlo paso a paso»;
 *   - `?invite=1` (paso 4 de la guía, `@eva/onboarding`) ⇒ alta guiada, tenga los alumnos que tenga.
 *
 * El alta guiada NO es un modal: reemplaza el contenido del directorio (`children` queda montado
 * pero oculto, así los filtros y el scroll del roster sobreviven al volver).
 */
export function AddStudentFlowProvider({
    config,
    children,
}: {
    /** `null` = no hay datos para el alta guiada (sin sesión de coach): todo cae al modal. */
    config: AddStudentFlowConfig | null
    children: ReactNode
}) {
    const router = useRouter()
    const [mode, setMode] = useState<AddStudentFlowMode>(config?.autoOpenGuided ? 'guided' : 'closed')

    const close = useCallback(() => {
        setMode('closed')
        // Saca el `?invite=1` de la URL (si no, un refresh reabre el alta) y revalida el
        // directorio: `createClientAction` ya hizo `revalidatePath`, esto lo trae a la vista.
        router.replace('/coach/clients')
        router.refresh()
    }, [router])

    const value = useMemo<AddStudentFlowValue>(() => {
        if (!config) return NOOP_ADD_STUDENT_FLOW
        return {
            mode,
            guidedAvailable: true,
            start: () => setMode(shouldUseGuidedStepper(config.realClientCount) ? 'guided' : 'modal'),
            startGuided: () => setMode('guided'),
            close,
        }
    }, [config, mode, close])

    const guided = Boolean(config) && mode === 'guided'

    return (
        <AddStudentFlowContext.Provider value={value}>
            {config && guided ? (
                <AddStudentStepper
                    persona={config.persona}
                    inviteCode={config.inviteCode}
                    brand={config.brand}
                    firstContent={config.firstContent}
                    onClose={close}
                />
            ) : null}
            {/* El directorio sobrevive oculto: volver del alta no pierde filtros ni scroll. */}
            <div className={guided ? 'hidden' : undefined}>{children}</div>
            {config ? <CreateClientModal open={mode === 'modal'} onClose={close} /> : null}
        </AddStudentFlowContext.Provider>
    )
}
