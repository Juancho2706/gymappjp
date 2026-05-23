import { ChevronLeft } from 'lucide-react'

interface EnterpriseTrustHeaderProps {
    backHref?: string
}

export function EnterpriseTrustHeader({
    backHref = 'https://eva-app.cl',
}: EnterpriseTrustHeaderProps) {
    return (
        <div className="w-full max-w-sm sm:max-w-[400px]">
            <a
                href={backHref}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 rounded px-1"
                rel="noopener noreferrer"
            >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Volver a EVA Enterprise
            </a>
        </div>
    )
}
