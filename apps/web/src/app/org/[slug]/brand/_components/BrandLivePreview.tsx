'use client'

import Image from 'next/image'
import { Dumbbell, Home, Salad, Smartphone, User } from 'lucide-react'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import type { BrandTheme, ThemeMode } from '@eva/brand-kit'

export type BrandPreviewProps = {
    theme: BrandTheme
    mode: ThemeMode
    brandName: string
    logoUrl: string | null
    logoUrlDark: string | null
    loaderText: string
    useCustomLoader: boolean
    loaderIconMode: 'logo' | 'text'
    loaderTextColor: string | null
}

function LogoMark({ logoUrl, color, name, size }: { logoUrl: string | null; color: string; name: string; size: number }) {
    if (logoUrl) {
        return <Image src={logoUrl} alt="" width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />
    }
    return (
        <div className="flex items-center justify-center rounded-xl font-black text-white" style={{ width: size, height: size, backgroundColor: color }}>
            {(name.trim()[0] ?? 'A').toUpperCase()}
        </div>
    )
}

/**
 * WYSIWYG preview driven by the resolved brand theme (light or dark). Renders with
 * the actual computed tokens — including on-color text — so legibility is real.
 */
export function BrandLivePreview({ theme, mode, brandName, logoUrl, logoUrlDark, loaderText, useCustomLoader, loaderIconMode, loaderTextColor }: BrandPreviewProps) {
    const t = theme[mode]
    const logo = mode === 'dark' ? (logoUrlDark ?? logoUrl) : logoUrl
    const compact = brandName.length > 18 ? `${brandName.slice(0, 18)}…` : brandName

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {/* Coach app */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: t.bg, border: `1px solid ${t.border}` }}>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textMuted }}>App del coach</p>
                <div className="flex items-center gap-2.5">
                    <LogoMark logoUrl={logo} color={t.accent} name={brandName} size={34} />
                    <p className="truncate text-sm font-black" style={{ color: t.text }}>{compact}</p>
                </div>
                <div className="mt-4 flex gap-2">
                    <span className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: t.accent, color: t.accentText }}>Acción</span>
                    <span className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid ${t.border}`, color: t.text }}>Secundario</span>
                </div>
                <div className="mt-3 h-2 rounded-full" style={{ backgroundColor: t.surface }}>
                    <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: t.accent }} />
                </div>
            </div>

            {/* Alumno PWA */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: t.surface, border: `1px solid ${t.border}` }}>
                <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textMuted }}>PWA del alumno</p>
                    <Smartphone className="h-4 w-4" style={{ color: t.textMuted }} aria-hidden="true" />
                </div>
                <div className="mx-auto w-full max-w-[180px] rounded-[1.5rem] p-2.5" style={{ backgroundColor: t.bg, border: `4px solid ${t.border}` }}>
                    <div className="flex items-center gap-2">
                        <LogoMark logoUrl={logo} color={t.accent} name={brandName} size={26} />
                        <div className="min-w-0">
                            <p className="truncate text-[11px] font-black" style={{ color: t.text }}>{compact}</p>
                            <p className="text-[9px]" style={{ color: t.textMuted }}>Entrenamiento de hoy</p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <span className="h-8 rounded-lg" style={{ backgroundColor: t.surface }} />
                        <span className="h-8 rounded-lg" style={{ backgroundColor: t.accent }} />
                        <span className="h-8 rounded-lg" style={{ backgroundColor: t.surface }} />
                    </div>
                    <div className="mt-2 flex justify-around pt-2" style={{ borderTop: `1px solid ${t.border}` }}>
                        <Home className="h-3.5 w-3.5" style={{ color: t.accent }} aria-hidden="true" />
                        <Dumbbell className="h-3.5 w-3.5" style={{ color: t.textMuted }} aria-hidden="true" />
                        <Salad className="h-3.5 w-3.5" style={{ color: t.textMuted }} aria-hidden="true" />
                        <User className="h-3.5 w-3.5" style={{ color: t.textMuted }} aria-hidden="true" />
                    </div>
                </div>
            </div>

            {/* Loader real */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: t.bg, border: `1px solid ${t.border}` }}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textMuted }}>Pantalla de carga</p>
                <div className="flex min-h-[120px] items-center justify-center">
                    <EvaRouteLoader
                        size="md"
                        useCustom={useCustomLoader}
                        customText={(useCustomLoader && loaderText.trim()) ? loaderText : brandName}
                        textColor={loaderTextColor ?? undefined}
                        primaryColor={t.accent}
                        iconMode={loaderIconMode === 'logo' ? 'coach' : 'none'}
                        coachLogoUrl={logo ?? undefined}
                    />
                </div>
            </div>

            {/* Install icon + splash */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: t.surface, border: `1px solid ${t.border}` }}>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textMuted }}>Ícono + splash</p>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <LogoMark logoUrl={logo} color={t.accent} name={brandName} size={44} />
                        <p className="mt-1.5 max-w-[56px] truncate text-[9px]" style={{ color: t.textMuted }}>{compact}</p>
                    </div>
                    <div className="flex h-[120px] w-[68px] items-center justify-center rounded-[1.25rem]" style={{ backgroundColor: t.accent, border: `4px solid ${t.border}` }}>
                        <LogoMark logoUrl={logo} color={t.accentText} name={brandName} size={34} />
                    </div>
                </div>
            </div>
        </div>
    )
}
