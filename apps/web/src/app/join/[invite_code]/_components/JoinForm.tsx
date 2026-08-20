'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { joinViaInviteAction } from '../_actions/join.actions'

interface Props {
    inviteCode: string
    primaryColor: string
    /**
     * F6 (workout-share): referido que venía en la URL, ya filtrado por forma en el servidor.
     * El tipo se declara inline (y no se importa de `_lib/join-referral`) para no cruzar un
     * módulo `server-only` al bundle del cliente.
     */
    referral?: { ref: string; src: string; k?: string } | null
}

export function JoinForm({ inviteCode, primaryColor, referral }: Props) {
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const router = useRouter()

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        setError(null)
        start(async () => {
            const result = await joinViaInviteAction(inviteCode, null, formData)
            if ('error' in result && result.error) {
                setError(result.error)
            } else if ('loginHref' in result && result.loginHref) {
                router.push(`${result.loginHref}?registered=1`)
            }
        })
    }

    const inputClass = 'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/*
              F6: el referido viaja al server action por el MISMO FormData del alta. Son inputs
              ocultos (no estado del cliente ni storage) porque el submit ocurre en la misma
              pantalla donde se leyó la URL: lo que el servidor pintó es exactamente lo que se
              envía. El action igual revalida contra la DB — esto es transporte, no permiso.
            */}
            {referral && (
                <>
                    <input type="hidden" name="ref" value={referral.ref} />
                    <input type="hidden" name="src" value={referral.src} />
                    {referral.k && <input type="hidden" name="k" value={referral.k} />}
                </>
            )}
            <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Nombre completo</label>
                <input name="full_name" required minLength={2} maxLength={120} className={inputClass} placeholder="Juan Pérez" />
            </div>
            <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
                <input name="email" type="email" required className={inputClass} placeholder="juan@email.com" />
            </div>
            <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Teléfono (opcional)</label>
                <input name="phone" type="tel" maxLength={30} className={inputClass} placeholder="+56 9 1234 5678" />
            </div>
            <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Contraseña</label>
                <input name="password" type="password" required minLength={8} className={inputClass} placeholder="Mínimo 8 caracteres" />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
                type="submit"
                disabled={pending}
                style={{ backgroundColor: primaryColor }}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
                {pending ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
        </form>
    )
}
