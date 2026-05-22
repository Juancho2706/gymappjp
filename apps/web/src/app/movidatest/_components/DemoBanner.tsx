'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Clapperboard, X, Building2, UserCircle, Smartphone } from 'lucide-react'
import Image from 'next/image'

const PERSONAS = [
    { label: 'Admin Movida HQ', sublabel: 'Vista Patricio Sánchez (dueño)', href: '/movidatest/admin', icon: Building2, color: 'text-violet-500' },
    { label: 'Coach Felipe', sublabel: 'Vista entrenador', href: '/movidatest/coach/dashboard', icon: UserCircle, color: 'text-teal-500' },
    { label: 'Cliente María', sublabel: 'App del alumno', href: '/movidatest/cliente/dashboard', icon: Smartphone, color: 'text-blue-500' },
]

export function DemoBanner() {
    const [open, setOpen] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const pathname = usePathname()

    if (dismissed) return null

    const current = PERSONAS.find(p => pathname.startsWith(p.href)) ?? null

    return (
        <div className="sticky top-0 z-50 flex items-center gap-2 bg-zinc-900/95 border-b border-zinc-700/60 px-3 py-2 text-sm backdrop-blur">
            <Clapperboard className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-amber-300 font-semibold text-xs hidden sm:inline">DEMO</span>
            <span className="text-zinc-400 text-xs hidden sm:inline">·</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Image src="/logomovida.png" alt="Movida" width={60} height={20} className="h-5 w-auto object-contain" />
                <span className="text-zinc-400 text-xs hidden md:inline">virtualizado en EVA</span>
            </div>

            {/* Persona switcher */}
            <div className="relative">
                <button
                    onClick={() => setOpen(v => !v)}
                    className="flex items-center gap-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition-colors"
                >
                    {current ? (
                        <>
                            <current.icon className={`w-3.5 h-3.5 ${current.color}`} />
                            <span className="hidden sm:inline">{current.label}</span>
                            <span className="sm:hidden">Vista</span>
                        </>
                    ) : (
                        <span>Cambiar vista</span>
                    )}
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                </button>

                {open && (
                    <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl overflow-hidden z-10">
                        {PERSONAS.map(p => (
                            <Link
                                key={p.href}
                                href={p.href}
                                onClick={() => setOpen(false)}
                                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-zinc-700 transition-colors"
                            >
                                <p.icon className={`w-4 h-4 mt-0.5 ${p.color} shrink-0`} />
                                <div>
                                    <p className="text-xs font-medium text-zinc-200">{p.label}</p>
                                    <p className="text-[10px] text-zinc-500">{p.sublabel}</p>
                                </div>
                            </Link>
                        ))}
                        <div className="border-t border-zinc-700 px-3 py-2">
                            <Link href="/movidatest" onClick={() => setOpen(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                                ← Volver al hub
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            <button onClick={() => setDismissed(true)} className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
