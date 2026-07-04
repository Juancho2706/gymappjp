'use client'

/**
 * Ambient brand-tinted glow para vistas hero del panel coach (tema del coach via
 * --theme-primary-rgb). Misma técnica que LibraryHeroBackdrop (elipses radiales de marca)
 * pero el falloff lo dan los stops del radial-gradient — SIN filter:blur — más barato de pintar
 * y sin halo recortado por el clip.
 *
 * Cobertura (fix CEO 2026-07-04, screenshots): el contenedor es **full-bleed vertical y
 * horizontal** para cubrir el dashboard ENTERO sin cortes visibles:
 *  - `inset-y-0` → alto = alto real del contenedor del dashboard (no un `h-[420px]` fijo que
 *    cortaba el gradiente a media altura = línea horizontal dura).
 *  - `left-1/2 w-screen -translate-x-1/2` → escapa el gutter horizontal del wrapper
 *    (CoachMainWrapper px-4/md:px-8) y llega a los bordes laterales de la pantalla en móvil.
 *    `html` ya tiene `overflow-x: clip` → el w-screen NO genera scroll horizontal.
 *  - `overflow-hidden` propio → clipea las elipses en SUS bordes = bordes del viewport (lados) y
 *    top/bottom del dashboard. Los stops de cada elipse llegan a `transparent` ANTES de esos
 *    bordes verticales (fade completo dentro del área), así el único "clip" es en los lados,
 *    donde el glow sale de pantalla suave (bleed deseado, no un corte perceptible).
 *
 * Decorativo puro: `pointer-events-none` + `aria-hidden`. Se auto-manda al fondo con `-z-10`,
 * así basta montarlo como primer hijo de un contenedor que establezca stacking context
 * (`relative`/`isolate`); el contenido en flujo pinta por encima sin tocar su z.
 *
 * GOTCHA: --theme-primary-rgb ('r, g, b') NO se redefine en .dark → conserva el accent light;
 * la presencia en dark se modula con dark:opacity-*, no con el token. Consumir SIEMPRE con
 * `rgba(var(--theme-primary-rgb), a)` (lista con comas — `rgb(var(--x) / a)` muere en silencio).
 */
export function AmbientBrandGlow() {
    return (
        <div
            className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
            aria-hidden
        >
            {/* Wash primario — bloom central sobre el área hero. Centro ~180px bajo el top
                (top-[-120px] + centro de la elipse) → en el borde superior el gradiente ya es
                ~1% (imperceptible, sin línea dura); a ~390px ya es transparent (nada que cortar
                abajo). w-[min(900px,160vw)]: en móvil rebasa el viewport y sale por los lados. */}
            <div
                className="absolute left-1/2 top-[-120px] h-[600px] w-[min(900px,160vw)] -translate-x-1/2 opacity-[0.12] dark:opacity-[0.18]"
                style={{
                    background:
                        'radial-gradient(ellipse at center, rgba(var(--theme-primary-rgb), 0.55) 0%, transparent 70%)',
                }}
            />
            {/* Wash secundario — sesgado al borde derecho superior, más tenue. */}
            <div
                className="absolute -right-[6%] top-[-60px] h-[520px] w-[min(560px,120vw)] opacity-[0.09] dark:opacity-[0.10]"
                style={{
                    background:
                        'radial-gradient(ellipse at 30% 40%, rgba(var(--theme-primary-rgb), 0.35) 0%, transparent 68%)',
                }}
            />
            {/* Wash terciario — abajo-izquierda, MUY tenue (0.04/0.05): da vida al área inferior
                del dashboard para que no quede estéril, sin competir con el hero. Su fade completa
                dentro del área (el clip contra el bottom del contenedor cae en ~0.5% = invisible). */}
            <div
                className="absolute -left-[6%] bottom-[-140px] h-[480px] w-[min(600px,130vw)] opacity-[0.04] dark:opacity-[0.05]"
                style={{
                    background:
                        'radial-gradient(ellipse at 45% 55%, rgba(var(--theme-primary-rgb), 0.30) 0%, transparent 70%)',
                }}
            />
        </div>
    )
}
