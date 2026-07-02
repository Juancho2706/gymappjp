'use client'

import { type CSSProperties } from 'react'
import Image from 'next/image'
import { Dumbbell, Flame, Zap, Heart, Activity, Star, Wand2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CompositeLoaderView } from '@/components/loaders/variants'
import {
    LOADER_ANIMATION_KEYS,
    LOADER_TEXT_MAX,
    type LoaderAnimation,
    type LoaderComposite,
    type LoaderSymbol,
} from '@/lib/brand-composer'

/**
 * Compositor de loader "Crear el tuyo" (W1b): símbolo × animación × texto opcional → `loader_config`.
 * No es un editor libre — combina las mismas piezas parametrizadas. Si está activo, precede a la
 * variante de loader. Preview en vivo con el color de marca del coach.
 */
type Props = {
    value: LoaderComposite | null
    onChange: (next: LoaderComposite | null) => void
    logoUrl?: string | null
    brandName: string
    primaryColor: string
}

const ICON_SYMBOLS: { key: Exclude<LoaderSymbol, 'logo' | 'initial'>; Icon: LucideIcon }[] = [
    { key: 'dumbbell', Icon: Dumbbell },
    { key: 'flame', Icon: Flame },
    { key: 'bolt', Icon: Zap },
    { key: 'heart', Icon: Heart },
    { key: 'activity', Icon: Activity },
    { key: 'star', Icon: Star },
]

const ANIMATION_LABELS: Record<LoaderAnimation, string> = {
    pulso: 'Pulso',
    orbita: 'Órbita',
    barra: 'Barra',
    respiracion: 'Respiración',
}

const DEFAULT_CONFIG: LoaderComposite = { symbol: 'initial', animation: 'pulso' }

/** Convierte un hex a "r g b" (space-separated) para --theme-primary-rgb del preview. */
function hexToSpaceRgb(hex: string): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim())
    if (!m) return '16 185 129'
    const n = parseInt(m[1], 16)
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function LoaderComposer({ value, onChange, logoUrl, brandName, primaryColor }: Props) {
    const active = value !== null
    const config = value ?? DEFAULT_CONFIG
    const patch = (p: Partial<LoaderComposite>) => onChange({ ...config, ...p })

    return (
        <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-strong">
                        <Wand2 className="h-3.5 w-3.5 text-primary" /> Crear el tuyo
                    </span>
                    <span className="block text-xs text-muted">Combiná un símbolo, una animación y tu texto. Reemplaza la variante de arriba.</span>
                </span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    onClick={() => onChange(active ? null : DEFAULT_CONFIG)}
                    className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', active ? 'bg-primary' : 'bg-border')}
                >
                    <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', active ? 'left-[22px]' : 'left-0.5')} />
                </button>
            </label>

            {active && (
                <div className="space-y-4 pt-1">
                    {/* Símbolo */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-strong">Símbolo</span>
                        <div className="grid grid-cols-4 gap-2">
                            <button
                                type="button"
                                disabled={!logoUrl}
                                onClick={() => patch({ symbol: 'logo' })}
                                className={cn(
                                    'flex h-14 items-center justify-center rounded-lg border-2 transition-all',
                                    config.symbol === 'logo' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                                    !logoUrl && 'cursor-not-allowed opacity-40'
                                )}
                                title={logoUrl ? 'Tu logo' : 'Subí un logo primero'}
                            >
                                {logoUrl ? (
                                    <Image src={logoUrl} alt="" width={28} height={28} className="object-contain" unoptimized />
                                ) : (
                                    <span className="text-[9px] font-semibold text-muted">Logo</span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => patch({ symbol: 'initial' })}
                                className={cn(
                                    'flex h-14 items-center justify-center rounded-lg border-2 text-lg font-black transition-all',
                                    config.symbol === 'initial' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-strong hover:border-primary/40'
                                )}
                                title="Inicial de tu marca"
                            >
                                {(brandName?.trim()?.charAt(0) || 'E').toUpperCase()}
                            </button>
                            {ICON_SYMBOLS.map(({ key, Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => patch({ symbol: key })}
                                    className={cn(
                                        'flex h-14 items-center justify-center rounded-lg border-2 transition-all',
                                        config.symbol === key ? 'border-primary bg-primary/5 text-primary' : 'border-border text-strong hover:border-primary/40'
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Animación */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-strong">Animación</span>
                        <div className="grid grid-cols-4 gap-2">
                            {LOADER_ANIMATION_KEYS.map((anim) => (
                                <button
                                    key={anim}
                                    type="button"
                                    onClick={() => patch({ animation: anim })}
                                    className={cn(
                                        'rounded-lg border-2 px-2 py-2 text-[11px] font-semibold transition-all',
                                        config.animation === anim ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted hover:border-primary/40 hover:text-strong'
                                    )}
                                >
                                    {ANIMATION_LABELS[anim]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Texto opcional */}
                    <div className="space-y-1.5">
                        <label htmlFor="loader_composite_text" className="text-xs font-semibold text-strong">Texto (opcional)</label>
                        <input
                            id="loader_composite_text"
                            type="text"
                            value={config.text ?? ''}
                            onChange={(e) => patch({ text: e.target.value.toUpperCase() || undefined })}
                            maxLength={LOADER_TEXT_MAX}
                            placeholder={(brandName?.trim() || 'EVA').toUpperCase()}
                            className="h-10 w-full rounded-xl border border-default bg-surface-sunken px-3 text-sm uppercase text-strong outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-muted">Vacío = usa el nombre de tu marca. Máx {LOADER_TEXT_MAX} caracteres.</p>
                    </div>

                    {/* Preview en vivo */}
                    <div className="rounded-lg border border-subtle bg-surface-sunken p-4">
                        <p className="mb-2 text-center text-[11px] text-muted">Vista previa</p>
                        <div
                            className="flex items-center justify-center py-2"
                            style={{ '--theme-primary': primaryColor, '--theme-primary-rgb': hexToSpaceRgb(primaryColor) } as CSSProperties}
                        >
                            <CompositeLoaderView
                                config={config}
                                brandName={brandName}
                                iconSrc={config.symbol === 'logo' ? (logoUrl || undefined) : undefined}
                                size="md"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
