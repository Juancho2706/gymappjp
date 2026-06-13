import Link from 'next/link'
import { headers } from 'next/headers'
import { Home } from 'lucide-react'
import { getClientBasePath } from '@/lib/client/base-path'

// 404 del arbol del alumno (/c/[coach_slug] y /t/[team_slug] via proxy rewrite).
// Cuando una pagina de modulo llama notFound() (p.ej. bodycomp/movimiento sin
// entitlement), este boundary reemplaza al app/not-found.tsx raiz: su CTA apunta
// al dashboard DEL ALUMNO (no a /coach/dashboard), respetando el base path real
// (`/t/[team_slug]` para alumno de pool, `/c/[coach_slug]` para standalone).
export default async function ClientNotFound() {
    // not-found.tsx no recibe params; el proxy reenvia x-coach-slug + x-client-base-path.
    const h = await headers()
    const coachSlug = h.get('x-coach-slug') ?? ''
    const basePath = await getClientBasePath(coachSlug)

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 pt-safe pb-safe text-center">
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
                Esta sección no existe o no está disponible para ti. Vuelve a tu panel y retoma el
                entrenamiento.
            </p>

            <Link
                href={`${basePath}/dashboard`}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--theme-primary, hsl(var(--primary)))' }}
            >
                <Home className="w-4 h-4" />
                Mi panel
            </Link>
        </div>
    )
}
