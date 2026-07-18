import { getCoach } from '@/lib/coach/get-coach'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import { EvaTreefrogLoader } from '@/components/loaders/EvaTreefrogLoader'
import { resolvePresetBranding } from '@eva/brand-kit'

/**
 * Loader del panel /coach. Se centra en el ESCENARIO visible (viewport menos el topbar y el
 * padding del contenido) con `grid place-items-center` — antes quedaba anclado arriba porque el
 * `min-h-dvh` desbordaba la región de scroll bajo el topbar fijo.
 */
export async function BrandCoachLoadingShell({
    children,
}: {
    children?: React.ReactNode
}) {
    const coach = await getCoach()
    const useCustomStyles = coach?.use_brand_colors_coach !== false
    // Preset-aware: si el coach eligió un tema curado, el color del loader sale del preset
    // (antes usaba primary_color CRUDO → el legacy naranja pisaba al tema elegido).
    const preset = coach ? resolvePresetBranding(coach) : null

    return (
        <div className="grid w-full animate-in fade-in duration-300 place-items-center px-4 min-h-[calc(100dvh-var(--mobile-content-top-offset)-var(--mobile-content-bottom-offset)-3rem)] md:min-h-[calc(100dvh-60px-5rem)]">
            <div className="flex flex-col items-center justify-center py-2">
                {useCustomStyles ? (
                    <EvaRouteLoader
                        size="lg"
                        className="py-1"
                        customText={coach?.loader_text ?? undefined}
                        useCustom={coach?.use_custom_loader ?? false}
                        textColor={coach?.loader_text_color ?? undefined}
                        primaryColor={!coach?.loader_text_color ? (preset?.primary_color ?? coach?.primary_color ?? undefined) : undefined}
                        iconMode={(coach?.loader_icon_mode ?? 'eva') as 'eva' | 'coach' | 'none'}
                        coachLogoUrl={coach?.logo_url ?? undefined}
                        coachLogoDarkUrl={coach?.logo_url_dark ?? undefined}
                    />
                ) : (
                    <EvaTreefrogLoader compact className="py-1" />
                )}
            </div>
            {children}
        </div>
    )
}
