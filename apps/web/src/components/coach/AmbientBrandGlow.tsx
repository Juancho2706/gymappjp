'use client'

/**
 * Ambient brand-tinted glow para vistas hero del panel coach (tema del coach via
 * --theme-primary-rgb). Misma técnica que LibraryHeroBackdrop (dos elipses radiales de marca)
 * pero el falloff lo dan los stops del radial-gradient — SIN filter:blur — más barato de pintar
 * y sin halo recortado por el clip.
 *
 * Decorativo puro: `pointer-events-none` + `aria-hidden`. Se auto-manda al fondo con `-z-10`,
 * así basta montarlo como primer hijo de un contenedor que establezca stacking context
 * (`relative`/`isolate`); el contenido en flujo pinta por encima sin tocar su z.
 *
 * GOTCHA: --theme-primary-rgb ('r, g, b') NO se redefine en .dark → conserva el accent light;
 * la presencia en dark se modula con dark:opacity-*, no con el token.
 */
export function AmbientBrandGlow() {
    return (
        <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden"
            aria-hidden
        >
            {/* Wash primario — sesgado al área superior */}
            <div
                className="absolute left-[35%] top-[-45%] h-[420px] w-[min(520px,115vw)] -translate-x-1/2 opacity-[0.12] dark:opacity-[0.18]"
                style={{
                    background:
                        'radial-gradient(ellipse at center, rgba(var(--theme-primary-rgb), 0.55) 0%, transparent 68%)',
                }}
            />
            {/* Wash secundario — hacia el borde derecho, más tenue */}
            <div
                className="absolute -right-[5%] top-[-30%] h-[360px] w-[min(420px,95vw)] opacity-[0.09] dark:opacity-[0.10]"
                style={{
                    background:
                        'radial-gradient(ellipse at 30% 40%, rgba(var(--theme-primary-rgb), 0.35) 0%, transparent 65%)',
                }}
            />
        </div>
    )
}
