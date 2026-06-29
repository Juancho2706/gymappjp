'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Mail, CheckCircle2 } from 'lucide-react'

function VerifyEmailContent() {
    const params = useSearchParams()
    const email = params.get('email') ?? ''

    return (
        <div className="w-full max-w-md mx-auto animate-slide-up">
            <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-sm)] text-center space-y-4">
                <div className="flex justify-center">
                    <div className="h-16 w-16 rounded-card bg-sport-100 text-sport-600 flex items-center justify-center">
                        <Mail className="h-8 w-8" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">
                        Revisa tu email
                    </h1>
                    <p className="text-sm text-text-muted">
                        Enviamos un enlace de confirmación a{' '}
                        {email && <strong className="text-text-strong">{email}</strong>}.
                        {!email && 'tu correo registrado.'}{' '}
                        Hacé click en el enlace para activar tu cuenta gratuita.
                    </p>
                </div>

                <div className="rounded-control bg-surface-sunken border border-border-subtle p-4 text-left space-y-2.5">
                    <p className="text-xs font-semibold text-text-strong">Mientras esperas, recordá:</p>
                    {[
                        '3 alumnos incluidos sin costo',
                        'Planes de entrenamiento ilimitados',
                        'App personalizada para tus alumnos',
                        'Podés hacer upgrade cuando quieras',
                    ].map((item) => (
                        <div key={item} className="flex items-center gap-2 text-xs text-text-muted">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--success-500)]" />
                            {item}
                        </div>
                    ))}
                </div>

                <p className="text-xs text-text-muted pt-2">
                    ¿No llegó el email? Revisá tu carpeta de spam.{' '}
                    <Link href="/login" className="text-sport-600 hover:opacity-80 font-semibold">
                        Volver al login
                    </Link>
                </p>
            </div>
        </div>
    )
}

export default function VerifyEmailPage() {
    return (
        <Suspense>
            <VerifyEmailContent />
        </Suspense>
    )
}
