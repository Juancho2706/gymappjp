'use client'

import Image from 'next/image'
import { useMemo, useSyncExternalStore } from 'react'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'
import { EvaTreefrogLoader } from '@/components/loaders/EvaTreefrogLoader'
import { LoaderVariantView, CompositeLoaderView } from '@/components/loaders/variants'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { parseLoaderConfig } from '@/lib/brand-composer'
import { generateBrandPalette } from '@/lib/color-utils'

type IconMode = 'eva' | 'coach' | 'none'

// Las CSS vars del loader se leen SÍNCRONO en el primer render del cliente (useSyncExternalStore):
// con useEffect el frame 1 pintaba el wordmark EVA y el frame 2 swapeaba al loader del coach —
// el usuario veía "dos loaders" en cada navegación interna (bug QA CEO 2026-07-04). Las vars ya
// están en el DOM cuando el fallback de loading.tsx se monta (las emite el <style> del layout /c).
// En SSR (hard load) devuelve '' → default EVA; la hidratación corrige una sola vez sin mismatch.
const subscribeNoop = () => () => {}

function readLoaderCssVar(name: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
        .replace(/^['"]|['"]$/g, '')
}

/** Variante de loader del coach (--coach-loader-variant), leída síncrona en cliente. */
function useCoachLoaderVariant() {
    const raw = useSyncExternalStore(
        subscribeNoop,
        () => readLoaderCssVar('--coach-loader-variant'),
        () => ''
    )
    return resolveLoaderVariant(raw)
}

/** Loader COMPUESTO del coach (--coach-loader-config, jsonb), leído síncrono. Precede a la variante.
 *  Fail-closed: var ausente o JSON inválido → null → cae a la variante/loader EVA. */
function useCoachLoaderConfig() {
    const raw = useSyncExternalStore(
        subscribeNoop,
        () =>
            readLoaderCssVar('--coach-loader-config')
                // el <style> escapa comillas dobles como \22 y las simples como \27 al serializar el jsonb.
                .replace(/\\22/g, '"')
                .replace(/\\27/g, "'"),
        () => ''
    )
    return useMemo(() => parseLoaderConfig(raw), [raw])
}

type EvaRouteLoaderProps = {
    subtitle?: string
    className?: string
    size?: 'sm' | 'md' | 'lg'
    customText?: string
    useCustom?: boolean
    textColor?: string
    primaryColor?: string
    /** Controls which icon to show: EVA logo, coach logo, or none */
    iconMode?: IconMode
    /** Coach's own logo URL (used when iconMode === 'coach') */
    coachLogoUrl?: string
}

export function EvaRouteLoader({
    subtitle,
    className,
    size = 'lg',
    customText,
    useCustom = false,
    textColor,
    primaryColor,
    iconMode = 'eva',
    coachLogoUrl,
}: EvaRouteLoaderProps) {
    const loaderVariant = useCoachLoaderVariant()
    const loaderConfig = useCoachLoaderConfig()
    const displayText = useCustom && customText?.trim() ? customText.trim().toUpperCase() : 'EVA'
    const isLongText = displayText.length > 6

    const iconPx = size === 'lg' ? (isLongText ? 48 : 56) : size === 'md' ? (isLongText ? 40 : 44) : 36
    const wordClass = (() => {
        if (size === 'lg') {
            return isLongText
                ? 'text-3xl sm:text-4xl tracking-tight'
                : 'text-4xl sm:text-5xl tracking-tight'
        }
        if (size === 'md') {
            return isLongText
                ? 'text-2xl sm:text-3xl tracking-tight'
                : 'text-3xl sm:text-4xl tracking-tight'
        }
        return 'text-2xl sm:text-3xl tracking-tight'
    })()

    const hasCustomColor = Boolean(textColor)

    let textClassName: string
    let textStyle: React.CSSProperties

    if (hasCustomColor) {
        textClassName = 'eva-loader-word-pulse'
        textStyle = { color: textColor }
    } else if (primaryColor) {
        const p = generateBrandPalette(primaryColor)
        textClassName = 'bg-clip-text text-transparent eva-loader-text-shine'
        textStyle = { backgroundImage: `linear-gradient(90deg, ${p.primaryLight}, ${p.primary}, ${p.primaryDark}, ${p.primaryLight})` }
    } else {
        textClassName = 'bg-clip-text text-transparent eva-loader-text-shine'
        textStyle = { backgroundImage: 'linear-gradient(90deg, #8b5cf6, #06b6d4, #10b981, #8b5cf6)' }
    }

    const showIcon = iconMode !== 'none'
    const iconSrc = iconMode === 'coach' && coachLogoUrl ? coachLogoUrl : BRAND_APP_ICON

    // white-label W1b: si el coach compuso su propio loader (loader_config), tiene prioridad sobre
    // la variante y el loader EVA. El símbolo 'logo' usa el logo del coach (o EVA como fallback).
    if (loaderConfig) {
        return (
            <CompositeLoaderView
                config={loaderConfig}
                brandName={displayText}
                iconSrc={showIcon ? iconSrc : undefined}
                subtitle={subtitle}
                size={size === 'sm' ? 'md' : size}
            />
        )
    }

    // white-label v2: si el coach Pro+ eligió una variante (≠ 'eva'), la renderizamos en lugar del
    // wordmark shimmer por defecto. 'eva' (default + free/starter) sigue con el loader actual intacto.
    if (loaderVariant !== 'eva') {
        return (
            <LoaderVariantView
                variant={loaderVariant}
                brandName={displayText}
                iconSrc={showIcon ? iconSrc : undefined}
                subtitle={subtitle}
                size={size === 'sm' ? 'md' : size}
            />
        )
    }

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 text-center',
                'eva-route-loader-motion',
                className
            )}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className={cn(
                'flex flex-col items-center gap-2',
                showIcon && 'gap-3'
            )}>
                {showIcon && (
                    <div className="eva-loader-icon-wrap relative shrink-0">
                        <Image
                            src={iconSrc}
                            alt=""
                            width={iconPx}
                            height={iconPx}
                            className="drop-shadow-md"
                            style={{ width: iconPx, height: iconPx }}
                            priority={false}
                        />
                    </div>
                )}
                <span
                    className={cn(
                        'font-display font-extrabold leading-none',
                        textClassName,
                        wordClass
                    )}
                    style={textStyle}
                >
                    {displayText}
                </span>
            </div>
            {subtitle ? (
                <p className="text-muted-foreground text-sm font-medium max-w-xs">{subtitle}</p>
            ) : null}
        </div>
    )
}

function useLoaderBrandConfig() {
    if (typeof window === 'undefined') {
        return null
    }
    const root = getComputedStyle(document.documentElement)
    const useCustom = root.getPropertyValue('--coach-use-custom-loader').trim() === '1'
    const text = root.getPropertyValue('--coach-loader-text').trim().replace(/^['"]|['"]$/g, '')
    const color = root.getPropertyValue('--coach-loader-color').trim().replace(/^['"]|['"]$/g, '')
    const iconModeRaw = root.getPropertyValue('--coach-loader-icon-mode').trim().replace(/^['"]|['"]$/g, '')
    const iconMode: IconMode = (iconModeRaw === 'coach' || iconModeRaw === 'none') ? iconModeRaw : 'eva'
    const primary = root.getPropertyValue('--theme-primary').trim().replace(/^['"]|['"]$/g, '')
    return { useCustom, text, color, iconMode, primary }
}

function BrandMarkSlot({
    subtitle,
    top,
    compact,
    customText,
    useCustom,
    textColor,
    primaryColor,
    iconMode,
    coachLogoUrl,
}: {
    subtitle?: string
    top: 'route' | 'treefrog'
    compact?: boolean
    customText?: string
    useCustom?: boolean
    textColor?: string
    primaryColor?: string
    iconMode?: IconMode
    coachLogoUrl?: string
}) {
    return (
        <div className={cn('relative flex flex-col items-center justify-center', compact ? 'py-2' : 'py-3')}>
            {top === 'route' ? (
                <EvaRouteLoader subtitle={subtitle} size="lg" className="py-1" customText={customText} useCustom={useCustom} textColor={textColor} primaryColor={primaryColor} iconMode={iconMode} coachLogoUrl={coachLogoUrl} />
            ) : (
                <EvaTreefrogLoader compact={Boolean(compact)} subtitle={subtitle} className="py-1" />
            )}
        </div>
    )
}

const routeLoaderMinHeightClass =
    'min-h-[calc(100svh-var(--mobile-content-top-offset)-var(--mobile-content-bottom-offset)-3rem)] md:min-h-[min(85dvh,820px)]'

export type CoachLoadingShellProps = {
    children?: React.ReactNode
    subtitle?: string
    top?: 'route' | 'treefrog'
    layout?: 'default' | 'fullscreen'
    customText?: string
    useCustom?: boolean
    textColor?: string
    primaryColor?: string
    /** Controls which icon to show: EVA logo, coach logo, or none */
    iconMode?: IconMode
    /** Coach's own logo URL (used when iconMode === 'coach') */
    coachLogoUrl?: string
}

export function CoachLoadingShell({
    children,
    subtitle,
    top = 'treefrog',
    layout = 'default',
    customText,
    useCustom,
    textColor,
    primaryColor,
    iconMode,
    coachLogoUrl,
}: CoachLoadingShellProps) {
    const hasChildren = children != null && children !== false

    if (layout === 'fullscreen') {
        return (
            <div className="fixed inset-0 z-50 flex animate-in flex-col bg-background fade-in duration-300">
                <div className="flex shrink-0 justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
                    <BrandMarkSlot subtitle={subtitle} top={top} compact customText={customText} useCustom={useCustom} textColor={textColor} primaryColor={primaryColor} iconMode={iconMode} coachLogoUrl={coachLogoUrl} />
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
        )
    }

    if (!hasChildren) {
        return (
            <div
                className={cn(
                    'flex w-full flex-col items-center justify-center px-4 animate-in fade-in duration-300',
                    'min-h-dvh',
                    'max-md:-my-6 max-md:py-6'
                )}
            >
                <BrandMarkSlot subtitle={subtitle} top={top} compact customText={customText} useCustom={useCustom} textColor={textColor} primaryColor={primaryColor} iconMode={iconMode} coachLogoUrl={coachLogoUrl} />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex justify-center">
                <BrandMarkSlot subtitle={subtitle} top={top} compact customText={customText} useCustom={useCustom} textColor={textColor} primaryColor={primaryColor} iconMode={iconMode} coachLogoUrl={coachLogoUrl} />
            </div>
            {children}
        </div>
    )
}

export function ClientLoadingShell(props: CoachLoadingShellProps) {
    return <CoachLoadingShell {...props} />
}
