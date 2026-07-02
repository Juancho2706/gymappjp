'use client'

import { useMemo, useState } from 'react'
import { resolveBrandTheme, contrastReport } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { CURATED_FONTS, FONT_KEY_TUPLE, type FontKey } from '@/lib/brand-fonts'
import { LOADER_VARIANTS, LOADER_VARIANT_TUPLE, type LoaderVariant } from '@/lib/brand-loaders'
import { Sparkles, Lock, Palette, Type as TypeIcon, Loader2, Check, AlertTriangle, Moon, Sun } from 'lucide-react'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Valores persistidos del branding avanzado — viven levantados en el form padre (preview + dirty). */
export type AdvancedBrandValue = {
    secondaryColor: string
    accentLight: string
    accentDark: string
    neutralTint: boolean
    fontKey: FontKey | ''
    loaderVariant: LoaderVariant
}

type Props = {
    tier: SubscriptionTier
    /** Color primario reactivo (lo controla el form padre) — base del cálculo de contraste. */
    primaryColor: string
    /** Estado controlado por el form padre (para reflejarlo en el preview del teléfono + dirty). */
    value: AdvancedBrandValue
    onChange: (patch: Partial<AdvancedBrandValue>) => void
}

const CARD = 'bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-[var(--shadow-sm)]'

/** Sección "Branding avanzado (Pro)" del white-label v2: color2 + fuente + dark + loader, con
 *  preview en vivo y guardia WCAG. Emite hidden inputs que el form padre envía al server action.
 *  Controlado: los campos persistidos viven en el padre (preview del teléfono + dirty/beforeunload). */
export function BrandAdvancedSection({ tier, primaryColor, value, onChange }: Props) {
    const { secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant } = value
    const [advancedOpen, setAdvancedOpen] = useState(!!(value.accentLight || value.accentDark))
    const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')

    // Tema derivado en vivo (mismo motor que el render real) → preview y guardia de contraste.
    const theme = useMemo(() => {
        const base = HEX_RE.test(primaryColor) ? primaryColor : '#10B981'
        const opt = (v: string) => (HEX_RE.test(v) ? v : null)
        return resolveBrandTheme({
            brandColor: base,
            accentLight: opt(accentLight),
            accentDark: opt(accentDark),
            neutralTint,
            secondaryLight: opt(secondaryColor),
            secondaryDark: opt(secondaryColor),
        })
    }, [primaryColor, accentLight, accentDark, neutralTint, secondaryColor])

    const report = useMemo(() => contrastReport(theme), [theme])
    const failing = report.items.filter((i) => !i.passes)
    const t = theme[previewMode]

    // Gate defensivo: la page ya redirige a < Pro, pero por si acaso mostramos un teaser sin inputs.
    if (!isBrandingAllowed(tier)) {
        return (
            <div className={CARD}>
                <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted" />
                    <h2 className="text-base font-bold text-strong">Branding avanzado</h2>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">Pro</span>
                </div>
                <p className="text-xs text-muted -mt-3">
                    Color secundario, fuente personalizada, modo oscuro con tu marca y loaders. Disponible desde el plan Pro.
                </p>
            </div>
        )
    }

    return (
        <div className={CARD} data-tour-id="brand-advanced">
            <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-strong">Branding avanzado</h2>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">Pro</span>
            </div>
            <p className="text-xs text-muted -mt-3">
                Profundidad visual para que la app se sienta 100% tuya. Tus alumnos siempre la ven; vos elegís cómo.
            </p>

            {/* Hidden inputs → los recoge el form padre */}
            <input type="hidden" name="brand_secondary_color" value={secondaryColor} />
            <input type="hidden" name="accent_light" value={accentLight} />
            <input type="hidden" name="accent_dark" value={accentDark} />
            <input type="hidden" name="neutral_tint" value={neutralTint ? 'on' : ''} />
            <input type="hidden" name="brand_font_key" value={fontKey} />
            <input type="hidden" name="loader_variant" value={loaderVariant} />

            {/* ── Color secundario ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-muted" />
                    <span className="text-sm font-semibold text-strong">Color secundario</span>
                </div>
                <p className="text-xs text-muted">Para badges, etiquetas, macros de nutrición y la 2ª serie de gráficos. Independiente del principal.</p>
                <div className="flex items-center gap-3">
                    <input
                        type="color"
                        aria-label="Color secundario"
                        value={HEX_RE.test(secondaryColor) ? secondaryColor : '#00C7BE'}
                        onChange={(e) => onChange({ secondaryColor: e.target.value })}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    />
                    <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => onChange({ secondaryColor: e.target.value })}
                        placeholder="#00C7BE (opcional)"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {secondaryColor && (
                        <button type="button" onClick={() => onChange({ secondaryColor: '' })} className="text-xs text-muted underline shrink-0">Quitar</button>
                    )}
                </div>
            </div>

            {/* ── Fuente ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <TypeIcon className="w-3.5 h-3.5 text-muted" />
                    <span className="text-sm font-semibold text-strong">Fuente de títulos</span>
                </div>
                <p className="text-xs text-muted">Se aplica a los títulos de tu app. El cuerpo queda en Inter para máxima legibilidad.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FONT_KEY_TUPLE.map((k) => {
                        const f = CURATED_FONTS[k]
                        const selected = fontKey === k
                        return (
                            <button
                                key={k}
                                type="button"
                                onClick={() => onChange({ fontKey: selected ? '' : k })}
                                className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                                    selected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40'
                                }`}
                            >
                                <span className="text-lg leading-none text-strong" style={{ fontFamily: `var(${f.cssVar})` }}>Aa</span>
                                <span className="truncate text-[11px] font-medium text-strong" style={{ fontFamily: `var(${f.cssVar})` }}>{f.label}</span>
                                <span className="truncate text-[9px] text-muted">{f.note}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Tinte neutro + acento avanzado ── */}
            <div className="space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-strong">Tinte de marca en los fondos</span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={neutralTint}
                        onClick={() => onChange({ neutralTint: !neutralTint })}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${neutralTint ? 'bg-primary' : 'bg-border'}`}
                    >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${neutralTint ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                </label>
                <button type="button" onClick={() => setAdvancedOpen((v) => !v)} className="text-xs font-medium text-primary underline">
                    {advancedOpen ? 'Ocultar acento por modo' : 'Ajustar acento por modo (avanzado)'}
                </button>
                {advancedOpen && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {([['accentLight', 'Acento claro', accentLight, '#047857'], ['accentDark', 'Acento oscuro', accentDark, '#34d399']] as const).map(
                            ([field, label, val, ph]) => {
                                const set = (v: string) => onChange(field === 'accentLight' ? { accentLight: v } : { accentDark: v })
                                return (
                                    <div key={label} className="space-y-1">
                                        <span className="text-xs font-medium text-muted">{label}</span>
                                        <div className="flex items-center gap-2">
                                            <input type="color" aria-label={label} value={HEX_RE.test(val) ? val : ph} onChange={(e) => set(e.target.value)} className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5" />
                                            <input type="text" value={val} onChange={(e) => set(e.target.value)} placeholder={`${ph} (auto)`} className="h-9 w-full rounded-lg border border-border bg-background px-2 font-mono text-xs uppercase outline-none focus:ring-2 focus:ring-primary/40" />
                                        </div>
                                    </div>
                                )
                            }
                        )}
                    </div>
                )}
            </div>

            {/* ── Loader ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-muted" />
                    <span className="text-sm font-semibold text-strong">Pantalla de carga</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LOADER_VARIANT_TUPLE.map((v) => {
                        const meta = LOADER_VARIANTS[v]
                        const selected = loaderVariant === v
                        return (
                            <button
                                key={v}
                                type="button"
                                onClick={() => onChange({ loaderVariant: v })}
                                className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                                    selected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40'
                                }`}
                            >
                                <span className="text-[11px] font-semibold text-strong">{meta.label}</span>
                                <span className="truncate text-[9px] text-muted">{meta.note}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Preview + guardia WCAG ── */}
            <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-strong">Vista previa</span>
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                        {(['light', 'dark'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setPreviewMode(m)}
                                aria-pressed={previewMode === m}
                                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${previewMode === m ? 'bg-card text-strong shadow-sm' : 'text-muted'}`}
                            >
                                {m === 'light' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                                {m === 'light' ? 'Claro' : 'Oscuro'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="rounded-lg p-4" style={{ background: t.bg, color: t.text, fontFamily: fontKey ? `var(${CURATED_FONTS[fontKey].cssVar})` : undefined }}>
                    <div className="text-sm font-bold" style={{ color: t.text }}>Tu marca, {previewMode === 'light' ? 'modo claro' : 'modo oscuro'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: t.accent, color: t.accentText }}>Botón</span>
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: t.accent2, color: t.accent2Text }}>Etiqueta</span>
                        <span className="text-xs" style={{ color: t.textMuted }}>texto secundario</span>
                    </div>
                </div>
                {failing.length === 0 ? (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--success-700)' }}>
                        <Check className="h-3.5 w-3.5" /> Contraste legible (WCAG AA) en claro y oscuro.
                    </p>
                ) : (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--warning-600)' }}>
                        <AlertTriangle className="h-3.5 w-3.5" /> Ajustamos tus colores para que el texto siempre se lea ({failing.length} alerta{failing.length > 1 ? 's' : ''} rescatada{failing.length > 1 ? 's' : ''}).
                    </p>
                )}
            </div>
        </div>
    )
}
