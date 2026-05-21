import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getPreviewCoach = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null }

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode')
        .eq('id', user.id)
        .maybeSingle()

    return { user, coach }
})
