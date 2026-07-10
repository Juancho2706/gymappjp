export function EnterpriseAuthFooter() {
    return (
        <div className="mt-6 space-y-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-[10px] font-medium text-zinc-600 whitespace-nowrap">
                    Acceso restringido a administradores de organización
                </span>
                <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <p className="text-xs text-zinc-500">
                ¿Coach independiente?{' '}
                <a
                    href="https://eva-app.cl/login"
                    className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 rounded"
                    rel="noopener noreferrer"
                >
                    Ingresa en eva-app.cl
                </a>
            </p>
        </div>
    )
}
