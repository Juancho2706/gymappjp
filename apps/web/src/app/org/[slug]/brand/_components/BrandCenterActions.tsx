'use client'

import Image from 'next/image'
import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Rocket, Save, Upload } from 'lucide-react'
import { publishEnterpriseBrandAction, updateOrgAction, uploadOrgLogoAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    defaultName: string
    defaultColor: string
    logoUrl: string | null
}

function SaveButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar draft
        </button>
    )
}

function PublishButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publicar a coaches
        </button>
    )
}

export function BrandCenterActions({ orgSlug, defaultName, defaultColor, logoUrl }: Props) {
    const logoInputRef = useRef<HTMLInputElement>(null)
    const [brandState, brandAction] = useActionState(
        async (_: unknown, formData: FormData) => updateOrgAction(orgSlug, formData),
        null
    )
    const [logoState, logoAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const [publishState, publishAction] = useActionState(
        async () => publishEnterpriseBrandAction(orgSlug),
        null
    )
    const currentLogoUrl = logoState?.logoUrl ?? logoUrl

    return (
        <div className="space-y-4">
            <form action={logoAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Logo</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    {currentLogoUrl ? (
                        <Image src={currentLogoUrl} alt="Logo organizacion" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-sm font-black text-zinc-500">
                            LOGO
                        </div>
                    )}
                    <input
                        ref={logoInputRef}
                        name="logo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                            if (event.target.files?.[0]) event.target.form?.requestSubmit()
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-900"
                    >
                        <Upload className="h-4 w-4" />
                        Subir logo
                    </button>
                    <span className="text-xs text-zinc-500">JPG, PNG, WebP, GIF. Max 2MB.</span>
                </div>
                {logoState?.error && <p className="mt-3 text-xs font-semibold text-red-300">{logoState.error}</p>}
                {logoState?.success && <p className="mt-3 text-xs font-semibold text-emerald-300">Logo guardado.</p>}
            </form>

            <form action={brandAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Draft de marca</p>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px]">
                    <label className="block">
                        <span className="text-xs font-semibold text-zinc-500">Nombre visible</span>
                        <input
                            name="name"
                            required
                            defaultValue={defaultName}
                            maxLength={80}
                            className="mt-2 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-amber-300"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-zinc-500">Color</span>
                        <input
                            name="primary_color"
                            type="color"
                            defaultValue={defaultColor}
                            className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1"
                        />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        {brandState?.error && <p className="text-xs font-semibold text-red-300">{brandState.error}</p>}
                        {brandState?.success && <p className="text-xs font-semibold text-emerald-300">Draft guardado.</p>}
                    </div>
                    <SaveButton />
                </div>
            </form>

            <form action={publishAction} className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                <p className="text-sm font-black text-white">Publicar marca enterprise</p>
                <p className="mt-2 text-xs leading-5 text-emerald-100/80">
                    Aplica nombre, color, logo y loader a coaches activos creados/vinculados por esta empresa. No toca alumnos directamente: ellos heredan desde su coach.
                </p>
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
