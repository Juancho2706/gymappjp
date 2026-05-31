'use client'

import Image from 'next/image'
import { useActionState, useRef, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, Loader2, Rocket, Save, Trash2, Upload } from 'lucide-react'
import {
    discardBrandDraftAction,
    publishEnterpriseBrandAction,
    saveBrandDraftAction,
    uploadOrgLogoAction,
} from '../../_actions/org.actions'
import type { BrandDraft } from '@/infrastructure/db/org.repository'

interface Props {
    orgSlug: string
    defaultName: string
    defaultColor: string
    logoUrl: string | null
    draft: BrandDraft | null
    publishedAt: string | null
}

function SaveButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-400 px-3 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar borrador
        </button>
    )
}

function PublishButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publicar a coaches
        </button>
    )
}

export function BrandCenterActions({ orgSlug, defaultName, defaultColor, logoUrl, draft, publishedAt }: Props) {
    const logoInputRef = useRef<HTMLInputElement>(null)
    const [discardPending, startDiscard] = useTransition()

    const [logoState, logoAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const [draftState, draftAction] = useActionState(
        async (_: unknown, formData: FormData) => {
            const name = formData.get('name') as string
            const primary_color = formData.get('primary_color') as string
            return saveBrandDraftAction(orgSlug, { name, primary_color })
        },
        null
    )
    const [publishState, publishAction] = useActionState(
        async () => publishEnterpriseBrandAction(orgSlug),
        null
    )

    const currentLogoUrl = logoState?.logoUrl ?? draft?.logo_url ?? logoUrl
    const hasDraft = !!draft

    function handleDiscard() {
        startDiscard(async () => { await discardBrandDraftAction(orgSlug) })
    }

    return (
        <div className="space-y-4">
            {/* Draft status banner */}
            {hasDraft && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />
                    <p className="flex-1 text-xs text-amber-200">
                        Hay un borrador sin publicar. Los coaches siguen viendo la versión anterior hasta que publiques.
                    </p>
                    <button
                        onClick={handleDiscard}
                        disabled={discardPending}
                        className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 transition-colors disabled:opacity-50"
                    >
                        {discardPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Descartar
                    </button>
                </div>
            )}

            {/* Logo upload */}
            <form action={logoAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Logo</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    {currentLogoUrl ? (
                        <Image src={currentLogoUrl} alt="Logo organizacion" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-sm font-black text-zinc-500">LOGO</div>
                    )}
                    <input ref={logoInputRef} name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) e.target.form?.requestSubmit() }} />
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-900">
                        <Upload className="h-4 w-4" />Subir logo
                    </button>
                    <span className="text-xs text-zinc-500">JPG, PNG, WebP, GIF. Max 2MB.</span>
                </div>
                {logoState?.error && <p className="mt-3 text-xs font-semibold text-red-300">{logoState.error}</p>}
                {logoState?.success && <p className="mt-3 text-xs font-semibold text-emerald-300">Logo guardado en borrador.</p>}
            </form>

            {/* Name + color draft form */}
            <form action={draftAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Borrador de marca</p>
                    {hasDraft && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">BORRADOR</span>}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px]">
                    <label className="block">
                        <span className="text-xs font-semibold text-zinc-500">Nombre visible</span>
                        <input name="name" required maxLength={80}
                            defaultValue={draft?.name ?? defaultName}
                            className="mt-2 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-amber-300" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-zinc-500">Color</span>
                        <input name="primary_color" type="color"
                            defaultValue={draft?.primary_color ?? defaultColor}
                            className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1" />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        {draftState?.error && <p className="text-xs font-semibold text-red-300">{draftState.error}</p>}
                        {draftState?.success && <p className="text-xs font-semibold text-emerald-300">Borrador guardado.</p>}
                    </div>
                    <SaveButton />
                </div>
            </form>

            {/* Publish */}
            <form action={publishAction} className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-sm font-black text-white">Publicar marca enterprise</p>
                        <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                            {hasDraft
                                ? 'Aplica el borrador actual a coaches activos. Irreversible hasta el próximo borrador.'
                                : 'Republica la configuración actual a coaches activos.'}
                        </p>
                    </div>
                    {publishedAt && (
                        <p className="shrink-0 text-[10px] text-emerald-300/60">
                            Última vez {new Date(publishedAt).toLocaleDateString('es-CL')}
                        </p>
                    )}
                </div>
                <div className="mt-4">
                    <PublishButton />
                </div>
                {publishState?.error && <p className="mt-3 text-xs font-semibold text-red-300">{publishState.error}</p>}
                {publishState?.success && (
                    <p className="mt-3 text-xs font-semibold text-emerald-200">
                        Marca publicada en {publishState.coachCount} coach{publishState.coachCount === 1 ? '' : 'es'}.
                    </p>
                )}
            </form>
        </div>
    )
}
