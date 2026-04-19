# Concept A — "KINETIC OBSIDIAN" · Alpha Preview

> Rama: `feature/redesign-concept-a`
> Entregable: **alpha visible** (lo que ve coach / alumno / visitante). El resto queda como backlog al final de este documento para una próxima sesión.

---

## 1 · Dirección de Arte y Branding

**Metáfora central:** *Sala de edición cinematográfica.* Cada pantalla es una escena con iluminación puntual; la app respira "after-dark studio", no "dashboard SaaS".

### Decisiones tomadas

| Decisión | Justificación |
|---|---|
| **Dark exclusivo** (`#05070A` obsidiana azulada) | Light mode no existe en Concept A. La marca se presenta como **producto premium nocturno**; el logo EVA (silueta humana blanca) resalta sin fricción sobre fondos oscuros. |
| **Tipografía:** Montserrat display + Inter body + Geist Mono data | Display Montserrat con tracking negativo agresivo (`-0.03em`) da autoridad; Mono para toda numerología da sensación de instrumentación. |
| **Material language:** Glassmorphism 3ra-gen | `backdrop-filter: blur(24px) saturate(180%)` + bordes con `mask-composite` (stroke luminoso) + grano SVG overlay 4%. No es "frosted glass" básico: es cristal tallado con reflejo direccional. |
| **Logo EVA como watermark pulsante** | La silueta aparece como marca de agua 900px de ancho con `animation: halo-drift 18s`, opacity 4–6% y halo blurred teñido de `--theme-primary`. Es el "norte cinematográfico" en dashboards vacíos y auth. |
| **Grain global** | `noise-overlay` con `mix-blend-mode: overlay` al 4% en todos los layouts → textura film sin costar performance. |
| **Ambient mesh gradient** | Mesh radial sutil con 3 capas: coach-color + violet + cyan. Da profundidad atmosférica sin saturar. |

### Por qué no Light Mode

El target B2B (coaches) y B2C (alumnos serios) son power users que viven en la app. El modo oscuro reduce fatiga visual en sesiones largas (Builder, Workout Execution) y confiere al SaaS el prestigio de herramientas como Linear / Arc / Figma Dark. Además, el logo blanco es **nativamente compatible**: sobre oscuro se lee como firma luminosa sin wrappers.

---

## 2 · Estrategia White-label (Concepto A)

**Filosofía: "Firma de energía"** — el color personalizado del coach **nunca toca superficies grandes**. Aparece SOLO como acento vibrante en elementos que transmiten acción o progreso. Esto garantiza que cualquier color del coach (`#FFEB3B` amarillo neón, `#E91E63` magenta, `#212121` carbón) se integra sin romper la estética obsidian.

### Aplicación concreta (implementada)

| Superficie | Cómo aparece `--theme-primary` |
|---|---|
| **Coach Sidebar** | Barra vertical 2px en ítem activo + glow drop-shadow en icono activo (`kinetic-bar` utility). |
| **Logo EVA halo** | El halo radial detrás del logo usa `rgba(var(--theme-primary-rgb), 0.35)`. |
| **DragOverlay del Builder** | Al arrastrar un ejercicio, aplicamos `kinetic-glow-strong` (ring + inner shadow tintado). |
| **Auth card** | Glass-strong con acento en foco de inputs (inherited via token). |
| **Ambient mesh** | Capa radial top-left al 8% de saturación. |
| **Scrollbars** | Thumb hover → tint del primary. |

### Qué NO toca

- Backgrounds (obsidiana pura).
- Sidebars (glass neutro).
- Cards (glass con borde blanco sutil).
- Chart fills (paleta neutra + accent).
- Tipografía de cuerpo.

### Contrato preservado

Se mantiene intacta la inyección vía `<style>` en [src/app/coach/layout.tsx](src/app/coach/layout.tsx) y [src/app/c/[coach_slug]/layout.tsx](src/app/c/[coach_slug]/layout.tsx) → las CSS vars `--theme-primary` y `--theme-primary-rgb` se propagan a todos los utilities `kinetic-*` y `glass-card::before`.

---

## 3 · Qué se implementó en este alpha (visible)

### 3.1 Design System (globals.css)

- Paleta Obsidian completa: `--obs-base`, `--obs-raised`, `--obs-elevated`, `--obs-text*`.
- Tokens shadcn remapeados → Obsidian (`--card`, `--popover`, `--muted`, `--accent`, `--sidebar*`).
- Utilities nuevas: `.glass`, `.glass-strong`, `.glass-card` (con gradient stroke via mask compositing), `.kinetic-glow`, `.kinetic-glow-strong`, `.kinetic-ring`, `.kinetic-bar`, `.kinetic-accent`, `.ambient-mesh`, `.noise-overlay`, `.display-hero`.
- Keyframes nuevos: `kinetic-pulse`, `halo-drift`, `shockwave`, más los existentes refinados.
- Fallbacks: `@media (prefers-reduced-transparency: reduce)` desactiva blur → fondo sólido. `@media (prefers-reduced-motion)` detiene animaciones.
- Scrollbar obsidian custom.

### 3.2 FX Components ([src/components/fx/](src/components/fx/))

- `NoiseOverlay.tsx` — grano global (montado una vez en cada layout).
- `KineticHalo.tsx` / `KineticHaloInline` — silueta EVA con halo pulsante.
- `AmbientMesh.tsx` — mesh gradient fijo.
- `GlowRing.tsx` — anillo reutilizable con `--theme-primary-rgb`.

### 3.3 Shells

- **Coach shell** ([src/app/coach/layout.tsx](src/app/coach/layout.tsx)): adopta `bg-[var(--obs-base)]`, monta `<AmbientMesh>` + `<NoiseOverlay>`.
- **CoachSidebar** ([src/components/coach/CoachSidebar.tsx](src/components/coach/CoachSidebar.tsx)): **reescrito** — dock flotante `rgba(11,15,20,0.78)` + blur-2xl, colapsable a 72px / expandido 272px. Ítem activo: barra vertical kinetic-bar 2px + drop-shadow con `--theme-primary-rgb`. Tipografía uppercase tracking-[0.15em].
- **Client shell** ([src/app/c/[coach_slug]/layout.tsx](src/app/c/[coach_slug]/layout.tsx)): adopta obsidian base + FX layers. `ClientNav` inherita tokens (no rewrite todavía — backlog).
- **Auth shell** ([src/app/(auth)/layout.tsx](src/app/(auth)/layout.tsx)): **reescrito** — card glass-strong flotante + KineticHalo detrás.

### 3.4 Builder (priority showcase)

- **ExerciseBlock** ([src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx](src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx)): migrado a `glass-card` con border-l `3px` del muscle-color. Drag state → `kinetic-glow-strong scale-[1.03]`. Drag pending → `kinetic-glow`. Muscle color como inner-shadow sutil (`inset 3px 0`).
- DayColumn, DraggableCatalog, BlockEditSheet → heredan tokens automáticamente (cards glass, chips con accent).

### 3.5 Páginas que heredan tokens automáticamente

Por cambio de tokens `--card` / `--popover` / `--border` / `--muted` / `--sidebar*` en `globals.css`:
- Coach Dashboard, Listado Clientes, Exercise Catalog, Nutrition Hub, Settings, Subscription.
- Client Dashboard, Nutrition view, Exercises view, Check-in.
- Auth forms (login/register/forgot).

> Todos estos espacios se ven obsidian automáticamente, con glass y kinetic en los componentes shadcn (Card, Button, Input, etc.) vía las CSS vars.

---

## 4 · Diagramas ASCII de las superficies emblemáticas

### Coach Sidebar (desktop, expandido)

```
┌─────────────────────────┐
│ ◈ EVA                   │  ← display font, tracking [0.3em]
│   FITCOACH STUDIO       │  ← brand coach uppercase
├─────────────────────────┤
│                         │
│ ▌ ⚡ DASHBOARD          │  ← kinetic-bar 2px + glow icon
│   ◯ ALUMNOS             │
│   ◯ PROGRAMAS           │
│   ◯ EJERCICIOS          │
│   ◯ NUTRICIÓN           │
│   ◯ MI MARCA            │
│   ◯ SUSCRIPCIÓN         │
│                         │
├─────────────────────────┤
│ TERMINAL                │
│ Juan Villegas           │
│ [☀/🌙]                  │
│                         │
│ → DESCONECTAR           │
└─────────────────────────┘
   ↑ glass-strong, blur-2xl
   ↑ border-right obsidian
```

### Auth Card (login)

```
     ◀─── halo-drift (EVA watermark, 900px, 5%)
                  ↓
  ┌──────────────────────────────────┐
  │   [glass-strong, blur-32px]      │
  │                                  │
  │   INICIA SESIÓN                  │  ← display font
  │   Accede a tu cuenta             │
  │                                  │
  │   ┌──────────────────────┐       │
  │   │ Email                │       │  ← input glass subtle
  │   └──────────────────────┘       │
  │   ┌──────────────────────┐       │
  │   │ Contraseña           │       │
  │   └──────────────────────┘       │
  │                                  │
  │   [  ENTRAR  ]                   │  ← button kinetic-glow (único CTA)
  │                                  │
  │   ¿Olvidaste tu contraseña?      │
  └──────────────────────────────────┘
          ambient-mesh + noise overlay
```

### Builder (ExerciseBlock — glass card with kinetic drag)

```
idle:
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ ⁝ [gif] PRESS BANCA                │
│      ▢ 4 × 8-12   ⏱90s  #PECTORAL  │
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ↑ border-l 3px (muscle color)
  ↑ glass-card (gradient stroke)

dragging:
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ ⁝ [gif] PRESS BANCA                │ ← scale 1.03
│      ▢ 4 × 8-12   ⏱90s  #PECTORAL  │
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ↑↑ kinetic-glow-strong (ring + inner + outer glow)
  ↑↑ border-l kinetic-accent (usa --theme-primary)
  + noise grain visible en capa superior
```

---

## 5 · Core de Animaciones (implementadas)

| Dónde | Qué | Timing |
|---|---|---|
| Logo halo global (KineticHalo) | `animate-halo-drift` — drift + blur oscillation | 18s ease-in-out infinite |
| ExerciseBlock drag | `kinetic-glow-strong` + `scale-[1.03]` | Transition 300ms |
| Sidebar collapse | Width transition `[width,transform]` | 300ms |
| Glass card hover | `bg-white/[0.05]` + border tint | 300ms |
| Scrollbar hover | Tint `--theme-primary-rgb` | 220ms |
| Section drop zone hover | (existing) border + bg accent | Inherited |

### Animaciones disponibles (utilities, aún sin aplicar en todas las superficies del alpha)

- `animate-shockwave` — para drop success del Builder (backlog).
- `animate-halo-drift` — podría aplicarse a héroes secundarios (backlog).
- `animate-glow` (= `kinetic-pulse`) — para indicadores live (backlog).

---

## 6 · Backlog para próximas sesiones (diferido intencionalmente)

Estas superficies NO se rediseñaron en el alpha porque no forman parte del "visible primario" (lo que ve coach/alumno/landing en primer contacto) o requieren trabajo quirúrgico pesado. Heredan los tokens obsidian automáticamente así que **no lucen rotas**, pero merecen atención futura.

### Alto impacto pendiente
- [ ] **Landing `/` + `/pricing`**: aplicar KineticHalo en hero, mesh gradient por sección, tipografía display hero 120px+, scroll-driven camera con `useScroll`+`transform perspective` sobre el DashboardMockup.
- [ ] **Coach Dashboard** (`/coach/dashboard`): bento grid asimétrico, número hero del día (alumnos activos) en 120px Mono, MiniSparkline con `kinetic-bar`, layoutId entre ClientCardV2 y detalle.
- [ ] **Client Dashboard** (`/c/[slug]/dashboard`): "mission briefing" hero del próximo entreno con backdrop blur del músculo objetivo.
- [ ] **Workout Execution** (`/c/[slug]/workout/[planId]`): fondo obsidiana pleno, timer central 200px Mono, RPE slider custom track glow `--theme-primary`, cross-fade + scale entre ejercicios.
- [ ] **ClientNav**: rewrite en paridad con CoachSidebar (dock glass mobile con isla dinámica).

### Builder — profundizar el showcase
- [ ] **HorizontalTimeline**: scroll-snap horizontal con días como viñetas.
- [ ] **CommandDock**: catálogo lateral retráctil con ⌘K search overlay.
- [ ] **KineticDragOverlay**: overlay custom del DragOverlay de @dnd-kit con trail de 3 ghosts estroboscópicos y rotate idle.
- [ ] **layoutId shared**: entre card del catálogo y ExerciseBlock para "vuelo físico" con spring `{stiffness:380, damping:30, mass:0.6}`.
- [ ] **Drop shockwave**: activar `animate-shockwave` al soltar un ejercicio.
- [ ] **MuscleBalance HUD orb**: colapsar MuscleBalancePanel a orb flotante bottom-right; click expande.
- [ ] **ProgramPhasesBar**: phases con tape-label + line conectora usando `--theme-primary`.

### Funcional / pages de menor impacto visual
- [ ] Settings / Branding page (reaprovechar card glass-strong).
- [ ] Subscription / Pricing interna coach.
- [ ] Onboarding multi-step alumno.
- [ ] Legal / Privacidad.
- [ ] Exercise Catalog (data table upgrade).
- [ ] Nutrition Builder (aplicar mismo pattern que Builder).
- [ ] Check-in upload UI.
- [ ] Client detail (`/coach/clients/[id]`) con VisualEvolution hero.

### Micro
- [ ] Toast (sonner) con glass-strong background.
- [ ] Skeleton shimmer con gradiente obsidian + `--theme-primary-rgb`.
- [ ] Confetti palette tint con primary del coach.

---

## 7 · Cómo ver el preview

```bash
git checkout feature/redesign-concept-a
bun install   # (no nuevas deps)
bun dev
```

Navegar:
- `/` — Landing (hereda tokens, halo aún no aplicado)
- `/login` — Auth shell full Concept A
- `/coach/dashboard` — Coach shell con CoachSidebar obsidian + content token-inherited
- `/coach/builder/<clientId>` — Builder con ExerciseBlocks glass-card + kinetic drag
- `/c/<slug>/dashboard` — Client shell con tokens aplicados

### Pruebas de white-label
Cambia `coach.use_brand_colors_coach = true` y `primary_color` a colores extremos:
- `#FFEB3B` (amarillo neón) → aparece solo como glow sutil, no rompe.
- `#E91E63` (magenta) → acento en drag + halo + barra activa.
- `#212121` (negro) → fallback elegante (el glow apenas se nota, la UI sigue siendo navegable).

---

## 8 · Lógica funcional — intacta

Cero cambios en:
- `usePlanBuilder` reducer + types
- Server actions `saveWorkoutProgramAction`, `getExerciseHistoryAction`, `syncProgramFromTemplateAction`
- DnD-Kit lógica (DndContext, sensors, collisionDetection)
- Supabase queries, middleware white-label, auth flows
- Brand assets, muscle colors canónicos

El rediseño es **puramente presentacional**.
