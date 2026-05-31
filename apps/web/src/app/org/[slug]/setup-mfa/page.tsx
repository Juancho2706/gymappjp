'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react'
import Image from 'next/image'
import { clearMfaRequirementAction } from './mfa.actions'

interface Props {
    params: Promise<{ slug: string }>
}

export default function SetupMfaPage({ params }: Props) {
    const router = useRouter()
    const [slug, setSlug] = useState('')
    const [qrCode, setQrCode] = useState('')
    const [secret, setSecret] = useState('')
    const [factorId, setFactorId] = useState('')
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [done, setDone] = useState(false)
    const [enrolling, setEnrolling] = useState(true)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        params.then(p => setSlug(p.slug))
    }, [params])

    useEffect(() => {
        const supabase = createClient()

        async function enroll() {
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
            if (error || !data) {
                setError(error?.message ?? 'Error al generar código QR')
                setEnrolling(false)
                return
            }
            setFactorId(data.id)
            setQrCode(data.totp.qr_code)
            setSecret(data.totp.secret)
            setEnrolling(false)
        }

        enroll()
    }, [])

    function handleVerify() {
        if (code.length !== 6) { setError('El código debe ser de 6 dígitos'); return }
        setError('')
        startTransition(async () => {
            const supabase = createClient()
            const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
            if (!challenge) { setError('Error al generar desafío MFA'); return }

            const { error } = await supabase.auth.mfa.verify({
                factorId,
                challengeId: challenge.id,
                code,
            })

            if (error) {
                setError('Código incorrecto. Verifica la hora de tu app.')
                return
            }

            // Clear the requires_mfa_setup flag so middleware stops blocking
            await clearMfaRequirementAction()

            setDone(true)
            setTimeout(() => router.push(`/org/${slug}`), 1500)
        })
    }

    if (done) {
        return (
            <div className="min-h-dvh flex items-center justify-center p-4">
                <div className="text-center space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <p className="text-lg font-bold">2FA activado correctamente</p>
                    <p className="text-sm text-muted-foreground">Redirigiendo...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-dvh flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-xl font-black">Autenticación en dos pasos</h1>
                    <p className="text-sm text-muted-foreground">
                        Escanea el código QR con Google Authenticator, Authy o similar.
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                    {enrolling ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {qrCode && (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="p-2 bg-white rounded-xl border border-border">
                                        <Image
                                            src={qrCode}
                                            alt="Código QR para 2FA"
                                            width={180}
                                            height={180}
                                            unoptimized
                                        />
                                    </div>
                                    {secret && (
                                        <details className="w-full">
                                            <summary className="text-xs text-muted-foreground cursor-pointer text-center">
                                                Ingresar código manual
                                            </summary>
                                            <p className="mt-2 text-center font-mono text-sm bg-muted rounded-lg px-3 py-2 break-all">
                                                {secret}
                                            </p>
                                        </details>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="totp-code" className="block text-sm font-medium">
                                    Código de verificación
                                </label>
                                <input
                                    id="totp-code"
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                    onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                    className="w-full h-11 px-3 text-center text-xl font-mono tracking-widest rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-500 text-center">{error}</p>
                            )}

                            <button
                                type="button"
                                onClick={handleVerify}
                                disabled={isPending || code.length !== 6}
                                className="w-full h-11 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                Verificar y activar 2FA
                            </button>
                        </>
                    )}
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    Si tienes problemas,{' '}
                    <a href="mailto:soporte@eva-app.cl" className="underline underline-offset-2">
                        contacta soporte
                    </a>
                </p>
            </div>
        </div>
    )
}
