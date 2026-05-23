'use client'

import { useActionState } from 'react'
import { setupAccountAction, type SetupAccountState } from './_actions/setup-account.actions'

const initial: SetupAccountState = {}

export function SetupAccountForm() {
    const [state, action, pending] = useActionState(setupAccountAction, initial)

    return (
        <form action={action} className="space-y-4">
            {state.error && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {state.error}
                </p>
            )}

            <div className="space-y-1">
                <label htmlFor="password" className="block text-sm font-medium">
                    Contraseña
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full h-10 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="confirm_password" className="block text-sm font-medium">
                    Confirmar contraseña
                </label>
                <input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    required
                    placeholder="Repite tu contraseña"
                    className="w-full h-10 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
            </div>

            <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="tos_accepted"
                        value="on"
                        required
                        className="mt-0.5 h-4 w-4 rounded border-border accent-violet-600"
                    />
                    <span className="text-sm text-muted-foreground leading-snug">
                        Acepto los{' '}
                        <a
                            href="/legal/tos-enterprise"
                            target="_blank"
                            className="text-foreground underline underline-offset-2 hover:text-violet-600"
                        >
                            Términos de Servicio Enterprise
                        </a>
                    </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="privacy_accepted"
                        value="on"
                        required
                        className="mt-0.5 h-4 w-4 rounded border-border accent-violet-600"
                    />
                    <span className="text-sm text-muted-foreground leading-snug">
                        Acepto la{' '}
                        <a
                            href="/legal/privacy"
                            target="_blank"
                            className="text-foreground underline underline-offset-2 hover:text-violet-600"
                        >
                            Política de Privacidad
                        </a>{' '}
                        y el tratamiento de datos de salud
                    </span>
                </label>
            </div>

            <button
                type="submit"
                disabled={pending}
                className="w-full h-11 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
                {pending ? 'Configurando...' : 'Activar cuenta →'}
            </button>
        </form>
    )
}
