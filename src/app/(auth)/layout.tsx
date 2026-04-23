import { ThemeToggle } from '@/components/ThemeToggle'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'

/** Metadata por ruta: cada segmento bajo `(auth)` exporta `metadata` en su `layout.tsx`. */

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-dvh bg-background flex flex-col pt-safe">
            {/* Minimal header */}
            <header className="flex items-center justify-between px-6 py-4">
                <LandingBrandMark iconClassName="h-8 w-8 sm:h-9 sm:w-9" />
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

