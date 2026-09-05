'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, ImagePlus, Loader2, Palette, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { THEME_PRESETS } from '@eva/brand-kit'
import { EVA_BADGE_LABEL } from '@eva/tiers'
import { cn } from '@/lib/utils'
import { compressLogo, putToSignedUrl } from '@/lib/uploads/logo-upload.client'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
import {
    createLogoUploadUrlAction,
    updateBrandSettingsAction,
} from '../../settings/_actions/settings.actions'
import { BRAND_CHECKBOX_KEEP } from '../../settings/_lib/brand-form-values'
import type { CoachBrandDraft } from '../_data/dashboard.queries'

/**
 * «Tu marca en 60 segundos» — paso 1 de la guía v2, INLINE en el dashboard (SPEC §3).
 *
 * Por qué acá y no en una página: tocar la marca es la señal de activación más fuerte que tienen
 * los datos (50 % de activados vs 8 %) y es lo que menos gente alcanzaba, porque el paso 1 del
 * checklist viejo mandaba al Free a un paywall. Acá se resuelve sin salir del panel: nombre, color,
 * logo y una vista previa en vivo del login de su alumno.
 *
 * Guarda con la MISMA acción de Mi Marca (`updateBrandSettingsAction`), que persiste el formulario
 * completo. Por eso el server manda el estado actual (`CoachBrandDraft`) y acá se reenvía intacto
 * todo lo que el coach no tocó: postear tres campos sueltos borraría el resto.
 *
 * El logo va DIRECTO a Storage con una URL firmada (el POST multipart lo mata el WAF de
 * Cloudflare, incidente 2026-07-05) y el action materializa la URL pública desde el path.
 */

/** Verde sembrado por los caminos de alta. No es una marca elegida: es el drift. */
const SEEDED_GREEN = '#10b981'

/** Paleta corta del arranque: azul EVA + 5 presets curados con hues bien separados. */
const QUICK_PRESET_KEYS = ['ember', 'violet', 'aqua', 'amber-gold', 'mono-ink'] as const

type Swatch = { id: string; label: string; color: string; presetKey: string }

const SWATCHES: Swatch[] = [
    { id: 'eva', label: 'Azul EVA', color: BRAND_PRIMARY_COLOR, presetKey: '' },
    ...QUICK_PRESET_KEYS.flatMap((key) => {
        const preset = THEME_PRESETS.find((p) => p.key === key)
        return preset
            ? [{ id: preset.key, label: preset.label, color: preset.brandColor, presetKey: preset.key }]
            : []
    }),
]

const MAX_LOGO_RAW = 15 * 1024 * 1024

export function BrandQuickCard({
    brand,
    showsEvaBadge,
    onSaved,
}: {
    brand: CoachBrandDraft
    /** Free lleva el sello «Hecho con EVA» en las superficies del alumno (pricing v3). */
    showsEvaBadge: boolean
    /** Tilda el paso 1 de la guía sin esperar al refresh del servidor. */
    onSaved: () => void
}) {
    const router = useRouter()
    const fileRef = useRef<HTMLInputElement>(null)

    const seededGreen = brand.primaryColor.trim().toLowerCase() === SEEDED_GREEN
    // Verde sembrado ⇒ el azul EVA queda PRESELECCIONADO visualmente, pero no se guarda hasta que
    // el coach confirma. Sin esto, el coach nuevo estrena una marca que nunca eligió.
    const [color, setColor] = useState(seededGreen ? BRAND_PRIMARY_COLOR : brand.primaryColor)
    const [presetKey, setPresetKey] = useState(brand.themePresetKey)
    const [brandName, setBrandName] = useState(brand.brandName)
    const [stagedLogo, setStagedLogo] = useState<File | null>(null)
    const [stagedPreview, setStagedPreview] = useState<string | null>(null)
    const [optimizing, setOptimizing] = useState(false)
    const [saving, setSaving] = useState(false)

    const logoPreview = stagedPreview ?? brand.logoUrl
    const initials = (brandName.trim() || 'EVA').slice(0, 2).toUpperCase()

    async function pickLogo(file: File) {
        if (file.size > MAX_LOGO_RAW) {
            toast.error('El logo no puede superar 15 MB.')
            return
        }
        setOptimizing(true)
        try {
            const compressed = await compressLogo(file)
            setStagedLogo(compressed)
            setStagedPreview(URL.createObjectURL(compressed))
        } catch {
            toast.error('No pudimos leer esa imagen. Prueba con un PNG o JPG.')
        } finally {
            setOptimizing(false)
        }
    }

    function clearLogo() {
        setStagedLogo(null)
        setStagedPreview(null)
        if (fileRef.current) fileRef.current.value = ''
    }

    async function save() {
        if (saving || optimizing) return
        if (brandName.trim().length < 2) {
            toast.error('Escribe el nombre de tu marca (mínimo 2 caracteres).')
            return
        }
        setSaving(true)
        try {
            let logoPath: string | null = null
            if (stagedLogo) {
                const ticket = await createLogoUploadUrlAction({
                    variant: 'light',
                    contentType: stagedLogo.type || 'image/png',
                    size: stagedLogo.size,
                })
                if (!ticket.success) {
                    toast.error(ticket.error)
                    return
                }
                const uploaded = await putToSignedUrl(ticket.signedUrl, stagedLogo)
                if (!uploaded) {
                    toast.error('No se pudo subir el logo. Revisa tu conexión e intenta de nuevo.')
                    return
                }
                logoPath = ticket.path
            }

            const fd = new FormData()
            // Estado ACTUAL del coach: `updateBrandSettingsAction` escribe el formulario completo.
            fd.set('full_name', brand.fullName)
            fd.set('instagram_handle', brand.instagramHandle)
            fd.set('welcome_message', brand.welcomeMessage)
            fd.set('loader_text', brand.loaderText)
            fd.set('loader_icon_mode', brand.loaderIconMode)
            fd.set('brand_font_key', brand.brandFontKey)
            fd.set('loader_variant', brand.loaderVariant)
            fd.set('welcome_modal_content', brand.welcomeModalContent)
            fd.set('welcome_modal_type', brand.welcomeModalType)
            fd.set('executor_theme', brand.executorTheme)
            fd.set('login_layout_key', brand.loginLayoutKey)
            fd.set('loader_config', brand.loaderConfig)
            // Los checkbox del form de Mi Marca viajan como 'on'/ausente.
            // W3.4 — EXCEPCIÓN: «usar mi marca también en mi panel» viaja como KEEP, no como el
            // estado actual. Esta tarjeta no tiene ese checkbox, así que reenviarlo la convertía en
            // un escritor silencioso: el coach en `false` reescribía `false` cada vez que guardaba
            // su marca desde la guía, y se llevaba puesto el `true` con el que nacen los coaches
            // nuevos (W3.3) y el backfill de W3.5. Ausencia = `false` explícito en el action; el
            // único que puede apagar el toggle es su checkbox de Opciones › Mi Marca.
            fd.set('use_brand_colors_coach', BRAND_CHECKBOX_KEEP)
            if (brand.useCustomLoader) fd.set('use_custom_loader', 'on')
            if (brand.neutralTint) fd.set('neutral_tint', 'on')
            if (brand.welcomeModalEnabled) fd.set('welcome_modal_enabled', 'on')
            // Lo que el coach acaba de elegir.
            fd.set('brand_name', brandName.trim())
            fd.set('primary_color', color)
            fd.set('theme_preset_key', presetKey)
            if (logoPath) fd.set('logo_light_path', logoPath)

            const result = await updateBrandSettingsAction({}, fd)
            if (result.fieldErrors) {
                toast.error('Revisa los datos de tu marca.')
                return
            }
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success('Tu marca quedó lista', { id: 'brand-quick-saved' })
            clearLogo()
            onSaved()
            router.refresh()
        } catch {
            toast.error('No se pudo guardar. Intenta de nuevo.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <section
            aria-label="Tu marca en 60 segundos"
            className="rounded-card border border-subtle bg-surface-card p-4"
        >
            <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-[var(--text-strong)]">
                    <Palette className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-extrabold text-[var(--text-strong)]">
                        Tu marca en 60 segundos
                    </h3>
                    <p className="truncate text-[12.5px] text-[var(--text-muted)]">
                        Es lo primero que ve tu alumno al entrar.
                    </p>
                </div>
            </div>

            <div className="mt-3.5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex min-w-0 flex-col gap-3.5">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--text-muted)]">Nombre de tu marca</span>
                        <input
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            maxLength={100}
                            placeholder="Tu nombre o el de tu estudio"
                            className="h-11 w-full rounded-control border border-subtle bg-surface-sunken px-3 text-[14px] font-semibold text-[var(--text-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        />
                    </label>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--text-muted)]">Tu color</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {SWATCHES.map((s) => {
                                const active =
                                    color.toLowerCase() === s.color.toLowerCase() && presetKey === s.presetKey
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        aria-label={s.label}
                                        aria-pressed={active}
                                        onClick={() => {
                                            setColor(s.color)
                                            setPresetKey(s.presetKey)
                                        }}
                                        className={cn(
                                            'flex size-11 touch-manipulation items-center justify-center rounded-full border-2 transition-transform',
                                            active
                                                ? 'border-[var(--text-strong)] scale-105'
                                                : 'border-transparent hover:scale-105'
                                        )}
                                    >
                                        <span
                                            className="flex size-8 items-center justify-center rounded-full text-white"
                                            style={{ background: s.color }}
                                        >
                                            {active && <Check className="size-4" />}
                                        </span>
                                    </button>
                                )
                            })}
                            {/* Sin «otro color»: decisión del owner 22-08 — en la guía solo presets curados,
                                nada de editores HEX. El picker completo sigue en Opciones › Mi Marca. */}
                        </div>
                        {seededGreen && (
                            <p className="text-[11.5px] text-[var(--text-muted)]">
                                Te dejamos el azul EVA preseleccionado. Elige el tuyo y guarda.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--text-muted)]">Tu logo</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={optimizing}
                                className="inline-flex h-11 touch-manipulation items-center gap-2 rounded-control border border-subtle px-3 text-[12.5px] font-bold text-[var(--text-strong)] hover:bg-surface-sunken disabled:opacity-60"
                            >
                                {optimizing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                                {stagedLogo ? 'Cambiar logo' : 'Subir logo'}
                            </button>
                            {stagedLogo && (
                                <button
                                    type="button"
                                    onClick={clearLogo}
                                    aria-label="Quitar el logo elegido"
                                    className="flex size-11 touch-manipulation items-center justify-center rounded-control text-[var(--text-muted)] hover:bg-surface-sunken"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            )}
                            <span className="text-[11.5px] text-[var(--text-muted)]">PNG o JPG, hasta 15 MB</span>
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void pickLogo(f)
                            }}
                        />
                    </div>
                </div>

                {/* Vista previa del login del alumno: el «wow» del white-label, en vivo. */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-[var(--text-muted)]">Así lo ve tu alumno</span>
                    <div className="overflow-hidden rounded-card border border-subtle bg-surface-sunken">
                        <div className="flex flex-col items-center gap-2 px-4 pb-3 pt-5">
                            {logoPreview ? (
                                <Image
                                    src={logoPreview}
                                    alt=""
                                    width={44}
                                    height={44}
                                    unoptimized
                                    className="size-11 rounded-full bg-white object-contain"
                                />
                            ) : (
                                <span
                                    className="flex size-11 items-center justify-center rounded-full text-[13px] font-black text-white"
                                    style={{ background: color }}
                                >
                                    {initials}
                                </span>
                            )}
                            <span className="max-w-full truncate text-[13px] font-extrabold text-[var(--text-strong)]">
                                {brandName.trim() || 'Tu marca'}
                            </span>
                            <div className="h-7 w-full rounded-control border border-subtle bg-surface-card" />
                            <div className="h-7 w-full rounded-control border border-subtle bg-surface-card" />
                            <div
                                className="flex h-8 w-full items-center justify-center rounded-control text-[12px] font-bold text-white"
                                style={{ background: color }}
                            >
                                Entrar
                            </div>
                        </div>
                        {showsEvaBadge && (
                            <div className="border-t border-subtle py-1.5 text-center text-[10.5px] font-medium text-[var(--text-muted)]">
                                {EVA_BADGE_LABEL}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={() => void save()}
                disabled={saving || optimizing}
                className="mt-4 inline-flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-control bg-sport-500 px-4 text-[14px] font-bold text-[var(--text-on-sport)] transition-colors hover:bg-sport-600 disabled:opacity-60 md:w-auto"
            >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Guardar mi marca
            </button>
        </section>
    )
}
