'use client'

import { createContext, useContext } from 'react'
import type { Persona } from '@eva/schemas'
import type { AddStudentBrand, AddStudentFirstContent } from './AddStudentStepper'

/**
 * Contexto del alta de alumno del directorio (onboarding v2, TASKS F4.1).
 *
 * Vive en su propio módulo —y no dentro del provider— para romper el ciclo de imports:
 * `AddStudentFlowProvider` importa `CreateClientModal`, y el modal necesita el contexto para
 * ofrecer el escape «Hazlo paso a paso». Con el contexto acá, cada uno importa hacia abajo.
 */

export interface AddStudentFlowConfig {
    persona: Persona
    /** Identificador público del coach (`invite_code` o slug legacy) — el código del QR. */
    inviteCode: string
    brand: AddStudentBrand
    firstContent: AddStudentFirstContent
    /** Alumnos que NO son el de ejemplo. Decide stepper guiado vs modal. */
    realClientCount: number
    /** `?invite=1` / `?alta=1` en la URL: se abre el alta guiada al entrar. */
    autoOpenGuided?: boolean
}

export type AddStudentFlowMode = 'closed' | 'guided' | 'modal'

export interface AddStudentFlowValue {
    mode: AddStudentFlowMode
    /** Abre el alta por el camino que corresponda (guiada en el primer alta, modal después). */
    start: () => void
    /** Abre SIEMPRE el alta guiada. Lo usa el escape «Hazlo paso a paso» del modal. */
    startGuided: () => void
    close: () => void
    /**
     * `false` fuera del directorio (el modal del dashboard se monta sin provider): ahí el modal
     * sigue funcionando exactamente como hoy y no ofrece el modo guiado.
     */
    guidedAvailable: boolean
}

/** Flujo inerte: es el valor por defecto del contexto, para montar el modal sin provider. */
export const NOOP_ADD_STUDENT_FLOW: AddStudentFlowValue = {
    mode: 'closed',
    start: () => {},
    startGuided: () => {},
    close: () => {},
    guidedAvailable: false,
}

export const AddStudentFlowContext = createContext<AddStudentFlowValue>(NOOP_ADD_STUDENT_FLOW)

/** Estado del alta. Seguro fuera del provider: devuelve el flujo inerte (`guidedAvailable: false`). */
export function useAddStudentFlow(): AddStudentFlowValue {
    return useContext(AddStudentFlowContext)
}
