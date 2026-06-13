'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
    Palette, Loader2, Check, Sun, Moon, Sparkles, ImageIcon, Type,
    AlertTriangle, ShieldCheck, Dumbbell, Apple, House, UserRound,
} from 'lucide-react'
import { isThemeReadable } from '@eva/brand-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { updateTeamBrandAction } from '../_actions/team.actions'

export type TeamBrandValues = {
    name: string
    primary_color: string | null
    logo_url: string | null
    logo_url_dark: string | null
    accent_light: string | null
    accent_dark: string | null
    neutral_tint: boolean
    splash_bg_color: string | null
    loader_text: string | null
    loader_text_color: string | null
    loader_icon_mode: string
    use_custom_loader: boolean
}

type Props = {
    teamId: string
    teamSlug: string
    brand: TeamBrandValues
    canEdit: boolean
}

/** Paleta curada para centros deportivos — un tap y la marca queda decente. */
const PRESET_COLORS = ['#EC4899', '#8B5CF6', '#F59E0B', '#10B981', '#0EA5E9', '#EF4444', '#14B8A6', '#F97316'] as const

const ICON_MODES = [
    { value: 'logo', label: 'Logo' },
    { value: 'text', label: 'Texto' },
    { value: 'eva', label: 'EVA' },
    { value: 'none', label: 'Nada' },
] as const

type Draft = {
    name: string
    primary_color: string
    accent_light: string
    accent_dark: string
    splash_bg_color: string
    loader_text: string
    loader_text_color: string
    loader_icon_mode: string
    use_custom_loader: boolean
    neutral_tint: boolean
}

function toDraft(b: TeamBrandValues): Draft {
    return {
        name: b.name,
        primary_color: b.primary_color ?? '#10B981',
        accent_light: b.accent_light ?? '',
        accent_dark: b.accent_dark ?? '',
        splash_bg_color: b.splash_bg_color ?? '',
        loader_text: b.loader_text ?? '',
        loader_text_color: b.loader_text_color ?? '',
        loader_icon_mode: b.loader_icon_mode || 'logo',
        use_custom_loader: b.use_custom_loader,
        neutral_tint: b.neutral_tint,
    }
}

function ColorInput({ label, value, onChange, fallback, disabled, hint }: {
    label: string
    value: string
    onChange: (v: string) => void
    fallback: string
    disabled: boolean
    hint?: string
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            <div className="flex items-center gap-2">
                <label
                    className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border shadow-sm transition-transform active:scale-95"
                    style={{ backgroundColor: value || fallback }}
                >
                    <input
                        type="color"
                        value={value || fallback}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`Selector ${label}`}
                    />
                </label>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    maxLength={7}
                    placeholder={fallback}
                    className="h-9 w-24 font-mono text-xs"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        disabled={disabled}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                        limpiar
                    </button>
                )}
            </div>
            {hint && <p className="text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
        </div>
    )
}

function LogoDrop({ label, currentUrl, previewUrl, onFile, disabled, dark, inputName }: {
    label: string
    currentUrl: string | null
    previewUrl: string | null
    onFile: (f: File | null) => void
    disabled: boolean
    dark?: boolean
    inputName: string
}) {
    const ref = useRef<HTMLInputElement>(null)
    const shown = previewUrl ?? currentUrl
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            <button
                type="button"
                onClick={() => ref.current?.click()}
                disabled={disabled}
                className={cn(
                    'group flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors',
                    dark ? 'border-neutral-700 bg-neutral-950' : 'border-border bg-muted/40',
                    !disabled && 'hover:border-primary/50'
                )}
            >
                <span className={cn(
                    'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border',
                    dark ? 'border-neutral-700 bg-neutral-900' : 'border-border bg-white'
                )}>
                    {shown ? (
                        // Preview local (object URL) o remoto — img plano evita el dominio whitelist de next/image para blobs.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shown} alt={label} className="h-full w-full object-contain p-1.5" />
                    ) : (
                        <ImageIcon className={cn('h-5 w-5', dark ? 'text-neutral-600' : 'text-muted-foreground/50')} />
                    )}
                </span>
                <span className="min-w-0">
                    <span className={cn('block text-xs font-medium', dark ? 'text-neutral-200' : 'text-foreground')}>
                        {shown ? 'Cambiar imagen' : 'Subir imagen'}
                    </span>
                    <span className={cn('block text-[11px]', dark ? 'text-neutral-500' : 'text-muted-foreground')}>
                        PNG/JPEG · ideal 512×512 · ≤2 MB
                    </span>
                </span>
            </button>
            <input
                ref={ref}
                name={inputName}
                type="file"
                accept="image/jpeg,image/png"
                disabled={disabled}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="hidden"
            />
        </div>
    )
}

function Section({ icon: Icon, title, children }: {
    icon: typeof Palette
    title: string
    children: React.ReactNode
}) {
    return (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                </span>
                {title}
            </h4>
            {children}
        </section>
    )
}

/**
 * Brand Studio del TEAM: editor white-label completo con live preview (teléfono del alumno +
 * splash) y chequeo de contraste AA en vivo. Editable por owner/co-gestor; la marca personal
 * del coach vive aparte (Mi Marca, solo standalone).
 */
export function TeamBrandStudio({ teamId, teamSlug, brand, canEdit }: Props) {
    const [pending, startTransition] = useTransition()
    const [draft, setDraft] = useState<Draft>(() => toDraft(brand))
    const [saved, setSaved] = useState<Draft>(() => toDraft(brand))
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null)
    const [logoFilePicked, setLogoFilePicked] = useState(false)
    const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
    const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)
    const formRef = useRef<HTMLFormElement>(null)

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

    const dirty = useMemo(
        () => logoFilePicked || JSON.stringify(draft) !== JSON.stringify(saved),
        [draft, saved, logoFilePicked]
    )

    const primary = /^#[0-9a-fA-F]{6}$/.test(draft.primary_color) ? draft.primary_color : '#10B981'
    const accentForMode = previewMode === 'light'
        ? (/^#[0-9a-fA-F]{6}$/.test(draft.accent_light) ? draft.accent_light : primary)
        : (/^#[0-9a-fA-F]{6}$/.test(draft.accent_dark) ? draft.accent_dark : primary)

    const readable = useMemo(() => {
        try {
            return isThemeReadable({
                brandColor: primary,
                accentLight: /^#[0-9a-fA-F]{6}$/.test(draft.accent_light) ? draft.accent_light : null,
                accentDark: /^#[0-9a-fA-F]{6}$/.test(draft.accent_dark) ? draft.accent_dark : null,
                neutralTint: draft.neutral_tint,
            })
        } catch {
            return true
        }
    }, [primary, draft.accent_light, draft.accent_dark, draft.neutral_tint])

    const splash = /^#[0-9a-fA-F]{6}$/.test(draft.splash_bg_color) ? draft.splash_bg_color : primary
    const shownLogo = previewMode === 'dark'
        ? (logoDarkPreview ?? brand.logo_url_dark ?? logoPreview ?? brand.logo_url)
        : (logoPreview ?? brand.logo_url)

    const previewBg = previewMode === 'light' ? '#FAFAFA' : '#0A0A0A'
    const previewSurface = previewMode === 'light' ? '#FFFFFF' : '#171717'
    const previewText = previewMode === 'light' ? '#171717' : '#FAFAFA'
    const previewMuted = previewMode === 'light' ? '#737373' : '#A3A3A3'
    const previewBorder = previewMode === 'light' ? '#E5E5E5' : '#262626'

    function submit(fd: FormData) {
        setFeedback(null)
        startTransition(async () => {
            const res = await updateTeamBrandAction(teamId, fd)
            if (res?.error) { setFeedback({ type: 'error', msg: res.error }); return }
            setSaved(draft)
            setLogoFilePicked(false)
            setFeedback({ type: 'success', msg: 'Marca publicada. El equipo y los alumnos ya la ven.' })
        })
    }

    const dis = !canEdit || pending

    return (
        <form ref={formRef} action={submit} className="space-y-4">
            {/* name/colores van como inputs hidden controlados para que el form mande el draft */}
            <input type="hidden" name="name" value={draft.name} />
            <input type="hidden" name="primary_color" value={draft.primary_color} />
            <input type="hidden" name="accent_light" value={draft.accent_light} />
            <input type="hidden" name="accent_dark" value={draft.accent_dark} />
            <input type="hidden" name="splash_bg_color" value={draft.splash_bg_color} />
            <input type="hidden" name="loader_text" value={draft.loader_text} />
            <input type="hidden" name="loader_text_color" value={draft.loader_text_color} />
            <input type="hidden" name="loader_icon_mode" value={draft.loader_icon_mode} />
            <input type="hidden" name="use_custom_loader" value={draft.use_custom_loader ? 'true' : 'false'} />
            <input type="hidden" name="neutral_tint" value={draft.neutral_tint ? 'true' : 'false'} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(260px,300px)]">
                {/* ── Controles ─────────────────────────────────────── */}
                <div className="min-w-0 space-y-4">
                    <Section icon={Type} title="Identidad">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="tbs-name" className="text-xs font-medium text-muted-foreground">Nombre del equipo</Label>
                                <Input
                                    id="tbs-name"
                                    value={draft.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    disabled={dis}
                                    minLength={2}
                                    maxLength={80}
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <LogoDrop
                                    label="Logo · modo claro"
                                    currentUrl={brand.logo_url}
                                    previewUrl={logoPreview}
                                    inputName="logo"
                                    disabled={dis}
                                    onFile={(f) => {
                                        setLogoPreview(f ? URL.createObjectURL(f) : null)
                                        setLogoFilePicked(true)
                                    }}
                                />
                                <LogoDrop
                                    label="Logo · modo oscuro"
                                    currentUrl={brand.logo_url_dark}
                                    previewUrl={logoDarkPreview}
                                    inputName="logo_dark"
                                    disabled={dis}
                                    dark
                                    onFile={(f) => {
                                        setLogoDarkPreview(f ? URL.createObjectURL(f) : null)
                                        setLogoFilePicked(true)
                                    }}
                                />
                            </div>
                        </div>
                    </Section>

                    <Section icon={Palette} title="Colores">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Color principal</Label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            disabled={dis}
                                            onClick={() => set('primary_color', c)}
                                            className={cn(
                                                'h-8 w-8 rounded-full border-2 transition-transform active:scale-90',
                                                draft.primary_color.toLowerCase() === c.toLowerCase()
                                                    ? 'border-foreground scale-110 shadow-md'
                                                    : 'border-transparent hover:scale-105'
                                            )}
                                            style={{ backgroundColor: c }}
                                            aria-label={`Color ${c}`}
                                        />
                                    ))}
                                    <label
                                        className="relative flex h-8 items-center gap-1.5 cursor-pointer rounded-full border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50"
                                    >
                                        <span className="h-3.5 w-3.5 rounded-full border border-border" style={{ backgroundColor: primary }} />
                                        {draft.primary_color.toUpperCase()}
                                        <input
                                            type="color"
                                            value={primary}
                                            disabled={dis}
                                            onChange={(e) => set('primary_color', e.target.value)}
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            aria-label="Color personalizado"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className={cn(
                                'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
                                readable
                                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            )}>
                                {readable
                                    ? <><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Legibilidad AA: los textos sobre este color se leen bien en claro y oscuro.</>
                                    : <><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Contraste bajo: este color puede costar de leer. EVA lo ajustará automáticamente donde haga falta, pero considera un tono más oscuro.</>}
                            </div>

                            <details className="group">
                                <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
                                    <span className="inline-flex items-center gap-1">Ajustes avanzados de color <span className="transition-transform group-open:rotate-90">›</span></span>
                                </summary>
                                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <ColorInput label="Acento · modo claro" value={draft.accent_light} onChange={(v) => set('accent_light', v)} fallback={primary} disabled={dis} hint="Vacío = usa el color principal" />
                                    <ColorInput label="Acento · modo oscuro" value={draft.accent_dark} onChange={(v) => set('accent_dark', v)} fallback={primary} disabled={dis} hint="Vacío = usa el color principal" />
                                    <ColorInput label="Fondo del splash" value={draft.splash_bg_color} onChange={(v) => set('splash_bg_color', v)} fallback={primary} disabled={dis} />
                                    <label className="flex items-center gap-2 self-end pb-1 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={draft.neutral_tint}
                                            onChange={(e) => set('neutral_tint', e.target.checked)}
                                            disabled={dis}
                                            className="h-4 w-4 rounded border-border"
                                        />
                                        <span className="text-xs">Teñir grises con el color de marca</span>
                                    </label>
                                </div>
                            </details>
                        </div>
                    </Section>

                    <Section icon={Sparkles} title="Pantalla de carga">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="tbs-loader-text" className="text-xs font-medium text-muted-foreground">Texto (≤24)</Label>
                                <Input
                                    id="tbs-loader-text"
                                    value={draft.loader_text}
                                    onChange={(e) => set('loader_text', e.target.value)}
                                    disabled={dis}
                                    maxLength={24}
                                    placeholder={draft.name.toUpperCase().slice(0, 12)}
                                />
                            </div>
                            <ColorInput label="Color del texto" value={draft.loader_text_color} onChange={(v) => set('loader_text_color', v)} fallback="#FFFFFF" disabled={dis} />
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground">Ícono</Label>
                                <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-border text-xs font-medium" role="radiogroup" aria-label="Ícono del loader">
                                    {ICON_MODES.map((m) => (
                                        <button
                                            key={m.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={draft.loader_icon_mode === m.value}
                                            disabled={dis}
                                            onClick={() => set('loader_icon_mode', m.value)}
                                            className={cn(
                                                'min-h-[36px] px-2 transition-colors',
                                                draft.loader_icon_mode === m.value
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-background text-muted-foreground hover:bg-muted'
                                            )}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className="flex items-center gap-2 self-end pb-1 text-sm">
                                <input
                                    type="checkbox"
                                    checked={draft.use_custom_loader}
                                    onChange={(e) => set('use_custom_loader', e.target.checked)}
                                    disabled={dis}
                                    className="h-4 w-4 rounded border-border"
                                />
                                <span className="text-xs">Activar loader personalizado</span>
                            </label>
                        </div>
                    </Section>
                </div>

                {/* ── Live preview ──────────────────────────────────── */}
                <div className="lg:sticky lg:top-4 lg:self-start">
                    <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista del alumno</p>
                            <div className="flex overflow-hidden rounded-lg border border-border" role="radiogroup" aria-label="Modo de la vista previa">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={previewMode === 'light'}
                                    onClick={() => setPreviewMode('light')}
                                    className={cn('flex min-h-[32px] items-center px-2.5', previewMode === 'light' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                                >
                                    <Sun className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={previewMode === 'dark'}
                                    onClick={() => setPreviewMode('dark')}
                                    className={cn('flex min-h-[32px] items-center px-2.5', previewMode === 'dark' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                                >
                                    <Moon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Phone frame */}
                        <div className="mx-auto w-full max-w-[230px] overflow-hidden rounded-[28px] border-[6px] border-neutral-900 shadow-xl dark:border-neutral-700">
                            <div className="flex flex-col" style={{ backgroundColor: previewBg, minHeight: 360 }}>
                                {/* Status + header */}
                                <div className="px-3 pb-2 pt-3" style={{ backgroundColor: previewSurface, borderBottom: `1px solid ${previewBorder}` }}>
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ backgroundColor: `${accentForMode}1f` }}>
                                            {shownLogo ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={shownLogo} alt="" className="h-full w-full object-contain p-0.5" />
                                            ) : (
                                                <UserRound className="h-3.5 w-3.5" style={{ color: accentForMode }} />
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-[11px] font-bold leading-tight" style={{ color: previewText }}>
                                                {draft.name || 'Tu equipo'}
                                            </p>
                                            <p className="text-[9px] leading-tight" style={{ color: previewMuted }}>Hola, Alumna 👋</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Body mock */}
                                <div className="flex-1 space-y-2 p-3">
                                    <div className="rounded-xl p-2.5" style={{ backgroundColor: previewSurface, border: `1px solid ${previewBorder}` }}>
                                        <p className="text-[9px] font-semibold" style={{ color: previewMuted }}>HOY</p>
                                        <p className="text-[11px] font-bold" style={{ color: previewText }}>Tren superior · 45 min</p>
                                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: previewBorder }}>
                                            <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: accentForMode }} />
                                        </div>
                                    </div>
                                    <button type="button" tabIndex={-1} className="w-full cursor-default rounded-xl py-2 text-[11px] font-bold text-white" style={{ backgroundColor: accentForMode }}>
                                        Empezar entrenamiento
                                    </button>
                                    <div className="rounded-xl p-2.5" style={{ backgroundColor: previewSurface, border: `1px solid ${previewBorder}` }}>
                                        <p className="text-[9px] font-semibold" style={{ color: previewMuted }}>NUTRICIÓN</p>
                                        <div className="mt-1 flex items-center justify-between">
                                            <p className="text-[10px]" style={{ color: previewText }}>1.450 / 2.200 kcal</p>
                                            <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ backgroundColor: `${accentForMode}22`, color: accentForMode }}>66%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Tab bar */}
                                <div className="flex items-center justify-around px-2 py-2" style={{ backgroundColor: previewSurface, borderTop: `1px solid ${previewBorder}` }}>
                                    <House className="h-4 w-4" style={{ color: accentForMode }} />
                                    <Dumbbell className="h-4 w-4" style={{ color: previewMuted }} />
                                    <Apple className="h-4 w-4" style={{ color: previewMuted }} />
                                    <UserRound className="h-4 w-4" style={{ color: previewMuted }} />
                                </div>
                            </div>
                        </div>

                        {/* Splash preview */}
                        <div className="mt-3">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pantalla de carga</p>
                            <div className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl" style={{ backgroundColor: splash }}>
                                {draft.loader_icon_mode === 'logo' && shownLogo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={shownLogo} alt="" className="h-7 w-7 object-contain" />
                                )}
                                {draft.loader_icon_mode === 'logo' && !shownLogo && <Sparkles className="h-5 w-5 text-white/80" />}
                                {draft.loader_icon_mode === 'eva' && <Sparkles className="h-5 w-5 text-white/80" />}
                                {(draft.use_custom_loader && (draft.loader_text || draft.loader_icon_mode === 'text')) && (
                                    <p className="text-[11px] font-black tracking-[0.2em]" style={{ color: draft.loader_text_color || '#FFFFFF' }}>
                                        {(draft.loader_text || draft.name).toUpperCase().slice(0, 24)}
                                    </p>
                                )}
                            </div>
                        </div>

                        <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground/60">/t/{teamSlug}</p>
                    </div>
                </div>
            </div>

            {feedback && (
                <div className={cn(
                    'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
                    feedback.type === 'error'
                        ? 'border-red-500/20 bg-red-500/10 text-red-400'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                )}>
                    {feedback.type === 'success' && <Check className="h-4 w-4" />}
                    {feedback.msg}
                </div>
            )}

            {/* Sticky save bar — aparece solo con cambios sin publicar */}
            {canEdit && dirty && (
                <div className="sticky bottom-2 z-20 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
                    <p className="text-xs text-muted-foreground">
                        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                        Cambios sin publicar
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => { setDraft(saved); setLogoPreview(null); setLogoDarkPreview(null); setLogoFilePicked(false); formRef.current?.reset() }}
                        >
                            Descartar
                        </Button>
                        <Button type="submit" size="sm" disabled={pending}>
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar marca'}
                        </Button>
                    </div>
                </div>
            )}
        </form>
    )
}
