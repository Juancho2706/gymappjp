'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LOGIN_LAYOUTS, LOGIN_LAYOUT_KEYS, type LoginLayoutKey } from '@/lib/brand-composer'

/**
 * Selector del LAYOUT de la pantalla de login del alumno (W1b). 4 variantes con thumbnail esquemático.
 * Persiste `login_layout_key`. Todas heredan tema/fuente/logo — solo cambia el shell/entrada.
 * NULL = 'clasico' (idéntico a hoy).
 */
type Props = {
    value: LoginLayoutKey
    onChange: (key: LoginLayoutKey) => void
    /** Color de marca (para teñir los thumbnails). */
    accentColor: string
}

/** Mini-maqueta esquemática de cada layout (no funcional, solo señal visual). */
function Thumb({ layout, accent }: { layout: LoginLayoutKey; accent: string }) {
    const base = 'flex h-16 w-full flex-col items-center overflow-hidden rounded-lg border border-black/5 bg-surface-sunken dark:border-white/10'
    if (layout === 'clasico') {
        return (
            <div className={base}>
                <div className="h-7 w-full" style={{ background: accent }} />
                <div className="-mt-2 w-[85%] flex-1 rounded-t-md bg-white shadow-sm dark:bg-surface-sunken">
                    <div className="mx-auto mt-2 h-1.5 w-8 rounded bg-black/10 dark:bg-white/15" />
                    <div className="mx-auto mt-1 h-1.5 w-12 rounded bg-black/10 dark:bg-white/10" />
                </div>
            </div>
        )
    }
    if (layout === 'hero') {
        return (
            <div className={cn(base, 'justify-center gap-1.5')} style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
                <div className="h-6 w-6 rounded-xl" style={{ background: accent }} />
                <div className="h-1.5 w-10 rounded bg-black/15 dark:bg-white/20" />
            </div>
        )
    }
    if (layout === 'energia') {
        return (
            <div className={cn(base, 'justify-center')} style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>
                <div className="relative flex h-8 w-8 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-2" style={{ borderColor: accent, opacity: 0.35 }} />
                    <span className="absolute -inset-1 rounded-full border" style={{ borderColor: accent, opacity: 0.18 }} />
                    <span className="h-3 w-3 rounded-full" style={{ background: accent }} />
                </div>
            </div>
        )
    }
    // minimal
    return (
        <div className={cn(base, 'justify-center gap-1.5')}>
            <div className="h-2 w-14 rounded" style={{ background: accent }} />
            <div className="h-1.5 w-10 rounded bg-black/10 dark:bg-white/15" />
            <div className="h-1.5 w-16 rounded bg-black/10 dark:bg-white/10" />
        </div>
    )
}

export function LoginLayoutPicker({ value, onChange, accentColor }: Props) {
    return (
        <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-4 shadow-sm">
            {/* Siempre presente para el guardado. */}
            <input type="hidden" name="login_layout_key" value={value} />

            <div>
                <h2 className="text-base font-bold text-strong">Diseño del login</h2>
                <p className="mt-1 text-xs text-muted">
                    Cómo se ve la primera pantalla que abren tus alumnos. Todos usan tu tema, logo y tipografía.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {LOGIN_LAYOUT_KEYS.map((key) => {
                    const meta = LOGIN_LAYOUTS[key]
                    const selected = value === key
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChange(key)}
                            aria-pressed={selected}
                            className={cn(
                                'relative flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                                selected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40'
                            )}
                        >
                            {selected && (
                                <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                    <Check className="h-3 w-3" />
                                </span>
                            )}
                            <Thumb layout={key} accent={accentColor} />
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-bold text-strong">{meta.label}</p>
                                <p className="text-[10px] leading-tight text-muted">{meta.note}</p>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
