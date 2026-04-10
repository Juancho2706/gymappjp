import type { Metadata } from 'next'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { GymAppLogo } from '@/components/ui/Logo'

export const metadata: Metadata = {
    title: 'EVA',
    description: 'Accede a tu cuenta',
}

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-background flex flex-col pt-safe">
            {/* Minimal header */}
            <header className="flex items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2.5">
                    <GymAppLogo className="w-8 h-8" />
                    <span className="font-bold text-foreground font-display">
                        EVA
                    </span>
                </Link>
                <ThemeToggle />
            </header>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-4">
                {/* Ambient gradient */}
                <div
                    className="fixed inset-0 pointer-events-none"
                    aria-hidden="true"
                    style={{
                        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,122,255,0.08), transparent)',
                    }}
                />
                <div className="relative z-10 w-full max-w-md">
                    {children}
                </div>
            </div>
        </div>
    )
}

