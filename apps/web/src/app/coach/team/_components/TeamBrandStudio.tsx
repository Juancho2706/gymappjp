'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
    Palette, Loader, Loader2, Check, CheckCircle2, Sun, Moon, Plus, ImagePlus, X, Pipette,
    ChevronDown, AlertTriangle, ShieldCheck, Dumbbell, House, UserRound, Utensils,
} from 'lucide-react'
import { isThemeReadable, pickOnColor } from '@eva/brand-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'
import { compressLogo, putToSignedUrl } from '@/lib/uploads/logo-upload.client'
import { updateTeamBrandAction, createTeamLogoUploadUrlAction } from '../_actions/team.actions'

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

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function hexA(hex: string, a: number): string {
    if (!HEX_RE.test(hex)) return `rgba(0,0,0,${a})`
    const c = hex.replace('#', '')
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`
}

function teamInitials(name: string): string {
    return (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

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

/** Swatch + hex + limpiar — TeamColorInput del kit (teams-equipo.jsx:43-60). */
function ColorInput({ label, value, onChange, fallback, disabled, hint }: {
    label: string
    value: string
    onChange: (v: string) => void
    fallback: string
    disabled: boolean
    hint?: string
}) {
    const valid = HEX_RE.test(value)
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-strong">{label}</span>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        disabled={disabled}
                        className="text-[11px] font-semibold text-subtle"
                    >
                        Limpiar
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2">
                <label
                    className={cn(
                        'relative flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border-[1.5px] border-default',
                        !valid && 'bg-surface-sunken'
                    )}
                    style={valid ? { backgroundColor: value } : undefined}
                >
                    {!valid && <Pipette className="h-[15px] w-[15px] text-subtle" />}
                    <input
                        type="color"
                        value={valid ? value : fallback}
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
                    className="h-[38px] min-w-0 flex-1 font-mono text-[13.5px] font-semibold"
                />
            </div>
            {hint && <p className="mt-[5px] text-[10.5px] leading-snug text-subtle">{hint}</p>}
        </div>
    )
}

/** Dropzone de logo del kit (teams-equipo.jsx:24-40): 76px, logo centrado + "x" para quitar el pick local. */
function LogoDrop({ label, hint, currentUrl, previewUrl, removed, onFile, onRemove, disabled, dark, optimizing = false, error = null }: {
    label: string
    hint?: string
    currentUrl: string | null
    previewUrl: string | null
    removed: boolean
    onFile: (f: File | null) => void
    onRemove: () => void
    disabled: boolean
    dark?: boolean
    optimizing?: boolean
    error?: string | null
}) {
    const ref = useRef<HTMLInputElement>(null)
    const shown = previewUrl ?? (removed ? null : currentUrl)
    // "Quitar logo": solo con un logo YA guardado a la vista (no un pick local) y edición habilitada.
    const canRemove = !!currentUrl && !previewUrl && !removed && !disabled
    return (
        <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted">{label}</span>
                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-[11px] font-semibold text-subtle"
                    >
                        Quitar
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={() => ref.current?.click()}
                disabled={disabled || optimizing}
                className={cn(
                    'relative flex h-[76px] w-full items-center justify-center overflow-hidden rounded-control p-2',
                    shown
                        ? cn('border-[1.5px] border-default', dark ? 'bg-[var(--ink-900)]' : 'bg-surface-sunken')
                        : 'border-[1.5px] border-dashed border-strong bg-transparent'
                )}
            >
                {shown ? (
                    // Preview local (object URL) o remoto — img plano evita el dominio whitelist de next/image para blobs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shown} alt={label} className="block h-auto max-h-14 w-auto max-w-full object-contain" />
                ) : (
                    <span className="flex flex-col items-center gap-1 text-subtle">
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[10.5px] font-semibold">Subir</span>
                    </span>
                )}
                {previewUrl && !disabled && !optimizing && (
                    <span
                        aria-label="Quitar imagen"
                        onClick={(e) => {
                            e.stopPropagation()
                            if (ref.current) ref.current.value = ''
                            onFile(null)
                        }}
                        className="absolute right-[5px] top-[5px] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-surface-card text-muted shadow-sm"
                    >
                        <X className="h-3 w-3" />
                    </span>
                )}
                {optimizing && (
                    <span className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 bg-black/55 text-[11px] font-semibold text-white">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Optimizando…
                    </span>
                )}
            </button>
            <input
                ref={ref}
                type="file"
                accept="image/jpeg,image/png"
                disabled={disabled}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="hidden"
            />
            {error
                ? <div className="mt-[5px] text-[10.5px] font-semibold text-[var(--danger-600)]">{error}</div>
                : hint && <div className="mt-[5px] text-[10.5px] text-subtle">{hint}</div>}
        </div>
    )
}

/** Sección plegable del kit (TeamCollapsible, teams-equipo.jsx:63-78). */
function Collapsible({ icon: Icon, title, sub, defaultOpen, children }: {
    icon: typeof Palette
    title: string
    sub?: string
    defaultOpen?: boolean
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(!!defaultOpen)
    return (
        <div className="mt-3 overflow-hidden rounded-control border border-subtle">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
            >
                <Icon className="h-[17px] w-[17px] shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-strong">{title}</span>
                    {sub && <span className="block text-[11.5px] text-muted">{sub}</span>}
                </span>
                <ChevronDown className={cn('h-[17px] w-[17px] shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
            </button>
            {open && <div className="px-3.5 pb-4 pt-1">{children}</div>}
        </div>
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
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null)
    const [logoPicked, setLogoPicked] = useState(false)
    const [logoDarkPicked, setLogoDarkPicked] = useState(false)
    const [logoRemoved, setLogoRemoved] = useState(false)
    const [logoDarkRemoved, setLogoDarkRemoved] = useState(false)
    const [logoBusy, setLogoBusy] = useState<{ light?: boolean; dark?: boolean }>({})
    const [logoErr, setLogoErr] = useState<{ light?: string | null; dark?: string | null }>({})
    const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
    const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)
    const formRef = useRef<HTMLFormElement>(null)

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

    const dirty = useMemo(
        () => logoPicked || logoDarkPicked || logoRemoved || logoDarkRemoved || JSON.stringify(draft) !== JSON.stringify(saved),
        [draft, saved, logoPicked, logoDarkPicked, logoRemoved, logoDarkRemoved]
    )

    const primary = HEX_RE.test(draft.primary_color) ? draft.primary_color : '#10B981'
    const accentForMode = previewMode === 'light'
        ? (HEX_RE.test(draft.accent_light) ? draft.accent_light : primary)
        : (HEX_RE.test(draft.accent_dark) ? draft.accent_dark : primary)
    const onAccent = pickOnColor(accentForMode)
    const initials = teamInitials(draft.name)

    const readable = useMemo(() => {
        try {
            return isThemeReadable({
                brandColor: primary,
                accentLight: HEX_RE.test(draft.accent_light) ? draft.accent_light : null,
                accentDark: HEX_RE.test(draft.accent_dark) ? draft.accent_dark : null,
                neutralTint: draft.neutral_tint,
            })
        } catch {
            return true
        }
    }, [primary, draft.accent_light, draft.accent_dark, draft.neutral_tint])

    const splash = HEX_RE.test(draft.splash_bg_color) ? draft.splash_bg_color : primary
    // El pick local gana; si el logo guardado está marcado para quitar, el preview cae al fallback.
    const lightLogo = logoPreview ?? (logoRemoved ? null : brand.logo_url)
    const darkLogo = logoDarkPreview ?? (logoDarkRemoved ? null : brand.logo_url_dark)
    const shownLogo = previewMode === 'dark' ? (darkLogo ?? lightLogo) : lightLogo

    // Neutrales del mock = familia ink del kit (BrandPreview, teams-equipo.jsx:85-88).
    const N = previewMode === 'dark'
        ? { bg: '#0B0E13', surf: '#1B2129', text: '#F4F6FB', muted: '#93A0B8', border: '#2A323D' }
        : { bg: '#F6F8FB', surf: '#FFFFFF', text: '#0F1729', muted: '#64748B', border: '#E6EAF1' }
    if (draft.neutral_tint) {
        N.border = hexA(primary, previewMode === 'dark' ? 0.34 : 0.2)
        if (previewMode === 'light') N.surf = hexA(primary, 0.03)
    }

    const splashText = HEX_RE.test(draft.loader_text_color) ? draft.loader_text_color : '#FFFFFF'
    const showSplashText = draft.use_custom_loader && (!!draft.loader_text || draft.loader_icon_mode === 'text')
    const splashLabel = (draft.loader_text || (draft.name || 'EVA')).toUpperCase().slice(0, 12)

    // Al SELECCIONAR: comprimir/redimensionar a 512×512 PNG en el navegador y guardar el File liviano
    // para la subida directa en submit. Errores de imagen se muestran inline en el slot.
    const pickLogo = async (f: File | null, which: 'light' | 'dark') => {
        const setPrev = which === 'light' ? setLogoPreview : setLogoDarkPreview
        const setFile = which === 'light' ? setLogoFile : setLogoDarkFile
        const setPicked = which === 'light' ? setLogoPicked : setLogoDarkPicked
        const setRemoved = which === 'light' ? setLogoRemoved : setLogoDarkRemoved
        if (!f) { setPrev(null); setFile(null); setPicked(false); setLogoErr((e) => ({ ...e, [which]: null })); return }
        if (f.type && !f.type.startsWith('image/')) { setLogoErr((e) => ({ ...e, [which]: 'Elegí una imagen (PNG o JPG).' })); return }
        if (f.size > 15 * 1024 * 1024) { setLogoErr((e) => ({ ...e, [which]: 'La imagen es muy pesada (máx 15 MB).' })); return }
        setLogoErr((e) => ({ ...e, [which]: null }))
        setLogoBusy((b) => ({ ...b, [which]: true }))
        try {
            const compressed = await compressLogo(f)
            setFile(compressed)
            setPrev(URL.createObjectURL(compressed))
            setPicked(true)
            setRemoved(false)
        } catch {
            setLogoErr((e) => ({ ...e, [which]: 'No pudimos procesar esta imagen. Probá con un PNG o JPG.' }))
        } finally {
            setLogoBusy((b) => ({ ...b, [which]: false }))
        }
    }

    function submit(fd: FormData) {
        if (logoBusy.light || logoBusy.dark) { setFeedback({ type: 'error', msg: 'Esperá a que termine de optimizar el logo.' }); return }
        setFeedback(null)
        startTransition(async () => {
            // Subir logos DIRECTO a Storage (signed URL, bypass Cloudflare WAF) y pasar los paths al
            // action — el form ya no manda los bytes (inputs sin name), así que el POST es liviano.
            if (logoFile) {
                const t = await createTeamLogoUploadUrlAction(teamId, { variant: 'light', contentType: logoFile.type || 'image/png', size: logoFile.size })
                if (!t.success) { setFeedback({ type: 'error', msg: t.error }); return }
                if (!(await putToSignedUrl(t.signedUrl, logoFile))) { setFeedback({ type: 'error', msg: 'No se pudo subir el logo claro. Reintentá.' }); return }
                fd.set('logo_path', t.path)
            }
            if (logoDarkFile) {
                const t = await createTeamLogoUploadUrlAction(teamId, { variant: 'dark', contentType: logoDarkFile.type || 'image/png', size: logoDarkFile.size })
                if (!t.success) { setFeedback({ type: 'error', msg: t.error }); return }
                if (!(await putToSignedUrl(t.signedUrl, logoDarkFile))) { setFeedback({ type: 'error', msg: 'No se pudo subir el logo oscuro. Reintentá.' }); return }
                fd.set('logo_dark_path', t.path)
            }
            const res = await updateTeamBrandAction(teamId, fd)
            if (res?.error) { setFeedback({ type: 'error', msg: res.error }); return }
            setSaved(draft)
            setLogoFile(null)
            setLogoDarkFile(null)
            setLogoPicked(false)
            setLogoDarkPicked(false)
            setLogoRemoved(false)
            setLogoDarkRemoved(false)
            setFeedback({ type: 'success', msg: 'Marca publicada · el equipo y los alumnos ya la ven' })
            window.setTimeout(() => setFeedback((f) => (f?.type === 'success' ? null : f)), 2600)
        })
    }

    const dis = !canEdit || pending

    return (
        <form ref={formRef} action={submit}>
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
            <input type="hidden" name="remove_logo" value={logoRemoved ? 'true' : ''} />
            <input type="hidden" name="remove_logo_dark" value={logoDarkRemoved ? 'true' : ''} />

            {/* ── Live preview con toggle claro/oscuro ─────────────────── */}
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Vista previa del alumno</span>
                <div className="flex gap-0.5 rounded-pill bg-surface-sunken p-[3px]">
                    {([['light', Sun], ['dark', Moon]] as const).map(([m, MIcon]) => (
                        <button
                            key={m}
                            type="button"
                            aria-label={m}
                            onClick={() => setPreviewMode(m)}
                            className={cn(
                                'flex h-[26px] w-8 items-center justify-center rounded-pill',
                                previewMode === m ? 'bg-surface-card text-strong shadow-sm' : 'text-subtle'
                            )}
                        >
                            <MIcon className="h-3.5 w-3.5" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Teléfono del alumno — BrandPreview del kit (sin bisel, card radius 20) */}
            <div className="w-full overflow-hidden rounded-card shadow-sm" style={{ border: `1px solid ${N.border}`, background: N.bg }}>
                <div className="flex items-center gap-2 px-[13px] pb-2.5 pt-3">
                    {shownLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shownLogo} alt="" className="block h-[22px] w-auto max-w-[90px] object-contain" />
                    ) : (
                        <>
                            <span
                                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-black"
                                style={{ background: primary, color: pickOnColor(primary) }}
                            >
                                {initials || 'E'}
                            </span>
                            <span className="truncate font-display text-sm font-extrabold" style={{ color: N.text }}>
                                {draft.name || 'Tu equipo'}
                            </span>
                        </>
                    )}
                    <span className="ml-auto h-[26px] w-[26px] shrink-0 rounded-full" style={{ background: N.surf, border: `1px solid ${N.border}` }} />
                </div>
                <div className="mx-[13px] mb-2.5 rounded-control p-3" style={{ background: N.surf, border: `1px solid ${N.border}` }}>
                    <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-[10px] font-extrabold tracking-[0.08em]" style={{ color: N.muted }}>HOY</span>
                        <span className="text-[10px] font-bold" style={{ color: accentForMode }}>4/6 series</span>
                    </div>
                    <div className="mb-[11px] h-[7px] overflow-hidden rounded" style={{ background: hexA(accentForMode, 0.16) }}>
                        <div className="h-full w-[64%] rounded" style={{ background: accentForMode }} />
                    </div>
                    <div
                        className="flex h-[34px] items-center justify-center rounded-sm text-xs font-extrabold"
                        style={{ background: accentForMode, color: onAccent }}
                    >
                        Empezar entrenamiento
                    </div>
                </div>
                <div className="mx-[13px] mb-3 flex items-center gap-2 rounded-control px-3 py-2.5" style={{ background: N.surf, border: `1px solid ${N.border}` }}>
                    <span
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px]"
                        style={{ background: hexA(accentForMode, 0.16), color: accentForMode }}
                    >
                        <Utensils className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-[11.5px] font-bold" style={{ color: N.text }}>Nutrición</span>
                    <span className="rounded-pill px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: accentForMode, color: onAccent }}>82%</span>
                </div>
                <div className="flex pb-2.5 pt-2" style={{ borderTop: `1px solid ${N.border}` }}>
                    {[House, Dumbbell, Utensils, UserRound].map((TabIcon, i) => (
                        <span key={i} className="flex flex-1 justify-center" style={{ color: i === 0 ? accentForMode : N.muted }}>
                            <TabIcon className="h-[17px] w-[17px]" />
                        </span>
                    ))}
                </div>
            </div>

            {/* Bloqueo de edición para miembros */}
            <fieldset disabled={!canEdit} className={cn('min-w-0 border-0 p-0', !canEdit && 'opacity-60')}>
                {/* Identidad: nombre + logos */}
                <div className="mt-4">
                    <Label htmlFor="tbs-name" className="mb-1.5 block text-xs font-bold text-strong">Nombre del equipo</Label>
                    <Input
                        id="tbs-name"
                        value={draft.name}
                        onChange={(e) => set('name', e.target.value)}
                        disabled={dis}
                        minLength={2}
                        maxLength={80}
                        placeholder="Tu equipo"
                        className="h-11 font-display text-base font-bold"
                    />
                </div>
                <div className="mt-3.5 flex gap-3">
                    <LogoDrop
                        label="Logo claro"
                        hint="PNG/JPEG · se ajusta a 512×512"
                        currentUrl={brand.logo_url}
                        previewUrl={logoPreview}
                        removed={logoRemoved}
                        disabled={dis}
                        optimizing={logoBusy.light}
                        error={logoErr.light}
                        onRemove={() => {
                            setLogoRemoved(true)
                            setLogoPreview(null)
                            setLogoFile(null)
                            setLogoPicked(false)
                            setLogoErr((e) => ({ ...e, light: null }))
                        }}
                        onFile={(f) => { void pickLogo(f, 'light') }}
                    />
                    <LogoDrop
                        label="Logo oscuro"
                        hint="Para fondos oscuros"
                        currentUrl={brand.logo_url_dark}
                        previewUrl={logoDarkPreview}
                        removed={logoDarkRemoved}
                        disabled={dis}
                        dark
                        optimizing={logoBusy.dark}
                        error={logoErr.dark}
                        onRemove={() => {
                            setLogoDarkRemoved(true)
                            setLogoDarkPreview(null)
                            setLogoDarkFile(null)
                            setLogoDarkPicked(false)
                            setLogoErr((e) => ({ ...e, dark: null }))
                        }}
                        onFile={(f) => { void pickLogo(f, 'dark') }}
                    />
                </div>

                {/* Color principal */}
                <div className="mt-4">
                    <Label className="mb-2 block text-xs font-bold text-strong">Color principal</Label>
                    <div className="flex flex-wrap items-center gap-2">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                disabled={dis}
                                onClick={() => set('primary_color', c)}
                                className={cn(
                                    'h-8 w-8 rounded-full transition-transform active:scale-90',
                                    draft.primary_color.toLowerCase() === c.toLowerCase()
                                        ? 'border-[2.5px] border-strong shadow-[inset_0_0_0_2px_var(--surface-card)]'
                                        : 'border-2 border-subtle hover:scale-105'
                                )}
                                style={{ backgroundColor: c }}
                                aria-label={`Color ${c}`}
                            />
                        ))}
                        <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-strong text-subtle">
                            <Plus className="h-[15px] w-[15px]" />
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

                {/* Banner AA */}
                <div className={cn(
                    'mt-3.5 flex items-center gap-2 rounded-sm px-3 py-[9px] text-xs font-semibold',
                    readable
                        ? 'bg-[var(--success-100)] text-[var(--success-700)]'
                        : 'bg-[var(--warning-100)] text-[var(--warning-700)]'
                )}>
                    {readable
                        ? <><ShieldCheck className="h-[15px] w-[15px] shrink-0" /> Legibilidad AA: los textos se leen bien.</>
                        : <><AlertTriangle className="h-[15px] w-[15px] shrink-0" /> Contraste bajo — EVA lo ajustará automáticamente al publicar.</>}
                </div>

                {/* Avanzado: colores */}
                <Collapsible icon={Palette} title="Ajustes avanzados de color" sub="Acentos y fondo del splash">
                    <div className="flex flex-col gap-3.5">
                        <ColorInput label="Acento · modo claro" value={draft.accent_light} onChange={(v) => set('accent_light', v)} fallback={primary} disabled={dis} hint="Vacío = usa el color principal" />
                        <ColorInput label="Acento · modo oscuro" value={draft.accent_dark} onChange={(v) => set('accent_dark', v)} fallback={primary} disabled={dis} hint="Vacío = usa el color principal" />
                        <ColorInput label="Fondo del splash" value={draft.splash_bg_color} onChange={(v) => set('splash_bg_color', v)} fallback={primary} disabled={dis} hint="Vacío = usa el color principal" />
                        <button
                            type="button"
                            disabled={dis}
                            onClick={() => set('neutral_tint', !draft.neutral_tint)}
                            className="flex w-full items-center gap-[11px] rounded-sm bg-surface-sunken px-3 py-2.5 text-left"
                        >
                            <span
                                className={cn(
                                    'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]',
                                    !draft.neutral_tint && 'border-2 border-strong'
                                )}
                                style={draft.neutral_tint ? { background: primary, color: pickOnColor(primary) } : undefined}
                            >
                                {draft.neutral_tint && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="flex-1 text-[13px] font-semibold text-strong">Teñir los grises con el color de marca</span>
                        </button>
                    </div>
                </Collapsible>

                {/* Avanzado: loader */}
                <Collapsible icon={Loader} title="Pantalla de carga" sub="Lo que ven al abrir la app del equipo">
                    <button
                        type="button"
                        disabled={dis}
                        onClick={() => set('use_custom_loader', !draft.use_custom_loader)}
                        className="mb-3.5 flex w-full items-center gap-2.5 rounded-sm bg-surface-sunken px-3 py-2.5 text-left"
                    >
                        <span className="flex-1 text-[13px] font-semibold text-strong">Loader personalizado</span>
                        <span
                            className="relative h-[22px] w-[38px] shrink-0 rounded-pill transition-colors"
                            style={{ background: draft.use_custom_loader ? primary : 'var(--ink-200)' }}
                        >
                            <span className={cn(
                                'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-[left]',
                                draft.use_custom_loader ? 'left-[18px]' : 'left-0.5'
                            )} />
                        </span>
                    </button>
                    <div className={cn('flex flex-col gap-3.5', !draft.use_custom_loader && 'pointer-events-none opacity-50')}>
                        <div>
                            <Label htmlFor="tbs-loader-text" className="mb-1.5 block text-xs font-bold text-strong">Texto del loader</Label>
                            <Input
                                id="tbs-loader-text"
                                value={draft.loader_text}
                                onChange={(e) => set('loader_text', e.target.value)}
                                disabled={dis}
                                maxLength={24}
                                placeholder={draft.name.toUpperCase().slice(0, 12)}
                                className="h-[42px] text-sm font-semibold"
                            />
                        </div>
                        <ColorInput label="Color del texto" value={draft.loader_text_color} onChange={(v) => set('loader_text_color', v)} fallback="#FFFFFF" disabled={dis} />
                        <div>
                            <Label className="mb-2 block text-xs font-bold text-strong">Ícono del loader</Label>
                            <div className="flex gap-1.5" role="radiogroup" aria-label="Ícono del loader">
                                {ICON_MODES.map((m) => {
                                    const active = draft.loader_icon_mode === m.value
                                    return (
                                        <button
                                            key={m.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={dis}
                                            onClick={() => set('loader_icon_mode', m.value)}
                                            className={cn(
                                                'h-[38px] min-w-0 flex-1 rounded-sm text-[12.5px] font-bold transition-colors',
                                                active ? 'text-strong' : 'border-[1.5px] border-default bg-surface-card text-muted'
                                            )}
                                            style={active ? { border: `2px solid ${primary}`, background: hexA(primary, 0.08) } : undefined}
                                        >
                                            {m.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Splash preview */}
                        <div>
                            <div className="flex h-[150px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[16px]" style={{ backgroundColor: splash }}>
                                {draft.use_custom_loader && draft.loader_icon_mode === 'logo' && (lightLogo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={lightLogo} alt="" className="h-10 w-auto max-w-[140px] object-contain" />
                                ) : (
                                    <span
                                        className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] font-display text-xl font-black"
                                        style={{ background: hexA(splashText, 0.16), color: splashText }}
                                    >
                                        {initials || 'E'}
                                    </span>
                                ))}
                                {draft.use_custom_loader && draft.loader_icon_mode === 'eva' && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={BRAND_APP_ICON}
                                        alt="EVA"
                                        className="h-[46px] w-auto object-contain"
                                        style={{ filter: pickOnColor(splash) !== '#ffffff' ? 'invert(1)' : 'none' }}
                                    />
                                )}
                                {showSplashText && (
                                    <span className="font-display text-[17px] font-extrabold tracking-[0.04em]" style={{ color: splashText }}>
                                        {splashLabel}
                                    </span>
                                )}
                                {(!draft.use_custom_loader || draft.loader_icon_mode === 'none') && !showSplashText && (
                                    <span
                                        className="h-[30px] w-[30px] animate-spin rounded-full border-[3px]"
                                        style={{ borderColor: hexA(pickOnColor(splash), 0.3), borderTopColor: pickOnColor(splash) }}
                                    />
                                )}
                            </div>
                            <div className="mt-2 text-center font-mono text-[11.5px] text-subtle">/t/{teamSlug}</div>
                        </div>
                    </div>
                </Collapsible>
            </fieldset>

            {feedback?.type === 'error' && (
                <div className="mt-4 flex items-center gap-2 rounded-control bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                    {feedback.msg}
                </div>
            )}

            {/* Toast de publicación — pill flotante success del kit (teams-equipo.jsx:470-472) */}
            {feedback?.type === 'success' && (
                <div className="fixed bottom-[100px] left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-pill bg-[var(--success-600)] px-[18px] py-3 text-[13px] font-bold text-white shadow-[var(--shadow-lg)] dark:text-[var(--ink-950)]">
                    <CheckCircle2 className="h-4 w-4" /> {feedback.msg}
                </div>
            )}

            {/* Sticky publish bar — barra oscura inverse del kit (teams-equipo.jsx:461-468) */}
            {canEdit && dirty && (
                <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-3 rounded-card bg-[var(--surface-inverse)] px-4 py-3 shadow-[var(--shadow-xl)]">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--warning-500)]" />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold text-on-dark">Cambios sin publicar</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        className="border border-[var(--border-inverse)] bg-transparent text-on-dark hover:bg-white/10 hover:text-on-dark"
                        onClick={() => {
                            setDraft(saved)
                            setLogoPreview(null)
                            setLogoDarkPreview(null)
                            setLogoFile(null)
                            setLogoDarkFile(null)
                            setLogoPicked(false)
                            setLogoDarkPicked(false)
                            setLogoRemoved(false)
                            setLogoDarkRemoved(false)
                            setLogoErr({})
                            formRef.current?.reset()
                        }}
                    >
                        Descartar
                    </Button>
                    <Button type="submit" variant="sport" size="sm" disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar'}
                    </Button>
                </div>
            )}
        </form>
    )
}
