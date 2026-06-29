# Informe — Implementación del nuevo Design System de EVA (web + mobile)

**Fecha:** 2026-06-29
**Branch:** `feat/redesign-eva-design-system` (salido de `master`)
**Estado:** Solo informe. Cero código tocado. Ninguna decisión ejecutada todavía.
**Autor del análisis:** Claude (sesión CLI), a partir del proyecto Claude Design + mapeo del código actual.

---

## 0. TL;DR

El "diseño nuevo" no es una pantalla suelta: es un **design system EVA completo** (tokens + 13 componentes + 2 UI kits de ~55 pantallas) que vive en Claude Design y se entrega **nativo** vía el MCP `claude_design` — ya tengo acceso de lectura, no hace falta zip.

Implementarlo fiel en los dos frentes (web Next + mobile RN), coach + alumno, light/dark + white-label, es un trabajo **grande y multi-fase**. La buena noticia: la **infraestructura actual ya es casi compatible** — el motor white-label (`@eva/brand-kit`, OKLCH, compartido web+mobile) y la separación lógica/UI (reducers y engines 1:1) absorben el cambio sin reescribir negocio. El cambio es **de capa de presentación + tokens**, no de arquitectura.

Hay **4 tensiones arquitectónicas** que necesitan decisión tuya antes de empezar (sección 6). El resto es ejecución por fases (sección 5).

---

## 1. Qué es el diseño nuevo (lo que recibo)

### 1.1 Entrega — handoff nativo
- **Mecanismo:** panel "Send to local coding agent" de Claude Design → prompt que apunta al MCP `claude_design` (`https://api.anthropic.com/v1/design/mcp`, auth vía `/design-login`). En esta sesión equivale a mi herramienta `DesignSync`, **ya autenticada** (scope `user:design:read/write` agregado al login).
- **Proyecto fuente:** `d76cae7a-af93-4f35-8dc2-d96b5603e794` = **"EVA Design System MASTER OPT new alumno dash"** (el más reciente, tocado hoy 2026-06-29).
- **No necesito zip.** Leo el proyecto archivo por archivo por `projectId` (`list_files` / `get_file`). Fidelidad máxima: HTML/CSS/JSX literal, no conversión lossy.
- Hay otras 5 copias del proyecto (varias "Azul ACTUAL MASTER"). **Confirmar que `d76cae7a` es el canónico** (decisión D0).

### 1.2 Identidad visual
| Eje | Definición |
|-----|-----------|
| **Vibe** | Atlético, avanzado, enfocado. Herramienta de coach, no juguete consumer. |
| **Superficies** | UI "paper" clara por defecto; superficies hero **ink-950 oscuras** para énfasis. |
| **Color primario** | **Sport blue `#2680FF`** = único primario (entreno, acciones, estados activos). |
| **Nutrición** | **Ember orange `#FF6A3D`** = dominio nutrición (fijo, no white-label). |
| **Recovery** | **Aqua `#18ABD4`** = datos de recuperación (fijo). |
| **Tipografía** | **Archivo** (display/métricas, 800–900, tracking apretado) · **Hanken Grotesk** (UI/body) · **JetBrains Mono** (timers/data, figuras tabulares). |
| **Forma** | Redondeo iOS generoso: cards 20px, controles 14px, chips/badges pill. |
| **Iconos** | **Lucide**, stroke 2px, caps redondeados. Sin emoji. |
| **Copy** | Español, "tú" informal, sentence case; UPPERCASE solo en eyebrows (tracking 0.12em). |
| **Motion** | Quick & confident: ease-out 140–220ms; spring solo para celebraciones (anillos). Press scale 0.97. |

### 1.3 Tokens (fundación, CSS custom properties)
- **Ramps base:** `ink-950…50` + `paper`/`white`; `sport-100…700`; `ember-100…700`; `aqua-100…700`; status (`success/warning/danger/info`).
- **Aliases semánticos:** `--surface-{app,card,sunken,inverse,overlay}`, `--text-{strong,body,muted,subtle,on-sport,on-dark,...}`, `--border-{subtle,default,strong}`, `--action-primary`, `--cta-fill`, `--accent-{training,nutrition,recovery}`, `--track`, `--viz-1..6`, `--focus-ring`.
- **Dark mode:** `[data-theme="dark"]` que **solo flipea los aliases semánticos** (las ramps base quedan constantes → el white-label sigue funcionando en ambos temas).
- **White-label (del diseño):** rebrand = sobrescribir `--sport-100…700` (+ `--focus-ring`) en un scope; ember/aqua quedan fijos. Todo lo que referencia `var(--sport-*)` recolorea al instante.
- Escala de tipo (11→62px), espaciado (grid 4px, gutter 20px, touch ≥44px), radius (xs 6 → 2xl 36, pill, sheet 28), shadows (xs→xl cool-tinted + `--glow-sport`), motion (durations + easings). **Ya tengo los 9 archivos de tokens leídos y mapeados.**

### 1.4 Componentes (13)
- `core/`: **Button, IconButton, Badge, Avatar, Card, Tag**
- `data/`: **StatCard, ProgressRing, ProgressBar**
- `forms/`: **Input, SegmentedControl**
- `navigation/`: **ListRow, TabBar**
- Cada uno trae `.jsx` + `.d.ts` + `.prompt.md` (contrato de props) + showcase HTML. Namespace runtime: `window.EVADesignSystem_3f9831`.

### 1.5 UI kits (dos)
- **`ui_kits/eva-app/`** — app iOS mobile (= la versión responsive/PWA). ~24 pantallas coach+alumno con role switch:
  - Coach: CoachDashboard, StudentList, AlumnoHub, StudentDetail, WorkoutPlanner (constructor), ProgramasHome, ExerciseCatalog, NutricionHome, NutritionPlanCoach, Opciones, módulos (Cardio/Movimiento/Composición), Suscripción, TeamCoachDashboard, ModulosManage.
  - Alumno: StudentDashboard, Rutina (full-bleed, oculta chrome), PlanAlimenticio, Aprender, CheckIn, AlumnoMas, HistorialEntrenos.
  - `screens/` desglosa cada flujo (coach-auth, coach-builder(+extras), coach-dashboard(+sheets), coach-directory, coach-ficha(+nutrition/program/progress/training), coach-modules(+hub), coach-nutrition(+builder/extras), coach-programs, coach-settings, teams-equipo, alumno-auth/dashboard/nutricion/rutina, flow, shared).
- **`ui_kits/eva-desktop/`** — shell desktop (web responsive): `desktop-shell` (sidebar expand/rail + topbar con breadcrumb + búsqueda global + campana + cuenta), `desktop-coach`, `desktop-builder` (3 paneles), `index.html`, y `DESKTOP-OPT-PLAN.md`.
- **Regla transversal inquebrantable del diseño:** a **<760px el desktop debe quedar idéntico a la mobile app** (todo el chrome desktop está gated a `mode !== 'mobile'`). → **El responsive web a ancho móvil = la app RN.** Esto encaja con tu requisito "la version app rn mobile es igual al pwa/responsive".

### 1.6 IA / mapa de pantallas (provisto por el equipo EVA, dentro del diseño)
- **Coach** (~42 pantallas): Inicio · Alumnos (+Importar CSV, Perfil hub) · Programas (plantillas+constructor+catálogo+planificador) · Nutrición (plantillas+plan alumno+alimentos+grupos+recetas) · Opciones (Mi Marca, Suscripción/billing, Módulos, Funciones, eliminar) · Soporte · Equipo (si `coach_team`). Módulos de pago visibles solo si comprados; suscripción bloqueada → menú colapsa a "Reactivar".
- **Alumno** (~13 pantallas): Inicio (anillos adherencia) · Plan Alimenticio · Aprender · Check-in · Movimiento/Composición (read-only si módulo). Fuera de barra: Rutina, Historial, estados de acceso (crear contraseña, onboarding, pausado).
- **Dos modos:** standalone (coach individual, full) y Teams (coach en pool, feature set reducido, Marca/Suscripción/Módulos bloqueados). Enterprise (`/org`) y Admin (`/admin`) **fuera de scope** del diseño.

---

## 2. Estado actual — Web (`apps/web`, Next.js)

- **Tokens:** Tailwind v4 con `@theme inline` dentro de `src/app/globals.css` (sin `tailwind.config`). Tokens estilo shadcn (`--primary`, `--background`, `--card`, `--border`…), radius base `0.75rem` + multiplicadores, fuentes `--font-sans/display/mono`, colores de macros hardcoded (`--color-macro-*`).
- **Primario / branding:** `SYSTEM_PRIMARY_COLOR = #007AFF`, `BRAND_PRIMARY_COLOR = #10B981` en `lib/brand-assets.ts`. White-label v2 inyecta `--theme-primary` + derivados vía `<style>` inline en `coach/layout.tsx`; el alumno (`/c/[slug]/layout.tsx`) lee branding de headers del middleware. Motor: **`@eva/brand-kit` `resolveBrandTheme()`** (culori/OKLCH, clamp WCAG AA) + `color-utils.ts generateBrandPalette()` (HSL). Campos coach: `primary_color`, `secondary_color`, `accent_light/dark`, `neutral_tint`, `brand_font_key`, `use_brand_colors_coach`.
- **Fuentes:** Inter (body) + Montserrat (display) base; **10 fuentes white-label** ya cargadas (incluida **Hanken Grotesk** y Plus Jakarta, Manrope, Poppins…), `preload:false` por LCP. `brand-fonts.ts` resuelve el stack por `brand_font_key`.
- **Dark mode:** `next-themes` v0.4.6, estrategia **class** (`.dark` en `<html>`), default dark.
- **Componentes:** shadcn primitives en `components/ui/` (button, card, input, badge, avatar, tabs, progress, sheet, dialog, select…) + glass-button/glass-card. Dominio: `coach/CoachSidebar` (sidebar desktop + bottom tabs mobile), `client/ClientNav`, nutrition (`MacroRings`, `AdherenceRing`…), movement, bodycomp, landing.
- **Shell/responsive:** mobile-first estricto (`h-dvh`, `*-safe`, bottom bar 88px, top bar mobile 3.5rem). **El coach YA tiene sidebar desktop** (`CoachSidebar` parte PRIMARY_TABS en mobile vs nav full en desktop). PWA: `sw.js`, manifests por coach, splash Apple.

## 3. Estado actual — Mobile (`apps/mobile`, Expo + NativeWind v4)

- **Tokens:** `global.css` (CSS vars en **canales RGB**: `--color-primary 0 122 255`, `--color-background`, `--color-card`…) + `tailwind.config.js` (`theme.extend` mapea a `rgb(var(--color-x)/<alpha>)`, radius sm7→3xl26, fuentes) + `lib/theme.ts` (lightTheme/darkTheme, `hexToChannels`, `applyCoachBranding`, `brandVars`).
- **Primario / branding:** mismo motor **`@eva/brand-kit`** (compartido con web). Flujo: `fetchBrandingByCoachIdentifier()` → `CoachBranding` → AsyncStorage → `applyCoachBranding()` → `brandVars()` → `nativewind.vars()` envuelve el root para que las clases hereden el color. Dark: `useColorScheme()` + override AsyncStorage + `.dark` flip.
- **Fuentes:** Inter + Montserrat vía `@expo-google-fonts`. **No hay Archivo ni JetBrains Mono.**
- **Componentes (82):** Button, Card/GlassCard, Input, Badge, Avatar, SegmentedTabs, ProgressBar, **ComplianceRing** (anillo SVG animado ≈ ProgressRing), BottomSheet, Sparkline, MacroPill/MacroRingSummary, HabitsTracker, AdherenceStrip, Streak*, `coach/CoachMobileChrome` (header+tab bar blur), `coach/CoachMobileTabBar`, ClientCard, builder sheets, charts (victory-native), clientDetail tabs.
- **Rutas (Expo Router):** `app/coach/(tabs)` (home, clientes, builder, ejercicios, nutricion, settings, subscription, support, check-ins, perfil) + nested (cliente/[id], program-builder, nutrition-builder, foods, brand-preview). `app/alumno/(tabs)` (home, nutricion, exercises, check-in, history, perfil + workout oculto) + codigo/onboarding/suspended/workout/[planId]. `app/(auth)`.
- **Paridad web↔mobile:** lógica **1:1** (reducer plan-builder "ported 1:1 from web", engines `@eva/nutrition-engine`, schemas/types). **UI reimplementada por plataforma** (shadcn web vs componentes RN). No hay `@eva/ui` compartido.

### Packages compartidos (`packages/`) — web + mobile
`@eva/brand-kit` (motor white-label OKLCH) · `@eva/types` · `@eva/schemas` (Zod, incl. `FontKey`) · `@eva/tokens` (constantes de design system legacy) · `@eva/nutrition-engine` · `@eva/calc` · `@eva/module-catalog` · `@eva/feature-prefs` · `@eva/tiers`.

---

## 4. Delta / gap analysis (diseño nuevo vs actual)

| Eje | Actual (web / mobile) | Diseño nuevo | Brecha | Tamaño |
|-----|----------------------|--------------|--------|--------|
| **Primario** | `#007AFF` (web) / `0 122 255` (mobile) | sport `#2680FF` | Casi idéntico (azul iOS un toque más profundo) | XS |
| **Nutrición / recovery** | macros hardcoded; sin color recovery | ember `#FF6A3D` fijo + aqua fijo | Falta ramp ember/aqua de 1ª clase | M |
| **Capa semántica** | tokens shadcn (`--primary`…) / `--color-*` | aliases `--surface/-text/-border/-action-*` | No existe capa semántica intermedia pública | **L** |
| **Ramp ink** | neutrales derivados, no ramp | `ink-950…50` explícito | Falta la escala ink declarativa | M |
| **Tipografía** | Inter+Montserrat (web tiene Hanken ya) / Inter+Montserrat | Archivo + Hanken + JetBrains Mono | Falta **Archivo** (display) y **JetBrains Mono**; Hanken ya está en web | M (web) / M (mobile) |
| **Radius** | base 12px+mult (web) / fijo px (mobile) | cards 20 / controles 14 (semántico) | Remap + tocar clases `rounded-*` | M |
| **Dark selector** | `.dark` (next-themes / RN) | `[data-theme=dark]` | Trivial: autorear el CSS del diseño bajo `.dark` | XS |
| **White-label** | brand-kit OKLCH → `--theme-primary` (1 color) | override de ramp `--sport-100…700` | **Reconciliar** motor OKLCH ↔ ramp (decisión D2) | **L** |
| **Componentes core** | shadcn (web) / 82 comps (mobile) | 13 componentes con contrato propio | Mayoría existe → **re-estilar**; nuevos: StatCard, ProgressRing(web), Tag, ListRow, IconButton | L |
| **Shell desktop** | `CoachSidebar` ya hace sidebar desktop | shell con rail + breadcrumb + búsqueda global + master-detail + builder 3-paneles | Re-estilar + features nuevas (búsqueda global, rail, breadcrumb discipline) | **L** |
| **Regla <760px = app** | responsive ad-hoc | desktop colapsa a la app mobile verbatim | Alinear breakpoint 760 + verificar paridad | M |
| **Pantallas** | ~55 vivas (web) + ~30 (mobile) | ~55 rediseñadas, 2 plataformas | Re-skin pantalla por pantalla | **XL** |

**Lo que NO cambia (a favor):** arquitectura Clean (domain/infra/services), reducers/engines (1:1), `@eva/brand-kit` como motor, schemas, RLS/DB, server actions, feature-prefs/entitlements. El rediseño es **presentación + tokens**, no negocio.

---

## 5. Plan por fases (propuesto — ambos frentes en paralelo)

> Cada fase entrega web **y** mobile juntos (tu elección: "ambos en paralelo"). Cada fase = verde `typecheck` + `lint` + build; E2E/visual solo al cierre y con tu OK (regla del repo).

- **Fase 0 — Fundación de tokens (shared).** Portar los 9 grupos de tokens del diseño a `globals.css @theme` (web) y `global.css` + `tailwind.config.js` (mobile). Cargar **Archivo** + **JetBrains Mono** (web `next/font`, mobile `@expo-google-fonts`); Hanken pasa a UI default. Introducir la **capa semántica** (`--surface/-text/-border/-action-*`) y mapear los tokens shadcn/`--color-*` encima. Dark bajo `.dark`. **Reconciliar white-label** (ver D2). *Entregable:* tokens vivos, ambos apps compilan, todavía sin re-skin de pantallas.
- **Fase 1 — Librería de componentes core.** Re-estilar/crear los 13 componentes en web (restyle shadcn + nuevos StatCard/ProgressRing/Tag/ListRow/IconButton) y mobile (la mayoría ya existe → restyle; ComplianceRing→ProgressRing). *Entregable:* showcase de componentes 1:1 con el diseño en ambas plataformas.
- **Fase 2 — Shell + navegación.** Coach: shell desktop (rail/topbar/breadcrumb/búsqueda global) + `CoachMobileChrome`. Alumno: nav + tab bar (blur). Regla <760px=app. *Entregable:* navegar la app con el chrome nuevo.
- **Fase 3 — Dashboards** (el "new alumno dash" es el titular): StudentDashboard (anillos adherencia) + CoachDashboard (KPIs/war room), web+mobile.
- **Fase 4 — Alumnos + Ficha** (StudentList, AlumnoHub, StudentDetail/ficha tabs).
- **Fase 5 — Programas + Constructor** (ProgramasHome, builder 3-paneles, catálogo, planificador).
- **Fase 6 — Nutrición** (NutricionHome, NutritionPlanCoach, PlanAlimenticio alumno, alimentos/grupos/recetas).
- **Fase 7 — Módulos** (Cardio/Movimiento/Composición) + entitlements.
- **Fase 8 — Ajustes + Suscripción + Teams** (Opciones, Mi Marca, billing/Reactivar, ModulosManage, TeamCoachDashboard/Equipo).
- **Fase 9 — Auth + estados + Rutina full-bleed + Historial + Aprender + Check-in.**
- **Cierre — QA visual + E2E + dark + white-label** en preview, con tu OK.

**Orden alternativo (vertical slice):** en vez de horizontal por capa, hacer **alumno completo primero** (dashboard→plan→aprender→checkin→rutina) y después coach. Útil si querés mostrar el "new alumno dash" punta a punta antes. → Decisión D1.

---

## 6. Decisiones que necesito de vos (antes de tocar código)

- **D0 — Proyecto canónico.** ¿`d76cae7a` ("…MASTER OPT new alumno dash") es EL diseño a implementar, o una de las otras "Azul ACTUAL MASTER"? (Hay 6 proyectos; varios dicen MASTER.)
- **D1 — Estrategia de fasear.** (a) Horizontal por capa (tokens→componentes→shell→pantallas) — más sólido, los cimientos primero. (b) Vertical slice (alumno entero, luego coach) — ves resultado punta a punta antes. **Recomiendo (a)** para no re-skinnear sobre tokens que aún se mueven.
- **D2 — Reconciliación white-label (la decisión central).** El diseño hace rebrand sobrescribiendo la ramp `--sport-100…700`. EVA hoy deriva todo de **un** color por coach con `@eva/brand-kit` (OKLCH, clamp WCAG). Opciones:
  - **(Recomendada)** Mantener `@eva/brand-kit` como motor y **extenderlo para emitir la ramp sport completa** (7 pasos) desde el `primary_color` del coach → llena `--sport-*`. Conservás el clamp WCAG y la derivación OKLCH, y ganás la estructura de tokens del diseño. Cambio acotado al package (compartido web+mobile de una).
  - (b) Adoptar literal el approach del diseño (override manual de ramp) y jubilar parte del motor — más fiel al kit, pierde el clamp automático y la derivación de neutrales.
- **D3 — Tipografía.** Cambiar el sistema a **Archivo (display) + Hanken (UI) + JetBrains Mono (métricas)** globalmente. Impacta LCP y el `brand_font_key` per-coach sigue overrideando el display. ¿Adoptamos las 3? (Hanken ya está cargada en web; falta Archivo + JetBrains Mono en ambos.) **Recomiendo sí** (es la firma del diseño).
- **D4 — SDD.** El repo exige specs antes de feature nueva (`specs/[feature]/SPEC.md+PLAN.md+TASKS.md`). ¿Genero el set de specs de este rediseño en el branch como paso previo (recomendado por CLAUDE.md), o vamos directo a Fase 0?

---

## 7. Riesgos / notas

- **Superficie de cambio enorme:** ~55 pantallas × 2 plataformas + swap de fuentes que toca todo. Mitigación: Fase 0 (tokens) deja el 80% del look aplicado "gratis" vía variables antes de tocar pantallas.
- **Coordinación con sesiones paralelas:** memorias indican trabajo mobile/nutrición en otras ramas. Este branch debe rebasear seguido pa no chocar.
- **No romper white-label de los 16+ coaches free + Pro:** D2 debe preservar el contrato actual de `coaches.primary_color`/`brand_font_key`. Nada de migración destructiva de DB (el rediseño es de cliente; idealmente 0 migraciones).
- **Regla <760px=app:** verificar que el responsive web a ancho móvil quede pixel-cercano a la RN app (tu requisito). Conviene un check visual lado a lado al cierre.
- **Re-pull del diseño:** puedo releer cualquier archivo del proyecto por `projectId` cuando implemente; no necesito que re-exportes.

---

## 8. Próximo paso

Esperando tus respuestas a **D0–D4**. Con eso:
1. (Si D4=sí) genero `specs/redesign-eva-ds/` (SPEC+PLAN+TASKS) en este branch.
2. Arranco **Fase 0 — Fundación de tokens** (web+mobile), verde typecheck+lint+build, sin tocar pantallas todavía.

Nada se ejecuta hasta tu OK.
