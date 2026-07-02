# UX: Donde colocar el acceso a funciones OPCIONALES / DE PAGO / CONDICIONALES en la navegacion

**Contexto:** PWA fitness B2B2C, mobile-first + desktop. Bottom tab bar con 5 tabs fijos. Modulos de pago que solo algunos coaches compran (cardio, evaluacion de movimiento, composicion corporal, intercambios de nutricion). Pregunta concreta: ¿un 6to tab que aparezca solo si el coach tiene algun modulo activo, o hay mejores patrones?

**Fecha de investigacion:** 2026-06-24. Fuentes priorizadas 2025-2026.

---

## TL;DR (recomendacion con evidencia)

1. **NO agregar un 6to tab.** 5 es el tope duro tanto de iOS HIG como de Material 3; un 6to rompe la regla y, ademas, un tab condicional viola la consistencia (memoria muscular). Evidencia abajo.
2. **NO usar un tab condicional que aparece/desaparece.** Es anti-patron: rompe el modelo mental y la memoria de posicion. NN/g advierte explicitamente contra tabs que cambian de comportamiento entre usuarios/estados.
3. **Patron recomendado: un "hub de herramientas/modulos" accesible desde un destino estable** (uno de los 5 tabs existentes, p.ej. el de su dominio natural, o un tab "Mas"/menu). Dentro del hub, mostrar los modulos como tarjetas. Patron 2026 dominante para B2B = **role-based adaptive interface**: el mismo contenedor estable, contenido distinto segun lo que el coach tiene.
4. **Para los modulos NO comprados:** mostrarlos en el hub como bloqueados/atenuados con CTA de upsell (patron ClickUp/Spotify: dejar ver la feature en contexto y disparar el upgrade al intentar usarla). Esto sube la descubribilidad y la conversion.
5. **Para un modulo recien comprado:** disparar descubribilidad activa (badge "Nuevo", tooltip/hotspot anclado al hub, empty-state con CTA primaria). La feature recien comprada NO debe quedar escondida.

---

## 1. ¿Cuantos tabs debe tener una bottom nav? Por que 5 es el tope

**iOS HIG (Apple, Tab bars):** maximo **5 tabs** en iPhone. Si la app tiene mas destinos top-level, los secundarios van a un tab **"More"** (overflow), no a un 6to tab visible. Apple trata el tab bar como navegacion **persistente y estable** — los tabs no deberian aparecer/desaparecer entre estados.
- Apple Developer — *Tab bars*, Human Interface Guidelines (consultado jun-2026): https://developer.apple.com/design/human-interface-guidelines/tab-bars

**Material Design 3 (Navigation bar):** la barra expone **de 3 a 5 destinos** top-level. *"Avoid using more than five destinations"* porque los tap targets quedan demasiado juntos. Mas de 5 → mover los menos frecuentes a un **"More"/overflow** o a un navigation drawer.
- Material Design 3 — *Navigation bar guidelines*: https://m3.material.io/components/navigation-bar/guidelines
- Material Design 2 — *Bottom navigation* (regla 3-5, comportamiento por cantidad): https://m2.material.io/components/bottom-navigation

**Consenso 2026 (varias fuentes independientes):** *"place 4-5 primary navigation items"*, *"limited to 5 items maximum"*. La razon no es arbitraria: refleja el limite fisico del ancho del pulgar y el limite cognitivo de la memoria de trabajo. El usuario debe poder mirar la barra y entender cada opcion sin leer cada label.
- Phone Simulator — *Mobile Navigation Patterns That Work in 2026* (25-mar-2026): https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026
- UXPin — *Mobile Navigation Design: 8 Types, Examples & Best Practices (2026)*: https://www.uxpin.com/studio/blog/mobile-navigation-examples/
- Nitrous — *Mobile Tab Navigation Best Practices*: https://www.nitrousdesign.com/blogs/guideliness-for-designing-effective-tab-bar-navigation-on-mobile

**Que pasa al agregar un 6to:** (a) los tap targets se achican y se acercan (errores de toque); (b) los labels se truncan o desaparecen; (c) se viola la guideline de ambas plataformas; (d) si ademas es condicional, el layout "salta" entre coaches (el 5to tab cambia de posicion/sentido segun quien sea). Material 3 incluso revirtio en 2025 hacia barras mas cortas con el rediseño "Expressive".
- 9to5Google — *Material 3 Expressive drops navigation drawers, short bottom bars back* (14-may-2025): https://9to5google.com/2025/05/14/material-3-expressive-navigation/

---

## 2. Tabs CONDICIONALES / dinamicos (aparecen-desaparecen): ¿buena practica o anti-patron?

**Veredicto: anti-patron para la nav PRIMARIA.** Rompe los tres pilares de una bottom nav util: consistencia, memoria muscular y descubribilidad.

- **Consistencia:** la nav debe ser predecible en todas las pantallas y para todos los usuarios. NN/g: *"clicking on any of the tabs should change its panel, and they should use the same unselected and selected styling"*. El caso documentado (Behance / "Careers Home") donde un tab se comporta distinto a los demas *"likely prevented users from learning the site's organization"* y *"disorients users"*. Un tab que existe para unos coaches y no para otros es la misma falla: el set de tabs deja de ser un modelo aprendible.
  - NN/g — *Tabs, Used Right*: https://www.nngroup.com/articles/tabs-used-right/
- **Memoria muscular / posicion:** si el 6to tab aparece solo a veces, el coach que compra un modulo ve la barra reordenarse; el que no lo tiene nunca aprende que existe. La barra inferior funciona porque la posicion es fija ("el 3ro siempre es X").
- **Descubribilidad:** un tab que solo existe DESPUES de comprar no ayuda a vender (el no-pagador nunca lo ve), y un tab que solo aparece tras la compra puede pasar desapercibido justo cuando mas importa que se note.

**Matiz importante:** la personalizacion por rol/estado SI es tendencia 2026 — pero se aplica al **contenido de destinos estables**, no a hacer aparecer/desaparecer los contenedores de nav. *"role-based design has moved beyond permissions into experience design... show meaningfully different interfaces based on what a user actually does"* (HubSpot: mismo producto, vistas distintas por rol). La clave: **mismo esqueleto de nav, distinto contenido.**
- SaaSUI — *7 SaaS UI Design Trends for 2026* (role-based adaptive interfaces): https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- DAR Design — *Multi-Role B2B Product UX in 2026*: https://dardesign.io/blog/multi-role-b2b-saas-ux-roles-permissions-flows
- UXPin — *Navigation patterns* (la nav debe ser accesible/consistente en todas las pantallas): https://www.uxpin.com/studio/blog/mobile-navigation-patterns-pros-and-cons/

---

## 3. "More"/overflow vs hub-launcher vs entrada contextual: cuando usar cada uno

| Patron | Que es | Cuando usarlo |
|---|---|---|
| **"More" / overflow tab** (Priority+) | El 5to tab agrupa lo secundario/infrecuente | Cuando hay >5 destinos top-level y los modulos NO son el uso diario. *"As screen space decreases, move lower-priority items to overflow menu."* |
| **Hub-launcher** (un destino estable que abre una grilla de herramientas) | Un tab/seccion que muestra tarjetas de modulos, comprados y no comprados | Cuando los modulos forman una **familia coherente** ("herramientas avanzadas del coach"). Permite mostrar bloqueados+activos juntos, ideal para upsell. |
| **Entrada contextual** (la feature aparece dentro del flujo donde tiene sentido) | El modulo se ofrece dentro de la pantalla del alumno/plan donde se usa | Cuando el modulo es una extension de un flujo existente (p.ej. composicion corporal dentro de la ficha del alumno; intercambios dentro del editor de nutricion). |

**Regla rectora 2026:** *"Do not bury high-frequency actions in hidden menus... place the most frequently used features in the most accessible positions. Analyze usage data."* Los modulos de pago de un subconjunto de coaches NO son high-frequency para la base general → **no merecen un tab primario**; encajan en hub o overflow, y/o entrada contextual.
- Phone Simulator (Priority+ / overflow): https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026
- DesignStudio — *Mobile Navigation UX Best Practices (2026)*: https://www.designstudiouiux.com/blog/mobile-navigation-ux/
- Android Developers — *Layouts and navigation patterns*: https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns

**Recomendacion para este producto (hibrido):**
- **Hub de modulos** como hogar canonico (descubrible para todos), alojado bajo el tab existente cuyo dominio sea mas natural (o un tab "Mas" si los 5 ya estan saturados de funciones core).
- **+ Entradas contextuales** donde el modulo vive en un flujo (composicion corporal en ficha de alumno, intercambios en editor de nutricion). Esto da el "just-in-time discovery" que recomienda el patron de upsell.

---

## 4. Como exponen otras apps SaaS funciones premium/condicionales sin romper la nav

- **Dejar VER la feature aunque no la tengas (gated, no oculta).** ClickUp lista features premium en el menu; al tocar una no incluida en el plan, no solo bloquea: explica que no esta en el plan actual y ofrece upgrade. Spotify deja navegar como un usuario pago y dispara el prompt al intentar la accion premium. *"The premium feature can be integrated into the user experience, allowing users to see it in context."* Esto convierte el momento de descubrimiento en momento de venta.
  - Userpilot — *12 Real-World Upselling Examples in SaaS*: https://userpilot.com/blog/upselling-examples-saas/
  - Appcues — *Upselling prompts: 8 examples*: https://www.appcues.com/blog/upselling-prompts-saas
- **Role-based adaptive interface** (no esconder contenedores, adaptar contenido). El esqueleto de nav es estable; el contenido del hub se adapta a lo que el coach tiene. *"role-based interfaces reduce mis-clicks by 30%."*
  - SaaSUI 2026: https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- **Empty states como superficie de conversion** (no como error). *"Empty states convert 3x better than tooltips when they include a single primary CTA."* El hub con un modulo no comprado = empty-state con una CTA "Activar modulo".
  - SaaSUI 2026 (advanced empty state design): https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- **Progressive disclosure:** diferir lo avanzado/poco usado a una pantalla secundaria. *"Show only what's needed. Reveal complexity when the user is ready."* Encaja exacto: los modulos viven un nivel mas abajo, no en la barra primaria.
  - Taqwah — *SaaS UX Design Best Practices 2026*: https://taqwah.agency/blog/saas-ux-design-best-practices

**Sobre FAB:** util para UNA accion primaria de creacion, no para alojar un set de modulos heterogeneos. No es el patron correcto aqui (un FAB con 4 funciones distintas es un menu disfrazado). Reservarlo, si acaso, para la accion de creacion mas frecuente del dominio.

---

## 5. Descubribilidad de una feature de pago RECIEN comprada (que el coach la ENCUENTRE)

El riesgo real con cualquier solucion "un nivel mas abajo" es que el coach pague y no encuentre lo que pago. Patrones 2026 para cerrar ese gap:

1. **Anclar un anuncio in-app al lugar exacto** del modulo recien activado. *"Anchoring announcements to specific actions within your app converts a potential interruption into a moment of discovery, increasing adoption."*
2. **Tooltip / hotspot** sobre la entrada del hub o la nueva tarjeta del modulo. Hotspots = *"subtle, non-intrusive pattern good for... drawing attention to new features."* Badge "Nuevo" en el tab/hub que contiene el modulo.
3. **Prueba visual:** screenshot/GIF/demo corta de que hace el modulo. *"Visual proof accelerates understanding... seeing a feature in action communicates value faster than text."*
4. **Empty-state con CTA primaria unica** en la primera entrada al modulo (configura tu primer X). Es la superficie de onboarding de mayor leverage.
5. **Confirmacion post-compra que enlaza directo** al modulo ("Modulo activado → Abrir cardio"), no solo "gracias por tu compra".

Fuentes:
- Appcues — *26 Best User Onboarding Examples (2026)* (contextual onboarding, anchoring): https://www.appcues.com/blog/best-user-onboarding-examples
- Userpilot — *New Feature Onboarding* (tooltips/hotspots): https://userpilot.com/blog/new-feature-onboarding/
- Arcade — *14 Feature Announcement Examples (2026)* (prueba visual, interactividad): https://www.arcade.software/post/feature-announcement-examples

---

## Sintesis aplicada al producto

| Decision | Veredicto | Por que |
|---|---|---|
| 6to tab fijo | NO | Viola HIG/M3 (tope 5); tap targets/labels degradan. |
| 6to tab condicional (aparece si compra) | NO (anti-patron) | Rompe consistencia/memoria muscular; no ayuda a descubrir ni a vender. |
| Hub de modulos bajo tab estable (o "Mas") | SI (recomendado) | Contenedor estable + role-based content; aloja activos y bloqueados juntos. |
| Modulos no comprados visibles+gated en el hub | SI | Patron ClickUp/Spotify: descubribilidad + upsell en contexto. |
| Entradas contextuales (en ficha/editor) | SI (complemento) | Just-in-time discovery donde el modulo se usa. |
| Descubribilidad post-compra (badge/tooltip/empty-state/CTA en confirmacion) | SI (obligatorio) | Evita que el coach pague y no encuentre el modulo. |

---

## Fuentes (titulo — url — fecha)

- Apple — *Tab bars*, Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines/tab-bars — consultado jun-2026
- Material Design 3 — *Navigation bar guidelines* — https://m3.material.io/components/navigation-bar/guidelines — 2025
- Material Design 2 — *Bottom navigation* — https://m2.material.io/components/bottom-navigation — ref. estable
- 9to5Google — *Material 3 Expressive drops navigation drawers, short bottom bars back* — https://9to5google.com/2025/05/14/material-3-expressive-navigation/ — 14-may-2025
- Phone Simulator — *Mobile Navigation Patterns That Work in 2026* — https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026 — 25-mar-2026
- UXPin — *Mobile Navigation Design: 8 Types, Examples & Best Practices (2026)* — https://www.uxpin.com/studio/blog/mobile-navigation-examples/ — 2026
- UXPin — *Mobile Navigation Patterns: Pros and Cons* — https://www.uxpin.com/studio/blog/mobile-navigation-patterns-pros-and-cons/ — 2026
- Nitrous — *Mobile Tab Navigation Best Practices* — https://www.nitrousdesign.com/blogs/guideliness-for-designing-effective-tab-bar-navigation-on-mobile — 2025/2026
- NN/g — *Tabs, Used Right* — https://www.nngroup.com/articles/tabs-used-right/ — ref. estable
- DesignStudio — *Mobile Navigation UX Best Practices, Patterns & Examples (2026)* — https://www.designstudiouiux.com/blog/mobile-navigation-ux/ — 2026
- Android Developers — *Layouts and navigation patterns* — https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns — 2025/2026
- SaaSUI — *7 SaaS UI Design Trends for 2026* — https://www.saasui.design/blog/7-saas-ui-design-trends-2026 — 2026
- DAR Design — *Multi-Role B2B Product UX in 2026* — https://dardesign.io/blog/multi-role-b2b-saas-ux-roles-permissions-flows — 2026
- Taqwah — *SaaS UX Design Best Practices 2026* — https://taqwah.agency/blog/saas-ux-design-best-practices — 2026
- Userpilot — *12 Real-World Upselling Examples in SaaS* — https://userpilot.com/blog/upselling-examples-saas/ — 2026
- Userpilot — *New Feature Onboarding* — https://userpilot.com/blog/new-feature-onboarding/ — 2026
- Appcues — *Upselling prompts: 8 examples* — https://www.appcues.com/blog/upselling-prompts-saas — 2026
- Appcues — *26 Best User Onboarding Examples (2026)* — https://www.appcues.com/blog/best-user-onboarding-examples — 2026
- Arcade — *14 Feature Announcement Examples and Strategies (2026)* — https://www.arcade.software/post/feature-announcement-examples — 2026
