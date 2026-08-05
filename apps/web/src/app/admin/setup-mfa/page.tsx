'use client'

import { useEffect, useState, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Enrolamiento TOTP obligatorio del panel CEO (F4 08-05). Sin flag app_metadata (a diferencia
 * del flujo org): el proxy exige aal2 por sesion, y verificar el factor recien enrolado sube
 * la sesion a aal2 al instante — la proxima navegacion ya pasa.
 */
function SetupMfaInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [qrCode, setQrCode] = useState('')
    const [secret, setSecret] = useState('')
    const [factorId, setFactorId] = useState('')
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [done, setDone] = useState(false)
    const [enrolling, setEnrolling] = useState(true)
    const [isPending, startTransition] = useTransition()

    const rawNext = searchParams.get('next')
    const next = rawNext && rawNext.startsWith('/admin') && !rawNext.startsWith('//') ? rawNext : '/admin/dashboard'

    useEffect(() => {
        const supabase = createClient()
        async function enroll() {
            // Reintentos tras un enroll abandonado dejan factores 'unverified' colgados que
            // hacen fallar el proximo enroll con friendly name duplicado — se limpian antes.
            const { data: factors } = await supabase.auth.mfa.listFactors()
            for (const f of factors?.all ?? []) {
                if (f.status === 'unverified') {
                    await supabase.auth.mfa.unenroll({ factorId: f.id })
                }
            }
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Panel CEO' })
            if (error || !data) {
                setError(error?.message ?? 'Error al generar el código QR')
                setEnrolling(false)
                return
            }
            setFactorId(data.id)
            setQrCode(data.totp.qr_code)
            setSecret(data.totp.secret)
            setEnrolling(false)
        }
        void enroll()
    }, [])

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
                return
            }
            setDone(true)
            setTimeout(() => { router.push(next); router.refresh() }, 1200)
        })
    }

    return (
        <div className="dark flex min-h-[100dvh] items-center justify-center bg-surface-app px-4" style={{ colorScheme: 'dark' }}>
            <div className="w-full max-w-md space-y-6">
                {done ? (
                    <div className="text-center space-y-3">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--success-500)]" />
                        <p className="text-lg font-bold text-strong">2FA activado</p>
                        <p className="text-sm text-muted">Entrando al panel…</p>
                    </div>
                ) : (
                    <>
                        <div className="text-center space-y-2">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sport-500/10">
                                <ShieldCheck className="h-6 w-6 text-[var(--sport-500)]" />
                            </div>
                            <h1 className="text-xl font-black text-strong">Protege el Panel CEO</h1>
                            <p className="text-sm text-muted">
                                Esta cuenta administra toda la plataforma. Escanea el QR con tu app de
                                autenticación (Google Authenticator, Authy, 1Password…).
                            </p>
                        </div>

                        <div className="rounded-card border border-subtle bg-surface-card p-6 space-y-5">
                            {enrolling ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted" />
                                </div>
                            ) : (
                                <>
                                    {qrCode && (
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="rounded-xl border border-subtle bg-white p-2">
                                                <Image src={qrCode} alt="Código QR para activar 2FA" width={180} height={180} unoptimized />
                                            </div>
                                            {secret && (
                                                <details className="w-full">
                                                    <summary className="cursor-pointer text-center text-xs text-muted">
                                                        Ingresar código manual
                                                    </summary>
                                                    <p className="mt-2 break-all rounded-lg bg-surface-sunken px-3 py-2 text-center font-mono text-sm text-strong">
                                                        {secret}
                                                    </p>
                                                </details>
                                            )}
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <label htmlFor="totp-code" className="block text-sm font-medium text-body">
                                            Código de verificación
                                        </label>
                                        <input
                                            id="totp-code"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            value={code}
                                            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                            onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                            className="h-11 w-full rounded-lg border border-subtle bg-surface-sunken px-3 text-center font-mono text-xl tracking-widest text-strong focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                                        />
                                    </div>
                                    {error && <p role="alert" className="text-center text-sm text-[var(--danger-500)]">{error}</p>}
                                    <button
                                        type="button"
                                        onClick={handleVerify}
                                        disabled={isPending || code.length !== 6}
                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cta-fill)] text-sm font-semibold text-white transition-colors hover:bg-[var(--sport-600)] disabled:opacity-50"
                                    >
                                        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Verificar y activar 2FA
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default function AdminSetupMfaPage() {
    return (
        <Suspense>
            <SetupMfaInner />
        </Suspense>
    )
}
