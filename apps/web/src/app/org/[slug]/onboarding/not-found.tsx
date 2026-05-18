import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function OnboardingNotFound() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
            <ShieldX className="w-10 h-10 text-muted-foreground" />
            <div>
                <h1 className="text-lg font-bold">Onboarding no disponible</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Esta organización no existe o ya completó el onboarding.
                </p>
            </div>
            <Link
                href="/coach/dashboard"
                className="text-sm text-violet-500 hover:underline"
            >
                Volver al panel
            </Link>
        </div>
    )
}
