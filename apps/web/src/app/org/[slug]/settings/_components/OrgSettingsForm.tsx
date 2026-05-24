'use client'

import Image from 'next/image'
import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Save, Upload } from 'lucide-react'
import { updateOrgAction, uploadOrgLogoAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    defaultName: string
    defaultColor: string
    currentLogoUrl?: string | null
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-300 disabled:opacity-50"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
        </button>
    )
}

export function OrgSettingsForm({ orgSlug, defaultName, defaultColor, currentLogoUrl }: Props) {
    const [state, action] = useActionState(
        async (_: unknown, formData: FormData) => updateOrgAction(orgSlug, formData),
        null
    )
    const [logoState, logoAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const logoInputRef = useRef<HTMLInputElement>(null)
    const logoUrl = logoState?.logoUrl ?? currentLogoUrl

    return (
        <div className="space-y-5">
            <form action={logoAction} className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Logo de la organizacion</label>
                <div className="flex flex-wrap items-center gap-3">
                    {logoUrl && (
                        <Image
                            src={logoUrl}
                            alt="Logo"
                            width={44}
                            height={44}
                            className="h-11 w-11 rounded-xl border border-zinc-700 object-cover"
                        />
                    )}
                    <input
                        ref={logoInputRef}
                        name="logo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                            if (event.target.files?.[0]) {
                                event.target.form?.requestSubmit()
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        Subir logo
                    </button>
                    <span className="text-[11px] text-zinc-500">JPG, PNG, WebP, GIF / max 2 MB</span>
                </div>
                {logoState?.error && <p className="text-xs text-red-400">{logoState.error}</p>}
                {logoState?.success && <p className="text-xs text-emerald-500">Logo actualizado</p>}
            </form>

            <div className="border-t border-zinc-800" />

            <form action={action} className="space-y-3">
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Nombre</label>
                    <input
                        name="name"
                        required
                        defaultValue={defaultName}
                        maxLength={80}
                        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-400"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Color primario</label>
                    <div className="flex items-center gap-2">
                        <input
                            name="primary_color"
                            type="color"
                            defaultValue={defaultColor || '#10B981'}
                            className="h-10 w-10 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-950 p-1"
                        />
                        <span className="text-xs text-zinc-500">Color base de la organizacion</span>
                    </div>
                </div>
                {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
                {state?.success && <p className="text-xs text-emerald-500">Configuracion guardada</p>}
                <div className="flex justify-end">
                    <SubmitButton />
                </div>
            </form>
        </div>
    )
}
