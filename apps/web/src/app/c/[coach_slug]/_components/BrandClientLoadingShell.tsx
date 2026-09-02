import { headers } from 'next/headers'
import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'
import { decodeBrandHeaderValue } from '@/lib/brand-header-codec'
import { resolveEffectiveBrandColor } from '@/lib/branding/public-branding'

export async function BrandClientLoadingShell({
    children,
    layout,
}: {
    children?: React.ReactNode
    layout?: 'default' | 'fullscreen'
}) {
    const h = await headers()
    const customText = decodeBrandHeaderValue(h.get('x-coach-loader-text')) || undefined
    const useCustom = h.get('x-coach-use-custom-loader') === 'true'
    // W-brand B4: el standalone deja de leer loader_text_color — el texto del loader se pinta
    // con el gradiente derivado del primario. Managed (org/team) conserva su camino hasta W3.
    const brandSource = h.get('x-workspace-brand-source')
    const isManagedBrand = brandSource === 'organization' || brandSource === 'orphan'
    const textColor = isManagedBrand ? (h.get('x-coach-loader-text-color') || undefined) : undefined
    const iconModeRaw = h.get('x-coach-loader-icon-mode') ?? 'eva'
    const iconMode = (iconModeRaw === 'coach' || iconModeRaw === 'none') ? iconModeRaw : 'eva' as const
    const coachLogoUrl = h.get('x-coach-logo-url') || undefined
    const coachLogoDarkUrl = h.get('x-coach-logo-url-dark') || undefined
    // W1a — el loader de ruta pinta el color EFECTIVO (preset curado > `primary_color` crudo),
    // igual que el layout `/c`. Leyendo el header crudo, un coach con preset veía el loader en su
    // color libre legacy mientras el resto de la app ya estaba en el color del tema (bug del owner
    // 2026-09-02: `josefit`, preset `sport-blue`, loader NARANJA por su #F97316 viejo).
    const primaryColor = resolveEffectiveBrandColor({
        primaryColor: h.get('x-coach-primary-color'),
        themePresetKey: h.get('x-coach-theme-preset-key'),
        subscriptionTier: h.get('x-coach-subscription-tier'),
        managed: isManagedBrand,
    })

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
            coachLogoDarkUrl={iconMode === 'coach' ? coachLogoDarkUrl : undefined}
        >
            {children}
        </ClientLoadingShell>
    )
}
