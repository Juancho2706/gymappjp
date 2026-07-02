# Research: mejoras white-label — el coach como DUEÑO de su marca

> Fecha: 2026-07-02 · Investigador de producto EVA · Ángulo: **herramientas de dueño de marca para el COACH**
> Objetivo: que el coach sienta el white-label como SU negocio y no se vaya de EVA (retención del coach = churn del proveedor).
> Regla: **CERO IA**. Cada mejora tiene evidencia (URL de competidor real), esfuerzo (S/M/L) e impacto en retención del coach.

---

## Contexto EVA (lo que ya existe)

- White-label v2 SHIPPED (Pro+): color primario + secundario, fuente curada (12), dark mode, **login brandeado**, loaders brandeados, "powered by EVA" discreto. Toggle por coach.
- Ruta alumno `/c/[coach_slug]/*`; hoy `/c/[slug]` va **directo al login** (no hay landing pública pre-login).
- Push notifications vivas (`web-push` + VAPID, `src/lib/push.ts`).
- Identidad primaria del coach = `invite_code` (ya live).
- Pagos: MercadoPago **pre-approvals del coach hacia EVA**. Los coaches cobran a sus alumnos **por fuera** (gap conocido). El cobro coach→alumno es zona pagos: acá **solo se investiga**.
- PWA install prompt deprecado en Fase 6A; RN app = app EVA en store, white-label **in-app post-login**.

El insight transversal de la investigación: los competidores no venden "una app bonita", venden **sensación de propiedad**. El coach que ya subió su logo, armó su landing, imprimió sus QR, cobra dentro de la plataforma y tiene su embudo de referidos adentro **tiene un costo de salida altísimo**. Ese sunk cost ES la retención.

---

## Área 1 — Brand assets para el coach (kit de marketing auto-generado)

Los competidores tratan el branding como **material de marketing exportable**, no solo como skin de la app.

- **FitBudd Marketing Toolkit**: 100+ plantillas, plantillas de redes sociales, lead-gen, sales pitch, listos para el coach. El branding del coach alimenta material descargable, no solo la app. (https://www.fitbudd.com/marketing-tool-kit)
- Generadores de story/post brandeados de terceros que los coaches hoy usan **fuera** de su plataforma: Placeit (Instagram Story Generator for Fitness Coaches — https://placeit.net/c/design-templates/stages/instagram-story-generator-for-fitness-coaches-1473c-el1), Mojo (https://mojo-app.com/instagram-story/create-your-fitness-brand-with-instagram-story-templates/), Kapwing gym story templates (https://www.kapwing.com/templates/instagram-story/gym). **Oportunidad EVA: internalizar esto con el tema del coach ya cargado.**
- **QR + tarjeta digital**: los coaches imprimen QR business cards para captar alumnos (Blinq https://blinq.me/solutions/digital-business-card, QRCodeChimp https://www.qrcodechimp.com/qr-code-business-card, plantillas Etsy PT https://www.etsy.com/listing/1866228020/personal-trainer-qr-code-business-card, guía Trainerize https://www.trainerize.com/blog/personal-trainer-business-cards/). Hoy lo hacen a mano; EVA puede autogenerarlo apuntando a `/c/[slug]`.
- **Link-in-bio brandeado**: Kajabi ofrece "Link in Bio" gratis, una mini-site mobile-first que **reemplaza Linktree** con la marca del coach (https://www.kajabi.com/for/fitness-coaches, review https://www.thecoachsupport.com/blog/kajabi-review). EVA ya tiene el tema del coach → puede servir esta página con su color/fuente.

### Mejoras

| # | Mejora | Qué es | Esfuerzo | Impacto retención |
|---|--------|--------|----------|-------------------|
| 1 | **Kit de marca descargable auto-generado** | Desde el branding ya cargado (logo + color2 + fuente), generar y ofrecer descarga de avatar IG, cover, banner story con la marca del coach. Cero setup manual. | M | Alto — convierte el branding en material real; sunk cost visible |
| 2 | **Generador de imágenes de logro brandeadas** | Cuando el alumno cierra racha / PR / termina plan, generar imagen compartible con el tema del coach + "entrenado con [marca del coach]". El alumno la comparte → publicidad gratis del coach. | M | Alto — cada share es marketing del coach dentro de EVA |
| 3 | **QR card imprimible brandeada** | En `/coach/settings`, generar PNG/PDF con QR a `/c/[slug]` (o descarga de la PWA) con color/fuente del coach, listo para imprimir. | S | Medio — utilidad de adquisición offline con su marca |
| 4 | **Página link-in-bio brandeada (tipo Linktree)** | Mini-página pública `/c/[slug]/link` con tema del coach: bio, foto, links (IG, WhatsApp, "entrena conmigo"). Reemplaza Linktree externo. | M | Alto — el coach pone ESTE link en su bio de IG → EVA es su hogar público |

---

## Área 2 — Landing pública por coach (página de venta pre-login)

Todos los competidores serios dan al coach una **página de venta pública** con su marca. EVA hoy manda `/c/[slug]` directo al login: no hay dónde "vender" antes de que el alumno tenga cuenta.

- **TrueCoach Public Profiles**: página pública tipo storefront con bio, servicios, **testimonios/success stories, precios**, links a redes, y **"apply to train with you directly through your profile"** → captura leads automáticamente, sin sitio aparte, mobile-friendly y SEO-friendly. (https://truecoach.co/features/public-profiles/)
- **FitBudd**: sitio brandeado + app; los coaches venden desde su propia web con su marca (https://www.fitbudd.com/features/custom-branded-app).
- **Kajabi**: sales pages / landing pages para vender programas y coaching bajo la marca del coach (https://www.kajabi.com/for/fitness-coaches).
- **Everfit Public Client Invite Link**: link público de alta con **branding custom en la página de signup** (https://help.everfit.io/en/articles/5369004-public-client-invite-link).

### Mejoras

| # | Mejora | Qué es | Esfuerzo | Impacto retención |
|---|--------|--------|----------|-------------------|
| 5 | **Landing pública brandeada en `/c/[slug]`** | Reemplazar el redirect-a-login por una landing pre-login con marca del coach: hero, bio, foto, CTA "empezar / entrena conmigo". El login queda a un click. | L | Alto — es LA cara pública del coach; se vuelve su URL oficial |
| 6 | **Sección testimonios editable por el coach** | Bloque en la landing donde el coach agrega/ordena testimonios (nombre, foto, texto, resultado). | S | Medio — prueba social propia = página que el coach cuida |
| 7 | **Captura de lead / "aplicar para entrenar"** | Form en la landing que crea un prospecto en el dashboard del coach (nombre, objetivo, contacto), no obliga a cuenta. Como TrueCoach "apply". | M | Alto — EVA se vuelve el embudo de ventas del coach, no solo la entrega |
| 8 | **Precios/planes visibles del coach** | El coach lista sus paquetes (precio, qué incluye) en la landing pública. Vitrina, sin necesariamente cobrar dentro (ver Área 4). | S | Medio — su oferta comercial vive en EVA |

---

## Área 3 — Métricas de marca para el coach

Hallazgo clave: los competidores exponen métricas de **adherencia del alumno** (workout completion, nutrición, progreso — Trainerize, Coach Catalyst, Hevy Coach, TrueCoach, My PT Hub) pero **casi ninguno expone métricas de "salud de MI marca"**: cuántos instalaron mi app, cuántos abren mis push, cuántos compartieron con mi logo. **Gap de mercado = diferenciador barato para EVA.**

- Dashboards de engagement/adherencia estándar (https://www.trainerize.com/blog/client-progress-tracker/, https://coachcatalyst.com/, https://truecoach.co/features/personal-trainer-client-tracker/, https://hevycoach.com/features/client-tracker/).
- EVA ya tiene la data cruda: push subscriptions (`push_subscriptions`), envíos de push, sesiones de PWA. Solo falta **agregarla y presentarla como "Mi Marca".**

### Mejoras

| # | Mejora | Qué es | Esfuerzo | Impacto retención |
|---|--------|--------|----------|-------------------|
| 9 | **Panel "Mi Marca": alumnos que instalaron la app** | Métrica de cuántos alumnos tienen la PWA instalada / push activo (desde `push_subscriptions`) y % activos. | M | Medio-alto — el coach "ve" su base como negocio propio |
| 10 | **Opens / entregas de sus push** | Cuántos de sus push se entregaron y (si se instrumenta) se abrieron. Prueba de que su canal directo funciona. | M | Medio — canal directo medible = razón para no irse |
| 11 | **Contador de shares brandeados** | Cuántas veces se compartió una imagen de logro con su marca (instrumentar el share de la mejora #2). | S | Medio — cuantifica el marketing gratis que EVA le da |

---

## Área 4 — White-label del flujo de cobro coach→alumno (SOLO investigación — zona pagos)

Hoy los coaches de EVA cobran a sus alumnos **por fuera** (transferencia, MP manual, efectivo). Los competidores tratan el cobro como **el lock-in más fuerte**: si el dinero del coach pasa por la plataforma, irse cuesta muchísimo.

- **FitBudd Direct Client Payments**: subscripción / one-time / paquetes, integra Stripe + PayPal + Shopify **sin fee mensual extra**, lema "**Let no one come in between you and your earnings**" (el coach se queda con lo suyo), Apple Pay / GPay, sign-ups directos en la app. (https://www.fitbudd.com/features/direct-client-payments, plan Super Pro white-label $149/mo con Apple/GPay: https://www.fitbudd.com/post/fitbudd-vs-trainerize)
- **Trainerize Stripe Integrated Payments**: add-on $10/mo (incluido en Studio); conecta Stripe → pagos, acceso y billing en un lugar, onboarding automático. (https://help.trainerize.com/hc/en-us/articles/6147809498004-Stripe-Integrated-Payments, https://www.trainerize.com/features/stripe-payments/)
- Comparativa de fees/planes (contexto de a cuánto lo venden): https://assistantcoach.fit/blog/hidden-fees-fitness-coaching-software/

**Nota para EVA (decisión, no ejecución):** el equivalente chileno sería MercadoPago **Split/Marketplace** o pre-approvals a nombre del coach. Es zona regulada (SERNAC, boletas, IVA) — este research solo marca la oportunidad y el patrón; la ejecución la decide el equipo de pagos.

### Mejoras (research — requieren decisión de pagos)

| # | Mejora | Qué es | Esfuerzo | Impacto retención |
|---|--------|--------|----------|-------------------|
| 12 | **Cobro in-app del coach a sus alumnos** | El alumno paga su plan/suscripción/paquete DENTRO de EVA; el coach recibe el dinero (split MP / cuenta conectada). Patrón FitBudd/Trainerize. | L | Alto — el lock-in máximo: si el flujo de caja pasa por EVA, el coach no se va |
| 13 | **Checkout brandeado del alumno** | La pantalla de pago del alumno lleva la marca del coach (no "EVA"), reforzando que le paga a SU coach. | M | Alto — el momento de pago refuerza la marca del coach, no la de EVA |

---

## Área 5 — Programa de referidos brandeado (alumno invita con el link del coach)

Los competidores convierten a cada alumno en un canal de adquisición **para el coach**, con su marca.

- **Trainerize Client Referrals**: banner en la app del alumno → el alumno toca, auto-comparte su **link único**, y el coach ve **exactamente quién refirió a quién** en su dashboard. (https://www.trainerize.com/blog/4-ways-start-client-referral-rewards-program-bring-business/, features: https://www.trainerize.com/features/, growth: https://www.trainerize.com/blog/client-referrals/)
- **Everfit Referral / Public Invite Link**: link/código único, invitación por email o compartible, página de signup con branding custom. (https://help.everfit.io/en/articles/5369004-public-client-invite-link)
- (Comparar con el referral **plataforma→coach** de Trainerize, distinto del alumno→coach: https://help.trainerize.com/hc/en-us/articles/211421283-Does-Trainerize-Have-a-Referral-Program)

### Mejoras

| # | Mejora | Qué es | Esfuerzo | Impacto retención |
|---|--------|--------|----------|-------------------|
| 14 | **Banner de referidos en la app del alumno** | El alumno comparte un link brandeado del coach (`/c/[slug]?ref=...`); el coach ve en su dashboard quién refirió a quién. Cada alumno = canal de adquisición del coach. | M | Alto — EVA hace crecer la base del coach → el coach depende de EVA para crecer |
| 15 | **Recompensa de referido configurable por el coach** | El coach define el premio (mes gratis / descuento / sesión) que dispara el referido exitoso. | M | Medio — el motor de crecimiento del coach vive en EVA |

---

## Priorización sugerida (retención del coach / esfuerzo)

**Quick wins (S/M, impacto alto):** #4 link-in-bio, #3 QR card, #2 imágenes de logro brandeadas, #7 captura de lead.
**Apuestas estructurales (L, impacto alto):** #5 landing pública brandeada, #12 cobro in-app (zona pagos, requiere decisión).
**Diferenciador barato (gap de mercado):** #9–#11 panel "Mi Marca" — nadie lo expone y EVA ya tiene la data.

El hilo conductor: cada una de estas convierte a EVA de "la app donde entrego rutinas" a **"el sistema operativo del negocio del coach"** (su cara pública, su marketing, su cobro, su crecimiento). Ese es el foso de retención.

---

## Fuentes

- FitBudd Marketing Toolkit — https://www.fitbudd.com/marketing-tool-kit
- FitBudd Custom Branded App — https://www.fitbudd.com/features/custom-branded-app
- FitBudd Direct Client Payments — https://www.fitbudd.com/features/direct-client-payments
- FitBudd vs Trainerize — https://www.fitbudd.com/post/fitbudd-vs-trainerize
- Trainerize Custom Branded Apps — https://www.trainerize.com/features/custom-branded-fitness-apps/
- Trainerize Stripe Payments — https://www.trainerize.com/features/stripe-payments/ · https://help.trainerize.com/hc/en-us/articles/6147809498004-Stripe-Integrated-Payments
- Trainerize Client Referrals — https://www.trainerize.com/blog/4-ways-start-client-referral-rewards-program-bring-business/ · https://www.trainerize.com/blog/client-referrals/
- Trainerize Business Cards — https://www.trainerize.com/blog/personal-trainer-business-cards/
- TrueCoach Public Profiles — https://truecoach.co/features/public-profiles/
- TrueCoach Custom Branded App — https://truecoach.co/features/custom-branded-fitness-app/
- TrueCoach client sharing workouts — https://help.truecoach.co/en/articles/2403821-client-sharing-workouts-to-social-media
- Everfit Public Client Invite Link — https://help.everfit.io/en/articles/5369004-public-client-invite-link
- Everfit Referral Program — https://help.everfit.io/en/articles/4436288-everfit-referral-program
- Kajabi for Fitness Coaches (Link in Bio / sales pages) — https://www.kajabi.com/for/fitness-coaches · https://www.thecoachsupport.com/blog/kajabi-review
- Placeit IG Story Generator for Fitness Coaches — https://placeit.net/c/design-templates/stages/instagram-story-generator-for-fitness-coaches-1473c-el1
- Mojo fitness story templates — https://mojo-app.com/instagram-story/create-your-fitness-brand-with-instagram-story-templates/
- Kapwing gym story templates — https://www.kapwing.com/templates/instagram-story/gym
- Blinq digital business card — https://blinq.me/solutions/digital-business-card
- QRCodeChimp business card — https://www.qrcodechimp.com/qr-code-business-card
- Etsy PT QR business card — https://www.etsy.com/listing/1866228020/personal-trainer-qr-code-business-card
- Hidden fees comparison — https://assistantcoach.fit/blog/hidden-fees-fitness-coaching-software/
