'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { resolveBrandTheme, contrastReport, type BrandThemeTokens } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { CURATED_FONTS, FONT_KEY_TUPLE, resolveBrandFontStack, type FontKey } from '@/lib/brand-fonts'
import { LOADER_VARIANTS, LOADER_VARIANT_TUPLE, type LoaderVariant } from '@/lib/brand-loaders'
import { serializeLoaderConfig, DEFAULT_LOADER_COMPOSITE, type LoaderComposite } from '@/lib/brand-composer'
import { generateBrandPalette } from '@/lib/color-utils'
import { Sparkles, Lock, Palette, Type as TypeIcon, Loader2, Check, AlertTriangle, ChevronRight, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import { LoaderVariantView } from '@/components/loaders/variants'
import { LoaderComposer } from './_components/LoaderComposer'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Convierte un hex a "r, g, b" (comas — convención de la app) para --theme-primary-rgb de los previews de loader. */
function hexToSpaceRgb(hex: string): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim())
    if (!m) return '16, 185, 129'
    const n = parseInt(m[1], 16)
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Valores persistidos del branding avanzado — viven levantados en el form padre (preview + dirty). */
export type AdvancedBrandValue = {
    secondaryColor: string
    accentLight: string
    accentDark: string
    neutralTint: boolean
    fontKey: FontKey | ''
    loaderVariant: LoaderVariant
}

/** Config del loader legacy (texto/ícono/color) — también levantado al padre (preview + dirty).
 *  Se fusiona acá con `loaderVariant` para tener UNA sola sección "Pantalla de carga". */
export type AdvancedLoaderValue = {
    useCustomLoader: boolean
    loaderText: string
    loaderIconMode: 'eva' | 'coach' | 'none'
    loaderTextColor: string
}

type Props = {
    tier: SubscriptionTier
    /** Color primario reactivo (lo controla el form padre) — base del cálculo de contraste. */
    primaryColor: string
    /** Estado controlado por el form padre (para reflejarlo en el preview del teléfono + dirty). */
    value: AdvancedBrandValue
    onChange: (patch: Partial<AdvancedBrandValue>) => void
    /** Config del loader (texto/ícono/color) — controlado por el padre; se fusiona con la variante. */
    loader: AdvancedLoaderValue
    onLoaderChange: (patch: Partial<AdvancedLoaderValue>) => void
    /** Loader compuesto "Crear el mío" (W1b) — precede a la variante cuando está definido. */
    loaderConfig: LoaderComposite | null
    onLoaderConfigChange: (next: LoaderComposite | null) => void
    /** Nombre de marca (para la inicial/texto por defecto del compositor). */
    brandName: string
    /** Logo actual (o el recién elegido) — habilita la opción de ícono "Mi logo". */
    logoUrl?: string | null
    /** Hay un tema (preset) activo → los ajustes de abajo los define el tema salvo que los personalices. */
    presetActive?: boolean
}

const CARD = 'bg-surface-card border border-subtle rounded-card p-4 sm:p-6 shadow-[var(--shadow-sm)]'

/** Marco chico y consistente para los mini-previews "de lo que cambia" que van bajo cada control. */
function PreviewFrame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-lg border border-subtle bg-surface-sunken p-2.5', className)}>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
            {children}
        </div>
    )
}

/** Sección "Branding avanzado (Pro)" del white-label v2: color2 + fuente + dark + pantalla de carga
 *  (variante O compositor, unificados). Cada control muestra un mini-preview inmediato de LO QUE cambia,
 *  además de la vista previa grande del teléfono (que se mantiene). Acordeón CERRADO por defecto.
 *  Los valores persistidos se emiten como hidden inputs SIEMPRE presentes (fuera del cuerpo colapsable)
 *  para que guardar funcione aunque el acordeón esté cerrado. Controlado: el estado vive en el padre. */
export function BrandAdvancedSection({ tier, primaryColor, value, onChange, loader, onLoaderChange, loaderConfig, onLoaderConfigChange, brandName, logoUrl, presetActive }: Props) {
    const { secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant } = value
    const [open, setOpen] = useState(false)
    const [accentOpen, setAccentOpen] = useState(!!(value.accentLight || value.accentDark))

    const primaryHex = HEX_RE.test(primaryColor) ? primaryColor : '#10B981'

    // Tema derivado en vivo (mismo motor que el render real) → guardia de contraste + mini-previews.
    const theme = useMemo(() => {
        const opt = (v: string) => (HEX_RE.test(v) ? v : null)
        return resolveBrandTheme({
            brandColor: primaryHex,
            accentLight: opt(accentLight),
            accentDark: opt(accentDark),
            neutralTint,
            secondaryLight: opt(secondaryColor),
            secondaryDark: opt(secondaryColor),
        })
    }, [primaryHex, accentLight, accentDark, neutralTint, secondaryColor])

    // Par de temas con/sin tinte (solo varía neutralTint) → mini-preview del tinte neutro.
    const tintThemes = useMemo(() => ({
        off: resolveBrandTheme({ brandColor: primaryHex, neutralTint: false }),
        on: resolveBrandTheme({ brandColor: primaryHex, neutralTint: true }),
    }), [primaryHex])

    const report = useMemo(() => contrastReport(theme), [theme])
    const failing = report.items.filter((i) => !i.passes)

    const loaderPalette = generateBrandPalette(primaryHex)
    const brandGradient = `linear-gradient(90deg, ${loaderPalette.primaryLight}, ${loaderPalette.primary}, ${loaderPalette.primaryDark}, ${loaderPalette.primaryLight})`

    // Fuente de muestra (títulos). '' → default de display de EVA (Montserrat).
    const sampleFontFamily = resolveBrandFontStack(fontKey || null)

    // Pantalla de carga: dos rutas mutuamente excluyentes. loaderConfig !== null = "Crear el mío".
    const composerActive = loaderConfig !== null
    const setLoaderRoute = (route: 'variant' | 'composer') => {
        if (route === 'composer') { if (!composerActive) onLoaderConfigChange(DEFAULT_LOADER_COMPOSITE) }
        else { if (composerActive) onLoaderConfigChange(null) }
    }
    const previewIconSrc = loader.loaderIconMode === 'none'
        ? undefined
        : (loader.loaderIconMode === 'coach' && logoUrl ? logoUrl : BRAND_APP_ICON)
    const loaderVars = { '--theme-primary': primaryHex, '--theme-primary-rgb': hexToSpaceRgb(primaryHex) } as CSSProperties

    // Gate defensivo: la page ya redirige a < Pro, pero por si acaso mostramos un teaser sin inputs.
    if (!isBrandingAllowed(tier)) {
        return (
            <div className={`${CARD} space-y-5`}>
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
            {/* Header = disparador del acordeón (cerrado por defecto) */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 text-left"
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control" style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}>
                    <Sparkles className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-strong">Branding avanzado</h2>
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">Pro</span>
                    </div>
                    <p className="text-xs text-muted">Color secundario, fuente, acento por modo y pantalla de carga. Cada ajuste muestra un ejemplo en vivo.</p>
                </div>
                <ChevronRight className={`w-[18px] h-[18px] shrink-0 text-subtle transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>

            {/* Hidden inputs → SIEMPRE presentes (aunque el acordeón esté cerrado) para no perder datos al guardar */}
            <input type="hidden" name="brand_secondary_color" value={secondaryColor} />
            <input type="hidden" name="accent_light" value={accentLight} />
            <input type="hidden" name="accent_dark" value={accentDark} />
            <input type="hidden" name="neutral_tint" value={neutralTint ? 'on' : ''} />
            <input type="hidden" name="brand_font_key" value={fontKey} />
            <input type="hidden" name="loader_variant" value={loaderVariant} />
            <input type="hidden" name="use_custom_loader" value={loader.useCustomLoader ? 'on' : ''} />
            <input type="hidden" name="loader_text" value={loader.loaderText} />
            <input type="hidden" name="loader_icon_mode" value={loader.loaderIconMode} />
            <input type="hidden" name="loader_text_color" value={loader.loaderTextColor} />
            <input type="hidden" name="loader_config" value={serializeLoaderConfig(loaderConfig)} />

            {open && (
                <div className="mt-5 space-y-6">
                    {presetActive && (
                        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <p className="text-[11px] leading-relaxed text-muted">
                                Tu <b className="text-strong">tema</b> ya define color, fuente y loader. Cambiá algo acá
                                solo si querés personalizar sobre tu tema.
                            </p>
                        </div>
                    )}

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
                        {/* Mini-preview: badge + macro pintados con el secundario, en claro y oscuro */}
                        <PreviewFrame label={secondaryColor ? 'Así se ven tus badges' : 'Sin secundario · usa tu color principal'}>
                            <div className="grid grid-cols-2 gap-2">
                                {(['light', 'dark'] as const).map((mode) => {
                                    const t: BrandThemeTokens = theme[mode]
                                    return (
                                        <div key={mode} className="rounded-md border p-2" style={{ background: t.bg, borderColor: t.border }}>
                                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide" style={{ color: t.textMuted }}>{mode === 'light' ? 'Claro' : 'Oscuro'}</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: t.accent2, color: t.accent2Text }}>Etiqueta</span>
                                                <span className="h-2 w-2 rounded-full" style={{ background: t.accent2 }} />
                                                <span className="text-[9px] font-bold" style={{ color: t.accent2 }}>142<span style={{ color: t.textMuted }}>g</span></span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </PreviewFrame>
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
                        {/* Mini-preview: título de muestra renderizado con la fuente elegida */}
                        <PreviewFrame label="Muestra de tus títulos">
                            <p className="text-lg font-black leading-tight text-strong" style={{ fontFamily: sampleFontFamily }}>Título Aa</p>
                            <p className="text-xs text-muted" style={{ fontFamily: sampleFontFamily }}>{brandName?.trim() || 'Tu marca'}</p>
                        </PreviewFrame>
                    </div>

                    {/* ── Tinte neutro + acento avanzado ── */}
                    <div className="space-y-3">
                        <label className="flex cursor-pointer items-start justify-between gap-3">
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-strong">Tinte de marca en los fondos</span>
                                <span className="block text-xs text-muted">Tiñe muy sutil los fondos con tu color, para un aire más premium.</span>
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={neutralTint}
                                onClick={() => onChange({ neutralTint: !neutralTint })}
                                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${neutralTint ? 'bg-primary' : 'bg-border'}`}
                            >
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${neutralTint ? 'left-[22px]' : 'left-0.5'}`} />
                            </button>
                        </label>
                        {/* Mini-preview: mini-card sin tinte vs con tinte (más visible en oscuro) */}
                        <PreviewFrame label="Sin tinte vs. con tinte">
                            <div className="grid grid-cols-2 gap-2">
                                {([['off', 'Sin tinte', tintThemes.off], ['on', 'Con tinte', tintThemes.on]] as const).map(([k, label, th]) => {
                                    const active = (k === 'on') === neutralTint
                                    const t = th.dark
                                    return (
                                        <div key={k} className={cn('rounded-lg border-2 p-2 transition-all', active ? 'border-primary' : 'border-transparent')} style={{ background: t.bg }}>
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: t.textMuted }}>{label}</span>
                                                {active && <Check className="h-3 w-3 text-primary" />}
                                            </div>
                                            <div className="space-y-1 rounded-md p-1.5" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
                                                <span className="block h-1.5 w-3/4 rounded-full" style={{ background: t.border }} />
                                                <span className="block h-1.5 w-1/2 rounded-full" style={{ background: t.border }} />
                                                <span className="mt-1 block h-2 w-2 rounded-full" style={{ background: primaryHex }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <p className="mt-1.5 text-[9px] text-subtle">El tinte se nota más en modo oscuro.</p>
                        </PreviewFrame>
                        <button type="button" onClick={() => setAccentOpen((v) => !v)} className="text-xs font-medium text-primary underline">
                            {accentOpen ? 'Ocultar acento por modo' : 'Ajustar acento por modo (avanzado)'}
                        </button>
                        {accentOpen && (
                            <div className="space-y-3">
                                <p className="text-xs text-muted">Forzá un color de acento distinto en claro y oscuro. Si lo dejás vacío, se calcula solo desde tu color principal.</p>
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
                                {/* Mini-preview: swatch del acento resuelto en claro y oscuro, lado a lado */}
                                <PreviewFrame label="Acento resuelto por modo">
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['light', 'dark'] as const).map((mode) => {
                                            const t: BrandThemeTokens = theme[mode]
                                            return (
                                                <div key={mode} className="rounded-md border p-2" style={{ background: t.bg, borderColor: t.border }}>
                                                    <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide" style={{ color: t.textMuted }}>{mode === 'light' ? 'Claro' : 'Oscuro'}</span>
                                                    <div className="rounded-md px-2 py-1 text-center text-[10px] font-bold" style={{ background: t.accent, color: t.accentText }}>Acción</div>
                                                    <p className="mt-1 text-[9px]" style={{ color: t.text }}>Enlace de <span style={{ color: t.accent }}>acento</span></p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </PreviewFrame>
                            </div>
                        )}
                    </div>

                    {/* ── Pantalla de carga (unificada: variante O compositor) ── */}
                    <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 text-muted" />
                            <span className="text-sm font-semibold text-strong">Pantalla de carga</span>
                        </div>
                        <p className="text-xs text-muted">Esto es lo que ve tu alumno mientras carga su app o navega entre páginas.</p>

                        {/* Ruta: elegir una animación lista O armar la tuya (mutuamente excluyentes) */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setLoaderRoute('variant')}
                                aria-pressed={!composerActive}
                                className={cn(
                                    'flex flex-col items-start gap-0.5 rounded-xl border-2 p-2.5 text-left transition-all',
                                    !composerActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                )}
                            >
                                <span className="text-xs font-bold text-strong">Elegir animación</span>
                                <span className="text-[10px] text-muted">Una de las animaciones listas de EVA</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setLoaderRoute('composer')}
                                aria-pressed={composerActive}
                                className={cn(
                                    'flex flex-col items-start gap-0.5 rounded-xl border-2 p-2.5 text-left transition-all',
                                    composerActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                )}
                            >
                                <span className="flex items-center gap-1 text-xs font-bold text-strong"><Wand2 className="h-3 w-3 text-primary" /> Crear el mío</span>
                                <span className="text-[10px] text-muted">Combiná símbolo, animación y texto</span>
                            </button>
                        </div>

                        {composerActive ? (
                            <div className="rounded-xl border border-border p-3">
                                <LoaderComposer
                                    value={loaderConfig ?? DEFAULT_LOADER_COMPOSITE}
                                    onChange={onLoaderConfigChange}
                                    logoUrl={logoUrl}
                                    brandName={brandName}
                                    primaryColor={primaryHex}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Grid de variantes listas */}
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

                                {/* Mini-preview: la animación elegida, en vivo y en miniatura.
                                    overflow-hidden: los pings del radar / arcos escalan más allá del
                                    frame por diseño — se recortan como en la app real. */}
                                <PreviewFrame label="Vista previa en vivo">
                                    <div className="relative flex w-full items-center justify-center overflow-hidden py-2" style={loaderVars}>
                                        {loaderVariant !== 'eva' ? (
                                            <LoaderVariantView
                                                variant={loaderVariant}
                                                brandName={loader.useCustomLoader && loader.loaderText.trim() ? loader.loaderText : 'EVA'}
                                                iconSrc={LOADER_VARIANTS[loaderVariant].hasIcon ? previewIconSrc : undefined}
                                                size="md"
                                            />
                                        ) : (
                                            <EvaRouteLoader
                                                customText={loader.loaderText}
                                                useCustom={loader.useCustomLoader}
                                                textColor={loader.loaderTextColor || undefined}
                                                primaryColor={!loader.loaderTextColor ? primaryHex : undefined}
                                                iconMode={loader.loaderIconMode}
                                                coachLogoUrl={logoUrl ?? undefined}
                                                size="sm"
                                            />
                                        )}
                                    </div>
                                </PreviewFrame>

                                {/* Texto del loader — campo común de esta ruta */}
                                <div className="space-y-1.5">
                                    <label htmlFor="loader_text_input" className="text-sm font-semibold text-strong">Texto del loader</label>
                                    <input
                                        id="loader_text_input"
                                        type="text"
                                        value={loader.loaderText}
                                        onChange={(e) => {
                                            const up = e.target.value.toUpperCase()
                                            onLoaderChange({ loaderText: up, useCustomLoader: up.trim().length > 0 })
                                        }}
                                        maxLength={10}
                                        placeholder="EVA"
                                        className="h-10 w-full rounded-xl border border-default bg-surface-sunken px-3 text-sm uppercase text-strong outline-none focus:border-primary"
                                    />
                                    <p className="text-xs text-muted">Vacío = muestra &quot;EVA&quot;. Escribí tu marca para reemplazar el texto de la animación. Máx 10 caracteres.</p>
                                </div>

                                {/* Ícono del loader — solo si la variante lleva ícono central */}
                                {LOADER_VARIANTS[loaderVariant].hasIcon && (
                                    <div className="space-y-2">
                                        <span className="text-sm font-semibold text-strong">Ícono del loader</span>
                                        <p className="text-xs text-muted">La figura que acompaña al texto mientras carga.</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {([
                                                { value: 'eva', label: 'Logo EVA', desc: 'Ícono animado de EVA' },
                                                { value: 'coach', label: 'Mi logo', desc: logoUrl ? 'Tu logo de marca' : 'Sube un logo primero' },
                                                { value: 'none', label: 'Sin ícono', desc: 'Solo el texto' },
                                            ] as const).map(({ value: iconValue, label, desc }) => (
                                                <button
                                                    key={iconValue}
                                                    type="button"
                                                    disabled={iconValue === 'coach' && !logoUrl}
                                                    onClick={() => onLoaderChange({ loaderIconMode: iconValue })}
                                                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all ${
                                                        loader.loaderIconMode === iconValue ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                                    } ${iconValue === 'coach' && !logoUrl ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className="text-xs font-bold text-strong">{label}</span>
                                                    <span className="text-[10px] leading-tight text-muted">{desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Estilo del texto — solo el estilo EVA (default) usa un color propio */}
                                {loaderVariant === 'eva' && (
                                    <div className="space-y-2">
                                        <span className="text-sm font-semibold text-strong">Estilo del texto</span>
                                        <p className="text-xs text-muted">Cómo se pinta el texto del loader EVA.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onLoaderChange({ loaderTextColor: '' })}
                                                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                                                    loader.loaderTextColor === '' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                                }`}
                                            >
                                                <span className="bg-clip-text text-xl font-extrabold text-transparent" style={{ backgroundImage: brandGradient }}>
                                                    {(loader.loaderText || 'EVA').toUpperCase()}
                                                </span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Gradiente animado</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onLoaderChange({ loaderTextColor: loader.loaderTextColor || primaryHex })}
                                                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                                                    loader.loaderTextColor !== '' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                                }`}
                                            >
                                                <span className="text-xl font-extrabold" style={{ color: loader.loaderTextColor || primaryHex }}>
                                                    {(loader.loaderText || 'EVA').toUpperCase()}
                                                </span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Color sólido</span>
                                            </button>
                                        </div>
                                        {loader.loaderTextColor !== '' && (
                                            <div className="flex items-center gap-3 pt-2">
                                                <input
                                                    type="color"
                                                    value={HEX_RE.test(loader.loaderTextColor) ? loader.loaderTextColor : primaryHex}
                                                    onChange={(e) => onLoaderChange({ loaderTextColor: e.target.value })}
                                                    className="h-9 w-9 cursor-pointer rounded-xl border-2 border-border bg-transparent"
                                                />
                                                <input
                                                    type="text"
                                                    value={loader.loaderTextColor}
                                                    onChange={(e) => onLoaderChange({ loaderTextColor: e.target.value })}
                                                    placeholder="#007AFF"
                                                    className="h-10 flex-1 rounded-xl border border-default bg-surface-sunken px-3 text-sm text-strong outline-none focus:border-primary"
                                                />
                                            </div>
                                        )}
                                        <p className="text-[10px] text-muted">Gradiente: el mismo estilo animado que usa EVA. Color sólido: tu color con animación de pulso.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Guardia WCAG (la vista previa canónica es la del teléfono) ── */}
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
            )}
        </div>
    )
}
