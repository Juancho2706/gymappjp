'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, ExternalLink, Copy, Check, Type, MessageSquare, QrCode, Play, FileText, Maximize2, X, ImagePlus, Moon, Activity } from 'lucide-react'
import { updateBrandSettingsAction, createLogoUploadUrlAction, type BrandSettingsState } from './_actions/settings.actions'
import { compressLogo, putToSignedUrl } from '@/lib/uploads/logo-upload.client'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'
import { hexToRgb } from '@/lib/color-utils'
import { BrandThemePreview } from './_components/BrandThemePreview'
import { ThemeGallery } from './_components/ThemeGallery'
import { LoginLayoutPicker } from './_components/LoginLayoutPicker'
import { QRCodeSVG } from 'qrcode.react'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { BrandAdvancedSection, type AdvancedBrandValue, type AdvancedLoaderValue } from './BrandAdvancedSection'
import type { SubscriptionTier } from '@eva/tiers'
import { resolveBrandFontStack, isFontKey, type FontKey } from '@/lib/brand-fonts'
import { resolveLoaderVariant, type LoaderVariant } from '@/lib/brand-loaders'
import { getThemePreset } from '@/lib/brand-presets'
import { parseLoaderConfig, serializeLoaderConfig, resolveLoginLayout, type LoginLayoutKey, type LoaderComposite } from '@/lib/brand-composer'
import { BRAND_LOGO_WEB, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'

type Coach = Tables<'coaches'>

const initialState: BrandSettingsState = {}
const MAX_LOGO_RAW = 15 * 1024 * 1024 // tope del archivo ORIGINAL; tras comprimir queda en ~512px PNG

/** Colores "por defecto" de EVA: si el color guardado del coach es uno de estos, NO se considera
 *  una marca custom legacy (no mostramos el chip "Tema personalizado"). */
const EVA_DEFAULT_COLORS = new Set([SYSTEM_PRIMARY_COLOR.toLowerCase(), '#10b981', '#2680ff'])

/** Slot de logo (claro u oscuro) — elige archivo a STAGE (no auto-guarda; entra al FAB unificado). */
function LogoSlot({
    label,
    hint,
    dark = false,
    displayUrl,
    brandName,
    staged,
    optimizing = false,
    error = null,
    onPick,
    onClear,
}: {
    label: string
    hint: string
    dark?: boolean
    displayUrl: string | null
    brandName: string
    staged: boolean
    optimizing?: boolean
    error?: string | null
    onPick: (file: File) => void
    onClear: () => void
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [drag, setDrag] = useState(false)
    const pick = (f?: File | null) => { if (f) onPick(f) }

    return (
        <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
                {dark && <Moon className="h-3.5 w-3.5 text-muted" />}
                <span className="text-xs font-bold text-strong">{label}</span>
            </div>
            <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
                className={cn(
                    'relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-control border-2 border-dashed transition-colors',
                    dark ? 'bg-[var(--ink-950)]' : 'bg-surface-sunken',
                    drag ? 'border-[var(--sport-500)]' : 'border-default hover:border-[var(--sport-400)]'
                )}
            >
                {displayUrl ? (
                    <Image src={displayUrl} alt={brandName} fill sizes="220px" className="object-contain p-3" unoptimized />
                ) : dark ? (
                    <span className="text-[11px] text-zinc-400">Opcional — usa el claro si no lo defines</span>
                ) : (
                    <Image src={BRAND_LOGO_WEB} alt="EVA" fill sizes="220px" className="object-contain p-3" />
                )}
                {staged && !optimizing && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">Sin guardar</span>
                )}
                {optimizing && (
                    <span className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 bg-black/60 text-[11px] font-semibold text-white">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Optimizando…
                    </span>
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/40 py-1 text-[10px] font-semibold text-white">
                    <ImagePlus className="h-3 w-3" /> {drag ? 'Suelta aquí' : 'Arrastra o haz clic'}
                </span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <p className={cn('text-[10px]', error ? 'text-destructive' : 'text-muted')}>{error || hint}</p>
                {staged && (
                    <button type="button" onClick={onClear} className="shrink-0 text-[10px] font-semibold text-muted underline">
                        Descartar
                    </button>
                )}
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                aria-hidden="true"
                tabIndex={-1}
                className="sr-only"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
            />
        </div>
    )
}

export function BrandSettingsForm({ coach }: { coach: Coach }) {
    const router = useRouter()
    const formRef = useRef<HTMLFormElement>(null)
    const [state, setState] = useState<BrandSettingsState>(initialState)
    const [isSaving, setIsSaving] = useState(false)

    // La rueda de color murió (W1b): el color legacy del coach se preserva (no editable acá), y el
    // tema (preset) lo gobierna cuando está elegido. Se conserva como valor para reenviarlo intacto.
    const [selectedColor] = useState(coach.primary_color)
    const [useCoachColors, setUseCoachColors] = useState(!!coach.use_brand_colors_coach)
    const [useCustomLoader, setUseCustomLoader] = useState(coach.use_custom_loader ?? false)
    const [loaderText, setLoaderText] = useState(coach.loader_text ?? '')
    const [loaderTextColor, setLoaderTextColor] = useState(coach.loader_text_color ?? '')
    const [loaderIconMode, setLoaderIconMode] = useState<'eva' | 'coach' | 'none'>(
        (coach.loader_icon_mode as 'eva' | 'coach' | 'none') ?? 'eva'
    )
    const [copied, setCopied] = useState(false)
    const [welcomeModalEnabled, setWelcomeModalEnabled] = useState(coach.welcome_modal_enabled ?? false)
    const [welcomeModalContent, setWelcomeModalContent] = useState(coach.welcome_modal_content ?? '')
    const [welcomeModalType, setWelcomeModalType] = useState<'text' | 'video'>(coach.welcome_modal_type as 'text' | 'video' ?? 'text')
    const [welcomeMessageInput, setWelcomeMessageInput] = useState(coach.welcome_message ?? '')
    // Ejecutor V3 (E0.7) — tema del ejecutor del alumno: 'coach' = colores del coach, 'eva' = paleta EVA.
    const [executorTheme, setExecutorTheme] = useState<'coach' | 'eva'>(
        coach.executor_theme === 'eva' ? 'eva' : 'coach'
    )
    // white-label v2 (branding avanzado Pro): estado LEVANTADO al padre (antes vivía local en
    // BrandAdvancedSection) para que el preview del teléfono lo refleje y el dirty/beforeunload lo cuente.
    const [secondaryColor, setSecondaryColor] = useState(coach.brand_secondary_color ?? '')
    const [accentLight, setAccentLight] = useState(coach.accent_light ?? '')
    const [accentDark, setAccentDark] = useState(coach.accent_dark ?? '')
    const [neutralTint, setNeutralTint] = useState(coach.neutral_tint ?? false)
    const [fontKey, setFontKey] = useState<FontKey | ''>(isFontKey(coach.brand_font_key) ? coach.brand_font_key : '')
    const [loaderVariant, setLoaderVariant] = useState<LoaderVariant>(resolveLoaderVariant(coach.loader_variant))
    // white-label W1b — tema (galería de presets), layout de login y loader compuesto ("Crear el tuyo").
    const [themePresetKey, setThemePresetKey] = useState<string | null>(coach.theme_preset_key ?? null)
    const [loginLayoutKey, setLoginLayoutKey] = useState<LoginLayoutKey>(resolveLoginLayout(coach.login_layout_key))
    const [loaderConfig, setLoaderConfig] = useState<LoaderComposite | null>(parseLoaderConfig(coach.loader_config))
    // Vista previa: modo y pestaña LEVANTADOS al padre → una sola instancia lógica compartida
    // (mobile-top + sticky desktop + modal de zoom), toggle claro/oscuro ÚNICO.
    const [previewDark, setPreviewDark] = useState(false)
    const [previewTab, setPreviewTab] = useState('home')
    const [previewExpanded, setPreviewExpanded] = useState(false)

    // Logo unificado: se ELIGE acá (stage) y se sube al presionar Guardar (mismas actions multipart).
    const [stagedLogo, setStagedLogo] = useState<File | null>(null)
    const [stagedLogoUrl, setStagedLogoUrl] = useState<string | null>(null)
    const [stagedLogoDark, setStagedLogoDark] = useState<File | null>(null)
    const [stagedLogoDarkUrl, setStagedLogoDarkUrl] = useState<string | null>(null)
    const [logoOptimizing, setLogoOptimizing] = useState<{ light?: boolean; dark?: boolean }>({})
    const [logoErrors, setLogoErrors] = useState<{ light?: string | null; dark?: string | null }>({})
    const objectUrlsRef = useRef<string[]>([])

    const advancedValue: AdvancedBrandValue = { secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant }
    const handleAdvancedChange = (patch: Partial<AdvancedBrandValue>) => {
        if (patch.secondaryColor !== undefined) setSecondaryColor(patch.secondaryColor)
        if (patch.accentLight !== undefined) setAccentLight(patch.accentLight)
        if (patch.accentDark !== undefined) setAccentDark(patch.accentDark)
        if (patch.neutralTint !== undefined) setNeutralTint(patch.neutralTint)
        if (patch.fontKey !== undefined) setFontKey(patch.fontKey)
        if (patch.loaderVariant !== undefined) setLoaderVariant(patch.loaderVariant)
    }
    const loaderValue: AdvancedLoaderValue = { useCustomLoader, loaderText, loaderIconMode, loaderTextColor }
    const handleLoaderChange = (patch: Partial<AdvancedLoaderValue>) => {
        if (patch.useCustomLoader !== undefined) setUseCustomLoader(patch.useCustomLoader)
        if (patch.loaderText !== undefined) setLoaderText(patch.loaderText)
        if (patch.loaderIconMode !== undefined) setLoaderIconMode(patch.loaderIconMode)
        if (patch.loaderTextColor !== undefined) setLoaderTextColor(patch.loaderTextColor)
    }
    // Tema (preset) activo: gobierna color/fuente/loader de la vista previa (y del alumno vía el proxy).
    // Sin preset → modo legacy: usa el color guardado + los overrides del branding avanzado.
    const activePreset = useMemo(() => getThemePreset(themePresetKey), [themePresetKey])
    const effectivePrimary = activePreset ? activePreset.brandColor : (selectedColor ?? '#007AFF')
    // Espejo de resolvePresetBranding (@eva/brand-kit): la elección EXPLÍCITA del coach le gana
    // a la sugerencia del tema; el preset solo aporta fuente/loader si el coach no eligió.
    const effectiveLoaderVariant: LoaderVariant = loaderVariant !== 'eva'
        ? loaderVariant
        : (activePreset?.loaderVariant ?? 'eva')
    const effectiveFontKey: FontKey | '' = fontKey || (activePreset?.fontKey ?? '')
    // Grandfather: el coach tiene un color custom real (≠ defaults EVA) → ofrecer el chip legacy/reversa.
    const hasLegacyCustom = !!coach.primary_color && !EVA_DEFAULT_COLORS.has(coach.primary_color.toLowerCase())

    // Fuente resuelta para el preview del teléfono (preset o override; '' = default de display de EVA).
    const previewFontFamily = effectiveFontKey ? resolveBrandFontStack(effectiveFontKey) : undefined
    // Logo mostrado en el preview/avanzado: el recién elegido (stage) o el guardado.
    const previewLogoUrl = stagedLogoUrl ?? coach.logo_url

    const publicStudentIdentifier = getCoachPublicIdentifier(coach)
    const studentUrl = `https://eva-app.cl/c/${publicStudentIdentifier}/login`
    // slug legacy: solo lectura (inmutable). Sigue funcionando como alias para alumnos antiguos.
    const legacyStudentUrl = coach.slug ? `https://eva-app.cl/c/${coach.slug}/login` : null

    // Brand Score (H6): recalibrado para que el branding avanzado (fuente / loader / color2) cuente
    // y el 100% sea alcanzable. Suma exacta = 100.
    const brandScore = useMemo(() => {
        let score = 0
        if (coach.logo_url || stagedLogo) score += 20
        if (activePreset || (selectedColor && selectedColor !== '#007AFF')) score += 15
        if (welcomeMessageInput.trim()) score += 10
        if (welcomeModalEnabled && welcomeModalContent.trim()) score += 10
        if (coach.brand_name && coach.brand_name !== coach.full_name) score += 10
        if (useCustomLoader && loaderText.trim()) score += 10
        if (effectiveFontKey) score += 10
        if (effectiveLoaderVariant !== 'eva' || loaderConfig) score += 10
        if (/^#[0-9a-fA-F]{6}$/.test(secondaryColor)) score += 5
        return score
    }, [coach, stagedLogo, activePreset, selectedColor, welcomeMessageInput, welcomeModalEnabled, welcomeModalContent, useCustomLoader, loaderText, effectiveFontKey, effectiveLoaderVariant, loaderConfig, secondaryColor])

    const qrNode = useMemo(() => (
        <QRCodeSVG value={studentUrl} size={96} level="M" />
    ), [studentUrl])

    const isDirty = useMemo(() => {
        const origColor = coach.primary_color ?? '#007AFF'
        return (
            (selectedColor ?? '#007AFF') !== origColor ||
            useCoachColors !== !!coach.use_brand_colors_coach ||
            useCustomLoader !== (coach.use_custom_loader ?? false) ||
            loaderText !== (coach.loader_text ?? '') ||
            loaderTextColor !== (coach.loader_text_color ?? '') ||
            loaderIconMode !== ((coach.loader_icon_mode as 'eva' | 'coach' | 'none') ?? 'eva') ||
            welcomeModalEnabled !== (coach.welcome_modal_enabled ?? false) ||
            welcomeModalContent !== (coach.welcome_modal_content ?? '') ||
            (welcomeModalType as string) !== ((coach.welcome_modal_type ?? 'text') as string) ||
            welcomeMessageInput !== (coach.welcome_message ?? '') ||
            // logo (staged, se sube en el save)
            stagedLogo !== null ||
            stagedLogoDark !== null ||
            // white-label v2 (branding avanzado Pro) — fuente/loader/color2/acentos/tinte
            secondaryColor !== (coach.brand_secondary_color ?? '') ||
            accentLight !== (coach.accent_light ?? '') ||
            accentDark !== (coach.accent_dark ?? '') ||
            neutralTint !== (coach.neutral_tint ?? false) ||
            fontKey !== (isFontKey(coach.brand_font_key) ? coach.brand_font_key : '') ||
            loaderVariant !== resolveLoaderVariant(coach.loader_variant) ||
            // white-label W1b — tema / layout de login / loader compuesto
            themePresetKey !== (coach.theme_preset_key ?? null) ||
            loginLayoutKey !== resolveLoginLayout(coach.login_layout_key) ||
            serializeLoaderConfig(loaderConfig) !== serializeLoaderConfig(parseLoaderConfig(coach.loader_config)) ||
            // Ejecutor V3 (E0.7) — tema del ejecutor
            executorTheme !== (coach.executor_theme === 'eva' ? 'eva' : 'coach')
        )
    }, [selectedColor, useCoachColors, useCustomLoader, loaderText, loaderTextColor, loaderIconMode, welcomeModalEnabled, welcomeModalContent, welcomeModalType, welcomeMessageInput, stagedLogo, stagedLogoDark, secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant, themePresetKey, loginLayoutKey, loaderConfig, executorTheme, coach])

    // Live Preview Effect (H7: el mockup del teléfono SIEMPRE usa selectedColor; este efecto solo
    // tiñe el CHROME del panel del coach, y solo si use_brand_colors_coach está ON).
    useEffect(() => {
        const container = document.querySelector('.coach-layout-container') as HTMLElement;
        const previewColor = useCoachColors ? (effectivePrimary || '#007AFF') : '#007AFF';

        document.documentElement.style.setProperty('--theme-primary', previewColor);
        document.documentElement.style.setProperty('--theme-primary-rgb', hexToRgb(previewColor));
        if (container) {
            container.style.setProperty('--theme-primary', previewColor);
            container.style.setProperty('--theme-primary-rgb', hexToRgb(previewColor));
        }

        return () => {
            // REMOVER las inline (no "restaurar" un valor calculado): el <style> del layout —
            // que ya es preset-aware — retoma el control. Antes el cleanup dejaba INLINE el
            // primary_color LEGACY crudo (naranja) pisando al tema elegido hasta el reload.
            document.documentElement.style.removeProperty('--theme-primary');
            document.documentElement.style.removeProperty('--theme-primary-rgb');
            if (container) {
                container.style.removeProperty('--theme-primary');
                container.style.removeProperty('--theme-primary-rgb');
            }
        };
    }, [effectivePrimary, useCoachColors, coach]);

    // Dirty state warning
    useEffect(() => {
        if (!isDirty) return
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isDirty]);

    // Cerrar la vista previa expandida con Escape.
    useEffect(() => {
        if (!previewExpanded) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewExpanded(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [previewExpanded]);

    // Revocar object URLs de los logos staged al desmontar.
    useEffect(() => {
        return () => {
            objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
            objectUrlsRef.current = []
        }
    }, []);

    // Al SELECCIONAR: comprimir/redimensionar a 512×512 PNG en el navegador y STAGEar el archivo ya
    // liviano. La subida real (directo a Storage, bypass Cloudflare) ocurre en handleSave. Errores de
    // imagen se muestran inline en el slot (no toast) — red de seguridad del incidente 2026-07-05.
    const stageLogo = async (file: File, which: 'light' | 'dark') => {
        if (file.type && !file.type.startsWith('image/')) {
            setLogoErrors((e) => ({ ...e, [which]: 'Elige una imagen (PNG o JPG).' })); return
        }
        if (file.size > MAX_LOGO_RAW) {
            setLogoErrors((e) => ({ ...e, [which]: 'La imagen es muy pesada (máx 15 MB). Prueba con otra.' })); return
        }
        setLogoErrors((e) => ({ ...e, [which]: null }))
        setLogoOptimizing((o) => ({ ...o, [which]: true }))
        try {
            const compressed = await compressLogo(file)
            const url = URL.createObjectURL(compressed)
            objectUrlsRef.current.push(url)
            if (which === 'light') { setStagedLogo(compressed); setStagedLogoUrl(url) }
            else { setStagedLogoDark(compressed); setStagedLogoDarkUrl(url) }
        } catch {
            setLogoErrors((e) => ({ ...e, [which]: 'No pudimos procesar esta imagen. Prueba con un PNG o JPG.' }))
        } finally {
            setLogoOptimizing((o) => ({ ...o, [which]: false }))
        }
    }
    const clearStagedLogos = () => {
        setStagedLogo(null); setStagedLogoUrl(null)
        setStagedLogoDark(null); setStagedLogoDarkUrl(null)
        setLogoErrors({}); setLogoOptimizing({})
    }

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(studentUrl)
            setCopied(true)
            toast.success('Link copiado al portapapeles')
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('No se pudo copiar el link')
        }
    }

    // Sube un logo staged DIRECTO a Storage (signed URL, PUT a supabase.co) — esquiva el WAF de
    // Cloudflare que mataba el POST multipart (incidente 2026-07-05). Devuelve el path o un error.
    const uploadStagedLogo = async (blob: File, variant: 'light' | 'dark'): Promise<{ path?: string; error?: string }> => {
        const ticket = await createLogoUploadUrlAction({ variant, contentType: blob.type || 'image/png', size: blob.size })
        if (!ticket.success) return { error: ticket.error }
        const ok = await putToSignedUrl(ticket.signedUrl, blob)
        if (!ok) return { error: 'No se pudo subir el logo. Revisa tu conexión e intenta de nuevo.' }
        return { path: ticket.path }
    }

    // Guardado UNIFICADO: sube los logos staged DIRECTO a Storage y luego postea el form (liviano,
    // sin archivos → pasa Cloudflare) con los paths resultantes; updateBrandSettingsAction los persiste.
    const handleSave = async () => {
        if (isSaving) return
        if (logoOptimizing.light || logoOptimizing.dark) { toast.error('Espera a que termine de optimizar el logo.'); return }
        setIsSaving(true)
        try {
            let lightPath: string | null = null
            let darkPath: string | null = null
            if (stagedLogo) {
                const r = await uploadStagedLogo(stagedLogo, 'light')
                if (r.error) { setState({ error: r.error }); toast.error(r.error); return }
                lightPath = r.path!
            }
            if (stagedLogoDark) {
                const r = await uploadStagedLogo(stagedLogoDark, 'dark')
                if (r.error) { setState({ error: r.error }); toast.error(r.error); return }
                darkPath = r.path!
            }
            const fd = new FormData(formRef.current!)
            if (lightPath) fd.set('logo_light_path', lightPath)
            if (darkPath) fd.set('logo_dark_path', darkPath)
            const r2 = await updateBrandSettingsAction(initialState, fd)
            if (r2.fieldErrors) { setState({ fieldErrors: r2.fieldErrors }); toast.error('Revisa los campos marcados.'); return }
            if (r2.error) { setState({ error: r2.error }); toast.error(r2.error); return }
            setState({ success: true })
            toast.success('Marca actualizada', { id: 'coach-brand-saved' })
            clearStagedLogos()
            router.refresh()
        } catch {
            setState({ error: 'No se pudo guardar. Intenta de nuevo.' })
            toast.error('No se pudo guardar. Intenta de nuevo.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <form
            ref={formRef}
            key={`brand-form-${coach.updated_at ?? coach.id}`}
            onSubmit={(e) => { e.preventDefault(); void handleSave() }}
            className="space-y-8"
        >
            {/* Brand Score */}
            <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-semibold">Marca completada</span>
                    <span className="font-display font-black tabular-nums" style={{ color: brandScore >= 80 ? 'var(--success-600)' : brandScore >= 50 ? 'var(--warning-600)' : undefined }}>{brandScore}%</span>
                </div>
                <div className="h-1.5 max-w-[200px] flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                    <div
                        className="h-full rounded-pill transition-all duration-500"
                        style={{
                            width: `${brandScore}%`,
                            backgroundColor: brandScore >= 80 ? 'var(--success-500)' : brandScore >= 50 ? 'var(--warning-500)' : 'var(--theme-primary)',
                        }}
                    />
                </div>
                {isDirty && (
                    <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--warning-600)' }}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warning-500)' }} />
                        Sin guardar
                    </span>
                )}
            </div>

            {/* Container query: el breakpoint mide el ANCHO REAL del form (no el viewport) → en el pane
                embebido angosto (~720px) cae a 1 columna aunque el viewport sea ancho (RSP1/#10). El
                @container NO va en el <form> para no volverlo bloque contenedor del modal `fixed`. */}
            <div className="@container/brandform space-y-8">
            {/* Vista previa en vivo — en contenedor angosto va ARRIBA (tras el Brand Score); en ancho vive sticky a la derecha */}
            <div className="@4xl/brandform:hidden">
                <BrandThemePreview
                    brandName={coach.brand_name}
                    primaryColor={effectivePrimary}
                    logoUrl={previewLogoUrl}
                    welcomeMessage={welcomeMessageInput}
                    loaderText={loaderText}
                    useCustomLoader={useCustomLoader}
                    loaderTextColor={loaderTextColor}
                    loaderIconMode={loaderIconMode}
                    fontFamily={previewFontFamily}
                    loaderVariant={effectiveLoaderVariant}
                    loaderConfig={loaderConfig}
                    isDark={previewDark}
                    onToggleDark={() => setPreviewDark((v) => !v)}
                    activeTab={previewTab}
                    onTabChange={setPreviewTab}
                />
            </div>

            <div className="@4xl/brandform:grid @4xl/brandform:grid-cols-[1fr_300px] @4xl/brandform:gap-8">
                <div className="space-y-8">
                    {/* Logo — parte del guardado unificado (FAB), ya no auto-guarda */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-4 shadow-[var(--shadow-sm)]" data-tour-id="brand-logo">
                        <div>
                            <h2 className="text-base font-bold text-strong">Logo de tu marca</h2>
                            <p className="mt-1 text-xs text-muted">
                                También es el ícono que tus alumnos ven al instalar tu app. PNG o JPG · máx 2 MB · 512×512 px, fondo transparente. Se guarda junto con el resto al presionar Guardar.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4 sm:flex-row">
                            <LogoSlot
                                label="Logo claro"
                                hint="Para fondos claros (modo claro)."
                                displayUrl={stagedLogoUrl ?? coach.logo_url}
                                brandName={coach.brand_name}
                                staged={stagedLogo !== null}
                                optimizing={logoOptimizing.light}
                                error={logoErrors.light}
                                onPick={(f) => { void stageLogo(f, 'light') }}
                                onClear={() => { setStagedLogo(null); setStagedLogoUrl(null); setLogoErrors((e) => ({ ...e, light: null })) }}
                            />
                            <LogoSlot
                                label="Logo oscuro"
                                hint="Se usa en modo oscuro de la app del alumno."
                                dark
                                displayUrl={stagedLogoDarkUrl ?? coach.logo_url_dark}
                                brandName={coach.brand_name}
                                staged={stagedLogoDark !== null}
                                optimizing={logoOptimizing.dark}
                                error={logoErrors.dark}
                                onPick={(f) => { void stageLogo(f, 'dark') }}
                                onClear={() => { setStagedLogoDark(null); setStagedLogoDarkUrl(null); setLogoErrors((e) => ({ ...e, dark: null })) }}
                            />
                        </div>
                    </div>

                    {/* Identity */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-identity">
                        <div className="flex items-center gap-2">
                            <Type className="w-4 h-4 text-primary" />
                            <h2 className="text-base font-bold text-strong">Identidad de tu marca</h2>
                        </div>
                        <p className="text-xs text-muted -mt-3">
                            Esta información es lo primero que ven tus alumnos al abrir tu app.
                        </p>

                        <div className="space-y-1.5">
                            <Label htmlFor="brand_name" className="text-sm text-strong font-semibold">
                                Nombre de tu marca
                            </Label>
                            <Input
                                id="brand_name"
                                name="brand_name"
                                defaultValue={coach.brand_name}
                                required
                                className="h-10 bg-surface-sunken border-default text-strong rounded-xl focus:border-primary"
                            />
                            <p className="text-[10px] text-muted">
                                Nombre que ven tus alumnos en la app instalada, la pestaña del navegador y el título.
                            </p>
                            {state.fieldErrors?.brand_name && (
                                <p className="text-xs text-destructive">{state.fieldErrors.brand_name[0]}</p>
                            )}
                        </div>

                        {coach.slug && (
                            <div className="space-y-1.5">
                                <Label className="text-sm text-strong font-semibold">
                                    URL legacy (alias)
                                </Label>
                                <div className="flex items-center gap-0">
                                    <div className="flex h-10 items-center whitespace-nowrap rounded-l-xl border border-r-0 border-subtle bg-surface-sunken px-3 text-sm text-muted">
                                        /c/
                                    </div>
                                    <div className="flex h-10 flex-1 items-center rounded-r-xl border border-subtle bg-surface-sunken px-3 text-sm text-strong">
                                        {coach.slug}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted">
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{legacyStudentUrl}</span>
                                </div>
                                <p className="text-[10px] text-muted">
                                    Alias web antiguo (no editable). Los links nuevos usan tu código corto; este slug sigue funcionando para tus alumnos actuales.
                                </p>
                            </div>
                        )}

                        {/* Datos privados — separado de lo público (facturación/soporte) */}
                        <div className="space-y-1.5 border-t border-border pt-4">
                            <Label htmlFor="full_name" className="text-sm text-strong font-semibold">
                                Tu nombre completo
                            </Label>
                            <Input
                                id="full_name"
                                name="full_name"
                                defaultValue={coach.full_name}
                                required
                                className="h-10 bg-surface-sunken border-default text-strong rounded-xl focus:border-primary"
                            />
                            <p className="text-[10px] text-muted">Privado — para facturación y soporte. Tus alumnos no lo ven.</p>
                            {state.fieldErrors?.full_name && (
                                <p className="text-xs text-destructive">{state.fieldErrors.full_name[0]}</p>
                            )}
                        </div>
                    </div>

                    {/* Mensajes de bienvenida — login + modal del dashboard, en UN solo bloque (de-anidado) */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-welcome-modal">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-primary" />
                            <h2 className="text-base font-bold text-strong">Mensajes de bienvenida</h2>
                        </div>
                        <p className="text-xs text-muted -mt-3">
                            Dos mensajes distintos: uno en el login y otro al abrir el dashboard.
                        </p>

                        {/* Mensaje en el login */}
                        <div className="space-y-1.5">
                            <Label htmlFor="welcome_message" className="text-sm text-strong font-semibold">
                                Mensaje en el login
                            </Label>
                            <Textarea
                                id="welcome_message"
                                name="welcome_message"
                                value={welcomeMessageInput}
                                onChange={(e) => setWelcomeMessageInput(e.target.value)}
                                rows={3}
                                maxLength={240}
                                placeholder="Ej: Bienvenido/a. Esta semana nos enfocamos en consistencia y buena técnica."
                                className="bg-surface-sunken border-default text-strong rounded-xl focus:border-primary resize-none"
                            />
                            <p className="text-[10px] text-muted">
                                Aparece debajo de tu logo en la pantalla de login de tus alumnos. Máximo 240 caracteres.
                            </p>
                            {state.fieldErrors?.welcome_message && (
                                <p className="text-xs text-destructive">{state.fieldErrors.welcome_message[0]}</p>
                            )}
                        </div>

                        {/* Aviso al abrir el dashboard (modal) */}
                        <div className="space-y-4 border-t border-border pt-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Play className="w-4 h-4 text-primary" />
                                    <h3 className="text-sm font-bold text-strong">Aviso al abrir el dashboard (modal)</h3>
                                </div>
                                <input
                                    type="checkbox"
                                    name="welcome_modal_enabled"
                                    checked={welcomeModalEnabled}
                                    onChange={(e) => setWelcomeModalEnabled(e.target.checked)}
                                    className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                                />
                            </div>
                            <p className="text-xs text-muted -mt-2">
                                Muestra un mensaje o video a tus alumnos cada vez que entran a su dashboard. Útil para anuncios, motivación o instrucciones.
                            </p>

                            {welcomeModalEnabled && (
                                <div className="space-y-4">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setWelcomeModalType('text')}
                                            className={cn(
                                                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-all',
                                                welcomeModalType === 'text'
                                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                                    : 'bg-surface-sunken border-default text-muted hover:text-strong'
                                            )}
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            Texto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWelcomeModalType('video')}
                                            className={cn(
                                                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-all',
                                                welcomeModalType === 'video'
                                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                                    : 'bg-surface-sunken border-default text-muted hover:text-strong'
                                            )}
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                            Video
                                        </button>
                                    </div>

                                    {welcomeModalType === 'text' ? (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="welcome_modal_content" className="text-sm text-strong font-semibold">
                                                Mensaje para tus alumnos
                                            </Label>
                                            <Textarea
                                                id="welcome_modal_content"
                                                value={welcomeModalContent}
                                                onChange={(e) => setWelcomeModalContent(e.target.value)}
                                                rows={5}
                                                maxLength={1000}
                                                placeholder="Ej: ¡Feliz lunes! Esta semana tenemos un nuevo foco de entrenamiento..."
                                                className="bg-surface-sunken border-default text-strong rounded-xl focus:border-primary resize-none"
                                            />
                                            <p className="text-[10px] text-muted">
                                                Máximo 1000 caracteres. Tus alumnos verán este mensaje en un modal al entrar a su dashboard.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="welcome_modal_content" className="text-sm text-strong font-semibold">
                                                URL del video
                                            </Label>
                                            <Input
                                                id="welcome_modal_content"
                                                value={welcomeModalContent}
                                                onChange={(e) => setWelcomeModalContent(e.target.value)}
                                                placeholder="https://youtube.com/watch?v=... o https://vimeo.com/..."
                                                className="h-10 bg-surface-sunken border-default text-strong rounded-xl focus:border-primary"
                                            />
                                            <p className="text-[10px] text-muted">
                                                Pega el link de YouTube o Vimeo. El video se mostrará embebido en el modal.
                                            </p>
                                        </div>
                                    )}
                                    {state.fieldErrors?.welcome_modal_content && (
                                        <p className="text-xs text-destructive">{state.fieldErrors.welcome_modal_content[0]}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tema de marca (W1b): la galería de presets curados reemplaza la rueda de color libre.
                        El color legacy del coach se preserva intacto en el hidden input (reversible). */}
                    <ThemeGallery
                        value={themePresetKey}
                        onChange={setThemePresetKey}
                        legacyPrimaryColor={selectedColor}
                        hasLegacyCustom={hasLegacyCustom}
                    />
                    <input type="hidden" name="primary_color" value={selectedColor ?? '#007AFF'} />

                    {/* Diseño del login del alumno (W1b): 4 variantes de layout que heredan el tema. */}
                    <LoginLayoutPicker
                        value={loginLayoutKey}
                        onChange={setLoginLayoutKey}
                        accentColor={effectivePrimary}
                    />

                    {/* Aplicar mi marca a mi propio panel (de-anidado de "Color", es otra cosa: el chrome del coach) */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold text-strong">Usar mi marca también en mi panel</Label>
                                <p className="text-xs text-muted">Si se activa, tu panel de coach usa tu color y estilos de marca. Si no, usa los del sistema. No afecta la app del alumno.</p>
                            </div>
                            <input
                                type="checkbox"
                                name="use_brand_colors_coach"
                                checked={useCoachColors}
                                onChange={(e) => setUseCoachColors(e.target.checked)}
                                className="w-5 h-5 rounded border-border text-primary focus:ring-primary shrink-0"
                            />
                        </div>
                    </div>

                    {/* Ejecutor de entrenamiento (E0.7) — tema de colores del ejecutor del alumno.
                        Preferencia: "Mis colores" (color de marca) vs "Colores EVA" (Sport/Aqua/Ember).
                        El hidden input viaja SIEMPRE (aunque el bloque no toque tier). */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            <h2 className="text-base font-bold text-strong">Ejecutor de entrenamiento</h2>
                        </div>
                        <p className="text-xs text-muted -mt-3">
                            Elige los colores que ven tus alumnos mientras entrenan.
                        </p>
                        <input type="hidden" name="executor_theme" value={executorTheme} />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setExecutorTheme('coach')}
                                aria-pressed={executorTheme === 'coach'}
                                className={cn(
                                    'flex flex-col gap-3 rounded-control border p-4 text-left transition-all',
                                    executorTheme === 'coach'
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                        : 'border-default bg-surface-sunken hover:border-[var(--sport-400)]'
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-strong">Mis colores</span>
                                    {executorTheme === 'coach' && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="h-5 w-5 rounded-full border border-black/5"
                                        style={{ background: effectivePrimary || '#007AFF' }}
                                    />
                                </div>
                                <p className="text-[11px] text-muted">Usa el color de tu marca.</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setExecutorTheme('eva')}
                                aria-pressed={executorTheme === 'eva'}
                                className={cn(
                                    'flex flex-col gap-3 rounded-control border p-4 text-left transition-all',
                                    executorTheme === 'eva'
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                        : 'border-default bg-surface-sunken hover:border-[var(--sport-400)]'
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-strong">Colores EVA</span>
                                    {executorTheme === 'eva' && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-5 w-5 rounded-full border border-black/5" style={{ background: '#2680FF' }} />
                                    <span className="h-5 w-5 rounded-full border border-black/5" style={{ background: '#18ABD4' }} />
                                    <span className="h-5 w-5 rounded-full border border-black/5" style={{ background: '#FF6A3D' }} />
                                </div>
                                <p className="text-[11px] text-muted">Paleta EVA multicolor.</p>
                            </button>
                        </div>
                    </div>

                    {/* white-label v2 — branding avanzado (Pro): acordeón cerrado (color2 + fuente + dark + loader) */}
                    <BrandAdvancedSection
                        tier={(coach.subscription_tier ?? 'starter') as SubscriptionTier}
                        primaryColor={effectivePrimary || '#10B981'}
                        value={advancedValue}
                        onChange={handleAdvancedChange}
                        loader={loaderValue}
                        onLoaderChange={handleLoaderChange}
                        loaderConfig={loaderConfig}
                        onLoaderConfigChange={setLoaderConfig}
                        brandName={coach.brand_name}
                        logoUrl={previewLogoUrl}
                        presetActive={!!activePreset}
                    />

                    {/* Share with students */}
                    <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-share">
                        <div className="flex items-center gap-2">
                            <QrCode className="w-4 h-4 text-primary" />
                            <h2 className="text-base font-bold text-strong">Compartir con alumnos</h2>
                        </div>
                        <p className="text-xs text-muted -mt-3">
                            Tus alumnos entran con tu código corto. Los slugs antiguos siguen funcionando como alias.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                            <div className="p-3 bg-white rounded-xl border border-border shrink-0">
                                {qrNode}
                            </div>
                            <div className="flex-1 min-w-0 space-y-3 w-full">
                                <div className="space-y-1">
                                    <Label className="text-sm font-semibold">Link principal para tus alumnos</Label>
                                    {coach.invite_code ? (
                                        <div className="inline-flex items-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 font-mono text-sm font-black tracking-[0.22em] text-primary">
                                            {coach.invite_code}
                                        </div>
                                    ) : null}
                                    <div className="flex items-center gap-2">
                                        <Input
                                            readOnly
                                            value={studentUrl}
                                            className="h-10 bg-surface-sunken border-default text-strong rounded-xl text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopyLink}
                                            className={cn(
                                                'h-10 shrink-0 rounded-control border px-3 text-sm font-bold transition-all',
                                                copied
                                                    ? 'border-transparent'
                                                    : 'border-default bg-surface-sunken text-muted hover:border-[var(--sport-400)] hover:text-strong'
                                            )}
                                            style={copied ? { background: 'var(--success-100)', color: 'var(--success-700)' } : undefined}
                                        >
                                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted">
                                    Comparte este link por WhatsApp, Instagram o muestra el QR en tu gym. Si un alumno tiene un link antiguo con tu slug, también seguirá funcionando.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column: Live preview (sticky, solo en ancho — en angosto la instancia vive arriba) */}
                <div className="hidden @4xl/brandform:block @4xl/brandform:sticky @4xl/brandform:top-6 @4xl/brandform:self-start space-y-6" data-tour-id="brand-preview">
                    <BrandThemePreview
                        brandName={coach.brand_name}
                        primaryColor={selectedColor}
                        logoUrl={previewLogoUrl}
                        welcomeMessage={welcomeMessageInput}
                        loaderText={loaderText}
                        useCustomLoader={useCustomLoader}
                        loaderTextColor={loaderTextColor}
                        loaderIconMode={loaderIconMode}
                        fontFamily={previewFontFamily}
                        loaderVariant={loaderVariant}
                        loaderConfig={loaderConfig}
                        isDark={previewDark}
                        onToggleDark={() => setPreviewDark((v) => !v)}
                        activeTab={previewTab}
                        onTabChange={setPreviewTab}
                    />
                </div>
            </div>
            </div>

            {/* Hidden inputs always rendered — el modal siempre envía su estado aunque esté colapsado */}
            <input type="hidden" name="welcome_modal_type" value={welcomeModalType} />
            <input type="hidden" name="welcome_modal_content" value={welcomeModalContent} />

            {/* Guardado — sticky dentro del form (contenido, NO fixed al viewport → no flota sobre el rail en el pane embebido) */}
            <div className="sticky z-40 flex justify-end bottom-[calc(var(--mobile-content-bottom-offset,0px)+1rem)] md:bottom-6" data-tour-id="brand-save">
                <div className="flex flex-col items-end gap-2">
                    {state.error && (
                        <div className="max-w-[260px] rounded-control border px-3 py-2 text-xs shadow-[var(--shadow-lg)]" style={{ background: 'var(--danger-100)', borderColor: 'var(--danger-100)', color: 'var(--danger-600)' }}>
                            {state.error}
                        </div>
                    )}
                    {state.success && (
                        <div className="max-w-[260px] rounded-control border px-3 py-2 text-xs shadow-[var(--shadow-lg)]" style={{ background: 'var(--success-100)', borderColor: 'var(--success-100)', color: 'var(--success-700)' }}>
                            ✓ Cambios guardados
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPreviewExpanded(true)}
                            className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-card text-muted hover:text-strong hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 shadow-lg"
                        >
                            <Maximize2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Expandir vista</span>
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className={cn(
                                'flex items-center gap-2 rounded-pill transition-all duration-200 text-[var(--text-on-sport)] shadow-[var(--glow-sport)]',
                                'h-12 px-5 text-sm font-bold',
                                'disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-0.5'
                            )}
                            style={{ backgroundColor: 'var(--theme-primary)' }}
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span className="hidden sm:inline">{isSaving ? 'Guardando...' : 'Guardar cambios'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Colchón inferior: deja que el FAB sticky se mantenga sobre la barra de navegación móvil */}
            <div className="h-[calc(var(--mobile-content-bottom-offset,0px)+0.5rem)] md:h-2" aria-hidden="true" />

            {/* Vista previa expandida — el MISMO preview fiel (misma instancia lógica), a pantalla completa */}
            {previewExpanded && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
                    style={{ background: 'var(--surface-overlay)' }}
                    onClick={() => setPreviewExpanded(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Vista previa de tu marca"
                >
                    <div className="relative w-full max-w-sm max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewExpanded(false)}
                            className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted shadow-lg transition-colors hover:text-strong"
                            aria-label="Cerrar vista previa"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <BrandThemePreview
                            brandName={coach.brand_name}
                            primaryColor={selectedColor}
                            logoUrl={previewLogoUrl}
                            welcomeMessage={welcomeMessageInput}
                            loaderText={loaderText}
                            useCustomLoader={useCustomLoader}
                            loaderTextColor={loaderTextColor}
                            loaderIconMode={loaderIconMode}
                            fontFamily={previewFontFamily}
                            loaderVariant={loaderVariant}
                            loaderConfig={loaderConfig}
                            isDark={previewDark}
                            onToggleDark={() => setPreviewDark((v) => !v)}
                            activeTab={previewTab}
                            onTabChange={setPreviewTab}
                        />
                    </div>
                </div>
            )}
        </form>
    )
}
