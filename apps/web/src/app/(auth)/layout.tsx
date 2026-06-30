import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'

/**
 * Shell del flujo de acceso (login / registro / recuperación) — transcripción 1:1
 * de `DesktopAuthShell` (`.dt-auth2`): panel de marca (izq, solo desktop) + columna
 * del formulario (der). A móvil (< md = 760px) el panel se oculta y queda una sola
 * columna a pantalla completa — paridad exacta con la app móvil.
 *
 * Metadata por ruta: cada segmento bajo `(auth)` exporta `metadata` en su `layout.tsx`.
 */
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="fixed inset-0 z-50 flex bg-surface-app">
            <AuthBrandPanel />

            {/* Columna del formulario — a móvil ocupa todo el ancho; en desktop es la
               banda fija de 480px del diseño. Scrollea internamente. */}
            <div className="relative flex w-full flex-col items-center overflow-y-auto px-6 pb-12 pt-14 md:w-[480px] md:flex-none md:px-10">
                {children}
            </div>
        </div>
    )
}
