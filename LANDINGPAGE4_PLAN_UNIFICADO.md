# Plan unificado: `/landingpage4` — FORGE, Three.js y vitrinas

**Fecha de fusión:** 2026-04-20. **Ruta en el repo:** `LANDINGPAGE4_PLAN_UNIFICADO.md` (raíz del proyecto).

Este documento **une dos planificaciones** elaboradas para la vitrina [`/landingpage4`](src/app/landingpage4):

1. **Plan maestro (implementación v1)** — tokens FORGE, modo claro/oscuro, capas y z-index, Three.js, secciones y copy, pricing desde constantes, QA, y rutas públicas de prueba [`/landingpage4/pruebavistacoach`](src/app/landingpage4/pruebavistacoach) y [`/landingpage4/pruebavistaalumno`](src/app/landingpage4/pruebavistaalumno). Texto base proveniente del plan Cursor `landing_page4_three_baf34379.plan.md`.
2. **Plan de polish (iteración editorial y visual)** — ampliación sobre el maestro: utilidades CSS alineadas al HTML de referencia [`public/eva-design-03-forge.html`](public/eva-design-03-forge.html), logo por tema, hero con prefijo fijo y **typewriter** de sufijos, bloques de producto **full-bleed** con copy fundamentado en `nuevabibliadelaapp` (01 estado actual + 04 negocio), **un solo canvas** WebGL gobernado por **capítulos de scroll** (bridge cliente + ref), y pulido de header, pricing, FAQ y CTA/footer.

**Cómo leer el archivo:** la **Parte I** (plan maestro, §1–§21) empieza en §1. La **Parte II** (polish + mapa §23–§24) sigue al resumen de riesgos. La **Parte III** (demo viable implementada, §25–§30) documenta el sprint de decisión de producto (mockups, footer, demos).

---

**Parte I — Plan maestro (texto integral).** FORGE + scroll tipo Apple + Three.js.

Este documento sustituye la versión breve del plan maestro: aquí se especifica **qué** construir, **cómo** debe verse y comportarse cada pieza, y **cómo** validar que no se rompa nada.

---

## 1. Objetivo del producto (página)

- **Ruta de vitrina**: [`/landingpage4`](src/app/landingpage4) (las rutas `/landingpage1`–`3` fueron retiradas del código).
- **Narrativa**: varias secciones full-bleed o “casi viewport” que cuentan **qué hace EVA** (rutinas, nutrición según plan, alumnos/check-ins, marca/PWA), más **precios** y **CTA** final.
- **Referencia motion**: páginas tipo Apple = **scroll largo**, bloques que entran con **parallax suave**, titulares que **escalan u opacan** según progreso, sensación de **continuidad** (un fondo vivo + contenido que se encadena). Sin “scroll hijacking” (no bloquear wheel para forzar animación).
- **Referencia visual única de marca**: [`public/eva-design-03-forge.html`](public/eva-design-03-forge.html) — brutalista funcional, grid, acento rojo, mono para metadatos, Archivo para display.

---

## 2. Inventario de tokens FORGE (del HTML; usar tal cual en CSS variables)

Definir en `forge-theme.css` bajo `.landing-forge` (o `:root` scoped solo si el layout envuelve con clase única):

| Token HTML | Valor | Uso en UI |
|------------|-------|-----------|
| `--bg` | `#FAFAFA` | Fondo página |
| `--bg-dark` | `#09090B` | Base del **modo oscuro** FORGE (ver §14); no es opcional: el plan incluye claro + oscuro |
| `--surface` | `#FFFFFF` | Cards, header sólido |
| `--surface-alt` | `#F4F4F5` | Chips, fondos secundarios |
| `--ink` | `#09090B` | Texto principal |
| `--ink-2` | `#27272A` | Texto secundario fuerte |
| `--muted` | `#71717A` | Labels, nav secundario |
| `--dim` | `#A1A1AA` | Placeholder / disabled visual |
| `--border` | `#E4E4E7` | Bordes default |
| `--border-strong` | `#D4D4D8` | Separadores dashed “fuerte” |
| `--accent` | `#FF3B1F` | CTAs fuertes, slash en título, active tab |
| `--accent-dark` | `#CC2E18` | Hover pressed |
| `--accent-bg` | `#FFEDE8` | Chips save / highlight suave |
| `--success` | `#16A34A` | Solo si el copy lo requiere (p. ej. “incluido”) |
| `--warning` | `#CA8A04` | Avisos suaves |

**Grid de fondo** (replicar lógica del HTML `body::before`):

- `linear-gradient` 1px + `background-size: 48px 48px`, `opacity: 0.4`, `pointer-events: none`, `z-index` detrás del contenido.
- `mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, black, transparent)` (y prefijo `-webkit-`) para que el grid se desvanezca abajo.

**Sombras “sello”** (teléfonos / cards destacadas en el HTML):

- Ejemplo phone: `box-shadow: 8px 8px 0 var(--ink), 0 0 0 1px var(--ink)` — usar en **mock device** opcional de una sección (no obligatorio en v1; si se usa, mantener proporción y no imitar capturas reales de terceros).

**Tipografía del HTML** (Google Fonts en el HTML estático):

- Sans: **Geist** — en Next usar `next/font/google` con `Geist` si está disponible en la versión de `next/font` del proyecto; si no, **Inter** ya global como fallback cercano, pero preferir cargar **Geist** solo en `landingpage4/layout.tsx` para fidelidad.
- Mono: **Geist Mono** — el proyecto ya declara `--font-geist-mono` en [`globals.css`](src/app/globals.css); verificar variable en root y aplicar `font-mono` o la variable en `.landing-forge`.
- Display: **Archivo** — `next/font/google` subset `latin`, `weight: [400,600,700,800,900]`, variable CSS `--font-forge-display`.

**Escala tipográfica sugerida (FORGE + legibilidad web)**:

- Hero `h1`: `clamp(2.5rem, 8vw, 5rem)`, `font-weight: 900`, `letter-spacing: -0.04em`, `line-height: 0.95`.
- Sección `h2`: `clamp(1.75rem, 4vw, 3rem)`, weight 800.
- Eyebrow (tag strip / label): mono, `10px`–`11px`, `uppercase`, `letter-spacing: 0.1em`, color `muted`.
- Body: `15px`–`17px`, `line-height: 1.55`, color `ink-2` o `muted` según jerarquía.

**Radios y bordes**:

- Cards: `border-radius: 10px`–`12px` como `.block-card` del HTML; no usar `rounded-3xl` genérico del resto del sitio salvo CTA hero intencional.

### 2.1 Modo claro y oscuro (detalle)

**Objetivo**: la vitrina `landingpage4` y las subrutas de prueba deben verse **coherentes** en claro y oscuro, tomando del HTML FORGE el set claro (`--bg`, `--surface`, …) y el set que el mismo archivo reserva para contexto oscuro (`--bg-dark` como ink profundo).

**Mecánica recomendada (alineada al resto del repo)**:

- El root ya usa [`ThemeProvider`](src/app/layout.tsx) (`next-themes`). En `landingpage4/layout.tsx`, envolver hijos con el mismo proveedor **solo si** hace falta override; lo habitual es **no duplicar** el provider y usar `useTheme()` + `setTheme('light'|'dark'|'system')` en un componente cliente `ForgeThemeToggle.tsx`.
- Aplicar clase contenedora **`landing-forge`** en el wrapper de todas las rutas bajo `src/app/landingpage4/**` (layout segment), de modo que los tokens FORGE no pisen el `:root` global del dashboard EVA.
- **Mapeo CSS** en `forge-theme.css`:
  - **Claro (default)**: las variables de la tabla §2 tal cual (`--forge-bg` puede alias a `--bg` para no chocar con `--background` de shadcn).
  - **Oscuro**: selector `html.dark .landing-forge` (o `.dark .landing-forge` según cómo `next-themes` aplique la clase en este proyecto) reasigna:
    - `--forge-bg` → `#09090B` (`--bg-dark` del HTML)
    - `--forge-surface` → `#121212` o `#18181B` (ligeramente por encima del bg para cards)
    - `--forge-ink` → `#FAFAFA` (texto principal)
    - `--forge-ink-2` → `#A1A1AA`
    - `--forge-muted` → `#71717A`
    - `--forge-border` → `#27272A` / `#3F3F46`
    - `--forge-accent` → mantener `#FF3B1F` o subir luminosidad +2% si el contraste sobre `#09090B` en chips finos falla AA
    - `--forge-accent-bg` → rojo translúcido bajo opacidad (`color-mix` hacia `#09090B`)
  - **Grid de fondo en oscuro**: líneas del grid con color `#27272A`, `opacity` 0.25–0.35; misma máscara radial que en claro.
- **Three.js en oscuro**: partículas y niebla deben **re-tintarse** cuando cambie el tema (listener `MutationObserver` en `class` de `html` o suscripción a `useTheme` que llama `applyTheme('light'|'dark')` en el módulo Three vía ref). En oscuro: partículas más **opacas y frías** (grises + acentos rojos muy puntuales); opacidad del canvas puede subir levemente vs claro porque el fondo es más oscuro.
- **Transición**: al cambiar tema, `transition: background-color 0.2s ease, color 0.2s ease` en `.landing-forge`; evitar flash: `suppressHydrationWarning` en `<html>` ya lo gestiona el root si aplica.
- **Persistencia**: respetar la preferencia guardada por `next-themes` (localStorage); botón toggle con `aria-label` dinámico (“Activar modo oscuro” / “Activar modo claro”).
- **Contraste**: repetir checklist §10 **en ambos modos** (botón primario, links `accent`, texto `muted` sobre `surface`).

---

## 3. Arquitectura de capas (z-index y stacking)

Orden estricto recomendado (de atrás hacia adelante):

1. **`ForgeBackdropThree`**: `position: fixed; inset: 0; z-index: 0; pointer-events: none;` — nunca recibe clicks.
2. **Pseudo-grid FORGE**: puede vivir **en CSS** en el mismo fixed layer o en un `div` hermano `z-0` debajo del canvas; si ambos, Three **encima** del grid CSS con `mix-blend-multiply` opcional (probar contraste; si ensucia, un solo layer).
3. **Contenido**: wrapper `min-h-dvh` con `position: relative; z-index: 10;` que contiene header + main.
4. **`ForgeHeader`**: `position: sticky; top: 0; z-index: 50` **dentro** del stacking context del wrapper `z-10` **o** `z-[100]` si hace falta superponerse a secciones con transforms (probar en Safari). Fondo `surface` con `border-bottom: 1px solid var(--border)` al hacer scroll (`useScroll` umbral ~8–16px, igual patrón que [`ForgeHeader`](src/app/landingpage4/ForgeHeader.tsx) con `useScroll`).
5. **Menú móvil** (si hay drawer/portal): `z-index` mayor que header (p. ej. `200`) y `aria-modal` + focus trap básico (focus en primer enlace al abrir).

**Skip link** (accesibilidad): primer hijo del cliente, invisible hasta focus: “Saltar al contenido” → `#contenido` en el `<main>`.

---

## 4. Estructura de archivos (obligatoria)

```
src/app/landingpage4/
  layout.tsx                      # Fuentes; wrapper class "landing-forge min-h-dvh"; import forge-theme.css
  page.tsx                        # Metadata landing principal + <LandingPage4Client />
  forge-theme.css                 # Tokens light + bloque html.dark .landing-forge; grid; utilidades .forge-card, .forge-tag-strip
  LandingPage4Client.tsx          # Orquestación landing principal: Three + ForgeHeader + main + secciones
  ForgeBackdropThree.tsx          # Three client-only
  ForgeHeader.tsx                 # Sticky + nav + toggle tema + links a subrutas prueba
  ForgeThemeToggle.tsx            # Client: useTheme + botón/iconos sol/luna; focus ring
  scroll-context.tsx              # OPCIONAL: { scrollYProgress }
  sections/
    ForgeHero.tsx
    ForgeSectionRutinas.tsx
    ForgeSectionNutricion.tsx
    ForgeSectionAlumnos.tsx
    ForgeSectionMarca.tsx
    ForgeSectionPricing.tsx
    ForgeSectionFaq.tsx           # Recomendado v1 (3 preguntas)
    ForgeSectionCta.tsx
    ForgeFooter.tsx
  pruebavistacoach/
    page.tsx                      # Metadata + <ForgeCoachDemoPage /> (client o server shell + client demo)
  pruebavistaalumno/
    page.tsx                      # Metadata + <ForgeStudentDemoPage />
  _demos/                         # carpeta colateral (nombre exacto negociable: _forge-demos)
    forge-demo-mocks.ts           # Datos fake: nombre coach, marca, contadores, strings UI
    ForgeCoachDemoPage.tsx        # Composición vista coach FORGE
    ForgeCoachSidebar.tsx         # Réplica estructural CoachSidebar FORGE (sin Supabase)
    ForgeCoachMainChrome.tsx      # Barra superior / breadcrumbs visuales si aplica
    ForgeCoachDashboardPanel.tsx  # Cards tipo dashboard: stats, lista actividad, CTA mock
    ForgeStudentDemoPage.tsx      # Composición vista alumno FORGE
    ForgeStudentShell.tsx         # Nav inferior o lateral como ClientNav simplificado FORGE
    ForgeStudentDashboardMock.tsx # Calendario semana + cards entreno/nutrición (paridad con preview)
```

**Imports CSS**: `forge-theme.css` **solo** desde [`src/app/landingpage4/layout.tsx`](src/app/landingpage4/layout.tsx) para que `pruebavistacoach` y `pruebavistaalumno` hereden tokens sin reimportar.

**Convención de nombres**: prefijo `Forge*` en componentes exclusivos de esta vitrina para no confundirlos con [`CoachSidebar`](src/components/coach/CoachSidebar.tsx) ni con [`ClientNav`](src/app/c/[coach_slug]/_components o ruta análoga).

---

## 5. Metadata y SEO ([`page.tsx`](src/app/landingpage4/page.tsx))

- `title`: corto, FORGE + EVA, p. ej. `EVA · FORGE — Plataforma para coaches`.
- `description`: 1–2 frases con keywords reales (rutinas, nutrición, alumnos, app).
- `openGraph`: `title`, `description`, `url: 'https://www.eva-app.cl/landingpage4'`, `siteName: 'EVA'`, `type: 'website'`.
- **Imagen OG**: reutilizar constantes de marca si existen en [`src/lib/brand-assets`](src/lib/brand-assets) o default del layout root; no inventar URL.
- **`robots`**: misma política que otras landings de vitrina (si las demás indexan, esta también; si no, `noindex` — verificar cómo están lp2/lp3).

---

## 6. Comportamiento “Apple-like” sin nuevas dependencias (v1)

### 6.1 Herramientas

- **`framer-motion`**: `motion`, `useScroll`, `useTransform`, `useSpring` (opcional para suavizar), `useMotionValueEvent` para side-effects controlados.
- **Evitar**: re-render de todo el árbol por `scroll` en `useState`; el bridge a Three debe leer `MotionValue` en el animation frame del Three o vía `useMotionValueEvent` que solo escribe en refs/métodos del renderer.

### 6.2 Patrón de scroll

- `const mainRef = useRef<HTMLElement>(null)`.
- `const { scrollYProgress } = useScroll({ target: mainRef, offset: ['start start', 'end end'] })`.
- Por sección, **sub-rangos** de `scrollYProgress` mapeados con `useTransform(scrollYProgress, [0, 0.2, ...], [...])` **o** componentes hijos con `useInView` + animaciones independientes (más simple y suficiente para “cool”).

### 6.3 Patrón “sticky copy” (opcional por sección)

Para 1–2 secciones clave (p. ej. Rutinas + Pricing):

- Contenedor externo `min-h-[220vh]` o similar.
- Hijo interno `sticky top-[calc(var(--header-h)+1rem)] h-[calc(100dvh-var(--header-h)-2rem)]` con contenido centrado.
- Mientras el usuario atraviesa el contenedor externo, el inner queda fijo y los **bloques de texto** pueden cambiar con `useTransform` en función del progreso **local** (definir `useScroll` con `target: sectionRef` y `offset: ['start end', 'end start']`).

Documentar `--header-h: 3.5rem` (56px) si coincide con nav.

### 6.4 Motion por sección (defaults)

- **Entrada**: `initial={{ opacity: 0, y: 24 }}` → `whileInView={{ opacity: 1, y: 0 }}` con `viewport={{ once: true, margin: '-12% 0px' }}`, `transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }`.
- **Stagger** en listas de bullets: `transition: { delay: index * 0.06 }`.
- **Hover** (solo desktop): cards `hover:translate-y-[-2px]` + sombra sutil `accent` muy baja opacidad; `transition` 200ms.

---

## 7. Three.js — especificación técnica (`ForgeBackdropThree.tsx`)

### 7.1 Principios

- Un solo `WebGLRenderer`, un solo `Scene`, una sola animación `requestAnimationFrame`.
- **Pixel ratio**: `Math.min(devicePixelRatio, 1.75)` como lp1.
- **Color space**: `SRGBColorSpace`, `THREE.ColorManagement.enabled = true`.
- **Fondo del renderer**: `setClearColor(0x000000, 0)` — transparencia para que se vea `--bg` del DOM.
- **Opacidad global del canvas**: clase Tailwind en el wrapper; valores distintos por tema: **claro** `opacity-[0.25]`–`0.45` (fondo casi blanco); **oscuro** `opacity-[0.35]`–`0.55` (más margen para leer partículas sin ensuciar `--forge-ink`).

### 7.2 Contenido visual v1 (recomendado)

- **Points** (`BufferGeometry` + `PointsMaterial` con mapa circular suave en canvas 2D o `alphaMap`, **tamaño pequeño** ~1.5–3 px en pantalla).
- Cantidad **1800–2800** partículas (misma magnitud que [`ForgeBackdropThree`](src/app/landingpage4/ForgeBackdropThree.tsx)); bajar a ~1200 si GPU débil detectada (opcional: `navigator.hardwareConcurrency <= 4`).
- Distribución: esfera o volumen ligeramente achatado; rotación lenta `rotation.y += 0.008` por segundo equivalente en `clock.getDelta()`.
- **Paleta partículas** (lerp por “capítulo”):
  - Capítulo 0 (hero): gris `#A1A1AA`, toques `#27272A`.
  - Capítulo 1: introducir `#FF3B1F` al 15% de saturación en mezcla.
  - Capítulo 2–3: más densidad ink.
  - Cerca de pricing/CTA: ligero pulso de acento (no neón ARC).

Implementación del capítulo: método `applyChapter(t: number)` donde `t` es `scrollYProgress` 0–1 leído desde ref actualizado en cada frame **o** desde variable almacenada en `useMotionValueEvent` throttled (máx 60Hz).

### 7.3 Niebla

- `FogExp2` con color cercano a `#FAFAFA` convertido a hex Three **pero** en escena transparente usar color muy claro y densidad baja para no lavar; alternativa: **sin fog** y solo partículas dispersas.

### 7.4 `prefers-reduced-motion: reduce`

- **No** inicializar WebGL.
- Renderizar el mismo `div` que el fallback CSS: grid FORGE + quizá **gradientes estáticos** radiales (sin animación). Opcional: `transition: none` en toda `.landing-forge`.

### 7.5 Ciclo de vida y limpieza (obligatorio)

En `useEffect` return:

- `cancelAnimationFrame`.
- `removeEventListener` resize, scroll (si se escucha scroll en Three), `visibilitychange`.
- `renderer.dispose()`.
- `geometry.dispose()`, `material.dispose()`, `texture.dispose()` si aplica.
- Quitar `canvas` del DOM si aún está montado.

### 7.6 Errores WebGL

- Si `getContext` falla: try/catch o flag interno → fallback CSS (mismo que reduced motion).

---

## 8. Mapa de secciones — contenido, layout, ids, motion, Three

Convención de **ids** para anchors del header (estables):

| id | Componente | Propósito |
|----|------------|-----------|
| `top` | Hero | inicio |
| `rutinas` | Rutinas | ancla nav |
| `nutricion` | Nutrición | ancla nav |
| `alumnos` | Alumnos | ancla nav |
| `marca` | Marca/PWA | ancla nav |
| `planes` | Pricing | ancla nav + alinear con lp1 |
| `cta` | CTA final | botón principal |
| `contenido` | `<main id="contenido">` | skip link |

### 8.1 `ForgeHero` (`#top`)

- **Layout**: `max-w-6xl` centrado, `padding` `px-4` `pt` generoso bajo header (`pt-24` sm `pt-28`).
- **Tag strip** (como `.tag-strip` del HTML): fila de celdas con bordes compartidos (`border-collapse` vía `divide-x` o bordes manuales sin doble borde). Celdas ejemplo: `EVA`, `COACH`, `FORGE`, `v4` — última o la de marca con fondo `ink` texto `bg` o celda `.red` con `--accent`.
- **H1**: dos líneas max; línea 2 o palabra clave con color `accent` o clase `.slash` (peso distinto como el HTML).
- **Subtítulo**: mono pequeño bajo el H1 (`sub` del HTML).
- **CTAs**: primario `Link` a `/register?tier=pro&cycle=monthly` (o tier por defecto del producto), estilo botón relleno `accent` texto blanco o `surface` según contraste (medir: rojo `#FF3B1F` con texto blanco suele pasar AA grande); secundario outline `border-strong` + texto `ink`.
- **Motion**: H1 `opacity` + `y` desde 32px; tag strip `delay` 0.1s; CTAs `delay` 0.2s.
- **Three chapter**: forzar `t ≈ 0`.

### 8.2 `ForgeSectionRutinas` (`#rutinas`)

- **Copy** (orientativo, ajustar a voz de marca real del sitio): plantillas, días, bloques, superseries — alineado visualmente a **Screen 1** del HTML (builder) sin copiar UI completa: usar **lista** con cards estilo `.block-card` (barra lateral `::before` 3px `ink` o `accent` para “superset”).
- **Layout**: dos columnas `md:grid-cols-2` — texto izquierda, ilustración derecha (cards ficticias o screenshot si hay asset libre en `/public`).
- **Motion**: columna texto `x: -20 → 0`; columna visual `x: 20 → 0` (reducir en `prefers-reduced-motion`).
- **Three**: capítulo 1 suave.

### 8.3 `ForgeSectionNutricion` (`#nutricion`)

- Enfatizar **planes por tier** (sin números inventados): enlace “Ver detalle en `/pricing`”.
- UI: chips estilo `.save-chip` / `.chip.red` del HTML.
- **Motion**: reveal escalonado de chips.
- **Three**: capítulo 2.

### 8.4 `ForgeSectionAlumnos` (`#alumnos`)

- Check-ins, seguimiento, métricas de adherencia (lenguaje conservador si no hay métricas públicas en código).
- **Opcional**: mini “timeline” vertical con bordes `border-dashed border-strong`.
- **Three**: capítulo 3.

### 8.5 `ForgeSectionMarca` (`#marca`)

- PWA, instalación, marca blanca — coherente con [`layout.tsx` metadata](src/app/layout.tsx) del producto.
- Si hay imágenes: `next/image` con `sizes` y alt descriptivo.
- **Three**: transición hacia más partículas “ordenadas” (opcional: ligero acoplamiento a scroll para sensación de “ensamblaje”).

### 8.6 `ForgeSectionPricing` (`#planes`)

- **Datos**: mismos imports que en [`ForgePricing.tsx`](src/app/landingpage4/sections/ForgePricing.tsx) desde `@/lib/constants`: `tierOrder`, `TIER_CONFIG`, `getTierPriceClp`, `BILLING_CYCLE_CONFIG`, `getDefaultBillingCycleForTier`, `getTierBillingCycleSummary`, `getTierNutritionSummary`, `TIER_STUDENT_RANGE_LABEL`, y componente de precios inline o extraído a `landingpage4/TierPrices.tsx` si se desea DRY.
- **Layout**: en móvil `snap-x` carousel como lp1; en desktop grid 3–5 columnas según breakpoints.
- **Estilos**: cards con `surface`, `border`, **featured** tier `pro` con borde `accent` y fondo `accent-bg` muy suave (no copiar neón ARC de lp1).
- **Motion**: `whileInView` por card con delay por índice.
- **Three**: capítulo “pricing” — leve aumento de contraste partículas o pulso muy lento (una vez al entrar en viewport vía ref, no loop agresivo).

### 8.7 `ForgeSectionCta` (`#cta`)

- Bloque full-width dentro de `max-w-6xl` o bleed con `surface` + borde grueso `ink` y sombra tipo sello (versión suavizada para web).
- Headline corto + dos botones (registro / login).
- **Motion**: `scale: 0.96 → 1` + `opacity` al entrar en vista.

### 8.8 `ForgeFooter`

- Links: `/legal`, `/privacidad`, `mailto:contacto@eva-app.cl`, `/`, `/pricing`.
- Texto pequeño mono `muted`.
- Sin claims de terceros no verificados.

---

## 9. `ForgeHeader.tsx` — detalle

- Altura fija **56px** (`h-14`) alineada a `--mobile-top-bar-h` si aplica.
- Logo: `Image` `/LOGOS/eva-icon.png` + wordmark “EVA” Archivo o Montserrat local; no distorsionar.
- Links centro desktop: `Producto` → `#rutinas` o primer ancla de producto; `Planes` → `#planes`; `FAQ` — **decisión**: o se añade sección FAQ breve en lp4, o el link apunta a ancla en footer “Preguntas” / se elimina del nav lp4. **Recomendación v1**: incluir **mini FAQ** colapsable al final antes del footer **o** link a `#faq` con sección `ForgeSectionFaq.tsx` (3 ítems) para no romper expectativa del usuario.
- CTA nav: “Entrar” `/login`, “Registrar” `/register?...`.
- **Enlaces a vitrinas** (texto corto, no ocupar nav): grupo “Demos” o iconos con `aria-label`: `/landingpage4/pruebavistacoach`, `/landingpage4/pruebavistaalumno` (en desktop dropdown o fila secundaria; en móvil dentro del drawer).
- **`ForgeThemeToggle`**: a la derecha del nav (antes del menú hamburguesa en móvil); no duplicar lógica de [`ThemeProvider`](src/app/layout.tsx).
- Móvil: `Sheet`-like custom (mismo patrón que [`ForgeHeader`](src/app/landingpage4/ForgeHeader.tsx) / menú portal) con `createPortal`, bloqueo `overflow` en `body` al abrir, primer foco en “Cerrar”.
- **Accesibilidad**: `aria-current` en ancla activa si implementás scroll-spy (opcional v2); mínimo `aria-label` en icono menú.

---

## 10. Accesibilidad (checklist no negociable)

- Contraste texto: **WCAG AA** mínimo para body (`ink` sobre `bg`); botones rojos con texto blanco verificar ratio (si falla, texto `ink` sobre fondo `accent-bg` con borde `accent`).
- **Focus visible**: `outline` o `ring-2` color `accent` o `ink` en todos los interactuables.
- **Teclado**: orden de tab lógico; menú móvil cerrable con `Escape` (recomendado).
- **Reducción de movimiento**: Three off; `motion` debe respetar `useReducedMotion()` de framer para desactivar grandes `y`/`scale`.
- **Títulos**: un solo `h1` en la página (Hero); secciones `h2`, sub `h3`.
- **Imágenes**: `alt` significativo; decorativas `alt=""`.

---

## 11. Rendimiento y bundle

- **Dynamic import**: no es estrictamente necesario si la ruta ya es client-heavy; opcional `next/dynamic` para `ForgeBackdropThree` con `ssr: false` para evitar cualquier evaluación de `three` en servidor (Three suele ser client-only por uso de `window`).
- **Lighthouse**: LCP el H1 y hero text no deben quedar detrás de JS de Three; colocar contenido crítico en HTML primero, Three debajo en orden de hidratación.
- **Resize**: debounce/throttle ya manejado en rAF del Three; handler `resize` en `window`.

---

## 12. Contenido y legal

- No afiliar EVA a ARC Raiders ni a juegos (lp4 es FORGE, no ARC).
- Precios y textos legales: **solo** derivados de `constants` o copy ya aprobado en otras landings.
- Créditos de terceros (21st, etc.): **no** añadir en footer salvo que esta página reutilice componentes con licencia que lo exijan.

---

## 13. QA — matriz de pruebas manuales

1. Chrome desktop: scroll completo, sticky header, anchors desde nav.
2. Safari iOS: sticky + 100dvh sin saltos bruscos; safe-area inferior en footer si hay home indicator.
3. `prefers-reduced-motion`: sin Three, animaciones UI mínimas.
4. Teclado: skip link, tab por menú móvil simulado.
5. `npm run typecheck` y `npm run build` sin errores.
6. Zoom 200%: layout sin solapamiento crítico.
7. **Toggle claro/oscuro**: sin parpadeo al hidratar; contraste AA en ambos; grid visible en ambos.
8. **Subrutas prueba**: navegación desde lp4 y vuelta; sin llamadas Supabase; sin redirección a login.

---

## 14. Rutas públicas de prueba (alcance y reglas)

| Ruta | Propósito | Auth |
|------|-----------|------|
| [`/landingpage4`](src/app/landingpage4) | Marketing FORGE + Three + precios | No |
| [`/landingpage4/pruebavistacoach`](src/app/landingpage4/pruebavistacoach) | Demostración UI **coach** con nueva estética | No |
| [`/landingpage4/pruebavistaalumno`](src/app/landingpage4/pruebavistaalumno) | Demostración UI **alumno** (app cliente) con nueva estética | No |

**Reglas estrictas**:

- **No** usar [`src/app/coach/layout.tsx`](src/app/coach/layout.tsx) ni envolver con `getCoach()`: ese layout **redirige a `/login`** sin sesión.
- **No** usar [`src/app/c/[coach_slug]/layout.tsx`](src/app/c/[coach_slug]/layout.tsx) para estas pruebas: depende de slug real y auth de cliente (referencia de UX: [`src/components/client/ClientNav.tsx`](src/components/client/ClientNav.tsx)).
- Las tres rutas comparten **`landingpage4/layout.tsx`**: mismas fuentes, `forge-theme.css`, clase `landing-forge`, acceso a `useTheme`.
- **Datos**: solo mocks en [`forge-demo-mocks.ts`](src/app/landingpage4/_demos/forge-demo-mocks.ts) (nombres ficticios “Coach Demo”, “Marca FORGE”, números redondos, avatares opcionales con iniciales).
- **Disclaimer** visible en ambas pruebas (mono, pequeño): “Vitrina de interfaz — no es tu cuenta ni datos reales.”

---

## 15. Vitrina coach — `/landingpage4/pruebavistacoach`

### 15.1 Paridad funcional “cómo funciona la app” (referencias de código)

Leer y **replicar la estructura**, no importar el layout autenticado:

- **Shell general**: [`src/app/coach/layout.tsx`](src/app/coach/layout.tsx) — flex `md:flex-row`, sidebar + main; **omitir** glows blur brand `--theme-primary` o reemplazar por acento FORGE sutil (`color-mix` con `--forge-accent` al 8%).
- **Sidebar**: [`src/components/coach/CoachSidebar.tsx`](src/components/coach/CoachSidebar.tsx) — items típicos (Dashboard, Clientes, Rutinas, Nutrición, Ajustes…); en la demo **5–7 entradas** con `aria-current` en “Dashboard”; iconos `lucide-react` iguales donde sea posible; anchos `w-56` / `w-64` según referencia.
- **Main wrapper**: [`src/components/coach/CoachMainWrapper.tsx`](src/components/coach/CoachMainWrapper.tsx) — padding `px-4 py-6` md `px-8 py-10`, `max-w-[1600px]`; en demo **no** necesita ruta especial builder.
- **Dashboard contenido** (referencia de bloques, no fetch): [`src/app/coach/dashboard/CoachDashboardClient.tsx`](src/app/coach/dashboard/CoachDashboardClient.tsx) — fila de KPIs (clientes activos, alertas, etc.), cards con animación `motion`, CTA “Crear cliente”; en demo usar **números estáticos** y mismas etiquetas en español que el producto.

### 15.2 Aplicación estética FORGE sobre esa estructura

- Sidebar: fondo `surface`, borde derecho `border`, items hover `surface-alt`; item activo barra lateral **3px** `ink` o borde inferior `accent` como tabs del HTML FORGE (`.day-tab.active`).
- Cards de stats: borde `1px solid var(--forge-border)`, radio 10px, sin `glass-card` blur del coach actual salvo que se adapte con borde duro FORGE.
- Tipografía: títulos sección con **Archivo**; meta con **Geist Mono** uppercase tracking.
- **Opcional “cool”**: `framer-motion` `layout` en una card al “cambiar métrica” simulado (botón que solo toggles estado local).

### 15.3 Página y metadata

- `page.tsx`: `metadata.title` p. ej. `EVA · Vista coach (demo FORGE)`; `robots: noindex` si las otras vitrinas lo usan para no diluir SEO (decisión producto; por defecto **noindex** en pruebas).
- Cabecera local encima del shell demo: breadcrumb “Landing FORGE / Vista coach” + link “Volver a `/landingpage4`”.

---

## 16. Vitrina alumno — `/landingpage4/pruebavistaalumno`

### 16.1 Paridad con la app alumno (referencias)

- **Layout real** (estructura): [`src/app/c/[coach_slug]/layout.tsx`](src/app/c/[coach_slug]/layout.tsx) — `ClientNav` + `main` scrollable; en demo **ForgeStudentShell** con nav inferior o lateral **igual número de ítems** que el alumno ve (Inicio, Nutrición, entrenar, etc. según iconos en preview).
- **Dashboard real** (composición de bloques): [`src/app/c/[coach_slug]/dashboard/page.tsx`](src/app/c/[coach_slug]/dashboard/page.tsx) — orden conceptual: header → `WeekCalendar` → `CheckInBanner` → `HeroAndComplianceGroup` → programa → historial → peso → sidebar blocks. En la demo **no** ejecutar `createClient` ni `getClientProfile`; usar **componentes nuevos** que **parezcan** esos bloques con datos mock (calendario 7 días, banner check-in estático “Pendiente”, card “Entrenamiento de hoy”, anillos de cumplimiento falsos).
- **Preview existente** (gold copy para simplificar): [`src/app/coach/settings/preview/StudentDashboardPreview.tsx`](src/app/coach/settings/preview/StudentDashboardPreview.tsx) — función interna `DashboardScreen` (líneas ~165+) ya modela **sidebar desktop**, **header**, **semana**, **cards** entreno/nutrición. Plan: **extraer o duplicar** esa estructura en `ForgeStudentDashboardMock.tsx` y **re-skin** completo a tokens FORGE (reemplazar `rounded-2xl` suave por radios 10px, bordes duros, sombras tipo sello opcional en card principal).

### 16.2 Modo móvil en la vitrina

- Igual que el preview: en viewport estrecho mostrar **solo** columna móvil; en `md+` ofrecer marco tipo teléfono (opcional) con `max-height` y `overflow-hidden` para sensación “app real”.

### 16.3 Página y metadata

- Igual patrón que coach: `noindex` recomendado, link volver a `/landingpage4`, disclaimer.

---

## 17. Estrategia de componentes: reutilizar vs fork

| Opción | Cuándo | Riesgo |
|--------|--------|--------|
| **A. Fork en `_demos/`** (recomendado) | Copiar JSX mínimo necesario + estilos FORGE | Duplicación de lógica; hay que actualizar a mano si cambia mucho el producto |
| **B. `variant="forge"` en componentes shared** | Si varios equipos quieren mismo componente dual | Contamina bundle global y aumenta complejidad de `CoachSidebar` real |
| **C. Importar subcomponentes presentacionales** p. ej. solo iconos | Reducción de duplicación | Pocos candidatos sin arrastrar hooks de datos |

**Decisión del plan**: **A** para sidebar, nav alumno, y bloques de dashboard demo. Para piezas **puramente visuales** sin datos (p. ej. `MacroBar` con props estáticas), valorar import directo **solo si** no importan server actions ni contextos de usuario.

---

## 18. Navegación cruzada y copy

- En **ForgeFooter** y/o **ForgeHeader**: enlaces “Demo coach” y “Demo alumno”.
- En cada demo: botón secundario “Ver landing FORGE”.
- **No** enlazar con `coach_slug` real en estas páginas.

---

## 19. Three.js en subrutas de prueba

- **Opción ligera**: no montar segundo canvas; fondo = **solo CSS** (grid FORGE + gradiente estático) en `pruebavistacoach` / `pruebavistaalumno` para no duplicar WebGL.
- **Opción unificada** (más trabajo): extraer `ForgeBackdropThree` a un **provider** de landingpage4 que renderice el canvas una vez — **complejo** al cambiar de ruta Next; **recomendación v1**: Three **solo** en `LandingPage4Client`; demos sin Three.

---

## 20. Fases opcionales (post v1)

- **Lenis** + scroll suave.
- **Shader** grid animado.
- **Extraer** `DashboardScreen` del preview a `@/components/marketing/StudentDashboardMock` compartido entre settings preview y landingpage4 (DRY).
- **Internacionalización** de copy en vitrinas.

---

## 21. Resumen de riesgos (tabla)

| Riesgo | Mitigación |
|--------|------------|
| Texto ilegible sobre Three | Opacidad canvas por tema (§7); partículas más sutiles en claro |
| jank en scroll | No `setState` por frame; Three lee refs/MotionValue |
| Safari stacking | Probar z-index header vs transforms |
| Bundle three en server | Client + `dynamic(..., { ssr: false })` donde haga falta |
| Contraste rojo FORGE | Verificar AA en CTAs **claro y oscuro** |
| Confundir demo con app real | Disclaimer + `noindex` + sin rutas `/coach` |
| Drift UI producto vs fork | Comentario en `_demos/README` con enlaces a archivos fuente de referencia |

---

## Parte II — Plan de polish y estado en el repositorio

### 22. Objetivos del polish (además del plan maestro)

- **FORGE en CSS:** ampliar `forge-theme.css` con utilidades reutilizables del HTML de referencia (tag strip, block cards, section headers, KPI hero, sombras tipo “sello”, etc.) sin romper el scope `.landing-forge`.
- **Marca:** `ForgeBrandLogo` en hero/CTA (tema claro/oscuro); **barra superior** usa solo `ForgeWordmark` (sin icono PNG en header).
- **Hero editorial:** prefijo estable *“Con EVA, tu coaching”* + **10 sufijos** rotativos con animación tipo máquina de escribir (`forge-typewriter-copy.ts`, `ForgeTypewriterHeadline.tsx`), con fallback si `prefers-reduced-motion`.
- **Producto narrativo:** secciones de valor **ancho completo** (o bleed controlado) con bullets “grounded” y tono alineado a documentación interna (`forge-product-copy.ts`, `ForgeProductSections.tsx`), en sustitución o consolidación de varias `ForgeSection*` discretas si reduce fragmentación.
- **Three + scroll:** un `ForgeBackdropThree` único con `chapterRef` (`ForgeChapterRef`): el cliente expone `target` y `smooth`; un `ForgeScrollChapterBridge` observa anclas/secciones y actualiza el ref **sin** `setState` por frame; la escena aplica **lerp** hacia el capítulo y multiplicadores de color/densidad (`CHAPTER_MULT` u homólogo) según progreso.
- **Cierre de página:** alinear anchos (`max-w-7xl`, paddings `px-5 md:px-12 lg:px-20` u patrón equivalente) en `ForgeHeader`, `ForgePricing`, `ForgeFaq`, `ForgeCtaFooter`; sombras y bordes FORGE coherentes con pricing destacado.

### 23. Mapa rápido: plan maestro §4 vs implementación actual

El maestro propone varios archivos bajo `sections/` con nombres tipo `ForgeSectionRutinas.tsx`. En el repo consolidado, la **landing principal** puede agrupar narrativa de producto en menos piezas; referencia útil:

| Idea del plan maestro | Implementación de referencia |
|------------------------|------------------------------|
| `LandingPage4Client` + Three dinámico + skip link | `src/app/landingpage4/LandingPage4Client.tsx` |
| `ForgeBackdropThree` + capítulos | `src/app/landingpage4/ForgeBackdropThree.tsx` |
| Bridge scroll → capítulo | `src/app/landingpage4/ForgeScrollChapterBridge.tsx` |
| Header (wordmark) + toggle tema | `ForgeHeader.tsx`, `ForgeWordmark.tsx`, `ForgeThemeToggle.tsx` |
| Hero + typewriter + mockup doble dispositivo | `sections/ForgeHero.tsx`, `ForgeHeroAppShowcase.tsx`, `ForgeTypewriterHeadline.tsx` |
| Secciones de producto + mock visual por bloque | `ForgeProductSections.tsx`, `ForgeProductVisual.tsx`, `forge-product-copy.ts` |
| Pricing desde `@/lib/constants` | `src/app/landingpage4/sections/ForgePricing.tsx` |
| FAQ | `src/app/landingpage4/sections/ForgeFaq.tsx` |
| CTA + footer | `src/app/landingpage4/sections/ForgeCtaFooter.tsx` |
| Tokens + grid FORGE | `src/app/landingpage4/forge-theme.css`, `layout.tsx` |
| Demos coach / alumno | `src/app/landingpage4/_demos/*`, `pruebavistacoach/page.tsx`, `pruebavistaalumno/page.tsx` |

### 24. Pendientes opcionales (post–polish)

- Paridad 1:1 con capturas reales de producción (screenshots) si marketing lo pide.
- Renombrar assets de logo largos a **kebab-case** para evitar `encodeURIComponent` en rutas públicas.
- Fases opcionales ya listadas en §20 del maestro (Lenis, shader grid, extracción compartida del mock de alumno, i18n de copy de vitrina).

---

## Parte III — Demo viable (implementado 2026-04)

Esta parte documenta el sprint que deja `/landingpage4` lista para **evaluación interna** (¿usarla como landing principal?): wordmark en barra, hero con composición app coach + alumno, grilla más legible, mockups por sección de producto, footer ampliado y **demos navegables** sin backend.

### 25. Criterios de aceptación (“demo viable”)

1. **Above the fold:** grilla FORGE perceptible (global + refuerzo en `#top`); headline + typewriter; mockup laptop + teléfono con datos de `forge-demo-mocks.ts`; enlaces “Ver demo coach / alumno”.
2. **Scroll de producto:** cada `#rutinas` … `#marca` incluye **columna visual** (`ForgeProductVisual`) + leyenda `visualCaption` (UI simplificada).
3. **Cierre:** CTA con atajos mono (Producto, Planes, FAQ, demos); footer en **dos niveles** (mensaje EVA + enlaces: Legal, Privacidad, **Precios**, sitio, demos, FAQ ancla, email).
4. **Demos:** coach con **vistas** `dashboard | clients | clientDetail | programs | builder | nutritionHub | brand` (sidebar y móvil con `button` + `aria-current`); alumno con **tabs** `home | nutrition | workout | checkin` y panel contextual en desktop.
5. **Marca:** sin icono PNG en el header; `ForgeWordmark` + `ForgeBrandLogo` sigue en hero y CTA.
6. **Build:** `npm run build` sin errores de TypeScript.

### 26. Parámetros de grilla (valores en código)

| Capa | Selector / clase | Claro | Oscuro |
|------|------------------|-------|--------|
| Global | `.landing-forge-grid::before` `opacity` | `0.52` | `0.44` |
| Hero | `.forge-hero-surface::before` `opacity` | `0.62` | `0.50` |

Líneas del refuerzo hero usan `color-mix(in srgb, var(--forge-border) 85%, transparent)` para un poco más de contraste sobre `--forge-bg`.

### 27. Mapa de archivos (sprint demo viable)

| Ruta / pieza | Archivo |
|--------------|---------|
| Wordmark reutilizable | [`src/app/landingpage4/ForgeWordmark.tsx`](src/app/landingpage4/ForgeWordmark.tsx) |
| Header sin icono | [`ForgeHeader.tsx`](src/app/landingpage4/ForgeHeader.tsx) |
| Hero + showcase | [`sections/ForgeHero.tsx`](src/app/landingpage4/sections/ForgeHero.tsx), [`sections/ForgeHeroAppShowcase.tsx`](src/app/landingpage4/sections/ForgeHeroAppShowcase.tsx) |
| Grilla + hero | [`forge-theme.css`](src/app/landingpage4/forge-theme.css) (clase `forge-hero-surface` en `#top`) |
| Copy + `visual` | [`forge-product-copy.ts`](src/app/landingpage4/forge-product-copy.ts) |
| Mockups por bloque | [`sections/ForgeProductVisual.tsx`](src/app/landingpage4/sections/ForgeProductVisual.tsx) |
| Layout secciones | [`sections/ForgeProductSections.tsx`](src/app/landingpage4/sections/ForgeProductSections.tsx) |
| CTA + footer | [`sections/ForgeCtaFooter.tsx`](src/app/landingpage4/sections/ForgeCtaFooter.tsx) |
| Datos demos + hero | [`_demos/forge-demo-mocks.ts`](src/app/landingpage4/_demos/forge-demo-mocks.ts) |
| Chrome demos | [`_demos/ForgeDemoChrome.tsx`](src/app/landingpage4/_demos/ForgeDemoChrome.tsx) (`breadcrumb` opcional) |
| Demo coach | [`_demos/ForgeCoachDemoPage.tsx`](src/app/landingpage4/_demos/ForgeCoachDemoPage.tsx) |
| Demo alumno | [`_demos/ForgeStudentDemoPage.tsx`](src/app/landingpage4/_demos/ForgeStudentDemoPage.tsx) |

### 28. Comportamiento demo coach (resumen)

- **Navegación:** índice del sidebar / bottom nav → `NAV_TO_VIEW`: Dashboard, Alumnos, Programas, Ejercicios→`builder`, Nutrición→`nutritionHub`, Mi marca→`brand`.
- **Detalle alumno:** desde Clientes, botón “Ver” abre `clientDetail` con pestañas estáticas (Overview | Plan | Nutrición); “← Volver al directorio” restaura `clients`. Con `clientDetail` activo, el ítem **Alumnos** queda resaltado en nav.
- **Disclaimer:** franja roja bajo `ForgeDemoChrome`; sin Supabase ni `coach/layout`.

### 29. Comportamiento demo alumno (resumen)

- **Tabs inferiores:** `button` con `aria-current="page"` en la pestaña activa.
- **Contenidos:** `home` (calendario + cards + métricas + programa); `nutrition` (comidas ejemplo + adherencia 30d ficticia); `workout` (series deshabilitadas); `checkin` (pasos 1–2–3 mock).
- **Desktop:** columna lateral explicando B2B2C / PWA (`md:w-72`).

### 30. QA rápida post-sprint

- [ ] `/landingpage4` claro/oscuro: grilla, hero, 4 secciones, pricing, FAQ, CTA, footer.
- [ ] `/landingpage4/pruebavistacoach`: todas las vistas del sidebar y detalle alumno.
- [ ] `/landingpage4/pruebavistaalumno`: las 4 tabs + panel lateral en `md+`.
- [ ] Focus visible en nav de demos y enlaces del footer.

---

## Anexo A — Lista de tareas original del plan Cursor (trazabilidad)

Estos ítems corresponden al frontmatter YAML del plan `landing_page4_three_baf34379`; sirven como checklist histórico. Marca manualmente en control de versiones o en issues si aún aplican.

- **tokens-layout:** `forge-theme.css` + layout: variables FORGE light + bloque `html.dark .landing-forge`, grid, fuentes Archivo/Geist (o mono del proyecto).
- **theme-toggle:** `ForgeThemeToggle` con `next-themes`, `aria-label`, sincronía de tema con Three si aplica.
- **page-metadata:** `page.tsx` de lp4 y de pruebas: metadata/OG por ruta.
- **client-shell:** `LandingPage4Client`: capas Three + contenido `z-10`, skip link, wrapper `.landing-forge`.
- **forge-header:** sticky, anclas, enlaces a demos, CTAs login/registro.
- **three-backdrop:** partículas, paleta por modo, capítulo por scroll, reduced motion, dispose.
- **scroll-bridge:** `MotionValue` / observers → Three sin `setState` por frame.
- **sections-all:** secciones + motion + dark.
- **pricing-constants:** pricing desde `@/lib/constants` como lp1.
- **demo-coach / demo-alumno:** shells FORGE con mocks, sin auth.
- **footer-legal:** footer + enlaces a demos y legales.
- **qa-matrix:** typecheck, build, QA claro/oscuro, móvil, movimiento reducido, contraste.

**Nota de mantenimiento:** cualquier desviación futura respecto a este plan unificado debería reflejarse primero en este archivo (o en issues enlazados) para no perder el hilo entre diseño FORGE, rendimiento WebGL y copy de producto.

