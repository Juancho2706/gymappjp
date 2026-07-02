# White-label fitness: mejores prácticas de branding (investigación web, jul-2026)

**Objetivo:** que el white-label de EVA se sienta "suyo" para el coach y que el alumno sienta "la app de mi coach", no EVA.
**Método:** 15 búsquedas web + 4 fetches de fuentes primarias, prioridad 2025–2026. Fecha de corte de investigación: 2026-07-02.
**Contexto EVA ya existente (no re-descubierto):** rampa sport derivada de 1 hex + WCAG, 12 fuentes, 6 loaders, logo claro/oscuro, login brandeado básico, powered-by discreto, decisión store = 1 app EVA con branding in-app post-login.

---

## 0. TL;DR — ranking de "qué mueve más la aguja de percepción de marca"

Ordenado por impacto/frecuencia de exposición vs. costo de implementación. La evidencia converge en que **frecuencia de exposición > riqueza visual puntual**: gana la superficie que el alumno ve muchas veces por semana.

| # | Palanca | Por qué mueve la aguja | Estado en EVA | Esfuerzo |
|---|---------|------------------------|---------------|----------|
| 1 | **App icon / ícono en home screen** | "El touchpoint de marca más frecuente de toda la relación de coaching — más que Instagram, emails o llamadas juntos" (5–10 aperturas/semana). Si el ícono lleva el logo de la plataforma, *la plataforma se vuelve el producto y el coach es intercambiable*. | Parcial (PWA manifest deprecado en Fase 6A; RN = app EVA única). **Gap crítico en iOS.** | Alto (iOS) |
| 2 | **Marca presente en TODA pantalla recurrente** (workout, check-in, plan, chat) | "El crédito y la confianza de cada check-in caen sobre tu marca"; branding parcial deja al alumno "tentable por cualquier otro coach de la misma app". | Parcial (color2+fuente+logo aplicados; falta auditar consistencia por pantalla). | Medio |
| 3 | **Push notifications con nombre/marca del coach** | 20% open rate vs 2% email; es la superficie de re-enganche de mayor frecuencia después del ícono. | Web-push live; falta verificar branding del remitente/copy por coach. | Bajo–Medio |
| 4 | **Splash screen brandeado + micro-animación de marca** | "Aspecto premium"; el usuario diario lo ve cientos de veces → construye reconocimiento de marca más rápido que casi cualquier otro touchpoint. Animación <2s reduce percepción de tiempo de carga. | Parcial (6 loaders; falta splash real de instalación PWA/RN por coach). | Medio |
| 5 | **Deliverables brandeados (PDF de plan, emails)** | "Si cobras premium, cada plan lleva TU logo, no el del software" → percepción de valor + retención. Emails transaccionales brandeados refuerzan cada interacción fuera de la app. | Emails vía Resend (falta branding por coach); PDF export no confirmado. | Medio |
| 6 | **Onboarding/login con personalidad** | Primera impresión "premium desde la primera interacción"; pero con techo de performance (video/animación pesada mata carga). | Login brandeado básico ya existe. | Bajo (mejora incremental) |
| 7 | **Store listing propio** (nombre/screenshots del coach) | Refuerza "descarga MI app" (frase de venta/referido más fuerte). **Pero** EVA ya decidió store único → esta palanca queda deliberadamente fuera; se compensa con #1–#5 in-app. | Fuera de scope por decisión (app EVA única). | N/A |

**Lectura para EVA:** la decisión "app única en store + branding in-app" sacrifica la palanca #7 (y debilita #1 en iOS). Por eso las palancas #2–#5 (consistencia de marca en pantallas recurrentes + push + splash + deliverables) son las que **más compensan** ese sacrificio y deben priorizarse. FitBudd/Coachway remachan lo mismo desde el ángulo opuesto: lo que vende el white-label no es "el logo lindo una vez", es que la marca esté en el **touchpoint diario**.

---

## 1. Cómo hacen white-label los líderes del nicho fitness

### 1.1 Qué dejan customizar y qué cobran (tabla comparativa)

| Plataforma | Qué customiza | Tier / precio white-label | Notas |
|------------|---------------|---------------------------|-------|
| **ABC Trainerize** | Ícono de app, listings de App Store / Google Play, colores y theming in-app. Enterprise agrega: animaciones custom, badges, icon packs, SSO, analytics. | 3 tiers: **Pro** (light branding, fee único ~US$169 sobre la mensualidad) · **Studio** (listing dedicado en store, incluido en Studio Plus/Max ~US$248/mes por local) · **Enterprise** (custom). Studio/Enterprise **exigen Apple Developer Account propia (US$99/año)**. | Post-adquisición por ABC Fitness (2023) los coaches solo reportan deriva hacia clubs/studios; UI "se siente menos moderna que competidores nuevos". CBA "vale la pena pasados ~25 clientes pagos". |
| **Everfit** | Tema de color + logo in-app (add-on "Advanced Branding", ~US$75 one-time desde tier Pro, **sin setup fee del app brandeado**). Full white-label (app con TU nombre en el store) solo Enterprise. | Pro tier accede a app brandeada sin setup fee extra (más accesible que la competencia). Full white-label = **Enterprise, custom pricing, mínimo 500+ clientes**. | Valorado por automatización (Autoflow, onboarding flow) y UI amigable. |
| **FitBudd** | Ícono, splash screen, esquema de color, logo en app+emails+interfaces, **dominio propio + web con e-commerce**, listing de store, welcome screen, mensajes de push. | Super Pro **US$149/mes + US$75 one-time**. Construido *desde cero* como plataforma white-label (no un overlay agregado después). | Posicionamiento explícito: "tus clientes deben experimentar TU marca, no la plataforma". Roadmap 2025–26 enfocado en coach solo/influencer. |
| **PT Distinction** | Apps iOS/Android custom-branded, branding + emails/recordatorios automáticos, integración de web. | Basic US$19.9/mes (3 clientes) → Master US$89.9/mes (50), +US$1.60/cliente sobre 50. | Reviews: "el mejor programa de coaching online" pero **curva de aprendizaje empinada** y glitches ocasionales de notificaciones. |
| **Exercise.com** | White-label app + web, branding completo, ecosistema de negocio. | Custom (enterprise-oriented). | Se vende como "construye tu marca, no la de ellos". |

### 1.2 Patrón de tiers (insight para EVA)

Todos escalonan el branding en **3 niveles**: (a) *light* = colores + logo in-app (barato, sin store propio), (b) *store propio* = listing + ícono en store (exige Apple Dev Account del coach, fee alto), (c) *enterprise* = animaciones/badges/icon packs/SSO. **EVA con su decisión "app única + in-app" vive en el tier (a) enriquecido** — que es exactamente lo que Everfit ofrece desde Pro y lo que FitBudd argumenta que "entrega la mayoría de la percepción de custom development a una fracción del costo".

### 1.3 Qué valoran y qué les falta a los COACHES (reviews)

- **Valoran:** que el cliente "conecte directamente contigo, no con una app de terceros"; el ícono con su marca como prueba social; automatización que ahorra tiempo; que "descarga mi app" sea una frase de venta/referido más fuerte que "regístrate en esta herramienta de terceros".
- **Les falta / se quejan:** Trainerize post-ABC = "app dateada", bugs sin resolver, billing incorrecto, pricing con features core como extras (costo real 2–3× el anunciado). Everfit full white-label bloqueado tras 500+ clientes (inaccesible para coach solo). PT Distinction = curva de aprendizaje + glitches de notificaciones. **Lección EVA:** el white-label accesible (sin gate de 500 clientes, sin Apple Dev Account obligatoria) es en sí un diferenciador competitivo.

---

## 2. Temas curados vs color picker libre + tokens multi-tenant

### 2.1 El consenso 2026: **curado > picker libre**

- Best practice dominante: **restringir la elección a tokens pre-validados**, no color picker arbitrario. "Es esencial establecer una paleta curada que cumpla WCAG AA/AAA en vez de depender de color pickers libres."
- **Rampa derivada de 1 seed (lo que EVA ya hace) es el estado del arte.** Material 3 genera una paleta tonal completa (13 tonos por color, 5 colores clave) desde **un solo seed color**, con contraste accesible por diseño; la spec 2025 (`SPEC_2025`) refina las relaciones de contraste. Confirma que la arquitectura de EVA (hex → rampa + WCAG) es correcta.
- **Contraste en build-time, no runtime:** patrón recomendado (Style Dictionary + lib de contraste) = generar pares texto/fondo accesibles **por cada token de fondo** en build, validados contra WCAG. Umbrales WCAG 2.2 AA: 4.5:1 texto normal, 3:1 texto grande (≥18.66px reg / 14px bold) y 3:1 componentes/bordes.

### 2.2 Caso Linear (el más aplicable a EVA)

Linear **colapsó ~98 variables por tema a solo 3 inputs**: **base color, accent color y contrast**. La variable `contrast` permite auto-generar temas de alto contraste para accesibilidad. El sistema deriva sombras complementarias (bordes, cajas elevadas) desde esos pocos colores clave. **Este es casi exactamente el modelo mental que EVA debería exponer al coach:** el coach elige 1–2 colores, el sistema deriva todo y garantiza contraste — nunca un picker de 98 slots.

### 2.3 Arquitectura de tokens multi-brand (para no acumular drift)

- **Split de dos capas primitivo↔semántico**: light/dark/high-contrast/brand son *variaciones del mapa semántico→primitivo, no de los componentes*. "Agregar un tema es un archivo de mapping nuevo, no un rewrite."
- **Design Tokens Spec alcanzó su primera versión estable (2025.10)** — respaldada por Adobe, Amazon, Google, Shopify, Figma. `$extends` + herencia de grupo permite multi-brand sin duplicar archivos (evita el drift de "cientos de archivos de tokens manuales"). Shopify (Polaris) e IBM usan tokens para "producto global con branding local".
- **Dark mode por tema** = mapping semántico distinto, no componentes distintos. EVA ya tiene dark; el punto es que cada brand del coach debe tener su variante dark derivada del mismo seed, no una segunda config manual.

**Recomendación EVA:** mantener la rampa derivada (correcta), pero **exponer al coach un modelo tipo Linear (base + accent + contrast)** y presets curados como punto de partida, en vez de solo "elige un hex". Presets curados reducen la parálisis de decisión y garantizan resultados premium por default.

---

## 3. Qué hace que se sienta "premium" y propia

Evidencia de qué superficies importan más para percepción de marca:

1. **App icon = touchpoint #1.** "El más frecuente de toda la relación" (5–10 aperturas/semana). Si lleva el logo de la plataforma, el coach se vuelve intercambiable. (Coachway)
2. **Splash screen animado.** "Apeal estético obvio + experiencia más premium"; animación **<2s** reduce el tiempo de arranque percibido; el usuario diario lo ve cientos de veces → construye reconocimiento de marca más rápido que casi cualquier otro touchpoint. Regla: limpio, simple, **un solo logo** (no múltiples). (UXPin, Justinmind)
3. **Micro-interacciones tematizadas = funcionales, no decorativas.** En touch no hay hover → las micro-animaciones *confirman interactividad y comunican cambios de estado*. "Si no comunica nada, es decoración, no micro-animación." Deben heredar el color de marca. (SVGator)
4. **Branding "behavioral" > visual (insight fuerte de FitBudd).** "El elemento de branding más olvidado no es visual, es *behavioral*": habit tracking, check-ins automáticos, solicitudes de fotos de progreso *atadas a tu marca* crean un touchpoint diario brandeado. **La marca gana por estar en el hábito, no solo en la paleta.**
5. **Push con nombre del coach:** 20% open rate (vs 2% email) → mayor re-enganche de marca.
6. **Deliverables brandeados (PDF/email):** "cada plan lleva TU logo, no el del software" → percepción de valor premium + retención. Promealplan/Coachway/FitBudd lo tratan como estándar profesional 2025–26.

**Síntesis premium:** premium ≠ más efectos; premium = **marca consistente en las superficies de alta frecuencia** (ícono, pantallas diarias, push, splash) + micro-animaciones que comunican + deliverables con logo. EVA ya tiene los ladrillos (loaders, fuentes, rampa); el gap es **cobertura consistente por superficie** y las de alta frecuencia (ícono, push, splash).

---

## 4. PWA / RN: instalación, ícono y "1 app en store + branding in-app"

### 4.1 PWA — ícono del coach y sus límites (gap crítico iOS)

- **iOS NO lee el array `icons` del manifest** — usa `apple-touch-icon` (180×180 PNG, sin transparencia; iOS compone fondo blanco bajo lo transparente).
- **Ícono dinámico per-coach en iOS exige SSR:** el `apple-touch-icon` debe estar presente en el HTML *en el primer load* → hay que renderizar HTML distinto por coach (server-side), porque iOS no re-evalúa el manifest en runtime.
- iOS <15.4: el manifest solo se carga desde red al abrir el share sheet, no en page load → riesgo de que no cargue a tiempo.
- **Implicación EVA:** para que el ícono en home screen del alumno sea el del coach (palanca #1), en PWA hay que **inyectar `apple-touch-icon` y `<link rel=manifest>` per-coach vía SSR** en la ruta `/c/[coach_slug]/*`. El manifest per-coach fue *deprecado en Fase 6A* — reconsiderar al menos para el ícono, que es la palanca de mayor impacto. En Android el manifest dinámico sí funciona (soporta `icons`).

### 4.2 RN — patrón "1 app en store + branding in-app" (lo que EVA ya eligió)

- El patrón 2025 dominante: **un "app engine" único que sirve múltiples marcas por config**, no forks/clones. Capas: core (lógica + UI primitives) + **brand layer config-driven** (theme, assets, strings, feature flags) resuelto por un *brand resolver* que fetchea la config del tenant.
- **OTA de temas:** OTA (JS bundle) permite empujar cambios de branding/tema *sin pasar por la cola de review del store*. Híbrido común: pantallas core por OTA + superficies marketing por server-driven UI.
- Splash/ícono/nombre dinámicos son *más difíciles* en RN (ligados al binario) — por eso EVA acertó al mantener el branding **in-app post-login** (theming por config remota), no a nivel de binario. El ícono en store queda EVA (trade-off aceptado).
- **Implicación EVA:** el theming del coach debe llegar como **config remota fetcheada al login** (brand resolver), cacheada, y aplicable **sin release** (OTA/config). Esto ya es coherente con la decisión tomada; el detalle a asegurar es que la config de marca sea *server-driven* y no compilada.

---

## 5. Login / onboarding brandeado con personalidad (sin matar performance)

- **Techo de performance explícito:** video/animación de fondo aumenta tiempo y tráfico de carga → usar con criterio. Preferir **Lottie o GIF liviano** ("cargan rápido y agregan delight") sobre video pesado. Onboarding ≤3–5 pantallas / <60s.
- **Background video (si se usa):** debe *visualizar el valor del producto*; el texto es complemento breve. Para login del coach, un loop corto/imagen del coach + micro-animaciones de entrada da personalidad sin costo alto.
- **Personalización > tutorial largo:** las mejores pantallas 2025 son limpias, interactivas, con micro-animaciones + indicadores de progreso; personalizar (nombre del coach, saludo) supera al walkthrough genérico.
- **Implicación EVA:** el login brandeado básico ya existe; la mejora incremental de mayor ROI es **micro-animación de entrada tematizada con el accent del coach + saludo personalizado ("La app de {coach}")**, evitando video de fondo pesado por default (ofrecerlo como opción con imagen optimizada/`next/image`). Coherente con la regla de perf de EVA.

---

## Fuentes (URL + tema; consultadas 2026-07-02)

**Líderes fitness / white-label:**
- ABC Trainerize CBA fees & tiers — https://help.trainerize.com/hc/en-us/articles/360041665511-Custom-Branded-App-Fees-and-Pricing
- Trainerize custom branded apps (feature) — https://www.trainerize.com/features/custom-branded-fitness-apps/
- Everfit review 2026 (branding add-on, Enterprise 500+) — https://www.promealplan.com/en/blog/everfit-review-2026 · https://www.getapp.com/recreation-wellness-software/a/everfit/
- FitBudd vs Trainerize 2026 (pricing, "experimentan TU marca") — https://www.fitbudd.com/post/fitbudd-vs-trainerize
- FitBudd customization guide ("branding behavioral > visual") — https://www.fitbudd.com/insights/white-label-fitness-app-customization-guide
- PT Distinction pricing & reviews — https://www.ptdistinction.com/pricing · https://www.capterra.com/p/141155/PT-Distinction/reviews/
- Trainerize reviews/quejas post-ABC — https://www.trustpilot.com/review/trainerize.com · https://www.promealplan.com/en/blog/trainerize-review-2026
- Coachway "Branded App for Fitness Coaches 2026" (app icon = touchpoint #1) — https://coachway.io/articles/branded-app-for-fitness-coaches/
- Exercise.com best white-label 2025 — https://www.exercise.com/grow/best-white-label-fitness-app-software/

**Temas curados / tokens / contraste:**
- Automating colour contrast con design tokens (build-time) — https://www.alwaystwisted.com/articles/a-design-tokens-workflow-part-16
- Accessible color tokens enterprise — https://www.aufaitux.com/blog/color-tokens-enterprise-design-systems-best-practices/
- Color system WCAG compliance 2026 (umbrales) — https://digitalheroes.co.in/journal/color-system-wcag-compliance/
- Multi-brand tokens & composability — https://frontendmasters.com/blog/exploring-multi-brand-systems-with-tokens-and-composability/
- Design Tokens Spec estable 2025.10 (W3C CG) — https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- Linear: 3 variables (base/accent/contrast) — https://linear.app/now/how-we-redesigned-the-linear-ui · https://linear.app/changelog/2020-12-04-themes
- Material 3 seed → tonal palette (SPEC_2025) — https://m3.material.io/styles/color/system/how-the-system-works · https://m3.material.io/foundations/customization

**Premium feel / splash / micro-interacciones:**
- Splash screen best practices 2026 (<2s, premium) — https://www.uxpin.com/studio/blog/splash-screen/
- Mobile app animation patterns (micro-animación = funcional) — https://www.svgator.com/blog/mobile-apps-animation-examples/
- Branded deliverables / push 20% vs 2% — https://coachingportal.io/blog/step-by-step-guide-to-white-labeling-your-fitness-app-for-personal-trainers · https://mevolife.com/white-label-fitness-app-builder

**PWA / RN:**
- iOS PWA icon limits (apple-touch-icon, no manifest icons) — https://naildrivin5.com/blog/2023/08/24/braindump-of-pwa-on-ios.html · https://logofoundry.app/blog/pwa-icon-requirements-safe-areas
- PWA add to home screen 2025 — https://www.gomage.com/blog/pwa-add-to-home-screen/
- RN multi-tenant 2025 (brand resolver, config-driven) — https://reactnativeinsights.com/react-native-in-2025-how-to-build-a-multi-tenant-mobile-app/ · https://the-expert-developer.medium.com/react-native-in-2025-building-multi-brand-multi-tenant-apps-from-a-single-codebase-3c01e8650cfc
- OTA vs server-driven UI RN — https://revopush.org/react-native-ota-and-server-driven-ui

**Login / onboarding:**
- Mobile onboarding best practices 2025 (Lottie>video, ≤60s) — https://webisoft.com/articles/mobile-onboarding-best-practices/ · https://www.appcues.com/blog/mobile-onboarding-best-practices
