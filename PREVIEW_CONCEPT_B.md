# Concept B — LUMINOUS PAPER (alpha)

**Branch:** `feature/redesign-concept-b`
**Theme:** Editorial premium / Moleskine del entrenador
**Mode:** Light default (`#FAFAF7` warm off-white) + dark adaptive (`#0E0F13`)

## Art direction

Papel premium tintado. Cada superficie es un artículo editorial: jerarquía tipográfica grande, hairlines en lugar de borders gruesos, sombras ultra suaves, drop caps y pull-quotes. Contrasta deliberadamente con el feel "after-dark" de la mayoría de apps fitness.

**Tipografía:** Geist / Inter Display para titulares, mono para datos, body sans regular. Caps pequeñas con tracking amplio para etiquetas editoriales.

**Logo EVA (blanco):** envuelto en **`.smoked-badge`** — círculo ahumado `bg-neutral-900` con grano, convierte el logo en joyería del producto sobre papel claro.

## White-label strategy

**Filosofía: tinte ambiental cromático.** El color del coach nunca satura superficies grandes — se infunde al 4% en el background mediante `color-mix(in oklch, var(--theme-primary) 4%, var(--paper))`. Aparece fuerte en:

- Underline 2px de phase tabs activas (`.editorial-underline`)
- Avatar ring, checkbox/toggle activos
- CTA único primario por pantalla
- Progress bars de adherencia

En dark mode: tint 6% sobre `#0E0F13` con `filter: saturate(0.8)` para evitar estridencia.

## Implementado en esta rama (alpha)

- [x] Design tokens completos en [src/app/globals.css](src/app/globals.css): `--paper`, `--paper-warm`, `--ink`, `--ink-muted`, `--hairline`
- [x] Background tinted con `--theme-primary` 4% vía `color-mix` oklch
- [x] Utilities: `.paper-card`, `.paper-elevated`, `.smoked-badge`, `.drop-cap`, `.pull-quote`, `.caption-micro`, `.editorial-underline`
- [x] Dark mode adaptativo
- [x] Shadcn primitives heredan nueva paleta vía tokens

## Deferred backlog (siguiente sesión)

Todo lo que el coach/alumno/landing visitor VE sigue funcionando con la nueva paleta por herencia de tokens, pero queda por refinar editorialmente:

- **Shells:** `PaperSidebar` (rail 240px estilo "chapters" con serif display en ítem activo), `PaperClientNav` (top sticky + bottom tab revista)
- **FX:** `PaperBadge` component (wrapper `.smoked-badge` para logo EVA en light)
- **Builder editorial:** scroll vertical con cada día = sección full-width 48px title + `Marginalia` para muscle balance + `CatalogDrawer` derecho (⌘E)
- **Coach Dashboard:** layout "portada de revista" — hero feature alumno destacado + sparklines + pull-quotes con insights
- **Client Dashboard:** "diario personal" — H1 editorial fecha + article preview del plan del día
- **Workout Execution:** libro de entrenamiento (número grande + flowing text + timer marginalia)
- **Landing:** editorial long-form (ToC sticky, drop caps, pull quotes)
- **Auth:** form diario (underline-only inputs, labels serif caps small)
- **Componentes tipográficos:** `DropCap.tsx`, `PullQuote.tsx`, `Marginalia.tsx`
- **Hook:** `useReadableForeground(coachColor)` → retorna black/white por luminancia (AA guarantee)
- **Animaciones:** `layoutId` chips↔cards warmup/cooldown, stagger editorial 60ms días + 30ms bloques, drag "levantarse del papel" scale 1.03 + rotate -1.5deg, page transitions horizontal slide tipo libro

## Preview

```bash
git checkout feature/redesign-concept-b
bun install && bun dev
# navegar: /coach/dashboard, /coach/builder/<clientId>, /c/<slug>/dashboard, /, /login
# toggle coach.use_brand_colors_coach para ver el tinte ambiental
```
