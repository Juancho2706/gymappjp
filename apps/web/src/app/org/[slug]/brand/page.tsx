import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle2, Palette } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { orgRoleCan } from '@/domain/org/permissions'
import { BrandStudio } from './_components/BrandStudio'

export const metadata: Metadata = { title: 'Marca' }

interface Props {
    params: Promise<{ slug: string }>
}

function getReadableColor(color: string | null) {
    return color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#F59E0B'
}

function hexToRgb(color: string) {
    const hex = color.replace('#', '')
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
}

function luminance(color: string) {
    const { r, g, b } = hexToRgb(color)
    const channels = [r, g, b].map((value) => {
        const n = value / 255
        return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
    })
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrastRatio(fg: string, bg: string) {
    const light = Math.max(luminance(fg), luminance(bg))
    const dark = Math.min(luminance(fg), luminance(bg))
    return Number(((light + 0.05) / (dark + 0.05)).toFixed(2))
}

export default async function OrgBrandPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')
    if (!orgRoleCan(org.myRole, 'org.brand.view')) redirect(`/org/${slug}`)

    const canEdit = orgRoleCan(org.myRole, 'org.brand.edit')
    const canPublish = orgRoleCan(org.myRole, 'org.brand.publish')
    const draft = org.brand_draft
    const hasDraft = Boolean(draft && Object.keys(draft).length > 0)

    // Effective (draft over live) values for the editor + readiness checks.
    const primaryColor = getReadableColor(draft?.primary_color ?? org.primary_color)
    const name = draft?.name ?? org.name
    const logoUrl = (draft && 'logo_url' in draft ? draft.logo_url : org.logo_url) ?? null
    const contrastOnDark = contrastRatio(primaryColor, '#18181B')
    const contrastOnWhite = contrastRatio(primaryColor, '#FFFFFF')

    const checks = [
        { label: 'Logo cargado', ok: Boolean(logoUrl), hint: logoUrl ? 'Listo' : 'Sube tu logo' },
        { label: 'Nombre de marca', ok: name.trim().length >= 3, hint: name.trim().length >= 3 ? 'Listo' : 'Mínimo 3 letras' },
        { label: 'Color legible en oscuro', ok: contrastOnDark >= 3, hint: contrastOnDark >= 3 ? 'Buen contraste' : 'Elige un color más claro' },
        { label: 'Color legible en claro', ok: contrastOnWhite >= 2.2, hint: contrastOnWhite >= 2.2 ? 'Buen contraste' : 'Elige un color más oscuro' },
    ]

    const initialIconMode = ((draft?.loader_icon_mode ?? org.loader_icon_mode) === 'text' ? 'text' : 'logo') as 'logo' | 'text'

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                {/* Hero */}
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0"
                        style={{ background: `radial-gradient(circle at 18% 0%, ${primaryColor}26, transparent 36%)` }} />
                    <div className="relative flex flex-col gap-2">
                        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                            <Palette className="h-3.5 w-3.5" aria-hidden="true" />Marca
                        </span>
                        <h1 className="text-xl font-black tracking-tight text-white sm:text-3xl md:text-4xl">Personaliza tu marca</h1>
                        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                            Define el logo, color y pantalla de carga que verán tus coaches y tus alumnos. Guarda los cambios y publícalos cuando estés listo.
                        </p>
                    </div>
                </section>

                {/* Readiness checklist */}
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {checks.map((c) => (
                        <div key={c.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{c.label}</p>
                                {c.ok
                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    : <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />}
                            </div>
                            <p className="mt-2 text-sm font-bold text-zinc-200">{c.hint}</p>
                        </div>
                    ))}
                </section>

                <BrandStudio
                    orgSlug={slug}
                    canEdit={canEdit}
                    canPublish={canPublish}
                    publishedAt={org.brand_published_at}
                    hasDraft={hasDraft}
                    initial={{
                        name,
                        primaryColor,
                        logoUrl,
                        logoUrlDark: (draft && 'logo_url_dark' in draft ? draft.logo_url_dark : org.logo_url_dark) ?? null,
                        loaderText: (draft?.loader_text ?? org.loader_text) ?? '',
                        useCustomLoader: (draft?.use_custom_loader ?? org.use_custom_loader) ?? false,
                        loaderIconMode: initialIconMode,
                        loaderTextColor: (draft?.loader_text_color ?? org.loader_text_color) ?? null,
                        accentLight: (draft?.accent_light ?? org.accent_light) ?? null,
                        accentDark: (draft?.accent_dark ?? org.accent_dark) ?? null,
                        neutralTint: (draft?.neutral_tint ?? org.neutral_tint) ?? false,
                    }}
                />
            </div>
        </div>
    )
}
