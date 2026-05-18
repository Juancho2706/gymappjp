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
            {/* Ambient gradient */}
            <div
                className="fixed inset-0 pointer-events-none z-0"
                aria-hidden="true"
                style={{
                    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,122,255,0.08), transparent)',
                }}
            />

            {/*
              Content — no max-width constraint here; each child sets its own.
              Coach login uses a full-width split layout; other pages use max-w-md.
            */}
            <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
                {children}
            </div>
        </div>
    )
}

