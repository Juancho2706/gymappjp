import type { Metadata } from 'next'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { GymAppLogo } from '@/components/ui/Logo'
import { NoiseOverlay } from '@/components/fx/NoiseOverlay'
import { KineticHalo } from '@/components/fx/KineticHalo'

export const metadata: Metadata = {
    title: 'EVA',
    description: 'Accede a tu cuenta',
}

/**
 * Auth shell — Concept A · Kinetic Obsidian
 * Card glass central flotando sobre mesh gradient + halo EVA.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-dvh bg-[var(--obs-base)] text-[var(--obs-text)] flex flex-col pt-safe overflow-hidden">
            {/* Ambient mesh */}
            <div className="ambient-mesh" aria-hidden />

            {/* Halo watermark de la silueta EVA */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <KineticHalo size={900} opacity={0.05} />
            </div>

            {/* Header minimal */}
            <header className="relative z-10 flex items-center justify-between px-6 py-5">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <GymAppLogo className="h-8 w-[4.25rem] flex-shrink-0 transition-transform group-hover:scale-105" />
                    <span className="font-bold text-[11px] uppercase tracking-[0.3em] text-[var(--obs-text)]">EVA</span>
                </Link>
                <ThemeToggle />
            </header>

            {/* Content — glass card flotante */}
            <div className="relative z-10 flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="glass-strong rounded-2xl p-8 sm:p-10">
                        {children}
                    </div>
                </div>
            </div>

            <NoiseOverlay />
        </div>
    )
}
