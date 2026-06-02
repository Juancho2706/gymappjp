'use client'

import Image from 'next/image'
import { useActionState, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, CheckCircle2, Eye, Loader2, Lock, Moon, Palette, Rocket, Save, Sliders, Sun, Trash2, Upload } from 'lucide-react'
import {
    discardBrandDraftAction,
    publishEnterpriseBrandAction,
    saveBrandDraftAction,
    uploadOrgLogoAction,
} from '../../_actions/org.actions'
import { resolveBrandTheme, contrastReport, type ThemeMode } from '@eva/brand-kit'
import { BrandLivePreview } from './BrandLivePreview'

export interface BrandStudioProps {
    orgSlug: string
    canEdit: boolean
    canPublish: boolean
    publishedAt: string | null
    hasDraft: boolean
    initial: {
        name: string
        primaryColor: string
        logoUrl: string | null
        logoUrlDark: string | null
        loaderText: string
        useCustomLoader: boolean
        loaderIconMode: 'logo' | 'text'
        loaderTextColor: string | null
        accentLight: string | null
        accentDark: string | null
        neutralTint: boolean
    }
}

function SaveButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button type="submit" disabled={pending || disabled}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-400 px-3 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
        </button>
    )
}

function PublishButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button type="submit" disabled={pending || disabled}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publicar a coaches y alumnos
        </button>
    )
}

export function BrandStudio({ orgSlug, canEdit, canPublish, publishedAt, hasDraft, initial }: BrandStudioProps) {
    const logoInputRef = useRef<HTMLInputElement>(null)
    const logoDarkInputRef = useRef<HTMLInputElement>(null)
    const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
    const [previewMode, setPreviewMode] = useState<ThemeMode>('light')
    const [discardPending, startDiscard] = useTransition()

    const [name, setName] = useState(initial.name)
    const [primaryColor, setPrimaryColor] = useState(initial.primaryColor)
    const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
    const [logoUrlDark, setLogoUrlDark] = useState(initial.logoUrlDark)
    const [useCustomLoader, setUseCustomLoader] = useState(initial.useCustomLoader)
    const [loaderText, setLoaderText] = useState(initial.loaderText)
    const [loaderIconMode, setLoaderIconMode] = useState<'logo' | 'text'>(initial.loaderIconMode)
    const [customTextColor, setCustomTextColor] = useState(Boolean(initial.loaderTextColor))
    const [loaderTextColor, setLoaderTextColor] = useState(initial.loaderTextColor ?? initial.primaryColor)
    const [neutralTint, setNeutralTint] = useState(initial.neutralTint)
    const [accentLightOn, setAccentLightOn] = useState(Boolean(initial.accentLight))
    const [accentLight, setAccentLight] = useState(initial.accentLight ?? initial.primaryColor)
    const [accentDarkOn, setAccentDarkOn] = useState(Boolean(initial.accentDark))
    const [accentDark, setAccentDark] = useState(initial.accentDark ?? initial.primaryColor)

    // Resolve theme + contrast guard live (brand-kit is pure → runs client-side).
    const theme = resolveBrandTheme({
        brandColor: primaryColor,
        accentLight: accentLightOn ? accentLight : null,
        accentDark: accentDarkOn ? accentDark : null,
        neutralTint,
    })
    const report = contrastReport(theme)
    const readable = report.passes
    const failing = report.items.filter((i) => !i.passes)

    const [logoState, logoAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const [logoDarkState, logoDarkAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const [draftState, draftAction] = useActionState(
        async () => saveBrandDraftAction(orgSlug, {
            name,
            primary_color: primaryColor,
            loader_text: loaderText || null,
            use_custom_loader: useCustomLoader,
            loader_icon_mode: loaderIconMode,
            loader_text_color: customTextColor ? loaderTextColor : null,
            splash_bg_color: primaryColor,
            accent_light: accentLightOn ? accentLight : null,
            accent_dark: accentDarkOn ? accentDark : null,
            neutral_tint: neutralTint,
        }),
        null
    )
    const [publishState, publishAction] = useActionState(async () => publishEnterpriseBrandAction(orgSlug), null)

    if (logoState?.logoUrl && logoState.logoUrl !== logoUrl) setLogoUrl(logoState.logoUrl)
    if (logoDarkState?.logoUrl && logoDarkState.logoUrl !== logoUrlDark) setLogoUrlDark(logoDarkState.logoUrl)

    function handleDiscard() {
        startDiscard(async () => { await discardBrandDraftAction(orgSlug) })
    }

    const disabled = !canEdit
    const inputCls = 'mt-2 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-amber-300 disabled:opacity-50'
    const colorCls = 'mt-2 h-10 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1 disabled:opacity-50'

    return (
        <div className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1 md:hidden">
                {([['edit', 'Editar', Sliders], ['preview', 'Vista previa', Eye]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setMobileView(id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors ${mobileView === id ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-500'}`}>
                        <Icon className="h-3.5 w-3.5" />{label}
                    </button>
                ))}
            </div>

            {!canEdit && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-2.5 text-xs text-zinc-400">
                    <Lock className="h-4 w-4 shrink-0 text-zinc-500" />Tu rol puede ver la marca pero no editarla.
                </div>
            )}
            {hasDraft && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                    <p className="flex-1 text-xs text-amber-200">Tienes cambios sin publicar. Tus coaches y alumnos siguen viendo la marca anterior hasta que publiques.</p>
                    {canEdit && (
                        <button onClick={handleDiscard} disabled={discardPending}
                            className="flex items-center gap-1.5 text-xs font-bold text-amber-300 transition-colors hover:text-amber-100 disabled:opacity-50">
                            {discardPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Descartar
                        </button>
                    )}
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                {/* Editor */}
                <div className={`space-y-4 ${mobileView === 'preview' ? 'hidden md:block' : ''}`}>
                    {/* Logos */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-black text-white">Identidad</h2></div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <form action={logoAction}>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Logo (fondo claro)</p>
                                <div className="mt-2 flex items-center gap-3">
                                    {logoUrl ? <Image src={logoUrl} alt="Logo" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-[10px] font-black text-zinc-500">LOGO</div>}
                                    <input ref={logoInputRef} name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { if (e.target.files?.[0]) e.target.form?.requestSubmit() }} />
                                    <button type="button" disabled={disabled} onClick={() => logoInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-bold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Subir</button>
                                </div>
                                {logoState?.error && <p className="mt-2 text-xs text-red-300">{logoState.error}</p>}
                            </form>
                            <form action={logoDarkAction}>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Logo (fondo oscuro)</p>
                                <div className="mt-2 flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-950 ring-1 ring-zinc-700">
                                        {logoUrlDark ? <Image src={logoUrlDark} alt="Logo oscuro" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" /> : <span className="text-[10px] font-black text-zinc-600">DARK</span>}
                                    </div>
                                    <input type="hidden" name="variant" value="dark" />
                                    <input ref={logoDarkInputRef} name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { if (e.target.files?.[0]) e.target.form?.requestSubmit() }} />
                                    <button type="button" disabled={disabled} onClick={() => logoDarkInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-bold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Subir</button>
                                </div>
                                <p className="mt-1 text-[10px] text-zinc-600">Opcional. Un logo oscuro desaparece en modo oscuro.</p>
                            </form>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_120px]">
                            <label className="block"><span className="text-xs font-semibold text-zinc-500">Nombre visible</span>
                                <input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} maxLength={80} className={inputCls} /></label>
                            <label className="block"><span className="text-xs font-semibold text-zinc-500">Color de marca</span>
                                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={disabled} className={colorCls} /></label>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                            <input type="checkbox" checked={neutralTint} disabled={disabled} onChange={(e) => setNeutralTint(e.target.checked)} className="h-4 w-4 rounded accent-amber-400" />
                            Teñir fondos con el color de marca (look premium)
                        </label>
                    </div>

                    {/* Per-mode accent */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
                        <h3 className="text-sm font-black text-white">Acento por modo</h3>
                        <p className="text-xs text-zinc-500">Por defecto se usa el color de marca. Puedes ajustar un acento distinto para claro y oscuro — el texto se calcula solo, nunca queda ilegible.</p>
                        {([['light', 'Modo claro', Sun, accentLightOn, setAccentLightOn, accentLight, setAccentLight], ['dark', 'Modo oscuro', Moon, accentDarkOn, setAccentDarkOn, accentDark, setAccentDark]] as const).map(([id, label, Icon, on, setOn, val, setVal]) => (
                            <div key={id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                                    <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 rounded accent-amber-400" />
                                    <Icon className="h-3.5 w-3.5" />{label}: acento personalizado
                                </label>
                                {on && <input type="color" value={val} onChange={(e) => setVal(e.target.value)} disabled={disabled} className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1 disabled:opacity-50" />}
                            </div>
                        ))}
                    </div>

                    {/* Loader */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-white">Pantalla de carga</h3>
                            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                <input type="checkbox" checked={useCustomLoader} disabled={disabled} onChange={(e) => setUseCustomLoader(e.target.checked)} className="h-4 w-4 rounded accent-amber-400" />Personalizar
                            </label>
                        </div>
                        {useCustomLoader && (
                            <div className="space-y-3">
                                <label className="block"><span className="text-xs font-semibold text-zinc-500">Texto (máx 14)</span>
                                    <input value={loaderText} onChange={(e) => setLoaderText(e.target.value.slice(0, 14))} disabled={disabled} maxLength={14} placeholder={name} className={inputCls} /></label>
                                <div><span className="text-xs font-semibold text-zinc-500">Ícono</span>
                                    <div className="mt-2 flex gap-2">
                                        {([['logo', 'Mostrar logo'], ['text', 'Solo texto']] as const).map(([mid, mlabel]) => (
                                            <button key={mid} type="button" disabled={disabled} onClick={() => setLoaderIconMode(mid)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${loaderIconMode === mid ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>{mlabel}</button>
                                        ))}
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                    <input type="checkbox" checked={customTextColor} disabled={disabled} onChange={(e) => setCustomTextColor(e.target.checked)} className="h-4 w-4 rounded accent-amber-400" />Color de texto personalizado
                                </label>
                                {customTextColor && <input type="color" value={loaderTextColor} onChange={(e) => setLoaderTextColor(e.target.value)} disabled={disabled} className="h-10 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1 disabled:opacity-50" />}
                            </div>
                        )}
                    </div>

                    {/* Save */}
                    <form action={draftAction} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                        <div className="text-xs">
                            {draftState?.error && <span className="font-semibold text-red-300">{draftState.error}</span>}
                            {draftState?.success && <span className="font-semibold text-emerald-300">Cambios guardados como borrador.</span>}
                            {!draftState && <span className="text-zinc-500">Guarda como borrador; nada cambia para tus coaches hasta publicar.</span>}
                        </div>
                        <SaveButton disabled={disabled} />
                    </form>

                    {/* Contrast guard */}
                    <div className={`rounded-2xl border p-4 ${readable ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-red-400/30 bg-red-400/10'}`}>
                        <div className="flex items-center gap-2">
                            {readable ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-red-300" />}
                            <p className="text-sm font-black text-white">{readable ? 'Contraste accesible (AA)' : 'Contraste insuficiente'}</p>
                        </div>
                        {!readable && (
                            <ul className="mt-2 space-y-1 text-xs text-red-200">
                                {failing.map((i, idx) => (<li key={idx}>· {i.label} ({i.mode === 'dark' ? 'oscuro' : 'claro'}): {i.ratio}:1, mínimo {i.min}:1</li>))}
                                <li className="mt-1 text-red-300/80">Ajusta el color de marca o el acento para poder publicar.</li>
                            </ul>
                        )}
                    </div>

                    {/* Publish */}
                    <form action={publishAction} className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-black text-white">Publicar marca</p>
                                <p className="mt-1 text-xs leading-5 text-emerald-100/80">{canPublish ? 'Aplica tu marca a los coaches y alumnos de tu organización.' : 'Solo el dueño o el encargado de marca pueden publicar.'}</p>
                            </div>
                            {publishedAt && <p className="shrink-0 text-[10px] text-emerald-300/60">Última vez {new Date(publishedAt).toLocaleDateString('es-CL')}</p>}
                        </div>
                        <div className="mt-4"><PublishButton disabled={!canPublish || !readable} /></div>
                        {publishState?.error && <p className="mt-3 text-xs font-semibold text-red-300">{publishState.error}</p>}
                        {publishState?.success && <p className="mt-3 text-xs font-semibold text-emerald-200">Marca publicada en {publishState.coachCount} coach{publishState.coachCount === 1 ? '' : 'es'}.</p>}
                    </form>
                </div>

                {/* Preview */}
                <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 ${mobileView === 'edit' ? 'hidden md:block' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-black text-white">Vista previa en vivo</h2></div>
                        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
                            {([['light', 'Claro', Sun], ['dark', 'Oscuro', Moon]] as const).map(([id, label, Icon]) => (
                                <button key={id} type="button" onClick={() => setPreviewMode(id)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${previewMode === id ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-500'}`}><Icon className="h-3 w-3" />{label}</button>
                            ))}
                        </div>
                    </div>
                    <p className="mt-1 mb-4 text-xs text-zinc-500">Así se verá para coaches y alumnos en modo {previewMode === 'dark' ? 'oscuro' : 'claro'}.</p>
                    <BrandLivePreview
                        theme={theme}
                        mode={previewMode}
                        brandName={name || 'Tu marca'}
                        logoUrl={logoUrl}
                        logoUrlDark={logoUrlDark}
                        loaderText={loaderText}
                        useCustomLoader={useCustomLoader}
                        loaderIconMode={loaderIconMode}
                        loaderTextColor={customTextColor ? loaderTextColor : null}
                    />
                </div>
            </div>
        </div>
    )
}
