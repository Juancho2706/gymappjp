import { headers } from 'next/headers'
import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'

export async function BrandClientLoadingShell({
    children,
    layout,
}: {
    children?: React.ReactNode
    layout?: 'default' | 'fullscreen'
}) {
    const h = await headers()
    const customText = h.get('x-coach-loader-text') || undefined
    const useCustom = h.get('x-coach-use-custom-loader') === 'true'
    const textColor = h.get('x-coach-loader-text-color') || undefined
    const iconModeRaw = h.get('x-coach-loader-icon-mode') ?? 'eva'
    const iconMode = (iconModeRaw === 'coach' || iconModeRaw === 'none') ? iconModeRaw : 'eva' as const
    const coachLogoUrl = h.get('x-coach-logo-url') || undefined
    const primaryColor = h.get('x-coach-primary-color') || undefined

    return (
        <ClientLoadingShell
            layout={layout}
            top="route"
            customText={customText}
            useCustom={useCustom}
            textColor={textColor}
            primaryColor={!textColor ? primaryColor : undefined}
            iconMode={iconMode}
            coachLogoUrl={iconMode === 'coach' ? coachLogoUrl : undefined}
        >
            {children}
        </ClientLoadingShell>
    )
}
