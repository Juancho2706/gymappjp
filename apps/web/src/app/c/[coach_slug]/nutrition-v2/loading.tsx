import { BrandClientLoadingShell } from '../_components/BrandClientLoadingShell'

/**
 * Loading del hub Nutrición V2 del alumno. Antes NO existía: al navegar desde el menú,
 * la transición retenía la pantalla anterior hasta bajar TODO el payload RSC (tap
 * "muerto" ~4s reportado por el CEO en su teléfono). Con este boundary por segmento el
 * tap pinta feedback al instante. Skeleton aproximado de la pantalla: toolbar
 * Hoy/Plan/Historial + hero del día + cards de franjas (tokens semánticos, light/dark).
 */
export default function StudentNutritionV2Loading() {
    return (
        <BrandClientLoadingShell>
            <div aria-hidden="true" className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-28">
                {/* Toolbar Hoy / Plan / Historial */}
                <div className="flex gap-2 rounded-card border border-border-subtle bg-surface-card p-1.5">
                    <div className="h-10 flex-1 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-10 flex-1 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-10 flex-1 animate-pulse rounded-control bg-surface-sunken" />
                </div>
                {/* Hero del día (aura + metas) */}
                <div className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4">
                    <div className="h-5 w-2/5 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-24 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="flex gap-2">
                        <div className="h-6 w-16 animate-pulse rounded-pill bg-surface-sunken" />
                        <div className="h-6 w-16 animate-pulse rounded-pill bg-surface-sunken" />
                        <div className="h-6 w-16 animate-pulse rounded-pill bg-surface-sunken" />
                    </div>
                </div>
                {/* Franjas / registros */}
                <div className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4">
                    <div className="h-4 w-1/3 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-12 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-12 animate-pulse rounded-control bg-surface-sunken" />
                </div>
                <div className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4">
                    <div className="h-4 w-1/3 animate-pulse rounded-control bg-surface-sunken" />
                    <div className="h-12 animate-pulse rounded-control bg-surface-sunken" />
                </div>
            </div>
        </BrandClientLoadingShell>
    )
}
