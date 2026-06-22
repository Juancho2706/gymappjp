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
import { BrandAdvancedSection } from './BrandAdvancedSection'
import type { SubscriptionTier } from '@eva/tiers'

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
                'flex items-center gap-2 rounded-xl transition-all duration-200 text-white shadow-lg',
                'px-3 py-2.5 sm:px-5 text-sm font-bold',
                'disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-0.5'
            )}
            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
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
    // Vista previa a pantalla completa (mismo componente fiel que el sticky — refleja lo que editás).
    const [previewExpanded, setPreviewExpanded] = useState(false)

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
            welcomeMessageInput !== (coach.welcome_message ?? '')
        )
    }, [selectedColor, useCoachColors, useCustomLoader, loaderText, loaderTextColor, loaderIconMode, welcomeModalEnabled, welcomeModalContent, welcomeModalType, welcomeMessageInput, coach])

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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold">Marca completada</span>
                    <span className="font-black tabular-nums" style={{ color: brandScore >= 80 ? '#10b981' : brandScore >= 50 ? '#f59e0b' : undefined }}>{brandScore}%</span>
                </div>
                <div className="flex-1 max-w-[200px] h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${brandScore}%`,
                            backgroundColor: brandScore >= 80 ? '#10b981' : brandScore >= 50 ? '#f59e0b' : 'var(--theme-primary)',
                        }}
                    />
                </div>
                {isDirty && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                        Sin guardar
                    </span>
                )}
            </div>

            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8">
                <div className="space-y-8">
            {/* Identity */}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-identity">
                <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-foreground">Identidad de tu marca</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-3">
                    Esta información es lo primero que ven tus alumnos al abrir tu app.
                </p>

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
                        <p className="text-[10px] text-muted-foreground">Nombre privado para facturación y soporte.</p>
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
                        <p className="text-[10px] text-muted-foreground">
                            Nombre que ven tus alumnos en la app instalada, la pestaña del navegador y el título.
                        </p>
                        {state.fieldErrors?.brand_name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.brand_name[0]}</p>
                        )}
                    </div>
                </div>

                {coach.slug && (
                    <div className="space-y-1.5">
                        <Label className="text-sm text-foreground font-semibold">
                            URL legacy (alias)
                        </Label>
                        <div className="flex items-center gap-0">
                            <div className="h-10 px-3 flex items-center bg-muted border border-r-0 border-border rounded-l-xl text-sm text-muted-foreground whitespace-nowrap">
                                /c/
                            </div>
                            <div className="h-10 px-3 flex items-center flex-1 bg-secondary border border-border rounded-r-xl text-sm text-foreground">
                                {coach.slug}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{legacyStudentUrl}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Alias web antiguo (no editable). Los links nuevos usan tu código corto; este slug sigue funcionando para tus alumnos actuales.
                        </p>
                    </div>
                )}

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                        <Label htmlFor="welcome_message" className="text-sm text-foreground font-semibold">
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
                        className="bg-secondary border-border text-foreground rounded-xl focus:border-primary resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Aparece debajo de tu logo en la pantalla de login de tus alumnos. Máximo 240 caracteres.
                    </p>
                    {state.fieldErrors?.welcome_message && (
                        <p className="text-xs text-destructive">{state.fieldErrors.welcome_message[0]}</p>
                    )}
                </div>

                {/* Welcome Modal */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-4" data-tour-id="brand-welcome-modal">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Play className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground">Mensaje de bienvenida al dashboard</h3>
                        </div>
                        <input
                            type="checkbox"
                            name="welcome_modal_enabled"
                            checked={welcomeModalEnabled}
                            onChange={(e) => setWelcomeModalEnabled(e.target.checked)}
                            className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
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
                                            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
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
                                            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Play className="w-3.5 h-3.5" />
                                    Video
                                </button>
                            </div>

                            {welcomeModalType === 'text' ? (
                                <div className="space-y-1.5">
                                    <Label htmlFor="welcome_modal_content" className="text-sm text-foreground font-semibold">
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
                                        className="bg-secondary border-border text-foreground rounded-xl focus:border-primary resize-none"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Máximo 1000 caracteres. Tus alumnos verán este mensaje en un modal al entrar a su dashboard.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <Label htmlFor="welcome_modal_content" className="text-sm text-foreground font-semibold">
                                        URL del video
                                    </Label>
                                    <Input
                                        id="welcome_modal_content"
                                        name="welcome_modal_content"
                                        value={welcomeModalContent}
                                        onChange={(e) => setWelcomeModalContent(e.target.value)}
                                        placeholder="https://youtube.com/watch?v=... o https://vimeo.com/..."
                                        className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
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
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-color">
                <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-foreground">Color de marca</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-3">
                    Este color se aplica a botones, elementos activos, gráficos y brillos de tu app. Generamos automáticamente variantes más claras y oscuras.
                </p>

                <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setSelectedColor(color)}
                            className={cn(
                                'w-10 h-10 rounded-xl border-2 transition-all duration-150 hover:scale-110',
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
                            value={selectedColor ?? '#007AFF'}
                            onChange={(e) => setSelectedColor(e.target.value)}
                            className="w-10 h-10 rounded-xl cursor-pointer border-2 border-border bg-transparent"
                            title="Color personalizado"
                        />
                        <span className="text-xs text-muted-foreground font-mono">{selectedColor}</span>
                    </div>
                </div>

                {/* Contrast badge + reset */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div
                        className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border',
                            contrast.level === 'AA' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
                            contrast.level === 'AA-large' && 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
                            contrast.level === 'fail' && 'bg-destructive/10 border-destructive/30 text-destructive',
                        )}
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
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar por defecto
                        </button>
                    )}
                </div>

                <input type="hidden" name="primary_color" value={selectedColor} />

                {/* Generated palette */}
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Paleta generada automáticamente</p>
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
                                <span className="text-[9px] text-muted-foreground">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-border p-4 bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-3">Vista previa del botón principal</p>
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
                            <p className="text-xs text-muted-foreground">Si se activa, tu panel de coach usa tu color, loader y estilos de marca. Si no, usa los valores del sistema.</p>
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
                defaults={{
                    secondaryColor: coach.brand_secondary_color ?? '',
                    accentLight: coach.accent_light ?? '',
                    accentDark: coach.accent_dark ?? '',
                    neutralTint: coach.neutral_tint ?? false,
                    fontKey: coach.brand_font_key ?? '',
                    loaderVariant: coach.loader_variant ?? 'eva',
                }}
            />

            {/* Loader customization */}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-loader">
                <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-foreground">Loader animado</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-3">
                    Animación que aparece cuando tus alumnos cargan la app o navegan entre páginas.
                </p>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Usar texto personalizado</Label>
                        <p className="text-xs text-muted-foreground">Muestra tu marca en vez de &quot;EVA&quot; en la animación de carga.</p>
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
                            <Label htmlFor="loader_text" className="text-sm text-foreground font-semibold">
                                Texto del loader
                            </Label>
                            <Input
                                id="loader_text"
                                name="loader_text"
                                value={loaderText}
                                onChange={(e) => setLoaderText(e.target.value.toUpperCase())}
                                maxLength={10}
                                placeholder="EVA"
                                className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary uppercase"
                            />
                            <p className="text-xs text-muted-foreground">
                                Máximo 10 caracteres. Se transforma automáticamente a mayúsculas.
                            </p>
                            {state.fieldErrors?.loader_text && (
                                <p className="text-xs text-destructive">{state.fieldErrors.loader_text[0]}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm text-foreground font-semibold">Ícono del loader</Label>
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
                                        <span className="text-[10px] text-muted-foreground leading-tight">{desc}</span>
                                    </button>
                                ))}
                            </div>
                            <input type="hidden" name="loader_icon_mode" value={loaderIconMode} />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm text-foreground font-semibold">Estilo del texto</Label>
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
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gradiente animado</span>
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
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color sólido</span>
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
                                        className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary flex-1"
                                    />
                                </div>
                            )}
                            <input type="hidden" name="loader_text_color" value={loaderTextColor} />
                            <p className="text-[10px] text-muted-foreground">
                                Gradiente: el mismo estilo animado que usa EVA. Color sólido: tu color de marca con animación de pulso.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Share with students */}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm" data-tour-id="brand-share">
                <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-bold text-foreground">Compartir con alumnos</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-3">
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
                                    className="h-10 bg-secondary border-border text-foreground rounded-xl text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className={cn(
                                        'h-10 px-3 rounded-xl border text-sm font-bold transition-all shrink-0',
                                        copied
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                                            : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
                                    )}
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Comparte este link por WhatsApp, Instagram o muestra el QR en tu gym. Si un alumno tiene un link antiguo con tu slug, también seguirá funcionando.
                        </p>
                    </div>
                </div>
            </div>

                </div>

                {/* Right column: Live preview (sticky on desktop) */}
                <div className="mt-8 lg:mt-0 lg:sticky lg:top-6 lg:self-start space-y-6" data-tour-id="brand-preview">
                    <BrandThemePreview
                        brandName={coach.brand_name}
                        primaryColor={selectedColor}
                        logoUrl={coach.logo_url}
                        welcomeMessage={welcomeMessageInput}
                        loaderText={loaderText}
                        useCustomLoader={useCustomLoader}
                        loaderTextColor={loaderTextColor}
                        loaderIconMode={loaderIconMode}
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
                        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive shadow-lg max-w-[260px]">
                            {state.error}
                        </div>
                    )}
                    {state.success && (
                        <div className="rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 shadow-lg max-w-[260px]">
                            ✓ Cambios guardados
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPreviewExpanded(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 shadow-lg"
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
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onClick={() => setPreviewExpanded(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Vista previa de tu marca"
                >
                    <div className="relative w-full max-w-sm max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewExpanded(false)}
                            className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground"
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
                        />
                    </div>
                </div>
            )}
        </form>
    )
}
