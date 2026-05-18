import { getCoach } from '@/lib/coach/get-coach'
import { CoachLoadingShell } from '@/components/ui/EvaRouteLoader'

export async function BrandCoachLoadingShell({
    children,
}: {
    children?: React.ReactNode
}) {
    const coach = await getCoach()
    const useCustomStyles = coach?.use_brand_colors_coach !== false

    return (
        <CoachLoadingShell
            top={useCustomStyles ? 'route' : 'treefrog'}
            customText={useCustomStyles ? (coach?.loader_text ?? undefined) : undefined}
            useCustom={useCustomStyles ? (coach?.use_custom_loader ?? false) : false}
            textColor={useCustomStyles ? (coach?.loader_text_color ?? undefined) : undefined}
            primaryColor={useCustomStyles && !coach?.loader_text_color ? (coach?.primary_color ?? undefined) : undefined}
            iconMode={useCustomStyles ? ((coach?.loader_icon_mode ?? 'eva') as 'eva' | 'coach' | 'none') : 'eva'}
            coachLogoUrl={useCustomStyles ? (coach?.logo_url ?? undefined) : undefined}
        >
            {children}
        </CoachLoadingShell>
    )
}
