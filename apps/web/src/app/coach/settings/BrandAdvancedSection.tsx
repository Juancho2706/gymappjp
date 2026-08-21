'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { resolveBrandTheme, contrastReport, type BrandThemeTokens } from '@eva/brand-kit'
import { type SubscriptionTier } from '@eva/tiers'
import { CURATED_FONTS, FONT_KEY_TUPLE, resolveBrandFontStack, type FontKey } from '@/lib/brand-fonts'
import { LOADER_VARIANTS, LOADER_VARIANT_TUPLE, type LoaderVariant } from '@/lib/brand-loaders'
import { serializeLoaderConfig, DEFAULT_LOADER_COMPOSITE, type LoaderComposite } from '@/lib/brand-composer'
import { Sparkles, Palette, Type as TypeIcon, Loader2, Check, AlertTriangle, ChevronRight, Wand2 } from 'lucide-react'
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

/** Valores persistidos del branding avanzado — viven levantados en el form padre (preview + dirty).
 *  W-brand B1/B2: murieron los hex de color (secundario + acentos por modo) — el par se deriva
 *  del tema/primario y ya no se edita acá. Solo queda lo no-color. */
export type AdvancedBrandValue = {
    neutralTint: boolean
    fontKey: FontKey | ''
    loaderVariant: LoaderVariant
}

/** Config del loader legacy (texto/ícono) — también levantado al padre (preview + dirty).
 *  Se fusiona acá con `loaderVariant` para tener UNA sola sección "Pantalla de carga".
 *  W-brand B4: `loaderTextColor` murió — el texto se pinta con el gradiente derivado del primario. */
export type AdvancedLoaderValue = {
    useCustomLoader: boolean
    loaderText: string
    loaderIconMode: 'eva' | 'coach' | 'none'
}

type Props = {
    /** Tier del coach. Ya NO gatea nada (white-label abierto en Pricing v3); se conserva en la
     *  firma para no tocar a los callers y por si vuelve a hacer falta discriminar por plan. */
    tier: SubscriptionTier
    /** Color primario reactivo (lo controla el form padre) — base del cálculo de contraste. */
    primaryColor: string
    /** Secundario RESUELTO (par curado del preset o derivado vía sealPair) — solo lectura (B2). */
    secondaryColor: string
    /** Estado controlado por el form padre (para reflejarlo en el preview del teléfono + dirty). */
    value: AdvancedBrandValue
    onChange: (patch: Partial<AdvancedBrandValue>) => void
    /** Config del loader (texto/ícono) — controlado por el padre; se fusiona con la variante. */
    loader: AdvancedLoaderValue
    onLoaderChange: (patch: Partial<AdvancedLoaderValue>) => void
    /** Loader compuesto "Crear el mío" (W1b) — precede a la variante cuando está definido. */
    loaderConfig: LoaderComposite | null
    onLoaderConfigChange: (next: LoaderComposite | null) => void
    /** Nombre de marca (para la inicial/texto por defecto del compositor). */
    brandName: string
    /** Logo actual (o el recién elegido) — habilita la opción de ícono "Mi logo". */
    logoUrl?: string | null
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

/** Sección "Branding avanzado (Pro)" del white-label v2: fuente + tinte + pantalla de carga
 *  (variante O compositor, unificados). W-brand B1: los inputs hex de color murieron — el par de
 *  marca se muestra solo-lectura (curado del preset o derivado del primario vía sealPair, B2).
 *  Cada control muestra un mini-preview inmediato de LO QUE cambia,
 *  además de la vista previa grande del teléfono (que se mantiene). Acordeón CERRADO por defecto.
 *  Los valores persistidos se emiten como hidden inputs SIEMPRE presentes (fuera del cuerpo colapsable)
 *  para que guardar funcione aunque el acordeón esté cerrado. Controlado: el estado vive en el padre. */
export function BrandAdvancedSection({ primaryColor, secondaryColor, value, onChange, loader, onLoaderChange, loaderConfig, onLoaderConfigChange, brandName, logoUrl }: Props) {
    const { neutralTint, fontKey, loaderVariant } = value
    const [open, setOpen] = useState(false)

    const primaryHex = HEX_RE.test(primaryColor) ? primaryColor : '#10B981'

    // Tema derivado en vivo (mismo motor que el render real) → guardia de contraste + mini-previews.
    // W-brand B2: el secundario llega YA resuelto (par curado del preset o sealPair del primario);
    // los acentos por modo murieron — el motor los deriva solo del primario.
    const theme = useMemo(() => {
        const sec = HEX_RE.test(secondaryColor) ? secondaryColor : null
        return resolveBrandTheme({
            brandColor: primaryHex,
            neutralTint,
            secondaryLight: sec,
            secondaryDark: sec,
        })
    }, [primaryHex, neutralTint, secondaryColor])

    // Par de temas con/sin tinte (solo varía neutralTint) → mini-preview del tinte neutro.
    const tintThemes = useMemo(() => ({
        off: resolveBrandTheme({ brandColor: primaryHex, neutralTint: false }),
        on: resolveBrandTheme({ brandColor: primaryHex, neutralTint: true }),
    }), [primaryHex])

    const report = useMemo(() => contrastReport(theme), [theme])
    const failing = report.items.filter((i) => !i.passes)

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

    // Sin gate: white-label COMPLETO (fuente, tinte, dark, loaders, presets) en todos los planes
    // desde Pricing v3 — decisión owner 2026-08-21. Pro = cupo + sin sello «Hecho con EVA».

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
                    </div>
                    <p className="text-xs text-muted">Fuente, tinte de marca y pantalla de carga. Cada ajuste muestra un ejemplo en vivo.</p>
                </div>
                <ChevronRight className={`w-[18px] h-[18px] shrink-0 text-subtle transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>

            {/* Hidden inputs → SIEMPRE presentes (aunque el acordeón esté cerrado) para no perder datos al guardar.
                W-brand B1/B2/B4: brand_secondary_color / accent_light / accent_dark / loader_text_color ya NO
                viajan — la server action los descarta igual (whitelist) y el par se deriva del tema. */}
            <input type="hidden" name="neutral_tint" value={neutralTint ? 'on' : ''} />
            <input type="hidden" name="brand_font_key" value={fontKey} />
            <input type="hidden" name="loader_variant" value={loaderVariant} />
            <input type="hidden" name="use_custom_loader" value={loader.useCustomLoader ? 'on' : ''} />
            <input type="hidden" name="loader_text" value={loader.loaderText} />
            <input type="hidden" name="loader_icon_mode" value={loader.loaderIconMode} />
            <input type="hidden" name="loader_config" value={serializeLoaderConfig(loaderConfig)} />

            {open && (
                <div className="mt-5 space-y-6">
                    {/* ── Par de marca (solo lectura — B2: el secundario se deriva del tema/primario) ── */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Palette className="w-3.5 h-3.5 text-muted" />
                            <span className="text-sm font-semibold text-strong">Tu par de marca</span>
                        </div>
                        <p className="text-xs text-muted">Badges, etiquetas y macros usan un color secundario que combina con tu tema. Se calcula solo — si eliges un tema, usa su par curado.</p>
                        {/* Mini-preview: badge + macro pintados con el secundario RESUELTO, en claro y oscuro */}
                        <PreviewFrame label="Así se ven tus badges">
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

                    {/* ── Tinte neutro ── */}
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
                                <span className="text-[10px] text-muted">Combina símbolo, animación y texto</span>
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
                                                primaryColor={primaryHex}
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
                                    <p className="text-xs text-muted">Vacío = muestra &quot;EVA&quot;. Escribe tu marca para reemplazar el texto de la animación. Máx 10 caracteres.</p>
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

                                {/* W-brand B4: murió el selector de color del texto — el loader EVA pinta su
                                    texto con el gradiente derivado del color principal (contraste curado por
                                    el motor), sin campo editable. */}
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
