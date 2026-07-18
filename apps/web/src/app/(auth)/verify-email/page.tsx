'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { MailCheck, Check, ArrowRight } from 'lucide-react'

function VerifyEmailContent() {
    const params = useSearchParams()
    const email = params.get('email') ?? ''

    const benefits = [
        '3 alumnos sin costo',
        'Planes de entrenamiento ilimitados',
        'Tu propia app para alumnos',
        'Upgrade cuando quieras',
    ]

    return (
        <div className="w-full max-w-md mx-auto my-auto animate-slide-up text-center">
            <div className="inline-flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sport-100 text-sport-600 mb-5">
                <MailCheck className="h-[34px] w-[34px]" />
            </div>

            <h1 className="font-display text-[25px] font-black tracking-[-0.02em] text-text-strong">
                Revisa tu email
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Te enviamos un enlace de confirmación a
                <br />
                <strong className="text-text-strong">{email || 'tu correo'}</strong>. Clickéalo para
                activar tu cuenta gratuita.
            </p>

            <div className="mt-6 rounded-card border border-border-subtle bg-surface-card p-[18px] text-left shadow-[var(--shadow-sm)]">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.05em] text-text-subtle">
                    Incluido en tu plan Free
                </p>
                <div className="flex flex-col gap-2.5">
                    {benefits.map((item) => (
                        <div key={item} className="flex items-center gap-2.5">
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
                                <Check className="h-[13px] w-[13px]" />
                            </span>
                            <span className="text-[13.5px] text-text-body">{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            <p className="mt-[18px] text-[12.5px] text-text-subtle">
                ¿No te llegó? Revisa spam o espera un minuto.
            </p>

            <Link
                href="/login"
                className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] text-[17px] font-bold tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all duration-200 hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] active:scale-[0.98]"
            >
                Ya confirmé · Ir al panel
                <ArrowRight className="h-4 w-4" />
            </Link>
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
