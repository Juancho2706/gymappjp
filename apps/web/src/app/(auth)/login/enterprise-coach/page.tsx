import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ShieldCheck } from 'lucide-react'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { EnterpriseCoachLoginForm } from './EnterpriseCoachLoginForm'

export const metadata: Metadata = {
    title: 'Coach Enterprise - EVA',
    description: 'Activa o ingresa como coach gestionado por una organizacion enterprise.',
}

export default function EnterpriseCoachLoginPage() {
    return (
        <div className="min-h-dvh bg-zinc-950 text-zinc-100">
            <div className="mx-auto grid min-h-dvh w-full max-w-6xl lg:grid-cols-[1fr_440px]">
                <section className="hidden flex-col justify-between border-r border-zinc-800 p-10 lg:flex">
                    <div className="flex items-center justify-between">
                        <LandingBrandMark iconClassName="h-9 w-9" />
                        <ThemeToggle />
                    </div>

                    <div className="max-w-xl">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Coach Enterprise
                        </span>
                        <h1 className="mt-5 text-4xl font-black tracking-tight text-white">
                            Trabaja bajo la marca y reglas de tu empresa.
                        </h1>
                        <p className="mt-4 text-sm leading-6 text-zinc-400">
                            Esta entrada activa tu workspace enterprise con un codigo de invitacion. Tu cuenta standalone, si existe, se mantiene separada.
                        </p>
                    </div>

                    <div className="grid gap-3 text-sm text-zinc-400">
                        {[
                            'No modifica billing de tu cuenta coach independiente.',
                            'No cambia tu marca standalone.',
                            'La empresa controla alumnos, branding y acceso enterprise.',
                        ].map(item => (
                            <div key={item} className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                {item}
                            </div>
                        ))}
                    </div>
                </section>

                <main className="flex min-h-dvh flex-col justify-center px-5 py-8">
                    <div className="mb-8 flex items-center justify-between lg:hidden">
                        <LandingBrandMark iconClassName="h-8 w-8" />
                        <ThemeToggle />
                    </div>

                    <div className="mx-auto w-full max-w-sm">
                        <div className="mb-6">
                            <h2 className="text-2xl font-black tracking-tight text-white">Coach Enterprise</h2>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Ingresa con tu email de coach y el codigo entregado por la empresa.
                            </p>
                        </div>

                        <EnterpriseCoachLoginForm />

                        <div className="mt-6 text-center">
                            <Link href="/login" className="text-sm font-bold text-zinc-400 transition hover:text-zinc-100">
                                Volver al login coach
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
