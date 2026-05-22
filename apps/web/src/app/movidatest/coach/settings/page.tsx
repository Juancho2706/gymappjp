'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Eye, Palette, Phone } from 'lucide-react'
import { felipeCoach, MOVIDA_BRAND } from '../../_mock'

export default function CoachSettingsPage() {
    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-bold">Configuración</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Perfil de {felipeCoach.full_name}</p>
            </div>

            {/* Profile */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Perfil del coach</h2>
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: '#0D9488' }}>F</div>
                    <div>
                        <p className="font-semibold">{felipeCoach.full_name}</p>
                        <p className="text-sm text-muted-foreground">{felipeCoach.specialty}</p>
                        <p className="text-xs text-muted-foreground">{felipeCoach.email}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Código invitación</p>
                        <p className="font-mono font-bold">{felipeCoach.invite_code}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Teléfono</p>
                        <p className="font-medium flex items-center gap-1"><Phone className="w-3 h-3" />{felipeCoach.phone}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Suscripción</p>
                        <p className="font-medium text-teal-500">PRO Enterprise</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Alumnos máx.</p>
                        <p className="font-medium">∞ (Enterprise)</p>
                    </div>
                </div>
            </section>

            {/* Branding del coach (sub-marca dentro de Movida) */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-violet-500" />
                    <h2 className="text-sm font-semibold">Sub-marca del coach</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">Dentro de Movida</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Dentro de la organización Movida, cada coach puede personalizar su nombre de marca y color. Los alumnos verán la marca del coach en su app.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Nombre de marca</p>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">Felipe Movida</div>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Color primario</p>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: MOVIDA_BRAND.primaryColor }} />
                            <span className="text-sm font-mono">{MOVIDA_BRAND.primaryColor}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Logo (hereda de Movida)</p>
                    <div className="rounded-xl border border-border bg-zinc-950 p-3 inline-block">
                        <Image src="/logomovida.png" alt="Movida" width={100} height={32} className="h-8 w-auto object-contain" />
                    </div>
                </div>
            </section>

            {/* Preview link */}
            <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold">Preview de la app del alumno</p>
                    <p className="text-xs text-muted-foreground">Así ven tus alumnos la app con tu marca</p>
                </div>
                <Link
                    href="/movidatest/cliente/dashboard"
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/5"
                >
                    <Eye className="w-3.5 h-3.5" />
                    Ver preview
                </Link>
            </div>
        </div>
    )
}
