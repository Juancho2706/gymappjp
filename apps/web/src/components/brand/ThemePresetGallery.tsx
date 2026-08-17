'use client'

import { useMemo, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEEL_META, FEEL_ORDER, THEME_PRESET_LIST, type BrandPreset, type PresetFeel } from '@/lib/brand-presets'
import { resolveBrandFontStack } from '@/lib/brand-fonts'

/**
 * W-brand B3 — galería COMPARTIBLE de los 14 temas curados (grid + filtro por feel + chip custom).
 *
 * Extraída de `app/coach/settings/_components/ThemeGallery.tsx` (Mi Marca standalone, W1b) para
 * que los studios de Team y Org monten el MISMO catálogo como camino default. Este componente es
 * SOLO presentación + selección: no sabe de forms ni de persistencia — el caller decide qué hace
 * la key elegida (standalone persiste `theme_preset_key`; Team/Org la usan como «rellenador» de
 * primario + par en sus columnas actuales, sin DDL).
 *
 * `appearance`: los studios de Org viven en un shell zinc oscuro hardcodeado (fuera de los tokens
 * claro/oscuro de la app) → variante 'dark' con clases zinc/amber; 'app' (default) usa los tokens.
 */

/** Chip de tema custom (grandfather): color libre legacy en standalone, hex exacto en Team/Org. */
export type GalleryCustomChip = {
    /** Hex que pinta el swatch del chip (color vigente/aplicado). */
    primaryColor: string | null
    /** Par del chip (opcional: presente = swatch doble, ausente = un solo color). */
    secondaryColor?: string | null
    title: string
    subtitle: string
}

type Appearance = 'app' | 'dark'

type Props = {
    /** Preset seleccionado (key) o null = tema custom/legacy. */
    value: string | null
    onChange: (key: string | null) => void
    /** Chip custom (grandfather). Ausente/null = sin chip. */
    customChip?: GalleryCustomChip | null
    disabled?: boolean
    appearance?: Appearance
}

/** Clases por apariencia — mismo layout, paleta de superficie distinta. */
const AP: Record<Appearance, {
    filterActive: string
    filterIdle: string
    card: string
    cardSelected: string
    check: string
    title: string
    sub: string
    swatchBorder: string
}> = {
    app: {
        filterActive: 'border-primary bg-primary/10 text-primary',
        filterIdle: 'border-default text-muted hover:text-strong',
        card: 'border-border hover:border-primary/40',
        cardSelected: 'border-primary ring-2 ring-primary/30 bg-primary/5',
        check: 'bg-primary text-white',
        title: 'text-strong',
        sub: 'text-muted',
        swatchBorder: 'border-black/5 dark:border-white/10',
    },
    dark: {
        filterActive: 'border-amber-400/60 bg-amber-400/10 text-amber-300',
        filterIdle: 'border-zinc-700 text-zinc-500 hover:text-zinc-200',
        card: 'border-zinc-700 hover:border-amber-400/40',
        cardSelected: 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-400/5',
        check: 'bg-amber-400 text-zinc-950',
        title: 'text-zinc-100',
        sub: 'text-zinc-500',
        swatchBorder: 'border-white/10',
    },
}

function PaletteSwatch({ preset, borderCls }: { preset: BrandPreset; borderCls: string }) {
    return (
        <div className={cn('flex h-9 w-full overflow-hidden rounded-lg border', borderCls)}>
            <span className="flex-1" style={{ background: preset.brandColor }} />
            <span className="w-1/3" style={{ background: preset.secondaryColor }} />
            <span className="w-1/4" style={{ background: preset.accentLight ?? preset.brandColor }} />
        </div>
    )
}

export function ThemePresetGallery({ value, onChange, customChip, disabled, appearance = 'app' }: Props) {
    const [feelFilter, setFeelFilter] = useState<PresetFeel | 'all'>('all')
    const ap = AP[appearance]

    const filtered = useMemo(
        () => (feelFilter === 'all' ? THEME_PRESET_LIST : THEME_PRESET_LIST.filter((p) => p.feel === feelFilter)),
        [feelFilter]
    )

    const customSelected = value === null

    return (
        <div className="space-y-3">
            {/* Filtro por feel */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setFeelFilter('all')}
                    className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        feelFilter === 'all' ? ap.filterActive : ap.filterIdle
                    )}
                >
                    Todos
                </button>
                {FEEL_ORDER.map((feel) => (
                    <button
                        key={feel}
                        type="button"
                        disabled={disabled}
                        onClick={() => setFeelFilter(feel)}
                        className={cn(
                            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                            feelFilter === feel ? ap.filterActive : ap.filterIdle
                        )}
                    >
                        {FEEL_META[feel].label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {/* Chip custom (grandfather): solo si el caller lo declara. */}
                {customChip?.primaryColor && (
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(null)}
                        aria-pressed={customSelected}
                        className={cn(
                            'relative flex min-h-[112px] flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                            customSelected ? ap.cardSelected : ap.card
                        )}
                    >
                        {customSelected && (
                            <span className={cn('absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full', ap.check)}>
                                <Check className="h-3 w-3" />
                            </span>
                        )}
                        <div className={cn('flex h-9 w-full overflow-hidden rounded-lg border', ap.swatchBorder)}>
                            <span className="flex-1" style={{ background: customChip.primaryColor }} />
                            {customChip.secondaryColor && (
                                <span className="w-1/3" style={{ background: customChip.secondaryColor }} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className={cn('truncate text-[13px] font-bold', ap.title)}>{customChip.title}</p>
                            <p className={cn('truncate text-[10px]', ap.sub)}>{customChip.subtitle}</p>
                        </div>
                    </button>
                )}

                {filtered.map((preset) => {
                    const selected = value === preset.key
                    return (
                        <button
                            key={preset.key}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(preset.key)}
                            aria-pressed={selected}
                            className={cn(
                                'relative flex min-h-[112px] flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                                selected ? ap.cardSelected : ap.card
                            )}
                        >
                            {selected && (
                                <span className={cn('absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full', ap.check)}>
                                    <Check className="h-3 w-3" />
                                </span>
                            )}
                            <PaletteSwatch preset={preset} borderCls={ap.swatchBorder} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-1">
                                    <p className={cn('truncate text-[13px] font-bold', ap.title)}>{preset.label}</p>
                                    <span
                                        className={cn('text-lg leading-none', ap.title)}
                                        style={{ fontFamily: resolveBrandFontStack(preset.fontKey) }}
                                    >
                                        Aa
                                    </span>
                                </div>
                                <p className={cn('mt-0.5 flex items-center gap-1 text-[10px] font-medium', ap.sub)}>
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {FEEL_META[preset.feel]?.label ?? preset.feel}
                                </p>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
