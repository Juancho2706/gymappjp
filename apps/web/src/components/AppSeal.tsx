/**
 * AppSeal — Sello EVA v2 «Horizonte B» (SPEC `docs/specs/eva-seal-background/`,
 * decisión del dueño 2026-08-17 sobre el artifact «Variaciones del Sello», remix B).
 *
 * Fondo por defecto de TODA la app logueada (D1): dos blobs del PAR de marca
 * (primario + secundario curado del preset o derivado — `sealPair` D3) a la deriva
 * + grano crosshatch. SIN grilla (remix B). El CSS vive en `globals.css`
 * («Sello EVA v2»): radial-gradients sobre `--seal-p-rgb`/`--seal-s-rgb` (publicadas
 * por los layouts junto a `--theme-primary`) con alphas por tema (`--seal-*`, D5).
 *
 * Contrato de animación (D4): SOLO la luz deriva (keyframes 46s/58s, transform puro,
 * `motion-safe`); el grano JAMÁS anima. `prefers-reduced-motion` ⇒ blobs ESTÁTICOS
 * (no desaparecen). `animated={false}` = kill-switch (QA de batería del dueño).
 *
 * Variantes:
 * - `b` (default): capa `fixed inset-0 -z-10` para los shells logueados. ⚠️ El
 *   padre DEBE crear stacking context (`isolate` o `z-0`); sin eso el `-z-10` se
 *   hunde bajo cualquier fondo opaco de la página y el sello queda invisible.
 * - `grain`: SOLO grano para overlays de trabajo denso (D2: editor de nutrición —
 *   el tinte no compite con datos). `fixed inset-0` DENTRO del overlay: el overlay
 *   del editor es `fixed inset-0` + scroll propio, así la capa cubre exactamente su
 *   área sin desplazarse con el contenido (una capa `absolute` se iría con el
 *   scroll y dejaría sin grano todo lo que pase del primer viewport). Sigue local:
 *   vive en el stacking context del overlay y se desmonta con él.
 *
 * El chrome del shell NO se toca (D2, regla del dueño): topbar/sidebar conservan su
 * superficie opaca `var(--surface-app)` ENCIMA del sello. Print: `globals.css`
 * apaga `[data-eva-seal]` (el sello no se imprime).
 */
export function AppSeal({
    variant = 'b',
    animated = true,
}: {
    /** `b` = blobs + grano (shells logueados) · `grain` = solo grano (overlays D2). */
    variant?: 'b' | 'grain'
    /** Kill-switch de la deriva (SPEC D4). `false` ⇒ blobs estáticos. */
    animated?: boolean
}) {
    if (variant === 'grain') {
        return (
            <div
                aria-hidden
                data-eva-seal="grain"
                className="eva-seal-grain pointer-events-none fixed inset-0 -z-10"
            />
        )
    }
    return (
        <div
            aria-hidden
            data-eva-seal="b"
            data-seal-animated={animated ? '' : undefined}
            className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
            <div className="eva-seal-blob eva-seal-blob1" />
            <div className="eva-seal-blob eva-seal-blob2" />
            <div className="eva-seal-grain absolute inset-0" />
        </div>
    )
}
