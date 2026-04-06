'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleClientBrandColors(useBrandColors: boolean, coachSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('clients')
        .update({ use_coach_brand_colors: useBrandColors })
        .eq('id', user.id)

    if (error) {
        console.error('Error updating brand colors preference:', error)
        return { error: error.message }
    }

    revalidatePath(`/c/${coachSlug}`, 'layout')
    return { success: true }
}
