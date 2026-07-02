'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, Palette, ExternalLink, Copy, Check, ImageIcon, Type, MessageSquare, SlidersHorizontal, QrCode, Play, FileText, RotateCcw, ShieldCheck, ShieldAlert, ShieldX, Maximize2, X } from 'lucide-react'
import { updateBrandSettingsAction, type BrandSettingsState } from './_actions/settings.actions'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'
import { generateBrandPalette, getContrastInfo, hexToRgb } from '@/lib/color-utils'
import { BrandThemePreview } from './_components/BrandThemePreview'
import { QRCodeSVG } from 'qrcode.react'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { BrandAdvancedSection, type AdvancedBrandValue } from './BrandAdvancedSection'
import type { SubscriptionTier } from '@eva/tiers'
import { resolveBrandFontStack, isFontKey, type FontKey } from '@/lib/brand-fonts'
import { resolveLoaderVariant, type LoaderVariant } from '@/lib/brand-loaders'

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
                'flex items-center gap-2 rounded-pill transition-all duration-200 text-[var(--text-on-sport)] shadow-[var(--glow-sport)]',
                'h-12 px-5 text-sm font-bold',
                'disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-0.5'
            )}
            style={{ backgroundColor: 'var(--theme-primary)' }}
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">{pending ? 'Guardando...' : 'Guardar cambios'}</span>
        </button>
    )
}

export function BrandSettingsForm({ coach }: { coach: Coach }) {
    const [state, formAction] = useActionState(updateBrandSettingsAction, initialState)
    const [selectedColor, setSelectedColor] = useState(coach.primary_color)
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
    // white-label v2 (branding avanzado Pro): estado LEVANTADO al padre (antes vivía local en
    // BrandAdvancedSection) para que el preview del teléfono lo refleje y el dirty/beforeunload lo cuente.
    const [secondaryColor, setSecondaryColor] = useState(coach.brand_secondary_color ?? '')
    const [accentLight, setAccentLight] = useState(coach.accent_light ?? '')
    const [accentDark, setAccentDark] = useState(coach.accent_dark ?? '')
    const [neutralTint, setNeutralTint] = useState(coach.neutral_tint ?? false)
    const [fontKey, setFontKey] = useState<FontKey | ''>(isFontKey(coach.brand_font_key) ? coach.brand_font_key : '')
    const [loaderVariant, setLoaderVariant] = useState<LoaderVariant>(resolveLoaderVariant(coach.loader_variant))
    // Vista previa a pantalla completa (mismo componente fiel que el sticky — refleja lo que editás).
    const [previewExpanded, setPreviewExpanded] = useState(false)

    const advancedValue: AdvancedBrandValue = { secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant }
    const handleAdvancedChange = (patch: Partial<AdvancedBrandValue>) => {
        if (patch.secondaryColor !== undefined) setSecondaryColor(patch.secondaryColor)
        if (patch.accentLight !== undefined) setAccentLight(patch.accentLight)
        if (patch.accentDark !== undefined) setAccentDark(patch.accentDark)
        if (patch.neutralTint !== undefined) setNeutralTint(patch.neutralTint)
        if (patch.fontKey !== undefined) setFontKey(patch.fontKey)
        if (patch.loaderVariant !== undefined) setLoaderVariant(patch.loaderVariant)
    }
    // Fuente resuelta para el preview del teléfono (solo si el coach eligió una; '' = sin cambio visual).
    const previewFontFamily = fontKey ? resolveBrandFontStack(fontKey) : undefined

    const palette = generateBrandPalette(selectedColor ?? '#007AFF')
    const publicStudentIdentifier = getCoachPublicIdentifier(coach)
    const studentUrl = `https://eva-app.cl/c/${publicStudentIdentifier}/login`
    // slug legacy: solo lectura (inmutable). Sigue funcionando como alias para alumnos antiguos.
    const legacyStudentUrl = coach.slug ? `https://eva-app.cl/c/${coach.slug}/login` : null

    const contrast = useMemo(() => getContrastInfo(selectedColor ?? '#007AFF'), [selectedColor])

    const brandScore = useMemo(() => {
        let score = 0
        if (coach.logo_url) score += 25
        if (selectedColor && selectedColor !== '#007AFF') score += 20
        if (welcomeMessageInput.trim()) score += 15
        if (useCustomLoader && loaderText.trim()) score += 15
        if (welcomeModalEnabled && welcomeModalContent.trim()) score += 15
        if (coach.brand_name && coach.brand_name !== coach.full_name) score += 10
        return score
    }, [coach, selectedColor, welcomeMessageInput, useCustomLoader, loaderText, welcomeModalEnabled, welcomeModalContent])

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
            // white-label v2 (branding avanzado Pro) — fuente/loader/color2/acentos/tinte
            secondaryColor !== (coach.brand_secondary_color ?? '') ||
            accentLight !== (coach.accent_light ?? '') ||
            accentDark !== (coach.accent_dark ?? '') ||
            neutralTint !== (coach.neutral_tint ?? false) ||
            fontKey !== (isFontKey(coach.brand_font_key) ? coach.brand_font_key : '') ||
            loaderVariant !== resolveLoaderVariant(coach.loader_variant)
        )
    }, [selectedColor, useCoachColors, useCustomLoader, loaderText, loaderTextColor, loaderIconMode, welcomeModalEnabled, welcomeModalContent, welcomeModalType, welcomeMessageInput, secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant, coach])

    useEffect(() => {
        if (state.success) {
            toast.success('Marca actualizada', { id: 'coach-brand-saved' })
        }
        if (state.error) {
            toast.error(state.error, { id: 'coach-brand-err' })
        }
    }, [state.success, state.error])

    // Live Preview Effect
    useEffect(() => {
        const container = document.querySelector('.coach-layout-container') as HTMLElement;
        const originalColor = coach.use_brand_colors_coach === false ? '#007AFF' : (coach.primary_color || '#007AFF');
        const previewColor = useCoachColors ? (selectedColor || '#007AFF') : '#007AFF';

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

    return (
        <form key={`brand-form-${coach.updated_at ?? coach.id}`} action={formAction} className="space-y-8 lg:space-y-0">
            {/* Brand Score */}
            <div className="flex items-center justify-between gap-3 px-1 mb-2">
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

            {/* Vista previa en vivo — <lg va ARRIBA, tras el Brand Score (kit MiMarca); en lg vive sticky a la derecha */}
            <div className="lg:hidden">
                <BrandThemePreview
                    brandName={coach.brand_name}
                    primaryColor={selectedColor}
                    logoUrl={coach.logo_url}
                    welcomeMessage={welcomeMessageInput}
                    loaderText={loaderText}
                    useCustomLoader={useCustomLoader}
                    loaderTextColor={loaderTextColor}
                    loaderIconMode={loaderIconMode}
                    fontFamily={previewFontFamily}
                    loaderVariant={loaderVariant}
                />
            </div>

            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8">
                <div className="space-y-8">
            {/* Identity */}
            <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-identity">
                <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-strong">Identidad de tu marca</h2>
                </div>
                <p className="text-xs text-muted -mt-3">
                    Esta información es lo primero que ven tus alumnos al abrir tu app.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
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
                        <p className="text-[10px] text-muted">Nombre privado para facturación y soporte.</p>
                        {state.fieldErrors?.full_name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.full_name[0]}</p>
                        )}
                    </div>

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

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-muted" />
                        <Label htmlFor="welcome_message" className="text-sm text-strong font-semibold">
                            Mensaje de bienvenida
                        </Label>
                    </div>
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

                {/* Welcome Modal */}
                <div className="rounded-control border border-subtle bg-surface-card p-4 space-y-4" data-tour-id="brand-welcome-modal">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Play className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-bold text-strong">Mensaje de bienvenida al dashboard</h3>
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
                                        name="welcome_modal_content"
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
                                        name="welcome_modal_content"
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

            {/* Brand color */}
            <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-color">
                <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-strong">Color de marca</h2>
                </div>
                <p className="text-xs text-muted -mt-3">
                    Este color se aplica a botones, elementos activos, gráficos y brillos de tu app. Generamos automáticamente variantes más claras y oscuras.
                </p>

                <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setSelectedColor(color)}
                            className={cn(
                                'h-10 w-10 rounded-control border-2 transition-all duration-150 hover:scale-110',
                                selectedColor === color
                                    ? 'scale-110 border-strong shadow-[var(--shadow-md)]'
                                    : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}

                    <div className="flex items-center gap-2 ml-2">
                        <input
                            type="color"
                            value={selectedColor ?? '#007AFF'}
                            onChange={(e) => setSelectedColor(e.target.value)}
                            className="w-10 h-10 rounded-xl cursor-pointer border-2 border-border bg-transparent"
                            title="Color personalizado"
                        />
                        <span className="text-xs text-muted font-mono">{selectedColor}</span>
                    </div>
                </div>

                {/* Contrast badge + reset */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div
                        className="flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-bold"
                        style={
                            contrast.level === 'AA'
                                ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                : contrast.level === 'AA-large'
                                ? { background: 'var(--warning-100)', color: 'var(--warning-700)' }
                                : { background: 'var(--danger-100)', color: 'var(--danger-600)' }
                        }
                    >
                        {contrast.level === 'AA' && <ShieldCheck className="w-3.5 h-3.5" />}
                        {contrast.level === 'AA-large' && <ShieldAlert className="w-3.5 h-3.5" />}
                        {contrast.level === 'fail' && <ShieldX className="w-3.5 h-3.5" />}
                        {contrast.level === 'AA' ? 'Legible (WCAG AA)' : contrast.level === 'AA-large' ? 'Solo textos grandes' : 'Bajo contraste'}
                        <span className="opacity-60">{contrast.ratio.toFixed(1)}:1</span>
                    </div>
                    {selectedColor && selectedColor !== '#007AFF' && (
                        <button
                            type="button"
                            onClick={() => setSelectedColor('#007AFF')}
                            className="flex items-center gap-1 text-xs text-muted hover:text-strong transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar por defecto
                        </button>
                    )}
                </div>

                <input type="hidden" name="primary_color" value={selectedColor} />

                {/* Generated palette */}
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Paleta generada automáticamente</p>
                    <div className="flex gap-2">
                        {[
                            { label: 'Primario', color: palette.primary },
                            { label: 'Oscuro', color: palette.primaryDark },
                            { label: 'Claro', color: palette.primaryLight },
                            { label: 'Superficie', color: palette.primarySurface },
                            { label: 'Brillo', color: palette.primaryGlow },
                        ].map(({ label, color }) => (
                            <div key={label} className="flex flex-col items-center gap-1">
                                <div
                                    className="w-8 h-8 rounded-lg border border-border/50"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                                <span className="text-[9px] text-muted">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-control border border-subtle bg-surface-sunken p-4">
                    <p className="mb-3 text-xs text-muted">Vista previa del botón principal</p>
                    <button
                        type="button"
                        className="px-5 py-2.5 text-sm font-bold rounded-xl text-white transition-all"
                        style={{ backgroundColor: selectedColor }}
                    >
                        Ingresar al Panel
                    </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Configuración de visualización
                    </h3>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-semibold">Usar todos mis estilos personalizados en mi dashboard actual</Label>
                            <p className="text-xs text-muted">Si se activa, tu panel de coach usa tu color, loader y estilos de marca. Si no, usa los valores del sistema.</p>
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

            {/* white-label v2 — branding avanzado (Pro): color2 + fuente + dark + loader */}
            <BrandAdvancedSection
                tier={(coach.subscription_tier ?? 'starter') as SubscriptionTier}
                primaryColor={selectedColor || '#10B981'}
                value={advancedValue}
                onChange={handleAdvancedChange}
            />

            {/* Loader customization */}
            <div className="bg-surface-card border border-subtle rounded-card p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-loader">
                <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-strong">Loader animado</h2>
                </div>
                <p className="text-xs text-muted -mt-3">
                    Animación que aparece cuando tus alumnos cargan la app o navegan entre páginas.
                </p>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Usar texto personalizado</Label>
                        <p className="text-xs text-muted">Muestra tu marca en vez de &quot;EVA&quot; en la animación de carga.</p>
                    </div>
                    <input
                        type="checkbox"
                        name="use_custom_loader"
                        checked={useCustomLoader}
                        onChange={(e) => setUseCustomLoader(e.target.checked)}
                        className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                    />
                </div>

                {useCustomLoader && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="loader_text" className="text-sm text-strong font-semibold">
                                Texto del loader
                            </Label>
                            <Input
                                id="loader_text"
                                name="loader_text"
                                value={loaderText}
                                onChange={(e) => setLoaderText(e.target.value.toUpperCase())}
                                maxLength={10}
                                placeholder="EVA"
                                className="h-10 bg-surface-sunken border-default text-strong rounded-xl focus:border-primary uppercase"
                            />
                            <p className="text-xs text-muted">
                                Máximo 10 caracteres. Se transforma automáticamente a mayúsculas.
                            </p>
                            {state.fieldErrors?.loader_text && (
                                <p className="text-xs text-destructive">{state.fieldErrors.loader_text[0]}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm text-strong font-semibold">Ícono del loader</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'eva', label: 'Logo EVA', desc: 'Ícono animado de EVA' },
                                    { value: 'coach', label: 'Mi logo', desc: coach.logo_url ? 'Tu logo de marca' : 'Sube un logo primero' },
                                    { value: 'none', label: 'Sin ícono', desc: 'Solo el texto' },
                                ] as const).map(({ value, label, desc }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        disabled={value === 'coach' && !coach.logo_url}
                                        onClick={() => setLoaderIconMode(value)}
                                        className={cn(
                                            'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center',
                                            loaderIconMode === value
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/40',
                                            value === 'coach' && !coach.logo_url && 'opacity-40 cursor-not-allowed'
                                        )}
                                    >
                                        <span className="text-xs font-bold">{label}</span>
                                        <span className="text-[10px] text-muted leading-tight">{desc}</span>
                                    </button>
                                ))}
                            </div>
                            <input type="hidden" name="loader_icon_mode" value={loaderIconMode} />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm text-strong font-semibold">Estilo del texto</Label>
                            {(() => {
                                const p = generateBrandPalette(selectedColor ?? '#007AFF')
                                const brandGradient = `linear-gradient(90deg, ${p.primaryLight}, ${p.primary}, ${p.primaryDark}, ${p.primaryLight})`
                                return (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLoaderTextColor('')}
                                            className={cn(
                                                'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                                                loaderTextColor === ''
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:border-primary/40'
                                            )}
                                        >
                                            <span
                                                className="text-xl font-extrabold bg-clip-text text-transparent"
                                                style={{ backgroundImage: brandGradient }}
                                            >
                                                {(loaderText || 'EVA').toUpperCase()}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Gradiente animado</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLoaderTextColor(loaderTextColor || selectedColor || '#007AFF')}
                                            className={cn(
                                                'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                                                loaderTextColor !== ''
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:border-primary/40'
                                            )}
                                        >
                                            <span
                                                className="text-xl font-extrabold"
                                                style={{ color: loaderTextColor || selectedColor || '#007AFF' }}
                                            >
                                                {(loaderText || 'EVA').toUpperCase()}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Color sólido</span>
                                        </button>
                                    </div>
                                )
                            })()}

                            {loaderTextColor !== '' && (
                                <div className="flex items-center gap-3 pt-2">
                                    <input
                                        type="color"
                                        value={loaderTextColor || selectedColor || '#007AFF'}
                                        onChange={(e) => setLoaderTextColor(e.target.value)}
                                        className="w-9 h-9 rounded-xl cursor-pointer border-2 border-border bg-transparent"
                                    />
                                    <Input
                                        id="loader_text_color"
                                        value={loaderTextColor}
                                        onChange={(e) => setLoaderTextColor(e.target.value)}
                                        placeholder="#007AFF"
                                        className="h-10 bg-surface-sunken border-default text-strong rounded-xl focus:border-primary flex-1"
                                    />
                                </div>
                            )}
                            <input type="hidden" name="loader_text_color" value={loaderTextColor} />
                            <p className="text-[10px] text-muted">
                                Gradiente: el mismo estilo animado que usa EVA. Color sólido: tu color de marca con animación de pulso.
                            </p>
                        </div>
                    </div>
                )}
            </div>

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

                {/* Right column: Live preview (sticky, solo lg — en <lg la instancia vive arriba tras el Brand Score) */}
                <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start space-y-6" data-tour-id="brand-preview">
                    <BrandThemePreview
                        brandName={coach.brand_name}
                        primaryColor={selectedColor}
                        logoUrl={coach.logo_url}
                        welcomeMessage={welcomeMessageInput}
                        loaderText={loaderText}
                        useCustomLoader={useCustomLoader}
                        loaderTextColor={loaderTextColor}
                        loaderIconMode={loaderIconMode}
                        fontFamily={previewFontFamily}
                        loaderVariant={loaderVariant}
                    />
                </div>
            </div>

            {/* Hidden inputs always rendered */}
            <input type="hidden" name="welcome_modal_type" value={welcomeModalType} />
            <input type="hidden" name="welcome_modal_content" value={welcomeModalContent} />

            {/* Spacer to prevent FAB from covering last content */}
            <div className="h-20 md:h-8" />

            {/* FAB Save Button */}
            <div className="fixed bottom-[calc(var(--mobile-content-bottom-offset,0px)+1.5rem)] right-4 z-50 md:bottom-6 md:right-8" data-tour-id="brand-save">
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
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-card text-muted hover:text-strong hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 shadow-lg"
                        >
                            <Maximize2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Expandir vista</span>
                        </button>
                        <SaveButton />
                    </div>
                </div>
            </div>

            {/* Vista previa expandida — el MISMO preview fiel (refleja lo que editás), a pantalla completa */}
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
                            logoUrl={coach.logo_url}
                            welcomeMessage={welcomeMessageInput}
                            loaderText={loaderText}
                            useCustomLoader={useCustomLoader}
                            loaderTextColor={loaderTextColor}
                            loaderIconMode={loaderIconMode}
                            fontFamily={previewFontFamily}
                            loaderVariant={loaderVariant}
                        />
                    </div>
                </div>
            )}
        </form>
    )
}
