import type { Metadata } from 'next'
import { Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'

export const metadata: Metadata = {
    title: 'OmniCoach OS',
    description: 'Accede a tu cuenta',
}

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Minimal header */}
            <header className="flex items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Dumbbell className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        OmniCoach
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
                        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(16,185,129,0.08), transparent)',
                    }}
                />
                <div className="relative z-10 w-full max-w-md">
                    {children}
                </div>
            </div>
        </div>
    )
}
