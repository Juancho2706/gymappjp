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
 * UNA sola capa: `fixed inset-0 -z-10` para los shells logueados. ⚠️ El padre DEBE
 * crear stacking context (`isolate` o `z-0`); sin eso el `-z-10` se hunde bajo
 * cualquier fondo opaco de la página y el sello queda invisible.
 *
 * Hubo una variante `grain` (solo grano) para los overlays de trabajo denso del D2
 * original. Murió el 2026-08-19 (auditoría 17-08 §1.11): la REVERSA del dueño sobre
 * D2 dejó al editor de nutrición con el fondo COMPLETO — `QuickEditPlanView` monta el
 * sello entero — así que la variante quedó con CERO consumidores. Si algún día un
 * builder pide fondo plano + solo grano, se vuelve a agregar junto con su montaje;
 * el marcador de markup `data-eva-seal="b"` (contrato del CSS y del gate visual) no
 * cambia por eso.
 *
 * El chrome del shell NO se toca (D2, regla del dueño): topbar/sidebar conservan su
 * superficie opaca `var(--surface-app)` ENCIMA del sello. Print: `globals.css`
 * apaga `[data-eva-seal]` (el sello no se imprime).
 */
export function AppSeal({
    animated = true,
}: {
    /** Kill-switch de la deriva (SPEC D4). `false` ⇒ blobs estáticos. */
    animated?: boolean
} = {}) {
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
