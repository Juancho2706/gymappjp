# Concept C — NEO-BRUTALIST SPATIAL (alpha placeholder)

**Branch:** `feature/redesign-concept-c`
**Theme:** Infinito espacial brutal / Figma-mapa-mental
**Mode:** Dark absoluto (`#000000` puro) + acentos alto contraste

> Este branch es un **alpha placeholder**: documenta la dirección visual completa y marca lo que se implementará en la siguiente sesión. Los tokens y shells no están aún sobre master — lee este doc para entender el rumbo y compararlo contra Concept A (Kinetic Obsidian) y B (Luminous Paper) ya implementados.

## Art direction

Tablero infinito tipo Figma/Miro donde el coach es un arquitecto. Consolida el learning de `/preview2` SIGNAL pero escalado a TODA la app.

- **Tipografía:** `Space Grotesk Bold` condensado (display), `Druk` (números hero XXL), `JetBrains Mono` (data). Caps + tracking amplio en hero, body sans normal.
- **Material:** brutalismo digital — bordes duros 2px, **sin shadows**, tape-labels rotados -2deg, números monoespaciados XXL como declaración. Grilla 8px visible en estados de edición.
- **Logo EVA (blanco):** watermark gigante central `60vw`, drift 18s, opacity 6%. Funciona como "norte" del tablero.

## White-label strategy

**Filosofía: pigmento saturado en acción.** Paleta base estrictamente monocroma (negro/blanco/grises). El color del coach **SATURA por completo** toda acción:

- CTAs rellenos sólidos con `--theme-primary`
- Chips de sección activa rellenos
- Líneas de conexión SVG entre nodos día
- Hover rings 3px sólidos (cero blur)
- Bar charts y progress rellenos

**Fallback AA** (`useContrastGuard` hook): si `color-contrast(--theme-primary vs #000) < 4.5:1` → envuelve el elemento en container blanco `#FFF` (wrapper 2px padding). Garantiza que cualquier color-brand se integre contra lienzo neutro sin fragilidad estética.

## Layouts radicales por superficie

- **Coach Sidebar:** barra vertical 64px permanente, **tipografía rotada 90deg** en ítem activo, sin iconos — solo tipografía display.
- **Client Nav:** top bar con **marquee de status** (`ADHERENCIA 87% · PRÓXIMO: PIERNA · RACHA 12`).
- **Builder:** **canvas infinito pan/zoom** tipo Figma; días = nodos card conectados por SVG paths; doble-click zoom-in a vista detalle con `layoutId`; catálogo = command palette central (`Space` / `⌘K`); minimap bottom-right.
- **Coach Dashboard:** grid 12-col brutal, número hero 200px (alumnos activos), tabla editorial periódico, KPIs como tape-labels.
- **Client Dashboard:** "newspaper frontpage" — título del día en display 120px, columnas editorial.
- **Workout Execution:** contador masivo 300px, RPE dial brutal mecánico, transición jello entre ejercicios.
- **Landing:** scroll horizontal snap, secciones manifiesto con numeración romana, marquee live.
- **Auth:** un input a la vez, número de paso en Druk 144px, shake validation.

## Core animaciones

- `layoutId` zoom-morph: miniatura día ↔ expandida (Builder spatial)
- **Magnetic snap:** drag aplica attraction vector hacia slot más cercano (rAF + motion values)
- **Jello drop:** `scale:[1,0.9,1.05,1]` spring `{stiffness:500, damping:12}`
- **Pan/zoom Figma-like:** motion values `x,y,scale` con wheel delta easing exponencial
- **Command palette:** `initial={{scale:0.6, opacity:0, filter:'blur(12px)'}}` + shake horizontal
- **SVG `pathLength`** para conexiones entre nodos de programa
- **Marquee infinite:** `motion.div` translate para status bar

## Stack de implementación (pendiente)

- Tokens en `src/app/globals.css`: `--void: #000000`, `--chalk: #FFFFFF`, `--grid-line`, `--tape-*` (muscle colors como tape)
- UI overrides: Button (solid brutal 2px), Card (no-shadow hard border), Dialog (slam-in)
- `src/components/shell/BrutalistSidebar.tsx`, `BrutalistClientNav.tsx`
- `src/components/spatial/SpatialCanvas.tsx`, `CommandPalette.tsx`, `ProgramMinimap.tsx`
- Builder: `DayNode.tsx`, `TapeLabel.tsx`
- **Dep nueva (solo concept C):** `@use-gesture/react` para pan/zoom móvil robusto
- `hooks/useSpatialCanvas.ts`, `hooks/useContrastGuard.ts`

## Deferred backlog (siguiente sesión)

Todo el stack de implementación arriba. Este branch actualmente solo documenta la dirección — al retomar:

1. Rewrite `globals.css` con tokens brutalist (void/chalk/grid/tape)
2. Override primitives shadcn con hard-border variants
3. `BrutalistSidebar` + `BrutalistClientNav`
4. `SpatialCanvas` pan/zoom (Builder como showcase prioritario)
5. `CommandPalette` + `ProgramMinimap`
6. Coach Dashboard brutal con Druk 200px hero number
7. Client Dashboard frontpage layout
8. Workout Execution immersive con dial RPE mecánico
9. Landing scroll horizontal snap + marquee
10. Auth single-input flow con Druk step numbers

## Preview

```bash
git checkout feature/redesign-concept-c
# (pendiente implementación — ver backlog)
bun install && bun dev
```

## Comparativa rápida

| | **A Kinetic Obsidian** | **B Luminous Paper** | **C Neo-Brutalist Spatial** |
|---|---|---|---|
| Mode | Dark exclusivo | Light default + dark adaptive | Dark absoluto |
| Metáfora | Sala de edición cine | Moleskine editorial | Tablero Figma |
| White-label | Glow de acento (firma energía) | Tint ambiental 4% | Pigmento saturado en acción |
| Builder | Timeline horizontal + Command Dock | Scroll editorial vertical | Canvas infinito pan/zoom |
| Riesgo | Blur perf móvil low-end | Saturación en dark tint | Pan/zoom móvil complejo |
