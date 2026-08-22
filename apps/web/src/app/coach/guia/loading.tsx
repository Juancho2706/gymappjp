/**
 * Esqueleto de «Tus primeros pasos» mientras el RSC resuelve las señales de la guía.
 * Copia la geometría real (anillo + cabecera + 5 tarjetas + riel del demo) para que no salte
 * el layout al llegar el contenido.
 */
export default function CoachGuiaLoading() {
    return (
        <div className="mx-auto w-full max-w-[1100px] pb-14" aria-busy="true" aria-live="polite">
            <span className="sr-only">Cargando tu guía de inicio…</span>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <div className="size-[76px] shrink-0 animate-pulse rounded-full bg-surface-sunken" />
                <div className="min-w-0 flex-1">
                    <div className="h-8 w-[min(100%,320px)] animate-pulse rounded-control bg-surface-sunken" />
                    <div className="mt-2 h-4 w-[min(100%,420px)] animate-pulse rounded-control bg-surface-sunken" />
                </div>
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                <div className="flex flex-col gap-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-[120px] animate-pulse rounded-card border border-subtle bg-surface-sunken"
                        />
                    ))}
                </div>
                <div className="h-[260px] animate-pulse rounded-card border border-subtle bg-surface-sunken" />
            </div>
        </div>
    )
}
