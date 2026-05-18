import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StudentDashboardPreview } from './StudentDashboardPreview'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vista Previa Alumno | Mi Marca' }

export default async function PreviewPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) redirect('/login')

    const primaryColor = coach.use_brand_colors_coach === false
        ? '#007AFF'
        : (coach.primary_color || '#007AFF')

    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primaryColor)
    const primaryRgb = hexMatch
        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}`
        : '0, 122, 255'

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `:root { --theme-primary: ${primaryColor}; --theme-primary-rgb: ${primaryRgb}; }`
            }} />
            <StudentDashboardPreview
                brandName={coach.brand_name || 'Mi Marca'}
                primaryColor={primaryColor}
                logoUrl={coach.logo_url ?? null}
                loaderText={coach.loader_text}
                useCustomLoader={coach.use_custom_loader ?? false}
                loaderTextColor={coach.loader_text_color}
                loaderIconMode={(coach.loader_icon_mode as 'eva' | 'coach' | 'none') ?? 'eva'}
            />
        </>
    )
}
