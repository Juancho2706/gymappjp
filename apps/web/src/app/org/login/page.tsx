import Link from 'next/link'
import type { Metadata } from 'next'
import { EvaBrandIcon } from '@/components/landing/LandingBrandMark'
import { OrgLoginForm } from './OrgLoginForm'

export const metadata: Metadata = {
    title: 'Panel Empresa | EVA',
}

export default function OrgLoginPage() {
    return (
        <main className="flex min-h-dvh bg-background text-foreground">
            <section className="flex w-full items-center justify-center px-4 py-8 pb-safe pt-safe">
                <div className="w-full max-w-[420px]">
                    <div className="mb-8 flex items-center gap-3">
                        <EvaBrandIcon className="h-10 w-10 shrink-0" />
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                EVA Enterprise
                            </p>
                            <h1 className="text-2xl font-extrabold tracking-normal text-foreground">
                                Panel Empresa
                            </h1>
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <p className="text-sm leading-6 text-muted-foreground">
                            Gestiona coaches, alumnos y configuración de tu organización.
                        </p>
                        <OrgLoginForm />
                    </div>

                    <p className="mt-5 text-center text-sm text-muted-foreground">
                        ¿Eres coach?{' '}
                        <Link href="/login" className="font-semibold text-primary hover:underline">
                            Ingresa en eva-app.cl/login
                        </Link>
                    </p>
                </div>
            </section>
        </main>
    )
}
