'use client'

import { useMemo, useState } from 'react'
import { Check, Palette, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { THEME_PRESET_LIST, FEEL_META, FEEL_ORDER, type PresetFeel, type BrandPreset } from '@/lib/brand-presets'
import { resolveBrandFontStack } from '@/lib/brand-fonts'

/**
 * Galería de TEMAS curados (W1b) — reemplaza la rueda de color libre. Tap = selecciona un preset
 * (persiste `theme_preset_key`); el estado sube al form padre y la vista previa lo refleja al instante.
 *
 * Grandfather: un coach con color custom y `theme_preset_key = NULL` ve un chip "Tema personalizado
 * (legacy)" seleccionado; los presets se ofrecen como opciones. Elegir uno setea la key SIN borrar
 * su color custom (reversible: volver al chip legacy lo restaura).
 */
type Props = {
    /** Preset seleccionado (key) o null = tema legacy/personalizado. */
    value: string | null
    onChange: (key: string | null) => void
    /** Color primario custom del coach (para el swatch del chip legacy). */
    legacyPrimaryColor: string | null
    /** El coach tiene un color custom real (≠ default) → mostrar el chip legacy como opción viva. */
    hasLegacyCustom: boolean
}

function PaletteSwatch({ preset }: { preset: BrandPreset }) {
    return (
        <div className="flex h-9 w-full overflow-hidden rounded-lg border border-black/5 dark:border-white/10">
            <span className="flex-1" style={{ background: preset.brandColor }} />
            <span className="w-1/3" style={{ background: preset.secondaryColor }} />
            <span className="w-1/4" style={{ background: preset.accentLight ?? preset.brandColor }} />
        </div>
    )
}

export function ThemeGallery({ value, onChange, legacyPrimaryColor, hasLegacyCustom }: Props) {
    const [feelFilter, setFeelFilter] = useState<PresetFeel | 'all'>('all')

    const filtered = useMemo(
        () => (feelFilter === 'all' ? THEME_PRESET_LIST : THEME_PRESET_LIST.filter((p) => p.feel === feelFilter)),
        [feelFilter]
    )

    const legacySelected = value === null

    return (
        <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-color">
            {/* Siempre presente — el form envía la key aunque no se toque nada. */}
            <input type="hidden" name="theme_preset_key" value={value ?? ''} />

            <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-strong">Tema de tu marca</h2>
            </div>
            <p className="text-xs text-muted -mt-3">
                Elige un tema curado: color, tipografía y tono en un solo tap. Todos están calibrados para
                verse legibles en claro y oscuro. Se aplican a botones, gráficos, brillos y la app de tus alumnos.
            </p>

            {/* Filtro por feel */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => setFeelFilter('all')}
                    className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        feelFilter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-default text-muted hover:text-strong'
                    )}
                >
                    Todos
                </button>
                {FEEL_ORDER.map((feel) => (
                    <button
                        key={feel}
                        type="button"
                        onClick={() => setFeelFilter(feel)}
                        className={cn(
                            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                            feelFilter === feel ? 'border-primary bg-primary/10 text-primary' : 'border-default text-muted hover:text-strong'
                        )}
                    >
                        {FEEL_META[feel].label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {/* Chip legacy: solo si el coach realmente tiene un color custom (grandfather). */}
                {hasLegacyCustom && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        aria-pressed={legacySelected}
                        className={cn(
                            'relative flex min-h-[112px] flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                            legacySelected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40'
                        )}
                    >
                        {legacySelected && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                <Check className="h-3 w-3" />
                            </span>
                        )}
                        <div className="flex h-9 w-full overflow-hidden rounded-lg border border-black/5 dark:border-white/10">
                            <span className="flex-1" style={{ background: legacyPrimaryColor || '#007AFF' }} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-strong">Tema personalizado</p>
                            <p className="truncate text-[10px] text-muted">Tu color actual (legacy)</p>
                        </div>
                    </button>
                )}

                {filtered.map((preset) => {
                    const selected = value === preset.key
                    return (
                        <button
                            key={preset.key}
                            type="button"
                            onClick={() => onChange(preset.key)}
                            aria-pressed={selected}
                            className={cn(
                                'relative flex min-h-[112px] flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                                selected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40'
                            )}
                        >
                            {selected && (
                                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                    <Check className="h-3 w-3" />
                                </span>
                            )}
                            <PaletteSwatch preset={preset} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-1">
                                    <p className="truncate text-[13px] font-bold text-strong">{preset.label}</p>
                                    <span
                                        className="text-lg leading-none text-strong"
                                        style={{ fontFamily: resolveBrandFontStack(preset.fontKey) }}
                                    >
                                        Aa
                                    </span>
                                </div>
                                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {FEEL_META[preset.feel]?.label ?? preset.feel}
                                </p>
                            </div>
                        </button>
                    )
                })}
            </div>

            {legacySelected && hasLegacyCustom && (
                <p className="text-[11px] text-muted">
                    Estás usando tu color personalizado de siempre. Elige un tema de arriba cuando quieras — tu
                    color queda guardado y puedes volver a él.
                </p>
            )}
        </div>
    )
}
