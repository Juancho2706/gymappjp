'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Palette, ExternalLink } from 'lucide-react'
import { updateBrandSettingsAction, type BrandSettingsState } from './actions'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>

const initialState: BrandSettingsState = {}

const PRESET_COLORS = [
    '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
    '#EF4444', '#EC4899', '#06B6D4', '#F97316',
]

function SaveButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 text-white shadow-lg',
                'disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-0.5'
            )}
            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {pending ? 'Guardando...' : 'Guardar cambios'}
        </button>
    )
}

export function BrandSettingsForm({ coach }: { coach: Coach }) {
    const [state, formAction] = useActionState(updateBrandSettingsAction, initialState)
    const [selectedColor, setSelectedColor] = useState(coach.primary_color)

    const [useCoachColors, setUseCoachColors] = useState((coach as any).use_brand_colors_coach ?? false)

    // Live Preview Effect — updates both :root and the container so portals/modals also preview
    useEffect(() => {
        const container = document.querySelector('.coach-layout-container') as HTMLElement;
        const originalColor = (coach as any).use_brand_colors_coach === false ? '#007AFF' : (coach.primary_color || '#007AFF');
        const previewColor = useCoachColors ? (selectedColor || '#007AFF') : '#007AFF';

        const hexToRgb = (hex: string) => {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return r ? `${parseInt(r[1],16)}, ${parseInt(r[2],16)}, ${parseInt(r[3],16)}` : '0, 122, 255';
        };

        document.documentElement.style.setProperty('--theme-primary', previewColor);
        document.documentElement.style.setProperty('--theme-primary-rgb', hexToRgb(previewColor));
        if (container) {
            container.style.setProperty('--theme-primary', previewColor);
            container.style.setProperty('--theme-primary-rgb', hexToRgb(previewColor));
        }

        return () => {
            document.documentElement.style.setProperty('--theme-primary', originalColor);
            document.documentElement.style.setProperty('--theme-primary-rgb', hexToRgb(originalColor));
            if (container) {
                container.style.setProperty('--theme-primary', originalColor);
                container.style.setProperty('--theme-primary-rgb', hexToRgb(originalColor));
            }
        };
    }, [selectedColor, useCoachColors, coach]);

    return (
        <form action={formAction} className="space-y-8">
            {/* Identity */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    Identidad del Coach
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="full_name" className="text-sm text-foreground font-semibold">
                            Tu nombre completo
                        </Label>
                        <Input
                            id="full_name"
                            name="full_name"
                            defaultValue={coach.full_name}
                            required
                            className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary"
                        />
                        {state.fieldErrors?.full_name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.full_name[0]}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="brand_name" className="text-sm text-foreground font-semibold">
                            Nombre de tu marca
                        </Label>
                        <Input
                            id="brand_name"
                            name="brand_name"
                            defaultValue={coach.brand_name}
                            required
                            className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary"
                        />
                        {state.fieldErrors?.brand_name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.brand_name[0]}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="slug" className="text-sm text-foreground font-semibold">
                        URL de tu app (slug)
                    </Label>
                    <div className="flex items-center gap-0">
                        <div className="h-10 px-3 flex items-center bg-muted border border-r-0 border-border rounded-l-xl text-sm text-muted-foreground whitespace-nowrap">
                            /c/
                        </div>
                        <Input
                            id="slug"
                            name="slug"
                            defaultValue={coach.slug}
                            required
                            placeholder="mi-marca"
                            className="h-10 rounded-l-none bg-secondary border-border text-foreground rounded-r-xl focus:border-primary"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Solo letras minúsculas, números y guiones. Ej: &quot;juan-fitness&quot;
                    </p>
                    {state.fieldErrors?.slug && (
                        <p className="text-xs text-destructive">{state.fieldErrors.slug[0]}</p>
                    )}
                </div>
            </div>

            {/* Brand color */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    Color de marca
                </h2>

                <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setSelectedColor(color)}
                            className={cn(
                                'w-9 h-9 rounded-xl border-2 transition-all duration-150 hover:scale-110',
                                selectedColor === color
                                    ? 'border-foreground scale-110 shadow-lg'
                                    : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}

                    <div className="flex items-center gap-2 ml-2">
                        <input
                            type="color"
                            value={selectedColor}
                            onChange={(e) => setSelectedColor(e.target.value)}
                            className="w-9 h-9 rounded-xl cursor-pointer border-2 border-border bg-transparent"
                            title="Color personalizado"
                        />
                        <span className="text-xs text-muted-foreground font-mono">{selectedColor}</span>
                    </div>
                </div>

                <input type="hidden" name="primary_color" value={selectedColor} />

                <div className="rounded-xl border border-border p-4 bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-3">Vista previa del botón de tu app</p>
                    <button
                        type="button"
                        className="px-5 py-2.5 text-sm font-bold rounded-xl text-white transition-all"
                        style={{ backgroundColor: selectedColor }}
                    >
                        Ingresar al Panel
                    </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-sm font-bold">Configuración de Visualización</h3>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-semibold">Usar en mi panel (Coach)</Label>
                            <p className="text-xs text-muted-foreground">Si se desactiva, tu panel usará el color azul por defecto.</p>
                        </div>
                        <input 
                            type="checkbox" 
                            name="use_brand_colors_coach" 
                            checked={useCoachColors}
                            onChange={(e) => setUseCoachColors(e.target.checked)}
                            className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                        />
                    </div>
                </div>

                {state.fieldErrors?.primary_color && (
                    <p className="text-xs text-destructive">{state.fieldErrors.primary_color[0]}</p>
                )}
            </div>

            {state.error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                    {state.error}
                </div>
            )}
            {state.success && (
                <div className="rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                    ✓ Cambios guardados correctamente.
                </div>
            )}

            <div className="flex items-center justify-between gap-4">
                <a
                    href="/coach/settings/preview"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                    <ExternalLink className="w-4 h-4" />
                    Ver como alumno
                </a>
                <SaveButton />
            </div>
        </form>
    )
}
