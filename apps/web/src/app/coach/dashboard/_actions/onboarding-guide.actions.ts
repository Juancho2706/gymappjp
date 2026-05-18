'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

const completedSchema = z
    .object({
        profile_branding: z.boolean().optional(),
        first_client: z.boolean().optional(),
        first_plan: z.boolean().optional(),
        first_checkin: z.boolean().optional(),
    })
    .strict()
    .optional()

const onboardingGuideSchema = z.object({
    dismissed: z.boolean().optional(),
    completed: completedSchema,
    ahaMomentSent: z.boolean().optional(),
})

export type OnboardingGuidePayload = z.infer<typeof onboardingGuideSchema>

export async function persistOnboardingGuideAction(
    payload: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsed = onboardingGuideSchema.safeParse(payload)
    if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? 'Payload inválido' }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, error: 'No autenticado' }
    }

    const { error } = await supabase
        .from('coaches')
        .update({
            onboarding_guide: parsed.data as Json,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        console.error('[persistOnboardingGuideAction]', error)
        return { ok: false, error: error.message }
    }

    revalidatePath('/coach/dashboard')
    return { ok: true }
}

export async function markBrandTourSeenAction(): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, error: 'No autenticado' }
    }

    const { data: current } = await supabase
        .from('coaches')
        .select('onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    const existing =
        current?.onboarding_guide != null &&
        typeof current.onboarding_guide === 'object' &&
        !Array.isArray(current.onboarding_guide)
            ? (current.onboarding_guide as Record<string, unknown>)
            : {}

    const updated: Json = { ...existing, brand_tour_seen: true }

    const { error } = await supabase
        .from('coaches')
        .update({ onboarding_guide: updated, updated_at: new Date().toISOString() })
        .eq('id', user.id)

    if (error) {
        console.error('[markBrandTourSeenAction]', error)
        return { ok: false, error: error.message }
    }

    revalidatePath('/coach/settings')
    return { ok: true }
}
