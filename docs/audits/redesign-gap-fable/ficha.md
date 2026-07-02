# Auditoría de fidelidad visual — FICHA DE ALUMNO (coach) · 2026-07-01

Fuentes: kit mobile `docs/design-source/ui_kits/eva-app/screens/coach-ficha*.jsx` (+ `shared.jsx`, `components/core/Avatar.jsx`, tokens `docs/design-source/tokens/base.css`) · kit desktop `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` + `index.html` (.dt-md).
App: `apps/web/src/app/coach/clients/**`.

**Nota de fuente de verdad desktop:** `DESKTOP-OPT-PLAN.md` §Ola 3 confirma que la ficha desktop nativa (`DesktopFicha`, desktop-coach.jsx:956-1037) fue **revertida**: el diseño canónico desktop es el **master-detalle** (`DesktopRoster`, desktop-coach.jsx:23-84 + CSS `.dt-md` index.html:224-253) con el `ClientProfile` móvil reutilizado en el panel derecho. La app implementa exactamente ese patrón (`CoachRosterMasterDetail` + `CoachFichaPanel`). El `DesktopFicha` NO se audita como ground truth.

**Decisiones CEO verificadas (NO son gaps):** Facturación fuera del tab-switch (docs/audits/ficha-alumno/03-plan-rework-ficha.md:150 — D-CEO-1, "Se conservan las 5 pestañas… BillingTabB8 se archiva"); badge único de estado fusionado (§5.1); composición corporal fusionada en Progreso gateada bodycomp; desktop 2-col vía `@container/ficha` en standalone ancho (commit 4649be5a); eliminación del "Panel unificado de 7 gráficas" (§5.3 — cada chart vuelve a su tab); widget de Hábitos diarios y MetricInfo = riqueza extra intencional.

---

## [P1] SectionTitle de la ficha: 3 tipografías distintas, 4 de 5 tabs no matchean el kit

- **Kit:** `eva-app/screens/shared.jsx:61-68` — UN solo `SectionTitle` para toda la ficha: **font-display (Archivo) 800 · 17px · letter-spacing -0.02em · var(--text-strong)**, con action-link opcional sport-700. Lo usan Resumen, Progreso, Entreno, Programa y Nutrición del kit por igual.
- **App:**
  - `[clientId]/ProgressBodyCompositionB6.tsx:64-73` — ✅ lo implementa correcto (comentario "diseño nuevo: font-display 800 · 17px").
  - `[clientId]/ProfileOverviewB3.tsx:120-133`, `TrainingTabB4Panels.tsx:48-52`, `NutritionTabB5.tsx:169-182`, `ProfileCheckInSnapshot.tsx:123`, `TrainingStrengthCards.tsx:202`, `ClientProfileDashboard.tsx:389,417` — eyebrow legacy `text-xs font-black uppercase tracking-widest text-sport-600`.
  - `[clientId]/ProgramTabB7.tsx:86-99` — tercera variante: 11px uppercase `text-muted`.
- **Diferencia visual:** en el kit cada sección abre con un heading display grande y oscuro (jerarquía fuerte); en la app 4 de 5 tabs abren con una etiquetita uppercase de 11-12px (verde sport o gris), y Progreso con el heading correcto → jerarquía inconsistente dentro de la MISMA página al cambiar de pestaña.
- **Fix:** extraer el `SectionTitle` de ProgressBodyCompositionB6 a un compartido de la ficha y reemplazar las 3 variantes (Overview/Training/Nutrition/Program/CheckInSnapshot/StrengthCards/Dashboard inline h3).
- **Verdict:** CONFIRMED — verificado contra código: shared.jsx:61-68 es el ÚNICO `SectionTitle` del kit (grep: 0 overrides locales; lo usan coach-ficha ×7, -progress ×6, -training ×4, -program ×2, -nutrition ×12); las 3 variantes app existen tal cual en todas las líneas citadas (ProgressB6:64-73 correcto display 17px; eyebrow sport-600 en OverviewB3:128, TrainingB4:50, NutritionB5:181 CardHeading, CheckInSnapshot:123, StrengthCards:202, Dashboard:389/417; ProgramB7:86-101 11px uppercase TXT_MUTED). No hay breakpoint/utility que lo mitigue — clases estáticas. Diferencia real y visible al cambiar de tab. P1 justo.

## [P1] Zona C de Nutrición sin re-skin EVA DS (shadcn legacy + paleta raw + GlassCard)

- **Kit:** `eva-app/screens/coach-ficha-nutrition.jsx:195-360` — "Alertas y contexto", "Contexto de check-in", "Restricciones y alergias", "Conversación · hoy", "Umbrales de micros", "Nota privada del coach", "Ciclo de dieta", "Hábitos del día" son **Cards DS estándar** (surface-card, radius-card, SectionTitle, tonos semánticos danger/warning/success).
- **App** (componentes montados dentro de `NutritionTabB5`):
  - `ClientFoodRestrictionsCard.tsx:40-41,155,166-296` — `rounded-2xl border-border bg-card`, chips `border-amber-300 bg-amber-50 text-amber-700`, inputs `rounded-xl`, `bg-muted/40`.
  - `NutritionCycleHistorySection.tsx:179-244` — `border-border/40`, `bg-muted/20`, `text-amber-600`, `rounded-lg/xl`.
  - `CoachNutrientTargetsEditor.tsx:199-231` — `text-primary` header, `bg-secondary/15`, `bg-emerald-500/10 text-emerald-600`.
  - `CoachPrivateNotesPanel.tsx:69-77` — card entera tintada `border-amber-500/25 bg-amber-500/[0.02]` + header amber.
  - `_nutrition-tab/presentationals.tsx:75-142` — **`GlassCard`** (glassmorphism del diseño viejo), `bg-primary/10`, `bg-emerald-500/35`, `bg-amber-500/35`.
  - También `NutritionCoachAlertsPanel.tsx`, `NutritionCheckinContextCard.tsx` (mismos patrones).
- **Diferencia visual:** las vars shadcn están remapeadas a tokens EVA (globals.css:208-297: `--card→surface-card`, `--muted-foreground→text-muted`, `--border→border-subtle`), así que parte del daño está mitigado; pero los **amber-*/emerald-* raw de Tailwind NO pasan por los tonos semánticos** (warning/success de EVA), los radios `rounded-lg/xl/2xl` (8/12/16px) no son `radius-control/card` (14/20px), y `GlassCard` es directamente el lenguaje visual anterior → la mitad inferior de la pestaña Nutrición se ve de otra generación que el resto de la ficha rediseñada.
- **Fix:** migrar estos 7 componentes a `Card` DS + tonos `var(--warning-*)/var(--success-*)` + `rounded-control/card`; matar `GlassCard` en presentationals.
- **Verdict:** CONFIRMED — verificado: los 7 componentes están montados en zona C de NutritionTabB5 (líneas 1010-1047, misma zona que el kit coach-ficha-nutrition.jsx:194-359 resuelve con Cards DS + tonos semánticos); `GlassCard` real (`components/ui/glass-card.tsx`: bg-white/70 + backdrop-blur-xl + glow blur-3xl = lenguaje pre-rediseño, importado en presentationals.tsx:13 y usado en DetailAccordion:142); paleta raw confirmada (rose/amber/zinc chips FoodRestrictions:35-46, amber-600 CycleHistory:219, emerald/rose NutrientTargets:230-231, card amber entera PrivateNotes:69-77, emerald/amber/rose-500/35 HeatmapCell:79-82) — amber-500 #F59E0B ≠ warning-500 #F5A524, emerald-500 #10B981 ≠ success-500 #1FB877, y NO pasan por el remap shadcn (que sí mitiga --card/--muted/--border, correcto lo dicho en el finding); radios 8/12/16 vs radius-control/card 14/20 confirmados (globals.css:130-131). P1 justo: zona entera de un tab en el lenguaje anterior.

## [P1] Modales de la ficha con el Dialog legacy (glass iOS-blue) en vez del bottom-sheet del kit

- **Kit:** `coach-ficha.jsx:379-396` (Editar biometría) y `:502-525` (Nuevo pago) — **bottom-sheet**: overlay `surface-overlay`, panel `surface-card` con `borderRadius: 20px 20px 0 0`, drag-handle de 36×4, botones secundario+sport fullWidth.
- **App:** `ProfileOverviewB3.tsx:591-724` (BiometricsEditDialog) y `ProfileCheckInSnapshot.tsx` (detalle de check-in) usan el `Dialog` compartido `components/ui/dialog.tsx:56-71`: modal **centrado** `rounded-2xl bg-popover` + `zoom-in-95`, con `dark:bg-black/40 backdrop-blur-2xl` y overlay de gradiente radial `rgba(0,122,255,0.05)` — glassmorphism + azul iOS del sistema PRE-rediseño.
- **Diferencia visual:** en <760 el kit desliza una sheet desde abajo con la card DS; la app hace zoom de un modal vidrioso con acento azul legacy. El contenido interno del form (labels uppercase, radiogroup sexo, tokens) sí está bien tokenizado.
- **Fix:** en móvil renderizar estos editores con el patrón Sheet `side=bottom` (ya usado por `ProgramTabB7` vía `useSheetSide`) o re-skinear `dialog.tsx` a DS (surface-card, border-subtle, sin gradiente azul). Ojo: `dialog.tsx` es compartido multi-feature — coordinar el re-skin global.
- **Verdict:** CONFIRMED — verificado: kit coach-ficha.jsx:379-396 es bottom-sheet (align flex-end, radius 20/20/0/0, drag-handle 36×4) y ambos call sites app usan el Dialog centrado zoom-in (BiometricsEditDialog ProfileOverviewB3:591-603, check-in detail ProfileCheckInSnapshot:132-162 → dialog.tsx:53-61). Matiz que NO refuta pero acota: el "azul iOS" hardcodeado `rgba(0,122,255,0.05)` solo sobrevive en el radial de DARK mode; en light el gradiente usa `from-primary/[0.07]` y `--primary` ya está remapeado a sport-500 (globals.css:218,260), y bg-popover/border → surface-card/border-subtle. El glassmorphism (`dark:bg-black/40 backdrop-blur-2xl`) y el patrón centrado-zoom vs sheet-desde-abajo son reales en ambos modos; useSheetSide existe en ProgramTabB7:70-84 (fix viable). P1 se sostiene por el quiebre de patrón de presentación + dark glass, no por el azul en light.

## [P2] Avatar del hero: cuadrado con 1 inicial vs Avatar DS circular con ring de estado

- **Kit:** `coach-ficha.jsx:100` — `<Avatar name size="lg" ring={s.ring||'sport'}/>`; el DS Avatar (`components/core/Avatar.jsx:6-63`) = **círculo** 56px, ring de estado de 2px, fondo `surface-inverse`, **2 iniciales** en `sport-400` font-display 800.
- **App:** `ClientProfileHero.tsx:204-208` — caja **cuadrada** `rounded-2xl` 64/80px, `bg-white/[0.07] border-inverse`, **1 sola inicial** blanca.
- **Diferencia visual:** forma, ring de estado ausente y color de iniciales distintos. Inconsistencia interna además: el rail del master-detail (`CoachRosterMasterDetail.tsx:233-248`) SÍ replica el Avatar DS verbatim (círculo + ring + iniciales).
- **Fix:** usar el mismo patrón de avatar circular con ring (nivel de estado como color) e `initialsOf` en el hero.

## [P2] Tab bar pegajosa sin estado "stuck" (elevación al scrollear)

- **Kit:** `coach-ficha.jsx:14-26,139` — sentinel + IntersectionObserver: al pegarse, la barra pasa de `border-subtle` a `border-default` + `box-shadow: 0 6px 16px -10px` con transición.
- **App:** `ProfileTabNav.tsx:60-67` — sticky + blur + `border-b border-subtle` fijos; no hay cambio de borde/sombra al pegarse.
- **Diferencia visual:** menor — falta el feedback de elevación que separa la barra del contenido al scrollear. Blur, pills, badges y sticky sí son 1:1.
- **Fix:** replicar el sentinel (1px) + toggle de clase `shadow`/`border-default` cuando no interseca.

## [P2] Chrome del standalone `/coach/clients/[clientId]`: fila "Directorio de Unidades" pre-rediseño + Exportar PDF duplicado

- **Kit:** `coach-ficha.jsx:90-95` — TopBar con back-chevron + nombre + subtitle y 2 icon-buttons (file-down / more). Vocabulario del rediseño: "Alumnos".
- **App:** `[clientId]/page.tsx:23-39` — fila superior con link `text-[10px] uppercase tracking-[0.3em]` "**Directorio de Unidades**" + link texto "Exportar PDF" (→ progress-print), encima del hero que YA trae los icon-buttons Exportar (window.print) y Más.
- **Diferencia visual:** tracking-[0.3em] y el léxico "Unidades" son del diseño anterior; Exportar PDF aparece 2 veces con 2 estilos y 2 destinos distintos. En el master-detail desktop este chrome no existe (correcto).
- **Fix:** back tipo TopBar del kit con label "Alumnos"; dejar UNA sola acción de exportar (decidir print vs progress-print) en el hero.

---

## Verificado 1:1 (matchea el kit)

- **Hero inverso** (`ClientProfileHero`): Card inverse + badges + email + racha/actividad + 4 chips 2×2 (Peso con delta tonal, Adherencia con barra sport, Workouts, Comidas hoy con % plan) — layout, tamaños (10/16px, barra 4px pill) y tonos 1:1; eyebrow "{PROGRAMA} · Semana N" + acciones icon-button 1:1 con el TopBar del kit.
- **Badge único de estado** con motivos (D-CEO-2) y tab-switch de 5 pestañas sin Facturación (D-CEO-1) = decisiones documentadas.
- **Tab pills**: h-38, radius pill, border 1.5px, activo sport-500 sólido, badges 18px (danger '!' incluido), sticky + blur `color-mix 80%` + fade/hint de swipe — 1:1.
- **Top-alert** (`ProfileTopAlertBanner`): border-left 3px tone-500 + fondo tone-100 + texto tone-700 + ícono tone-600 — 1:1 con coach-ficha.jsx:167-172; cascada `getProfileTopAlert` espejo del kit.
- **Resumen** (`ProfileOverviewB3`): rings de cumplimiento (76→84px, stroke 8, colores por umbral, delta "↑ N pts") · 5 KPIs icon-tile 36px tone-100/tone-600 + valor display · card Programa (fases bar, Semana X de Y, barra 7px, señal nutrición danger/success-100, próximo entreno sport-100) · Métricas clave (peso 22px + variación tonal + botón editar biometría) · Último check-in (fecha relativa, Marcar revisado, estrellas ember, link a Progreso) · Evolución visual (grid 3 aspect-3/4, fechas overlay) · Módulos (3 tiles icon+label gateados) · CTA "Editar plan" sport lg full-width. Orden de secciones = kit.
- **Barra de acción flotante** (`ProfileFloatingActions`): WhatsApp #25D366 con glifo idéntico + clipboard + dumbbell 50/44px radius-control shadow-md, sticky bottom, `pointer-events` patrón del kit, encogimiento hide-on-scroll (38px, thresholds 36/8px, ease-spring) — transcripción 1:1.
- **Progreso** (`ProgressBodyCompositionB6`): Peso·tendencia (curva + línea objetivo punteada success + dots clickeables) + statboxes Inicial/Cambio total/Ritmo 30d/Proyección 4 sem/Energía media + editor de peso objetivo + IMC con escala de gradiente + gauge Energía 7d + Comparativa de fotos + Historial de check-ins — estructura del kit completa; composición corporal fusionada = intencional.
- **Master-detail desktop** (`CoachRosterMasterDetail` vs `.dt-md`): rail 340→280→240px con breakpoints (1000/860 ≈ kit), header título display 18px + count pill + botones 30px (grid/plus primario cta-fill), search 36px sunken→card on focus, filas con Avatar DS ring + estado pill soft + adherencia `eva-mono` (danger <60%), activo `sport-100` + barra izquierda 3px sport-500, orden riesgo-primero, empty states — espejo fiel; panel derecho = ficha real (sin mocks) con fondo `surface-app` theme-aware.
- **Tokens**: Card DS (surface-card/inverse, radius-card 20, padding md 16 / lg 20), `font-display` en métricas (≈ `.eva-metric`), `eva-press`, danger/warning/success/ember/sport semánticos en todos los componentes principales de la ficha.

---

## Fix log wave 2 (2026-07-01)

Estado de partida: un intento previo (sin log) ya había extraído `_components/SectionTitle.tsx` y aplicado los 3 P1 en su mayoría. Esta wave completó lo faltante, corrigió remanentes y ejecutó los P2.

- **[P1] SectionTitle unificado** → FIXED. El intento previo ya importaba el `SectionTitle` compartido en Overview/Training/CheckInSnapshot/StrengthCards/Dashboard/Progress. Esta wave: consolidó la copia LOCAL de `ProgramTabB7.tsx` (era display 17px pero duplicada) → `import { SectionTitle } from './_components/SectionTitle'` (borré la función local, `TXT` sigue en uso). `NutritionTabB5.tsx` conserva su `SectionTitle`/`CardHeading` locales A PROPÓSITO: ya son display 17px/extrabold/text-strong 1:1, pero SIN margen (van dentro de una fila flex con badge+subtítulo en `ZoneHeader`; el margen del compartido las desalinearía). Verificado: 0 ocurrencias del eyebrow legacy `text-xs font-black uppercase tracking-widest text-sport-600` fuera de `BillingTabB8` (archivado, D-CEO-1).
- **[P1] Zona C Nutrición (7 componentes)** → FIXED (6 vivos) / SKIPPED (1 muerto).
  - `ClientFoodRestrictionsCard.tsx` — ya re-skineado por el intento previo (chips `var(--danger/warning-100/700)`, `rounded-card/control`, `bg-surface-sunken`). Sin cambios.
  - `NutritionCycleHistorySection.tsx` — el previo ya hizo amber→`var(--warning-600)` + display heading. Esta wave: `rounded-lg border-border/40` → `rounded-control border-subtle` en las filas de bloque.
  - `CoachNutrientTargetsEditor.tsx` — header `text-primary` uppercase → display heading text-strong; `rounded-xl border-border/40 bg-secondary/15` → `rounded-control border-subtle bg-surface-sunken`; badge Tope/Meta `bg-rose/emerald-500/10 text-rose/emerald-600` → `var(--warning-100)/var(--warning-700)` (cap) y `var(--success-100)/var(--success-700)` (aimup) + `rounded-control`.
  - `CoachPrivateNotesPanel.tsx` — quitado el tinte amber de la card entera (→ `Card p-5` DS); Lock + pill "Privada" → tokens `var(--warning-600/100/700)`; header → display heading; `border-border/40`+`rounded-lg bg-secondary/15` → `border-subtle`+`rounded-control bg-surface-sunken`.
  - `NutritionCoachAlertsPanel.tsx` — chips raw rose/amber/sky → patrón de alerta canónico DS (border-left 3px `tone-500` + fondo `tone-100` + texto `tone-700` + ícono `tone-600`, info=sport, espejo de `ProfileTopAlertBanner`); quitado el header interno redundante "Alertas del coach" (el `ZoneHeader` "C · Alertas y contexto" ya es el opener, como en el kit).
  - `NutritionCheckinContextCard.tsx` — header → display heading; íconos `sky-500`/`emerald-500/80` → `text-sport-600`/`var(--success-600)`; callout `border-amber-500/30 bg-amber-500/10 text-amber-950` → `rounded-control bg-[var(--warning-100)] text-[var(--warning-700)]`; `border-border/40` → `border-subtle` (×2).
  - `_nutrition-tab/presentationals.tsx` (GlassCard + raw palette) → SKIPPED. Es CÓDIGO MUERTO: el único import en toda `apps/web/src` es su propio `.test.tsx`; la Zona C viva usa las copias LOCALES de `NutritionTabB5.tsx` (`ZoneHeader`/`DetailAccordion`/`MACRO_COLORS`/heatmap), que ya están en DS correcto (`Card` DS, `bg-sport-100`, `var(--success/warning/danger-500)`). Re-skinearlo no tiene efecto visual y rompería su test unitario (asserta `MACRO_COLORS.cal`).
- **[P1] Modales bottom-sheet** → FIXED (por el intento previo, verificado). `BiometricsEditDialog` (`ProfileOverviewB3.tsx`) y detalle de check-in (`ProfileCheckInSnapshot.tsx`) ya usan `isDesktop ? <Dialog DS> : <Sheet side="bottom">` con drag-handle 36×4, `rounded-t-sheet`, `surface-card`, `border-subtle`, safe-areas (`useIsDesktopMd`). Sin cambios necesarios.
- **[P2] Avatar del hero** → FIXED. `ClientProfileHero.tsx`: caja cuadrada `rounded-2xl` con 1 inicial → Avatar DS circular (anillo de estado 2px por `STATUS_TONE[status.level]`, cara `surface-inverse`, 2 iniciales `sport-400` font-display 800 vía nuevo helper `initialsOf`), espejo verbatim del rail (`CoachRosterMasterDetail`).
- **[P2] Tab bar stuck** → FIXED. `ProfileTabNav.tsx`: listener de scroll (capture) que compara `getBoundingClientRect().top` contra el `top` sticky resuelto (`getComputedStyle`, cubre var mobile + `md:top-0` desktop) → toggle `border-default` + `shadow-[0_6px_16px_-10px_rgba(0,0,0,0.28)]` con transición. Autocontenido en el componente (sin sentinel — evita el conflicto con el `space-y-6` del padre).
- **[P2] Standalone page** → FIXED. `page.tsx`: "Directorio de Unidades" + `tracking-[0.3em]` → "Alumnos" + `tracking-widest`; eliminado el link "Exportar PDF" duplicado (el hero ya trae `window.print` 1:1 con el TopBar del kit; el master-detail ya omite este chrome; la ruta `/progress-print` sigue existiendo). Import `FileDown` removido.

Fuera de alcance no tocado: `BillingTabB8.tsx` (archivado D-CEO-1), `profileBodyCompositionUtils.ts:90-92` (helper de color de energía del tab Progreso, verificado 1:1, no citado), `bodycomp/_components/*` (wave 1).
