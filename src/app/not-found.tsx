import Link from 'next/link'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 text-center">
            <div className="relative mb-8">
                <p className="text-[10rem] font-black leading-none tracking-tighter font-display text-foreground/5 select-none">
                    404
                </p>
                <div className="absolute inset-0 flex items-center justify-center">
                    <p
                        className="text-7xl font-black tracking-tighter font-display"
                        style={{ color: 'var(--theme-primary, hsl(var(--primary)))' }}
                    >
                        404
                    </p>
                </div>
            </div>

            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground mb-2">
                Página no encontrada
            </h1>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                Esta ruta no existe o fue movida. Vuelve al inicio y retoma el camino.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
                <Link
                    href="/coach/dashboard"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: 'var(--theme-primary, hsl(var(--primary)))' }}
                >
                    <Home className="w-4 h-4" />
                    Dashboard
                </Link>
                <Link
                    href="javascript:history.back()"
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver atrás
                </Link>
            </div>
        </div>
    )
}
