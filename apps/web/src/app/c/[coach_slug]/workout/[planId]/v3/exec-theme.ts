'use client'

/**
 * Ejecutor V3 (E2.1) — resolución del acento. DARK-ONLY (única superficie dark-only del app;
 * no depende del tema claro/oscuro del sistema).
 *
 * Lee `data-executor-theme` (lo expone el layout /c desde Ola 0) y setea los tokens
 * `--exec-brand` / `--exec-recovery` / `--exec-celebration` en el wrapper del ejecutor:
 *   - coach → color primario white-label del subtree /c (`var(--theme-primary)`).
 *   - eva   → tema multicolor EVA: Sport para acciones/CTA.
 * Recovery (Aqua, movilidad/roller · Ola 3) y celebración (Ember · Ola 4) son fijas EVA en
 * ambos temas: acentos de sistema, nunca re-teñidos por la marca del coach.
 */

export type ExecutorTheme = 'coach' | 'eva'

// Paleta EVA fija.
export const EVA_SPORT = '#2680FF' // acciones / CTA
export const EVA_AQUA = '#18ABD4' // recovery (Ola 3)
export const EVA_EMBER = '#FF6A3D' // celebración (Ola 4)

/** Resuelve el tema del ejecutor subiendo por el DOM hasta el wrapper /c (`data-executor-theme`). */
export function readExecutorTheme(el: Element | null): ExecutorTheme {
    const host = el?.closest<HTMLElement>('[data-executor-theme]')
    return host?.dataset.executorTheme === 'eva' ? 'eva' : 'coach'
}

/**
 * Setea las variables de acento del ejecutor en `el`. Sólo `--exec-brand` cambia por tema;
 * recovery/celebration son fijas EVA. El fallback de coach mantiene el hook white-label
 * (`--theme-primary` gana; Sport si el subtree no lo definió).
 */
export function applyExecThemeVars(el: HTMLElement | null, theme: ExecutorTheme): void {
    if (!el) return
    const brand = theme === 'eva' ? EVA_SPORT : `var(--theme-primary, ${EVA_SPORT})`
    el.style.setProperty('--exec-brand', brand)
    el.style.setProperty('--exec-recovery', EVA_AQUA)
    el.style.setProperty('--exec-celebration', EVA_EMBER)
}
