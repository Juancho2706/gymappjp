import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
    getClientMovementDetail,
    getMovementHubData,
    getMovementPrintData,
    getMovementWizardData,
} from '@/services/assessment/movement-assessment.service'

// _data del modulo movement_assessment: SIEMPRE via service -> repository (jamas
// Supabase directo). Gating server-side (assertModule + scope 3-vias) vive en el
// service; aca un fallo de gate/acceso se traduce a `null` => la page hace notFound().

export const getMovementHub = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getMovementHubData(supabase, user.id)
    } catch {
        return null
    }
})

export const getMovementClientReport = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getClientMovementDetail(supabase, user.id, clientId)
    } catch {
        return null
    }
})

export const getMovementWizard = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        const data = await getMovementWizardData(supabase, user.id, clientId)
        return { ...data, currentUserId: user.id }
    } catch {
        return null
    }
})

export const getMovementPrint = cache(async (clientId: string, assessmentId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getMovementPrintData(supabase, user.id, clientId, assessmentId)
    } catch {
        return null
    }
})
