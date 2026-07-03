# Landing v2 "Prism" — Spec de transcripción (fuente de verdad para 4 constructores en paralelo)

> **Objetivo:** portar 1:1 el diseño `nuevalandingv2/LandingPrism v2.dc.html` a un set de componentes React/Next
> en `apps/web/src/components/landing-v2/` + un `page.tsx` nuevo que los compone. El resultado reemplaza
> a la landing actual (`apps/web/src/app/page.tsx` + `components/landing/**`) **manteniendo intacto el SEO**.
>
> **Regla de oro:** el markup/estilo es 1:1 con el diseño; **los datos (precios, tiers, links, copy legal, emails)
> se leen de la fuente real del código**, NO se hardcodean del diseño. Donde diseño y realidad chocan, gana la realidad
> (ver §6, discrepancias marcadas ⚠️).
>
> Fuentes leídas: `nuevalandingv2/LandingPrism v2.dc.html` (1330 líneas), `_ds/.../colors_and_type.css`,
> `apps/web/src/app/page.tsx`, `components/landing/**`, `packages/tiers/index.ts`, `lib/brand-assets.ts`,
> `app/globals.css`, `app/layout.tsx`.

---

## 0. RESUMEN EJECUTIVO / COORDINACIÓN CRÍTICA (leer antes de repartir trabajo)

El diseño es **dark-first, una sola pantalla larga**, cuyo **color de marca (`--brand`) muta en vivo** y se propaga
por TODA la página (hero, CTAs, glows, dashboard, teléfono, precios, módulos). Ese color lo maneja **un único
motor `requestAnimationFrame`** que escribe una CSS var global. Además hay **estado compartido de idioma (ES/EN)**
y **ciclo de precios (mensual/trimestral/anual)**.

**Consecuencia arquitectónica no negociable:** los 4 constructores NO pueden construir 13 islas aisladas. Hay
**3 piezas de estado transversal** que deben vivir en UN proveedor compartido montado en el root de la página:

1. **Brand engine** — palette + color actual (`cur`) + auto/lock + loop rAF que escribe
   `#landing-v2-root{--brand:…;--brand-rgb:…}` en un `<style>` del `<head>`.
2. **Idioma** ES/EN — reescribe textos (el diseño lo hace mutando `innerHTML`; en React = diccionario + estado).
3. **Ciclo de precios** — mensual/trimestral/anual.

→ **Entregable de coordinación (lo construye 1 solo agente, primero):** `LandingBrandProvider` (client) +
hook `useLandingBrand()` en `components/landing-v2/_brand-provider.tsx`. Todas las demás secciones **consumen** este
contexto donde tengan interacción (swatches, toggle idioma, toggle ciclo). Las secciones que no interactúan solo
usan `var(--brand)` / `rgb(var(--brand-rgb) / α)` en sus estilos y **no importan nada del provider**. Ver §7.

Sin este provider, "toca un color y todo cambia" NO funciona entre componentes construidos por separado.

---

## 1. FORMATO del `.dc.html` y cómo extraer cada sección

### Cómo está codificado
- Es **HTML plano** envuelto en tags custom del runtime de Claude Design: `<x-dc>`, `<helmet>`, y un
  `<script type="text/x-dc" data-dc-script>` al final. `support.js` es **solo el runtime del preview → IGNORAR**.
- **Todo el estilo es inline** (`style="…"` en cada elemento). No hay clases de utilidad tipo Tailwind salvo unas
  pocas clases "responsive-hook" (`r-marca`, `r-dash`, `r-price`, etc.) y clases de estado (`faq-i`, `dash-fade`,
  `anim-on`, `data-reveal`, `is-in`). Los estilos responsive viven **solo** en el `<style>` del `<helmet>`
  (líneas 20-80) como overrides `!important` por media query — porque los inline no pueden llevar media queries.
- El `<helmet>` (líneas 11-81) contiene: `<title>`, metas OG, y un `<style>` con: keyframes, reglas `::selection`,
  reglas de `details`/faq, el bloque `@media (prefers-reduced-motion: no-preference)` del reveal, y **3 breakpoints
  responsive** (980 / 640 / 460 px).
- El comportamiento (WebGL, brand morph, i18n, precios, reveal, contadores, page loader, dashboard live,
  module tabs) vive en **una clase JS `Component extends DCLogic`** (líneas 859-1328). Los handlers se cablean en
  el markup con `onClick="{{ nombreHandler }}"` y se resuelven vía `renderVals()` (líneas 1305-1326).
- Atributo propietario `style-hover="…"`: es el hover del runtime DC. En el port → traducir a `:hover` (CSS module
  o styled) o a `onMouseEnter/Leave`. La mayoría son micro-efectos (`transform: translateY(-2px)`,
  `background: rgba(255,255,255,0.08)`).
- `data-i18n="key"`: marca textos traducibles (diccionario EN en JS líneas 1198-1282; ES = el `innerHTML` del markup).
- `data-reveal` + `animation-delay` inline: elemento animado al entrar en viewport (IntersectionObserver).

### Cómo transcribir fielmente
1. **Estilos inline → conservarlos como `style={{…}}`** en el JSX (camelCase). Es la vía más fiel y rápida; el diseño
   ya es "inline-first". No intentar Tailwind-izar salvo utilidades triviales. Mantener los valores EXACTOS
   (hex, rgba, px, clamp).
2. **`var(--brand)` y `rgb(var(--brand-rgb) / α)`** se dejan literales en los estilos — los alimenta el provider.
   La sintaxis `rgb(R G B / α)` (space-separated) es CSS moderno válido; conservarla.
3. **Media queries** (§sección responsive de cada componente) → mover a un CSS module por sección o a un
   `<style jsx global>`/archivo `landing-v2.css` importado por el root, replicando las clases hook (`r-marca`, etc.).
   Recomendado: **un único `landing-v2.css`** con los 3 breakpoints tal cual (líneas 44-79 del diseño), importado
   una vez por `page.tsx`. Cada constructor pone la clase hook correspondiente en su root de sección.
4. **`<img src="./eva-icon.png">` / `eva-icon-white.png`** → `next/image`. Los PNG son **585×526** (no cuadrados);
   ver §Assets. Copiar `eva-icon-white.png` a `public/` (hoy NO existe en `public/LOGOS/`).
5. **Iconos `<i data-lucide="menu">`** → `lucide-react` (`import { Menu } from 'lucide-react'`). Lista de iconos usados
   en §2. El diseño carga lucide por CDN; en el port usar el paquete (ya en el stack).
6. **`<canvas id="prism-canvas">` + Three.js** → client component con dynamic import (§3).
7. **Handlers `onClick="{{ fn }}"`** → onClick reales que llaman al contexto/estado. Mapa completo en §7.

---

## 2. MAPA SECCIÓN-POR-SECCIÓN

Tabla maestra (comentario del diseño → ancla DOM → componente destino):

| # | Header en el diseño | Ancla / id | Líneas | Componente destino |
|---|---|---|---|---|
| A | PAGE LOADER (01 · progreso) | `#pl-overlay` | 85-103 | `PageLoader` |
| B | HERO BACKDROP WebGL | (div sin id) | 105-113 | `HeroBackdrop` |
| C | NAV + MOBILE MENU + STICKY MOBILE CTA | `nav`,`#mnav`,`#mcta` | 115-155 | `LandingNav` |
| D | HERO | `#top` | 157-259 | `Hero` |
| E | MARCA · centerpiece + morphing phone | `#marca` | 261-359 | `MarcaShowcase` |
| F | 01 · MÓDULOS ("panel coach") | `#panel` | 361-422 | `ModulosSection` |
| G | COACHES · social proof | `#coaches` | 424-453 | `CoachesProof` |
| H | 02 · MÓDULOS PROFESIONALES | `#modulos` | 455-684 | `ModulosPro` |
| I | 02/03 · PRECIOS | `#precios` | 686-755 | `PreciosSection` |
| J | TEAMS | `#teams` | 757-793 | `TeamsSection` |
| K | FAQ | `#faq` | 795-823 | `FaqSection` |
| L | CTA FINAL | (section sin id) | 825-838 | `CtaFinal` |
| M | FOOTER | `footer` | 840-856 | `LandingFooter` |

**⚠️ Ojo con los anclas del nav** (no coinciden con los números de comentario):
`#marca`=Tu marca, `#panel`=**Producto** (=sección "01 MÓDULOS/panel coach"), `#modulos`=**Módulos**
(=sección "02 MÓDULOS PROFESIONALES"), `#precios`=Precios. Respetar estos `id` exactos (los usan nav, footer y
`scroll-behavior:smooth`).

### Tokens visuales globales (aplican a TODAS las secciones)
- Fondo página: `#08080a`. Texto base `#F8F9FA`. Muted `#A1A1AA`. Muted-2 `#D4D4D8`. Dim `#8A8A93`.
- Bordes: `rgba(255,255,255,0.06)` (soft) · `0.08` · `0.10` (fuerte). Dashed en tablas/faq: `rgba(255,255,255,0.09)`.
- Superficies glass: `rgba(255,255,255,0.018–0.03)` + `backdrop-filter: blur(20px)`.
- Sombra card firma: `0 8px 32px 0 rgba(0,0,0,0.37)`.
- Radios: pills `9999px`; cards `22–26px`; contenedores `24px`; chips `7–12px`.
- `max-width` de sección: **1180px**, centrado (`margin:0 auto`), padding lateral **38px** desktop (→18px móvil).
- Fuentes (familias literales del diseño): body **Inter**; headings/display **Montserrat**; wordmark "EVA" y números
  grandes **Archivo**; metadata/labels mono **Geist Mono**. Ver §4 (mapping a next/font).
- Kicker/mono típico: `font-family:'Geist Mono'; font-size:10-11px; letter-spacing:0.15-0.18em; text-transform:uppercase|lowercase; color:var(--brand) | #8A8A93`.
- Cada sección tiene `position:relative; z-index:1` (para quedar sobre el backdrop WebGL en z:0).

---

### A. `PageLoader` (líneas 85-103 + JS 1066-1095)
**DOM:** overlay `position:fixed; inset:0; z-index:200; background:#08080a`, centrado. Dentro:
- Backdrop: blob radial `620×620`, `radial-gradient(circle, rgb(var(--brand-rgb)/0.18), transparent 62%)`, `blur(90px)`;
  grid `44px` con mask radial.
- Anillo: `160×160`. SVG 1 = círculo `r=74` con `stroke-dasharray:2 7`, gira infinito (`plSpin 7s linear`). SVG 2 =
  track `r=64` gris + **arco de progreso** `#pl-arc` (`r=64`, `stroke=var(--brand)`, `stroke-dasharray:402.1`,
  `stroke-dashoffset` animado, `drop-shadow` brand). Icono `eva-icon-white.png` 56×56 flotando (`plFloat 2.8s`).
- Wordmark "EVA" (Archivo 900, 30px). Barra `200×3px` con `#pl-bar` (relleno `var(--brand)`). Caption mono
  `#pl-cap` ("// preparando tu espacio" → "// listo") + `#pl-pct` ("0%").

**JS (initPageLoader):** dura `D=1050ms`, easing cúbico in-out. Anima arc (dashoffset `C=402.1·(1-e)`), bar width
`e·100%`, pct `round(e·100)%`. Al 100% → cap="// listo", 280ms, luego fade-out (`opacity 0`, `0.55s`) y
`display:none` a los 650ms. **Gates:** si `prefers-reduced-motion: reduce` **o** `sessionStorage['eva_pl_seen']==='1'`
→ ocultar de una (`display:none`). Al correr, setea `eva_pl_seen='1'`. **Keyframes:** `plSpin`, `plFloat`.

**Port:** client component. Usa `useEffect` para el rAF, `sessionStorage`, `matchMedia`. Monta arriba de todo
(z-index 200). No bloquea SSR: renderiza visible por default y se auto-oculta (para no-JS queda oculto vía el gate
inicial — cuidado: en SSR/no-JS debe NO tapar la página; recomendado render con `opacity` controlada por estado
`mounted`, o inicial `display:none` hasta que el efecto decida mostrarlo — ver nota de a11y).

**Assets:** `eva-icon-white.png`.

---

### B. `HeroBackdrop` (líneas 105-113 + WebGL JS 980-1046) — ver §3 para el shader completo
**DOM:** contenedor `position:absolute; top:0; left:0; right:0; height:1180px; z-index:0; pointer-events:none; overflow:hidden`.
Dentro, en orden (de atrás a delante):
1. `<canvas id="prism-canvas">` — `position:absolute; inset:0; width/height:100%; opacity:0.55`; **mask radial**
   `radial-gradient(ellipse 90% 70% at 50% 28%, black 20%, transparent 88%)`.
2. **Fallback glow blobs** (también enriquecen bajo el WebGL): blob top-left `680×680` `rgb(var(--brand-rgb)/0.22)`
   `blur(100px)`; blob right `600×600` `rgb(var(--brand-rgb)/0.14)` `blur(120px)`.
3. Grid `42px` (`linear-gradient` líneas `rgba(140,140,150,0.07)`) con mask radial.
4. Fade inferior a `#08080a` (`linear-gradient(180deg, transparent 55%, #08080a 96%)`).

**Responsive:** el canvas usa `min(devicePixelRatio, innerWidth<700?1:2)` de pixel ratio. En móvil el ratio baja a 1.

**Port:** el backdrop entero es un client component lazy (`next/dynamic`, `ssr:false`). El WebGL consume `cur` (color
actual) del brand provider para el uniform `uColor` (§3). **Reduced-motion / sin WebGL / sin Three** → NO montar
el canvas, dejar solo los blobs+grid (el diseño ya trae ese fallback; los blobs usan `var(--brand-rgb)` así que
igual reaccionan al color). Ver §3 para la lógica exacta de fallback.

---

### C. `LandingNav` (líneas 115-155 + JS toggleMenu/closeMenu 1319-1320)
Tres piezas:

**C1 · NAV sticky** (`position:sticky; top:0; z-index:40; background:rgba(8,8,10,0.55); backdrop-filter:blur(20px);
border-bottom:1px solid rgba(255,255,255,0.06); padding:14px 38px; gap:28px`):
- Logo: `eva-icon.png` 23×23 (drop-shadow brand) + wordmark "EVA" (Archivo 900, 18px) con
  gradiente `linear-gradient(90deg,#2E5FA3 0%,#007AFF 55%,#00E5FF 100%)` clip-text. Link a `#top`.
- Links (`.r-navlinks`): Tu marca `#marca`, Producto `#panel`, Módulos `#modulos`, Precios `#precios`
  (13px, `#D4D4D8`, hover `#FFFFFF`).
- Derecha (`margin-left:auto`): toggle **ES/EN** (pill con 2 botones `#lang-es`/`#lang-en`), link "Iniciar sesión"
  (`.r-navlogin`, → **/login**), CTA "Crear cuenta" (pill `var(--brand)`, glow, → **/register**), y botón hamburguesa
  `.r-menubtn` (oculto desktop, `display:none`; icono lucide `menu`).

**C2 · MOBILE MENU** (`#mnav`, `position:fixed; inset:0; z-index:90; display:none`): overlay full-screen
`rgba(8,8,10,0.94)` blur(24px); botón cerrar "✕" arriba-derecha; 4 links grandes (Montserrat 800, 26px, borde
dashed inferior): Tu marca/Producto/Módulos/Precios; abajo CTA "Crear mi cuenta →" (→/register) + "Iniciar sesión"
(→/login). Cierra al click en el overlay (`closeMenu`).

**C3 · STICKY MOBILE CTA** (`#mcta`, `position:fixed; bottom:0; z-index:60; display:none`): barra inferior
`rgba(8,8,10,0.72)` blur(20px), `padding-bottom: calc(12px + env(safe-area-inset-bottom))`. CTA principal
"Crear mi cuenta →" (flex:1, →/register) + "Entrar" (→/login).

**Responsive (@640px):** `nav` gap→12px, padding→11px 16px; `.r-navlinks` y `.r-navlogin` → `display:none`;
`.r-menubtn` → `display:inline-flex`; `#mcta` → `display:flex`.

**JS:** `toggleMenu` alterna `#mnav` flex/none; `closeMenu` → none. Toggle idioma (`setLangEs/En`) y el estado
visual de los botones lang (activo `color:#FFFFFF; background:rgba(255,255,255,0.10)`).

**Datos reales:** links → `/login`, `/register` (Next `<Link>`). Ver §6. El CTA del nav actual usa
`/register?tier=pro&cycle=monthly`; **decidir** si el CTA genérico de la landing v2 va a `/register` pelado
(como el diseño) o con querystring de tier (recomendado mantener `/register` simple salvo el card Pro, ver §6).

**Assets:** `eva-icon.png`. **Iconos lucide:** `menu`.

---

### D. `Hero` (`#top`, líneas 157-259 + JS dashboard-loop 1121-1143)
`section#top: position:relative; z-index:1; padding:92px 38px 40px; max-width:1180px; margin:0 auto`.

**D1 · Encabezado centrado** (`data-reveal`):
- `<h1>` (Montserrat 900, `clamp(42px,6.4vw,88px)`, `letter-spacing:-0.045em`, `line-height:1.04`, max-width:1000px,
  text-wrap:balance): **"Una plataforma. "** + span **"Tu marca."** con `color:var(--brand)` + `text-shadow` brand.
  → **Este es el H1 visible.** Ver §5 (SEO: mapear keyword).
- `<p>` subtítulo (17px, `#A1A1AA`, max-width:660px): *"Rutinas, nutrición y una app instalable con tu logo y tu color
  — todo tu negocio de Personal Training en un solo panel. Tú entrenas a tus alumnos; EVA lleva el resto."*
- CTAs: "Crear mi cuenta gratis →" (pill brand, glow, →/register) + "Ver cómo se ve →" (glass, →`#marca`).

**D2 · Brand rail lockable** (`.r-brandrail`): pill con label mono "// el color es tuyo" + **6 swatches**
(`#sw-rail`, 22×22, radios 7px) en orden: `#007AFF`(EVA blue,lock0) `#00C7BE`(teal,lock1) `#16A34A`(verde,lock2)
`#F59E0B`(ámbar,lock3) `#FF3B1F`(energy,lock4) `#5856D6`(violeta,lock5) + botón "↻ auto" (`#brand-auto`, resumeAuto).
Al fijar, el swatch activo recibe `border:2px solid rgba(255,255,255,0.9)` (`markSwatches`).

**D3 · Showcase glass dashboard** (`data-reveal`, `margin-top:70px`): "browser window" 940px con barra de título
(3 dots mac + "app.eva-app.cl/coach"), grid `168px 1fr`:
- Sidebar (`.r-dashside`): logo + "coach · juan" + items (Centro de Control [activo, bg brand], Alumnos, Programas,
  Nutrición, Marca).
- Panel: header "// centro de control · métricas en vivo" + badge LIVE (verde `#4ADE80`); **4 KPIs**
  (`.r-dashkpis`): Ingresos mes `$890k`, Alumnos `24`, Planes activos `18`, **Adherencia 7d `#kpi-adh` `87%`**
  (card brand); **sparkline SVG** (path `data-draw` con `prismDraw` animación, `stroke=var(--brand)`, fill gradient
  `#prismfill`); **3 filas de alumnos**: María Aguilar (`#dr0-s` "sin-registrar-8d" rojo / `#dr0-p` 12%),
  Joaquín Muñoz ("pr-nuevo · bench-press" verde / 98%), Camila Pérez (`#dr2-s` "racha · 12d" / 96%). Avatares
  `background:var(--brand)`.

**JS dashboard live-loop (initDashLoop, 4200ms):** cicla 3 frames mutando con fade (opacity 0→1, 300ms):
`#kpi-adh` (87→88→88%), `#dr0-s` (sin-registrar-8d rojo → "registró · hoy" verde → verde), `#dr0-p` (12→38→54%),
`#dr2-s` (racha 12d → racha 13d → "pr-nuevo · sentadilla"). **Gate reduced-motion → no corre.** En React: `useState`
índice de frame + `setInterval`, o `useReducer`. Clase `.dash-fade` = `transition:opacity 0.3s`.

**Responsive:** `@640px` `.r-dash`→1 col, `.r-dashside`→`display:none`, `.r-dashkpis`→2 cols.

**Assets:** `eva-icon-white.png` (sidebar). **Sin lucide.** Swatches disparan `useLandingBrand().lockBrand(i)`.

---

### E. `MarcaShowcase` (`#marca`, líneas 261-359)
`padding:130px 38px 60px; max-width:1180px`.

**E1 · Header centrado:** icono `eva-icon-white.png` 40×40; kicker "// white-label" (`var(--brand)`); `<h2>` (Montserrat
800, `clamp(30px,4vw,54px)`): **"El mismo motor. Mil marcas distintas."**; lede (16px `#A1A1AA` max-width:600px):
*"Tu alumno nunca ve 'EVA'. Ve tu logo, tu nombre y tu color… Toca un color arriba para fijarlo — todo el sitio
cambia contigo."*

**E2 · Grid `1fr 1.05fr` gap:56px** (`.r-marca`):
- **Izquierda:** 3 beneficios con barra vertical brand (`wl_p1t/d`, `wl_p2t/d`, `wl_p3t/d`) — títulos 15px,
  descripciones 13.5px `#A1A1AA`. El 3º menciona "código de 5 dígitos" (span mono `var(--brand)`). Debajo, card
  dashed "// pruébalo en vivo · fija un color" con **6 swatches grandes 30×30** (`.r-swbig`, `lock0..5`) + "↻ auto"
  (resumeAuto). **Mismos handlers que el brand rail del hero.**
- **Derecha:** **morphing phone** (`min-height:560px`). Glow radial brand detrás. Marco teléfono 268px
  (`border-radius:42px`, notch, `box-shadow` con brand). Pantalla `#0a0a0a` height:540px con app del alumno:
  header "Coach Juan / juan.eva-app.cl" + badge "12d" (bg brand); "// hoy · martes" + "Push Day · A"; botón
  "▶ Empezar entreno" (bg brand); 3 anillos SVG (Entrenos 78/var--brand, Nutrición 72/var--brand, Check-ins 85/`#4ADE80`);
  3 filas ejercicio (Bench Press activa con dot+bg brand, Incline DB, Cable Fly). **Todo lo brand transiciona con el
  color.**

**Responsive:** `@980px` `.r-marca`→1 col, gap:40px, el teléfono (`>div:last-child`) pasa a `order:-1; min-height:440px`.

**Assets:** `eva-icon-white.png`. Swatches → `lockBrand`/`resumeAuto` del provider.

---

### F. `ModulosSection` (`#panel`, "01 · panel coach", líneas 361-422 + JS initCounts)
`padding:110px 38px 40px`.

**F1 · Header** (max-width:700px): kicker "// 01 · panel coach"; `<h2>` **"Todo tu negocio, en un panel."**; lede
*"Deja las planillas y los PDFs. Cada módulo está construido para operar con 30+ alumnos sin perder el control."*

**F2 · Tabla de 4 features** (card glass, filas `grid 92px 1fr auto`, `.r-row`, dashed entre filas):
- 01 **Builder de rutinas** — "Supersets, RIR, descansos y **818 ejercicios** con GIF…" — tag "818 ejercicios".
- 02 **Nutrición** — "Planes de comida con macros… Disponible desde el plan Pro." — tag "macros · log diario".
- 03 **Seguimiento en vivo** — "Adherencia, PRs, peso y rachas… Alertas automáticas…" — tag "tiempo real".
- 04 **Tu marca, no la nuestra** — fila **destacada** (bg `rgb(var(--brand-rgb)/0.05)`, barra izquierda brand,
  número `04` en `var(--brand)`) — tag "white-label" (borde brand).

**F3 · Franja de 4 stats** (`.r-stat`, `grid repeat(4,1fr)`, border top+bottom): **818** (ejercicios con gif, `.r-count`
`data-count=818`), **17** (grupos musculares, `data-count=17`), **100%** (tu marca visible, `data-count=100`
`data-suffix=%`, color brand), **$0** (plan para empezar — estático, sin count-up).

**JS initCounts:** count-up al entrar en viewport (IO threshold 0.6), 1200ms, easing `1-(1-x)^3`,
`toLocaleString('es-CL')`. **Port:** hook `useCountUp` + IntersectionObserver.

**⚠️ Dato "818 ejercicios":** el diseño hardcodea **818**. La realidad = `getExerciseCount()` (count real de
`exercises` con `coach_id null`, fallback **129**). **Decidir (§6):** usar el número real (prop `exerciseCount`) en
Builder/stat/FAQ, o mantener 818 como número de marketing. Recomendado: **usar el real** para no mentir (el count
aparece en 3 lugares: F2 fila 01, F3 stat 818, FAQ a4, y card Free en Precios pf_3). El diseño dice 818 pero el count
real actual ronda 129 — **esto es una discrepancia grande, escalar a decisión de negocio.**

**Responsive:** `@640px` `.r-row`→`grid 52px 1fr`, `.r-rowtag`→`display:none`, `.r-stat`→2 cols.

---

### G. `CoachesProof` (`#coaches`, líneas 424-453)
`padding:90px 38px 0`. Header centrado: kicker "// coaches que ya operan con eva"; `<h2>`
**"Menos planilla. Más coaching."**. Grid `repeat(3,1fr)` (`.r-social`) de 3 `<figure>` testimonios:
- Carolina M. (CM) — "Pasé de cinco planillas a una app con mi logo…" — "coach online · 28 alumnos".
- Rodrigo S. (RS) — "El builder me ahorra horas cada semana…" — "preparador físico · 41 alumnos".
- Valentina R. (VR) — "Mis alumnos creen que la app es mía…" — "estudio boutique · 2 coaches".

Avatares con iniciales, `background:var(--brand)`. **⚠️ Testimonios ficticios** — copy de diseño. Mantener (no hay
testimonios reales en el código). Responsive `@980px` `.r-social`→1 col.

---

### H. `ModulosPro` (`#modulos`, "02 · módulos profesionales", líneas 455-684 + JS switchModule)
`padding:110px 38px 30px`. **La sección más grande.**

**H1 · Header** (max-width:760px): kicker "// 02 · módulos profesionales"; `<h2>` **"Las herramientas que usan los
profesionales de verdad."**; lede largo (cada módulo reemplaza Excel/Canva/calculadora…); badge pill brand
**"add-on · $9.990/mes c/u · enciende solo los que uses"**.

**H2 · Tabs de 4 módulos** (`.r-modtabs`, `grid repeat(4,1fr)`, botones `#modt-0..3`): cada tab = número mono + icono
lucide + título + subtítulo. Estado activo = borde `var(--brand)` + bg `rgb(var(--brand-rgb)/0.06)` + número/icono brand.
1. **Cardio por zonas** (`activity`) — "Prescripción cardiovascular".
2. **Evaluación de movimiento** (`person-standing`) — "Screening de 7 patrones".
3. **Composición corporal** (`ruler`) — "Antropometría ISAK + BIA".
4. **Nutrición por intercambios** (`salad`) — "El método chileno, digital".

**H3 · Paneles `#modp-0..3`** (card glass; solo 1 visible, resto `display:none`; el 0 arranca visible). Cada panel =
grid `1fr 1.05fr` (`.r-modgrid`): columna texto (h3 + descripción + 3 pasos numerados 01/02/03 con `var(--brand)`
+ chips) y columna **mockup/dataviz** (bg `rgba(0,0,0,0.22)`, borde izq):
- **modp-0 Cardio:** 5 barras de zonas FC (Z1-Z5, colores `#3B82F6/#14B8A6/#22C55E/#F59E0B/#EF4444`; Z4 destacada
  con outline ámbar) + rangos ppm + chip "8 × 400 m en Z4 · pausa 90 s". Chips: "fórmulas Tanaka + Karvonen",
  "running · ciclismo · crossfit".
- **modp-1 Movimiento:** semáforo (rojo/amarillo/verde, el amarillo con glow) + "Prioridad media · 15/21" + **7 patrones**
  con barras de 3 segmentos (Sentadilla profunda, Paso de valla, Estocada en línea [con tag "L≠R"], Movilidad de hombro,
  Elevación activa de pierna, Estabilidad de tronco, Estabilidad rotatoria). Nota "no es diagnóstico médico" (icono
  `shield-alert`).
- **modp-2 Composición corporal:** toggle ISAK/BIA (chips) + barra 5 componentes (Muscular/Grasa/Ósea/Residual/piel)
  con leyenda (Muscular 34,3kg 44% [brand], Grasa 13,3kg, Ósea 12,5kg, Residual 14,0kg) + cards Somatotipo "Mesomorfo"
  y "% grasa 17,1%" (brand). Chips: "Durnin · Yuhasz · Faulkner", "nutricionistas · prep. físicos". Icono `-`.
- **modp-3 Nutrición intercambios:** header "// app del alumno · 1.860 kcal · día entreno" + 3 comidas (Desayuno 410kcal,
  Almuerzo 620kcal, Once 380kcal) con chips de porciones coloreadas (C/LÁC/F/PROT/V/GR/SCOOP) + banner "Pauta en PDF con
  tu marca" (icono `file-text`, bg brand). 9 chips de grupos (Cereales, Proteínas, Frutas, Verduras, Lácteos, Lípidos,
  Grasas, Scoop, Legumbres).

**JS switchModule(i):** muestra `#modp-i` (`display:grid`), oculta el resto (`none`); repinta estados de los 4 tabs.
**Port:** `useState(activeModule)` local (0-3). NO necesita el provider (estado local de sección), pero SÍ usa
`var(--brand)` en los estilos activos.

**Datos reales:** el precio "$9.990/mes c/u" = precio uniforme add-on self-service (memoria: `$9.990/mod`,
`packages/module-catalog`). Los 4 módulos = cardio / movement / body_composition / nutrition-Pro (intercambios) —
alineados con el catálogo real. Ver §6.

**Responsive:** `@980px` `.r-modgrid`→1 col (borde izq→borde top). `@640px` `.r-modtabs`→2 cols, `.r-modgrid`→1 col.

**Iconos lucide:** `activity`, `person-standing`, `ruler`, `salad`, `shield-alert`, `file-text`.

---

### I. `PreciosSection` (`#precios`, líneas 686-755 + JS prices/setCycle 1174-1195)
`padding:110px 38px 60px`.

**I1 · Header centrado:** kicker "// 03 · precios"; `<h2>` **"Paga por cupo de alumnos."**; lede *"Sin contratos.
Cambia o cancela cuando quieras. Ahorra hasta 20% con prepago anual."*; **toggle de ciclo** (`.r-cyc`, botones
`#cyc-m`/`#cyc-q`/`#cyc-a`): **Mensual** / **Trimestral −10%** / **Anual −20%** (activo = bg brand); nota mono
"// equivalente mensual · facturado por período · clp".

**I2 · 3 cards** (`.r-price`, `grid repeat(3,1fr)`, max-width:1020px):
- **Free** ($0) — "Hasta 3 alumnos, para siempre." — ✓ Hasta 3 alumnos activos, ✓ Builder completo,
  ✓ Catálogo 818 ejercicios con GIF, ✗ Sin módulo de nutrición — CTA "Empezar gratis" (→/register).
- **Pro** (destacada, badge "más popular", glow brand) — `data-price="pro"` `$29.990` — "más cupos y nutrición
  incluida." — ✓ 11–30 alumnos, ✓ Nutrición incluida, ✓ White-label, ✓ Check-ins/progreso/alertas —
  CTA "Elegir Pro →".
- **Elite** — `data-price="elite"` `$44.990` — "alto volumen de alumnos." — ✓ **31–60 alumnos** ⚠️, ✓ Todo lo de Pro,
  ✓ Descuentos prepago anual, ✓ Soporte prioritario — CTA "Elegir Elite".

Nota inferior: "// también: starter (1–10) · growth (61–120) · scale (hasta 500) — todos con rutinas ilimitadas y
dashboard".

**JS setCycle(c):** cambia los `[data-price]` a `prices()[plan][c]` y repinta los 3 botones de ciclo. **Precios
hardcodeados en el diseño** (líneas 1177-1178):
```
pro:   { m:29990, q:26990, a:23990 }
elite: { m:44990, q:40490, a:35990 }
```
`fmt(n)` = `$` + miles con puntos.

**⚠️ DATOS REALES — NO hardcodear (§6):** portar usando `@eva/tiers`:
- `getTierPriceClp(tier, cycle)` (total del período) y mostrar **equivalente mensual** =
  `Math.round(getTierPriceClp(tier, cycle) / BILLING_CYCLE_CONFIG[cycle].months)` (exactamente como
  `LandingPricingPreview.tsx:234`). Valores reales resultantes:
  - Pro: m **29.990** · q **26.991** · a **23.992** (diseño mostraba 26.990/23.990 — redondeo cosmético)
  - Elite: m **44.990** · q **40.491** · a **35.992** (diseño 40.490/35.990)
- **Rango Elite:** usar `TIER_STUDENT_RANGE_LABEL.elite` = **"31–100 alumnos"** (NO 31–60 del diseño; el maxClients real
  de elite = 100).
- Free: `TIER_STUDENT_RANGE_LABEL.free` = "Hasta 3 alumnos" ✓.
- Pro: "11–30 alumnos" ✓.
- CTAs → `/register?tier=<id>&cycle=<cycle actual>` (patrón real de `LandingPricingPreview`), o `/register` pelado
  para Free. El ciclo del querystring debe reflejar el toggle activo.
- Ciclos y descuentos (10%/20%) → `BILLING_CYCLE_CONFIG` (no hardcodear los %).
- Nota "starter/growth/scale" → derivar de `TIER_STUDENT_RANGE_LABEL` (starter 1–10, growth 61–120, scale Hasta 500) ✓.

**Estado ciclo compartido:** vive en el provider (§0/§7) para que el toggle y los 3 precios estén sincronizados.
El diseño lo tiene local, pero como el provider ya centraliza estado transversal, poné `cycle` ahí (o local a esta
sección si se decide que ninguna otra sección lo necesita — hoy ninguna otra lo usa, así que **local a
PreciosSection es aceptable**; documentar la decisión).

**Responsive:** `@980px` `.r-price`→1 col, max-width:460px. `@640px` `.r-cyc`→wrap centrado.

---

### J. `TeamsSection` (`#teams`, líneas 757-793)
`padding:40px 38px 100px`. Card grande (`.r-teams`, `grid 1.1fr 1fr` gap:48px, radius:26px, glass, glow brand):
- **Izquierda:** kicker "// modo teams"; `<h2>` **"¿Más de un coach? Trabajen en el mismo panel."**; lede
  *"Modo Teams: pool de alumnos compartido, datos aislados por coach y reportes del equipo… Para duplas, estudios y
  gimnasios boutique."*; CTA "Conocer Teams →" (glass) → **mailto**.
- **Derecha:** 3 items con icono lucide: `users` "Pool de alumnos compartido" / "Asigna alumnos a coaches con un clic";
  `shield` "Datos aislados por coach" / "Privacidad a nivel de base de datos"; `bar-chart-3` "Reportes del equipo" /
  "Adherencia y alertas de todos, en vivo".

**Datos reales:** el diseño usa `mailto:contacto@eva-app.cl?subject=EVA%20Teams`. **Usar** `SALES_EMAIL` /
`teamsContactMailto()` de `lib/brand-assets.ts` (subject real: "EVA Teams - quiero conversar"). **Regla dura anti-precio:
Teams NO lleva números de precio** (memoria movida-commercial + el `teamsJsonLd` del page.tsx no lleva price). El diseño
ya respeta esto (solo capacidades + CTA de contacto). Mantener.

**Responsive:** `@980px` `.r-teams`→1 col, gap:30px, padding:34px 30px.
**Iconos lucide:** `users`, `shield`, `bar-chart-3`.

---

### K. `FaqSection` (`#faq`, líneas 795-823)
`padding:20px 38px 60px; max-width:820px`. Header centrado: kicker "// preguntas frecuentes"; `<h2>`
**"Antes de que preguntes."**. Card glass con **5 `<details class="faq-i">`** nativos (dashed entre ellos), summary con
"+" que rota 45° al abrir (`.faq-x`, `details[open] .faq-x{transform:rotate(45deg)}`):
1. ¿Puedo cancelar cuando quiera? → "Sí. No hay contratos…"
2. ¿Qué pasa si supero mi cupo? → "Subes al plan siguiente con un clic…"
3. ¿Mis alumnos pagan algo por la app? → "No. Instalan tu app gratis y entran con un código de 5 dígitos…"
4. ¿Puedo migrar mis rutinas desde Excel? → "Sí. Cargas tu rutina una vez… con los **818 ejercicios**…" (⚠️ ver F2 count)
5. ¿Necesito tarjeta para empezar? → "No. El plan Free es permanente para hasta 3 alumnos…"

**Port:** usar `<details>`/`<summary>` nativos (0 JS, funciona sin hidratar). CSS: ocultar el marker default
(`summary::-webkit-details-marker{display:none}`), `list-style:none`, transición del "+". **Bonus SEO:** considerar
`FAQPage` JSON-LD con estas 5 QA (no existe hoy; upside, ver §5).

**Responsive:** hereda paddings globales `@640px`.

---

### L. `CtaFinal` (section sin id, líneas 825-838)
`padding:40px 38px 110px`. Card centrada (radius:30px, borde brand, glow radial inferior brand): icono
`eva-icon-white.png` 36×36; kicker "// listo cuando tú lo estés"; `<h2>` (Montserrat 900, `clamp(36px,5vw,64px)`)
**"Profesionaliza tu coaching."**; sub *"Crea tu cuenta en minutos… Empiezas gratis, sin tarjeta."*; CTAs
"Crear mi cuenta →" (brand, →/register) + "Escríbenos" (glass, → `mailto:contacto@eva-app.cl`).

**Assets:** `eva-icon-white.png`. Mailto → `SALES_EMAIL`.

---

### M. `LandingFooter` (`footer`, líneas 840-856)
`border-top; padding:36px 38px; max-width:1180px; flex justify-between wrap`. Izquierda: `eva-icon.png` 18×18 +
wordmark "EVA" (Archivo 900) + "© 2026". Centro/derecha links: Tu marca `#marca`, Producto `#panel`, Módulos
`#modulos`, Precios `#precios`, **Aviso legal → /legal** (el diseño apunta a `AvisoLegal.dc.html`), y
`mailto:contacto@eva-app.cl`. Mono derecha: "// hecho en chile · pwa instalable · sin tracking de terceros".

**Responsive:** `@640px` `footer` `padding-bottom:112px` (para no chocar con el sticky mobile CTA).
**Datos reales:** Aviso legal → **/legal** (existe: `app/legal/page.tsx`). Email → `SALES_EMAIL`.
**Assets:** `eva-icon.png`.

---

## 3. WEBGL del hero — shader completo + fallback

**Approach:** Three.js `r160` (CDN en el diseño; en el port usar `three` del stack — **verificar si está instalado**,
si no `pnpm add three` + `@types/three`). Un **full-screen quad** (`PlaneGeometry(2,2)`) con `OrthographicCamera(-1,1,1,-1,0,1)`
y un **`ShaderMaterial`** con fragment shader de **fBm noise** teñido por el color de marca. NO es canvas 2D.

**Uniforms:**
```
uTime  : float   (now/1000, 0 si reduced-motion)
uRes   : vec2    (canvas w,h)
uColor : vec3    (color de marca actual, cur[]/255)  ← lo alimenta el brand engine cada frame
uNavy  : vec3    (0.02, 0.05, 0.13)  ← navy fijo, sombra base
```

**Vertex shader:**
```glsl
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
```

**Fragment shader (verbatim):**
```glsl
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform vec2 uRes; uniform vec3 uColor; uniform vec3 uNavy;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int k=0;k<5;k++){ v+=a*vnoise(p); p*=2.02; a*=0.5; } return v; }
void main(){
  vec2 uv = vUv; uv.x *= uRes.x / uRes.y;
  float t = uTime * 0.04;
  vec2 q = vec2(fbm(uv*1.6 + t), fbm(uv*1.6 + vec2(5.2,1.3) - t));
  float n = fbm(uv*1.6 + q*1.4 + t*0.5);
  vec3 bright = clamp(uColor*1.25 + 0.05, 0.0, 1.0);
  vec3 col = mix(uNavy, uColor, smoothstep(0.12, 0.85, n));
  col = mix(col, bright, smoothstep(0.55, 0.96, q.x));
  col *= 0.62;
  gl_FragColor = vec4(col, 1.0);
}
```

**Setup (initWebGL, 980-1046):**
- `new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true })` dentro de try/catch → si falla, **return**
  (queda solo el fallback de blobs/grid del DOM).
- `setPixelRatio(min(devicePixelRatio||1, innerWidth<700 ? 1 : 2))`.
- `resize()` con `ResizeObserver` sobre el canvas (setSize + uRes).
- **Render on-demand:** un frame inmediato tras setup; luego el brand engine (§brand) renderiza **solo si
  `glVisible !== false`** (IntersectionObserver sobre el canvas — pausa el render fuera de viewport). Ahorro de GPU.
- Espera a que `window.THREE` exista (poll cada 150ms hasta 40 intentos) — en el port con import directo no hace falta el poll.

**Loop de color (initBrandEngine, 924-947):** un ÚNICO rAF que (a) avanza el color, (b) actualiza uniforms
`uColor` (`cur/255`) y `uTime`, y (c) llama `renderer.render()` si el canvas está visible. **Es el mismo rAF del brand
engine** — WebGL y color comparten loop. En el port, el `HeroBackdrop` recibe `cur` (o un ref) del provider y actualiza
el uniform en su propio rAF, o el provider expone un callback de suscripción por-frame. Recomendado: **el provider
corre el rAF del color y expone `cur` vía ref**; `HeroBackdrop` corre su propio rAF de render leyendo ese ref (menos
acoplado, evita re-renders de React por frame).

**FALLBACK (reduced-motion / sin WebGL / WebGLRenderer throw / Three ausente):**
- El diseño **siempre** renderiza los blobs+grid del DOM (líneas 108-111) — el canvas va *encima* con `opacity:0.55`.
  Si el canvas no monta, quedan los blobs (que **igual usan `var(--brand-rgb)`** → reaccionan al color, sin animación).
- `prefers-reduced-motion: reduce`: `uTime` se congela en 0 (campo estático) — el diseño NO apaga el canvas en reduced,
  solo lo congela. **Decisión de port recomendada:** en reduced-motion **no montar el WebGL** y dejar solo blobs+grid
  (más barato, sin GPU idle, mismo look estático). El requerimiento pide justamente "reduced-motion → fallback blobs".
- **Port:** `HeroBackdrop` = `dynamic(() => import('./HeroBackdropGL'), { ssr:false, loading: <BlobsFallback/> })`.
  El componente chequea `matchMedia('(prefers-reduced-motion: reduce)')` y feature-detect WebGL antes de instanciar;
  si falla → renderiza solo `<BlobsFallback/>` (los 2 blobs + grid + fade, que son DOM puro con `var(--brand-rgb)`).

---

## 4. TOKENS — `colors_and_type.css` vs EVA DS (`app/globals.css`), y tokens NUEVOS de la landing

### Qué es `colors_and_type.css`
Es un **espejo del DS de la app** ("Source of truth: gymappjp codebase src/app/globals.css + brand assets"), NO una
paleta nueva. Reexpone los mismos colores EVA (`--eva-blue #007AFF`, navy, cyan, energy, ámbar, verde, violeta,
teal), neutrales dark/light, radios, y **las familias tipográficas Inter/Montserrat/Archivo/Geist Mono**. Útil como
referencia de valores, pero **la landing v2 casi no usa estas clases** — el diseño estiliza inline con hex/rgba
literales. Lo único "vivo" que importa es la lista de colores de la paleta (que el JS reusa) y las familias de fuente.

### La landing Prism NO introduce una paleta nueva — introduce un MECANISMO nuevo
El aporte propio de la landing v2 no son colores nuevos sino **CSS variables runtime dinámicas**:
- `--brand` (formato `rgb(R G B)`) y `--brand-rgb` (formato `R G B`, para `rgb(... / α)`) — **escritas cada frame por
  JS** en `#prism-root` (en el port: `#landing-v2-root`). Valor inicial `0 122 255` (EVA blue).
- `--sel-rgb` (en `<html>`, para `::selection`).
- La **palette** que el color recorre (JS 872-880), como constante TS:
  ```
  [0,122,255]  EVA blue
  [0,199,190]  teal      (#00C7BE)
  [22,163,74]  green     (#16A34A)
  [245,158,11] amber     (#F59E0B)
  [255,59,31]  energy    (#FF3B1F)   ← solo se fija a mano (excluido del auto-drift: this.ring)
  [88,86,214]  violet    (#5856D6)
  [0,229,255]  cyan      (#00E5FF)
  ```
  El auto-drift recorre `ring = palette sin el índice 4 (energy)`.

### Tokens que la landing NECESITA (scopear a la landing, NO tocar el DS de la app)
| Token / recurso | Estado en la app | Acción para landing-v2 |
|---|---|---|
| `--brand` / `--brand-rgb` runtime | El DS usa `--brand` con otro significado (sport-500) en toda la app | **Scopear a `#landing-v2-root`** vía `<style id="landing-v2-brand-style">` inyectado en `<head>` por el provider. NO reusar el `--brand` del DS: colisiona. Usar el id-scope para aislar. |
| paleta 7 colores | — | Constante TS en `_brand-provider.tsx` (no CSS var). |
| Fuente **Inter** | `--font-inter` (next/font, en `<html>`) | Reusar `var(--font-inter)`. |
| Fuente **Montserrat** | `--font-montserrat` (next/font) | Reusar `var(--font-montserrat)`. |
| Fuente **Archivo** | `--font-archivo` (next/font) | Reusar `var(--font-archivo)`. |
| Fuente **Geist Mono** | ❌ NO cargada (la app usa **JetBrains Mono** = `--font-jetbrains-mono`) | **NUEVO.** Opción A (recomendada): `import { Geist_Mono } from 'next/font/google'` con `variable:'--font-geist-mono'`, aplicar `.variable` al root de la landing. Opción B: mapear `'Geist Mono'` → `var(--font-jetbrains-mono)` (existente, evita otra webfont). Decidir según fidelidad vs peso. |
| Fondo `#08080a` | El DS dark usa `--surface-app` (~`#121212`) | Literal en la landing (más oscuro que el DS a propósito). No es token del DS. |

### Mapping de `font-family` para los constructores (aplicar a TODOS los literales del diseño)
Los estilos inline del diseño usan literales de familia. Para que resuelvan con next/font, **reemplazar** en cada
`font-family`:
```
'Inter', …                       → var(--font-inter), ui-sans-serif, system-ui, sans-serif
'Montserrat', …                  → var(--font-montserrat), var(--font-inter), sans-serif
'Archivo', 'Montserrat', …       → var(--font-archivo), var(--font-montserrat), sans-serif
'Geist Mono', monospace          → var(--font-geist-mono), ui-monospace, monospace   (opción A)
                                   [o var(--font-jetbrains-mono) en opción B]
```
El root de la landing (`page.tsx` o el provider) debe garantizar que estas CSS vars existan en su subárbol
(Inter/Montserrat/Archivo ya vienen de `<html>` por layout; Geist Mono se agrega). **Aplicar el mapping es mecánico y
uniforme — cada constructor lo hace en su sección** para no crear un cuello de botella.

**Regla CLAUDE.md:** NO modificar `app/globals.css` ni el `@theme` del DS. Todo lo de la landing va **scopeado**
(id-scope `#landing-v2-root` + CSS module/`landing-v2.css` propio + fuente scopeada). La landing es dark-only
(no participa del toggle light/dark del DS).

---

## 5. SEO A PRESERVAR (inventario del código actual)

**Todo esto vive en `apps/web/src/app/page.tsx` (server component) y DEBE conservarse verbatim en el `page.tsx` nuevo:**

1. **`metadata` export (Next Metadata API):**
   - `title: { absolute: 'Software para Personal Trainers y Gyms en Chile | EVA' }`
   - `description: 'EVA: plataforma para coaches, personal trainers y centros de entrenamiento. Rutinas, nutrición,
     evaluaciones y app con tu marca. Desde gratis — EVA Teams para equipos.'`
   - `keywords: ['software gym chile','software academia deportiva','app personal trainer','gestión coaches',
     'software centro entrenamiento']`
   - `alternates.canonical: '/'` (canónico www lo resuelve `resolveMetadataBase()` → NO tocar; el canónico real es
     `www.eva-app.cl`, memoria SEO).
   - `robots: { index:true, follow:true }`.
   - **⚠️ El `<title>`/OG del diseño** ("EVA — Escala tu negocio de Personal Training") es de menor valor SEO que el
     actual (que lleva "Software para Personal Trainers y Gyms en Chile"). **Mantener el `metadata` actual, descartar
     el `<title>` del diseño.**

2. **JSON-LD inline (2 bloques `<script type="application/ld+json">` server-rendered, sin next/script):**
   - `jsonLd`: `@graph` con **Organization** (`@id #org`, name EVA, legalName "EVA Technology SpA", logo `/icon.png`,
     email contacto@eva-app.cl), **WebSite**, **SoftwareApplication** (offers price "0" CLP, InStock).
   - `teamsJsonLd`: **Service** "EVA Teams" — **SIN price/priceCurrency** (regla anti-precio) — con `hasOfferCatalog`
     (Pool de alumnos / La marca de tu centro / Módulos profesionales / Equipo self-service) + `contactPoint` sales
     (`SALES_EMAIL`).
   - **Ambos se renderizan igual en el nuevo page.tsx** (copiar el bloque tal cual, incluido `resolveMetadataBase()`,
     `homeUrl`, `orgId`). Usan `dangerouslySetInnerHTML` con `JSON.stringify`.

3. **H1 con keyword — mapeo diseño vs actual:**
   - **Actual (rendered):** H1 con typewriter i18n (`landing.typewriter.*`), keyword-rich (menciona Personal
     Trainer/negocio). Un solo `<h1>`.
   - **Diseño v2 (visual):** `<h1>` = **"Una plataforma. Tu marca."** — visualmente manda, pero **carece del keyword
     "Personal Trainer / Chile / gym"**. El keyword sí aparece en el **subtítulo `<p>`** ("todo tu negocio de Personal
     Training…").
   - **Decisión requerida (§6):** el H1 debe seguir siendo **un único `<h1>`** y idealmente cargar keyword. Opciones:
     (a) dejar el H1 visual tal cual y confiar en title+description+subtítulo (keyword ahí); (b) agregar un
     `<span className="sr-only">` dentro del H1 con "Software para Personal Trainers en Chile" (keyword invisible,
     válido). **Recomendado (b)** — preserva el visual y el keyword. Un solo H1 en toda la página; el resto son `<h2>`.

4. **Idioma / locale:** el `<html lang="es-CL">` lo setea `layout.tsx` (no la landing) — **NO cambiar**. El toggle
   ES/EN de la landing es solo visual (no cambia `lang` ni URL). Verificar que layout mantiene `es_CL`.

5. **robots.txt / sitemap:** viven fuera de la landing (`app/robots.ts` / `app/sitemap.ts` u similar) — **intactos**,
   no los toca este trabajo.

6. **Upside opcional (no romper nada):** agregar un 3er JSON-LD **`FAQPage`** con las 5 QA de §K (Google rich results).
   Solo si sobra tiempo; no es "preservar" sino mejorar. No bloquea.

**Checklist de no-regresión SEO:** title absoluto ✓ · description ✓ · keywords ✓ · canonical '/' ✓ · robots index/follow ✓
· 2 JSON-LD (graph + teams sin precio) ✓ · 1 solo H1 con keyword (sr-only) ✓ · lang es-CL (layout) ✓ · OG del diseño
descartado a favor del metadata actual ✓.

---

## 6. DATA REAL vs diseño (grep hecho — valores confirmados)

### Precios / tiers (`packages/tiers/index.ts` — fuente única `@eva/tiers`)
| Concepto | Diseño (hardcode) | REAL (usar esto) | Fuente |
|---|---|---|---|
| Pro mensual | $29.990 | **29990** | `TIER_CONFIG.pro.monthlyPriceClp` |
| Pro trimestral (equiv/mes) | $26.990 | **26991** = `round(getTierPriceClp('pro','quarterly')/3)` | `getTierPriceClp`+`BILLING_CYCLE_CONFIG` |
| Pro anual (equiv/mes) | $23.990 | **23992** = `round(getTierPriceClp('pro','annual')/12)` | idem |
| Elite mensual | $44.990 | **44990** | `TIER_CONFIG.elite.monthlyPriceClp` |
| Elite trimestral (equiv/mes) | $40.490 | **40491** | idem |
| Elite anual (equiv/mes) | $35.990 | **35992** | idem |
| Free precio | $0 | **0** | `TIER_CONFIG.free` |
| Rango Free | Hasta 3 alumnos | **Hasta 3 alumnos** ✓ | `TIER_STUDENT_RANGE_LABEL.free` |
| Rango Pro | 11–30 | **11–30 alumnos** ✓ | `.pro` |
| Rango Elite | **31–60** ⚠️ | **31–100 alumnos** | `.elite` (maxClients=100) |
| Starter/Growth/Scale (nota) | 1–10 / 61–120 / hasta 500 | **1–10 / 61–120 / Hasta 500** ✓ | `TIER_STUDENT_RANGE_LABEL` |
| Descuentos ciclo | −10% / −20% | **10% / 20%** | `BILLING_CYCLE_CONFIG.{quarterly,annual}.discountPercent` |
| Add-on módulos | $9.990/mes c/u | **$9.990** (uniforme self-service) | `packages/module-catalog` / memoria addons |

→ **PreciosSection importa `@eva/tiers` y computa; NO copia los números del JS del diseño.** El leve delta
(26.990 vs 26.991) confirma que el diseño redondeó a mano — la realidad manda.

### 818 ejercicios (aparece en 4 lugares: F2 Builder, F3 stat, Precios Free pf_3, FAQ a4)
- Diseño: **818**. Real: `getExerciseCount()` en `page.tsx` = count real de `exercises` (coach_id null), **fallback 129**.
- **⚠️ Discrepancia grande (818 vs ~129).** Decisión de negocio. Opciones: (a) pasar `exerciseCount` real como prop a
  las 4 apariciones (honesto, pero puede leerse "pobre" si es 129); (b) mantener 818 (marketing) — requiere confirmar
  que el catálogo real tiene ~818 (el fallback 129 sugiere que NO). **Escalar al CEO/orquestador.** El `page.tsx` ya
  trae el mecanismo (`getExerciseCount()`), así que la vía técnica está lista para pasar el número real.

### Links del nav / footer / CTAs → rutas reales (verificadas)
| Diseño (href) | Ruta real | Existe |
|---|---|---|
| `./Register.dc.html` | **/register** (o `/register?tier=pro&cycle=<c>` en cards de plan) | ✓ `app/(auth)/register` |
| `./Login.dc.html` | **/login** | ✓ `app/(auth)/login` |
| `./AvisoLegal.dc.html` | **/legal** | ✓ `app/legal/page.tsx` |
| `#top #marca #panel #modulos #precios` | anclas internas (mismos id) | ✓ |
| `mailto:contacto@eva-app.cl` | `SALES_EMAIL` (`lib/brand-assets.ts`) | ✓ |
| Teams `mailto:…?subject=EVA%20Teams` | `teamsContactMailto()` (subject "EVA Teams - quiero conversar") | ✓ |

Nota: la landing actual usa CTA `/register?tier=pro&cycle=monthly` (LandingPillNav). Para v2: **CTAs genéricos → `/register`**
(como el diseño); **card Pro → `/register?tier=pro&cycle=<ciclo activo>`**, **card Elite → `?tier=elite&cycle=<c>`**,
**Free → `/register`**. Mantener consistencia con el patrón real (`getDefaultBillingCycleForTier`).

### Teams (`#teams`) vs realidad
- Modo Teams es **feature permanente viva** (memoria: tabla `teams`, rutas `/t/[team_slug]`, `/admin/teams`). El pitch
  del diseño (pool compartido, datos aislados por coach RLS, reportes de equipo) coincide con la realidad. **Sin precio
  público** (regla anti-precio). CTA = contacto de ventas. Todo correcto, mantener.

### Módulos profesionales vs catálogo real
Los 4 = **cardio / movement (evaluación movimiento) / body_composition / nutrition-Pro (intercambios)** — alineados con
`MODULE_KEYS` / `packages/module-catalog`. Precio $9.990/mes uniforme self-service (memoria). Nutrición base viene desde
Pro; los 4 pro-modules son add-ons. Copy correcto.

---

## 7. CONTRATO DE COMPONENTES (los 4 constructores lo siguen a ciegas)

**Ubicación:** `apps/web/src/components/landing-v2/`. **Convención:** cada archivo es `.tsx`. Client components solo
donde hay interacción/efectos; el resto server components (mejor SSR/SEO). Todos **importan sus propios datos** (props
mínimas o cero).

### Pieza compartida (construir PRIMERO, 1 agente) — NO está en los 13 pero es obligatoria
**`_brand-provider.tsx`** (`'use client'`):
- Exporta `LandingBrandProvider` (envuelve toda la landing) + hook `useLandingBrand()`.
- **Estado/lógica:** palette (const §4), `curRef` (color actual, mutable ref para no re-render por frame), `auto`,
  `lockedIdx`, `pos`; el **rAF loop** (initBrandEngine) que: avanza `pos` en auto (`+= dt*0.085`), easea `cur→target`
  (k=0.16 auto / 0.10 lock), y escribe `<style id="landing-v2-brand-style">` en `<head>`:
  `#landing-v2-root{--brand:rgb(R G B)!important;--brand-rgb:R G B!important;}` + `document.documentElement.style
  --sel-rgb`. Gate reduced-motion (auto no avanza; queda color fijo).
- **API de contexto:** `{ lockBrand(i:0..5), resumeAuto(), lockedIdx, subscribeColor(cb) | curRef, lang, setLang, cycle,
  setCycle }`. `subscribeColor`/`curRef` lo usa `HeroBackdrop` para el uniform sin re-render.
- **i18n:** `lang: 'es'|'en'` + `setLang`. Diccionario: ES = default (texto en JSX), EN = objeto (JS 1198-1282, portarlo
  a un `dict.ts`). En React, en vez de mutar `innerHTML`, cada componente lee `const { t } = useLandingBrand()` y hace
  `t('key','Texto ES por defecto')` — o más simple: cada componente recibe strings de un `copy.ts` central indexado por
  lang. **Recomendado:** módulo `landing-v2/copy.ts` con `{ es:{…}, en:{…} }` completo (ambos idiomas), y los
  componentes leen `copy[lang].xxx`. (Portar el diccionario EN entero es mecánico; el ES sale del markup.)
- `#landing-v2-root` es el wrapper que envuelve todo (equivalente a `#prism-root`): setea estilos base
  (bg `#08080a`, color `#F8F9FA`, font Inter, `overflow-x:hidden`, `position:relative`, `min-height:100dvh`).
  **Ojo viewport (CLAUDE.md):** usar `min-h-dvh`/`100dvh`, NO `100vh`.

### Los 13 componentes

| Componente | 'use client'? | Props | Contenido / notas |
|---|---|---|---|
| **PageLoader** | ✅ | ninguna | Overlay progreso (§A). rAF + sessionStorage `eva_pl_seen` + reduced-motion gate. z-200. Auto-desmonta. |
| **HeroBackdrop** | ✅ (dynamic ssr:false) | ninguna (lee `curRef` del provider) | WebGL fBm (§3) + fallback blobs/grid. `dynamic(import, {ssr:false, loading:BlobsFallback})`. IO pausa render. |
| **LandingNav** | ✅ | ninguna | Nav sticky + mobile menu + sticky mobile CTA (§C). Usa `useLandingBrand` para toggle lang. `useState` menú abierto. Links reales. Lucide `menu`. |
| **Hero** | ✅ | `exerciseCount?: number` (opcional, no se usa aquí salvo si se decide) | `#top` (§D). H1+sub+CTAs, brand rail (6 swatches → `lockBrand`), showcase dashboard con **live-loop** (`useState`+`setInterval`, reduced-motion gate). Sr-only keyword en H1 (§5). |
| **MarcaShowcase** | ✅ | ninguna | `#marca` (§E). 3 beneficios + morphing phone + 6 swatches grandes (→`lockBrand`/`resumeAuto`). |
| **ModulosSection** | ✅ (por count-up) | `exerciseCount: number` | `#panel` (§F). Tabla 4 features + 4 stats con count-up (IO). Recibe `exerciseCount` real para "818"→real (o const si se decide). |
| **CoachesProof** | ❌ server | ninguna | `#coaches` (§G). 3 testimonios estáticos. Solo `data-reveal` (el reveal lo maneja un hook global, ver abajo). |
| **ModulosPro** | ✅ | ninguna | `#modulos` (§H). 4 tabs + 4 paneles (`useState` activo). Lucide activity/person-standing/ruler/salad/shield-alert/file-text. Precio add-on desde const real. |
| **PreciosSection** | ✅ | ninguna | `#precios` (§I). Toggle ciclo (provider o local) + 3 cards. **Importa `@eva/tiers`** y computa precios/rangos reales. CTAs `/register?tier=…&cycle=…`. |
| **TeamsSection** | ❌ server | ninguna | `#teams` (§J). Card + 3 items. CTA `teamsContactMailto()`. Lucide users/shield/bar-chart-3. |
| **FaqSection** | ❌ server | ninguna | `#faq` (§K). 5 `<details>` nativos (0 JS). |
| **CtaFinal** | ❌ server | ninguna | CTA final (§L). Mailto `SALES_EMAIL`. |
| **LandingFooter** | ❌ server | ninguna | `footer` (§M). Links reales, `/legal`, mailto. |

**Nota reveal (`data-reveal`):** el diseño anima con IntersectionObserver global (initReveal 1049-1063): agrega
`.anim-on` al root y `.is-in` a cada `[data-reveal]` al entrar (threshold 0.16, rootMargin `-10%`), con red de
seguridad a 3200ms. Sin `.anim-on`, todo es visible (no-JS friendly). **Port:** un pequeño client util
`useRevealObserver()` montado por el provider que observa todos los `[data-reveal]` del `#landing-v2-root`, o un
componente `<Reveal>` wrapper. Keyframes `prismUp`/`prismUpM` + `prismDraw` (sparkline) van en `landing-v2.css`.
Los componentes server (Coaches/Teams/Faq/Cta/Footer) solo ponen el atributo `data-reveal` + `style animationDelay`;
el observer global (client) hace el resto. Gate reduced-motion → no agrega `.anim-on` (todo visible).

### `page.tsx` nuevo (server component) — lo compone
```
export const metadata = { …verbatim del actual… }        // §5
export default async function LandingPage() {
  const exerciseCount = await getExerciseCount()          // reutilizar helper actual
  const { jsonLd, teamsJsonLd } = buildJsonLd()           // verbatim del actual (resolveMetadataBase etc.)
  return (
    <LandingBrandProvider>   {/* id="landing-v2-root" adentro; dark-only; overflow-x clip */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}/>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(teamsJsonLd)}}/>
      <PageLoader/>
      <HeroBackdrop/>
      <LandingNav/>
      <main>
        <Hero/>
        <MarcaShowcase/>
        <ModulosSection exerciseCount={exerciseCount}/>
        <CoachesProof/>
        <ModulosPro/>
        <PreciosSection/>
        <TeamsSection/>
        <FaqSection/>
        <CtaFinal/>
        <LandingFooter/>
      </main>
    </LandingBrandProvider>
  )
}
```
Orden = el del diseño. `import 'landing-v2.css'` (breakpoints + keyframes + clases hook) una vez, arriba.

### Assets a preparar (bloqueante, 1 agente antes de construir)
- `public/LOGOS/eva-icon.png` — **ya existe** ✓.
- `public/LOGOS/eva-icon-white.png` — **NO existe** → copiar de `nuevalandingv2/eva-icon-white.png`
  (585×526 RGBA). Usar en PageLoader, MarcaShowcase, Hero sidebar, CtaFinal, LandingFooter usa la negra.
- `next/image` con `width`/`height` acorde al render (los PNG son 585×526, no cuadrados — no forzar 1:1 que distorsiona;
  usar el ratio real o recortar el asset a cuadrado si el diseño lo pinta cuadrado). El diseño los pinta a tamaños
  cuadrados (23×23, 40×40…) — **recomendado recortar/exportar una versión cuadrada** o aceptar el aspect ratio real.
- **Three.js:** ✅ **ya instalado** — `three@^0.184.0` + `@types/three@^0.184.0` en el `package.json` raíz (el diseño
  usa r160; la API de `WebGLRenderer`/`ShaderMaterial`/`OrthographicCamera`/`PlaneGeometry` usada acá es estable entre
  r160 y r184, no hay cambios rompientes para este shader). Import ESM: `import * as THREE from 'three'`. Cargar solo
  en `HeroBackdrop` (`dynamic`, `ssr:false`) para no inflar el bundle de la landing.
- **Geist Mono:** `next/font/google` `Geist_Mono` (opción A) o mapear a JetBrains (opción B) — §4.
- **lucide-react** (ya en stack) para los iconos.

### Keyframes / CSS a colocar en `landing-v2.css`
`prismUp`, `prismUpM`, `prismDraw`, `plFloat`, `plSpin` (líneas 24-28 del diseño) + reglas `details.faq-i`/`.faq-x`
(30-33) + `.dash-fade` (34) + bloque `@media (prefers-reduced-motion: no-preference){ .anim-on [data-reveal]… }`
(38-42) + `::selection` (23) + focus-visible (29) + los **3 breakpoints** (44-79) con sus clases hook
(`r-marca r-modgrid r-social r-teams r-price r-navlinks r-navlogin r-menubtn r-stat r-dash r-dashside r-dashkpis
r-brandrail r-cyc r-row r-rowtag r-modtabs r-swbig` + ids `#mcta #top #marca #panel #precios #teams #modulos #coaches
#faq #sw-rail`). **Copiar los breakpoints verbatim** (son override-only `!important`); cada constructor asegura poner
la clase hook correcta en su root de sección.

---

## 8. Riesgos / decisiones a escalar (resumen para el orquestador)
1. **818 ejercicios vs count real ~129** — decisión de negocio (F2/F3/Precios/FAQ). Mecanismo real ya listo (prop).
2. **Rango Elite 31–60 (diseño) vs 31–100 (real)** — usar real. (Ya resuelto arriba, pero confirmar copy.)
3. **Geist Mono nuevo vs mapear a JetBrains** — fidelidad vs peso de bundle.
4. **H1 keyword** — agregar `sr-only` con keyword dentro del H1 visual "Una plataforma. Tu marca." (recomendado).
5. **Precios monthly-equiv** — leve delta cosmético (26.991 vs 26.990); usar el real de `@eva/tiers`.
6. **`three` en deps** — ✅ ya instalado (`three@0.184` + `@types/three` + `lucide-react@0.577` en package.json raíz); solo cargar lazy ssr:false.
7. **Estado `cycle`/`lang`** — en el provider (transversal) vs local. `lang` sí es transversal (todo el texto);
   `cycle` hoy solo lo usa Precios → aceptable local, pero el provider ya centraliza; documentar la elección.
8. **PageLoader SSR/no-JS** — asegurar que NO tape la página sin JS (render inicial oculto hasta que el efecto decida).
9. Reemplazo de la landing actual: el nuevo `page.tsx` sustituye al de `app/page.tsx`; los `components/landing/**`
   viejos quedan huérfanos (borrar en un commit aparte tras verificar que nada más los importa).
