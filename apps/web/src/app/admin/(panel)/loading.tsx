// Skeleton compartido del panel CEO: antes NO existia ningun loading.tsx en /admin y cada
// navegacion congelaba la pantalla anterior hasta resolver todas las queries (F1 08-05).
export default function AdminPanelLoading() {
    return (
        <div className="animate-pulse space-y-4" aria-hidden>
            <div className="space-y-2">
                <div className="h-7 w-48 rounded-md bg-surface-sunken" />
                <div className="h-3 w-72 rounded bg-surface-sunken" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl border border-subtle bg-surface-card" />
                ))}
            </div>
            <div className="h-72 rounded-xl border border-subtle bg-surface-card" />
            <div className="h-48 rounded-xl border border-subtle bg-surface-card" />
        </div>
    )
}
