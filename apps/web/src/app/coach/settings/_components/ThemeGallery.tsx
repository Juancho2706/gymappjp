'use client'

import { Palette } from 'lucide-react'
import { ThemePresetGallery } from '@/components/brand/ThemePresetGallery'

/**
 * Galería de TEMAS curados (W1b) — reemplaza la rueda de color libre. Tap = selecciona un preset
 * (persiste `theme_preset_key`); el estado sube al form padre y la vista previa lo refleja al instante.
 *
 * Grandfather: un coach con color custom y `theme_preset_key = NULL` ve un chip "Tema personalizado
 * (legacy)" seleccionado; los presets se ofrecen como opciones. Elegir uno setea la key SIN borrar
 * su color custom (reversible: volver al chip legacy lo restaura).
 *
 * W-brand B3: el grid + filtro + chip custom viven ahora en el componente COMPARTIBLE
 * `@/components/brand/ThemePresetGallery` (mismo catálogo para Mi Marca y los studios Team/Org).
 * Este wrapper conserva lo propio de Mi Marca: card, copy, hidden input y tour id.
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

export function ThemeGallery({ value, onChange, legacyPrimaryColor, hasLegacyCustom }: Props) {
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

            <ThemePresetGallery
                value={value}
                onChange={onChange}
                customChip={hasLegacyCustom
                    ? {
                        primaryColor: legacyPrimaryColor || '#007AFF',
                        title: 'Tema personalizado',
                        subtitle: 'Tu color actual (legacy)',
                    }
                    : null}
            />

            {legacySelected && hasLegacyCustom && (
                <p className="text-[11px] text-muted">
                    Estás usando tu color personalizado de siempre. Elige un tema de arriba cuando quieras — tu
                    color queda guardado y puedes volver a él.
                </p>
            )}
        </div>
    )
}
