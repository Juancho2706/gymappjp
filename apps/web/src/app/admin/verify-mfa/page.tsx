'use client'

import { useEffect, useState, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Paso 2 del acceso al panel CEO (F4 08-05): la sesion password-only (aal1) se sube a aal2
 * verificando el factor TOTP ya enrolado. El proxy manda aca a toda sesion aal1 de un admin
 * con factor verificado.
 */
function VerifyMfaInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [factorId, setFactorId] = useState('')
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()

    const rawNext = searchParams.get('next')
    const next = rawNext && rawNext.startsWith('/admin') && !rawNext.startsWith('//') ? rawNext : '/admin/dashboard'

    useEffect(() => {
        const supabase = createClient()
        async function loadFactor() {
            const { data, error } = await supabase.auth.mfa.listFactors()
            const totp = data?.totp?.find(f => f.status === 'verified')
            if (error || !totp) {
                // Sin factor verificado esta pantalla no corresponde — el proxy manda a setup.
                router.replace('/admin/setup-mfa')
                return
            }
            setFactorId(totp.id)
            setLoading(false)
        }
        void loadFactor()
    }, [router])

    function handleVerify() {
        if (code.length !== 6) { setError('El código debe ser de 6 dígitos'); return }
        setError('')
        startTransition(async () => {
            const supabase = createClient()
            const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
            if (!challenge) { setError('Error al generar el desafío MFA'); return }
            const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
            if (error) {
                setError('Código incorrecto. Verifica la hora de tu app de autenticación.')
                setCode('')
                return
            }
            router.push(next)
            router.refresh()
        })
    }

    return (
        <div className="dark flex min-h-[100dvh] items-center justify-center bg-surface-app px-4" style={{ colorScheme: 'dark' }}>
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-2">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sport-500/10">
                        <ShieldCheck className="h-6 w-6 text-[var(--sport-500)]" />
                    </div>
                    <h1 className="text-xl font-black text-strong">Verificación en dos pasos</h1>
                    <p className="text-sm text-muted">Paso 2 de 2 · código de tu app de autenticación</p>
                </div>

                <div className="rounded-card border border-subtle bg-surface-card p-6 space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-7 w-7 animate-spin text-muted" />
                        </div>
                    ) : (
                        <>
                            <input
                                id="totp-code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="000000"
                                autoFocus
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                aria-label="Código de verificación de 6 dígitos"
                                className="h-12 w-full rounded-lg border border-subtle bg-surface-sunken px-3 text-center font-mono text-2xl tracking-[0.35em] text-strong focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                            />
                            {error && <p role="alert" className="text-center text-sm text-[var(--danger-500)]">{error}</p>}
                            <button
                                type="button"
                                onClick={handleVerify}
                                disabled={isPending || code.length !== 6}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cta-fill)] text-sm font-semibold text-white transition-colors hover:bg-[var(--sport-600)] disabled:opacity-50"
                            >
                                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                Entrar
                            </button>
                        </>
                    )}
                </div>

                <p className="text-center text-xs text-muted">
                    ¿Perdiste el acceso a tu app? El factor se restablece desde el dashboard de Supabase.
                </p>
            </div>
        </div>
    )
}

export default function AdminVerifyMfaPage() {
    return (
        <Suspense>
            <VerifyMfaInner />
        </Suspense>
    )
}
