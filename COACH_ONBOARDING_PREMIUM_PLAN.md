# EVA — Plan de onboarding coach premium

> **Documento canónico** (raíz del repo). Versionar con git.  
> **Última actualización:** 2026-04-30 (America/Santiago)  
> **Relacionado:** [nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md), [nuevabibliadelaapp/01-ESTADO-ACTUAL.md](nuevabibliadelaapp/01-ESTADO-ACTUAL.md), [AGENTS.md](AGENTS.md)

---

## Tabla de contenidos

1. [Propósito, contexto y alcance](#1-propósito-contexto-y-alcance)  
2. [Core loop (negocio)](#2-core-loop-negocio)  
3. [Estado actual del código y fallas](#3-estado-actual-del-código-y-fallas)  
4. [Experiencia visual premium y narrativa](#4-experiencia-visual-premium-y-narrativa)  
5. [Responsive y multi-dispositivo — obligatorio](#5-responsive-y-multi-dispositivo--obligatorio)  
6. [Definiciones de activación](#6-definiciones-de-activación)  
7. [KPIs y analítica](#7-kpis-y-analítica)  
8. [Rutas y CTAs](#8-rutas-y-ctas)  
9. [Perspectivas por rol](#9-perspectivas-por-rol)  
10. [Matriz QA y regresión](#10-matriz-qa-y-regresión)  
11. [Roadmap por olas](#11-roadmap-por-olas)  
12. [Checklist pre-merge](#12-checklist-pre-merge)  
13. [Decisiones tomadas](#13-decisiones-tomadas-congeladas-para-ejecución)  
14. [Changelog](#14-changelog)

---

## 1. Propósito, contexto y alcance

### 1.1 Contexto de producto

EVA es un SaaS **B2B2C**: el coach paga y configura; el alumno vive la experiencia en **`/c/[coach_slug]`** con marca del coach (PWA, loader, colores). El onboarding del coach no es un formulario: es la **primera impresión del panel** y define si entiende **en minutos** que puede reemplazar WhatsApp + planillas por un **ciclo profesional cerrado**.

La biblia de negocio resume la promesa: **white-label real + core loop completo + nutrición en tiers superiores + stack y precios locales**. El onboarding premium debe **materializar esa promesa en la UI**, no solo listar módulos.

### 1.2 Persona y momento emocional

| Momento | Estado mental del coach | Lo que necesita la UI |
|---------|-------------------------|------------------------|
| Primer login post-registro o post-pago | Expectativa + cierta ansiedad (“¿me van a cobrar algo raro?”, “¿es complicado?”) | Reconocimiento rápido de valor, **pocos decisiones**, camino claro |
| Primeros 60 s | Escanea el panel buscando “qué hago yo primero” | **Una** historia dominante + progreso visible |
| Día 1–3 | Puede estar entre clientes reales y pruebas | CTAs que **bajan a acción** sin bloquear exploración |
| Power-user | Quiere saltarse tutoriales | Dismiss + reabrir sin infantilizar |

### 1.3 Problema

El panel concentra muchos módulos (clientes, programas, builder, nutrición, ejercicios, marca, suscripción, etc.). Un coach nuevo **no sabe por dónde empezar** y puede abandonar antes de cerrar el **core loop** de valor (§2).

### 1.4 Objetivo del producto

Guiar al coach, sin bloquear al avanzado, hacia:

1. **Marca white-label** mínima entendible (logo, colores, mensaje, forma de compartir la app).  
2. **Primer alumno** en el sistema.  
3. **Primer plan asignado** (programa activo para ese alumno).  
4. **Señal de que el alumno usa la app** (hoy proxy frágil: check-in en feed; §6 y §3.1 F2).

### 1.5 Qué cubre este documento

- Dirección **visual premium** y **narrativa** (§4), **responsive obligatorio** (§5).  
- Activación, KPIs, riesgos y mitigaciones (“sin fallas”: UX, datos, legal, analítica).  
- Auditoría de código actual, olas de implementación (de a dos entregas), roles, QA, legal breve.

### 1.6 Qué no sustituye

No sustituye asesoría legal formal. La sección legal es **checklist de producto** para revisión con counsel.

---

## 2. Core loop (negocio)

**Constructor de planes → asignación a alumnos → ejecución en app del alumno → seguimiento por el coach.**

El onboarding premium debe **visualizar este loop** (diagramas mentales, copy, ilustración o mock) en checklist, hero y emails. Nutrición es **rama paralela** según tier, no sustituye el loop principal.

---

## 3. Estado actual del código y fallas

### 3.1 Inventario técnico

| Elemento | Ruta / tabla | Comportamiento relevante |
|----------|----------------|---------------------------|
| Checklist coach | `src/app/coach/dashboard/CoachOnboardingChecklist.tsx` | 4 pasos; persistencia guía + dismiss con confirmación; chip reabrir; tour marca vía `coach-brand-tour.ts` |
| Props checklist | `src/app/coach/dashboard/_components/DashboardShell.tsx` | `totalClients`, `activePlans`, `hasRecentCheckin` = `recentActivities.some(a => a.type === 'check-in')` |
| Eventos | `src/app/api/coach/onboarding-events/route.ts` | Zod: `stepKey`, `eventType`; insert service role |
| Tabla | `coach_onboarding_events` | `src/lib/database.types.ts` |
| Nutrición onboarding | `NutritionOnboarding.tsx`, `nutrition-onboarding-shared.ts` | Pasos + dismiss por coach en localStorage |
| Mi Marca + tour | `coach/settings`, `BrandSettingsTourClient.tsx` | Tour 8 pasos; `eva:brand-settings-tour-seen:{coachId}`; `CustomEvent('brand-tour-start')` |
| Tiers | `src/lib/constants.ts`, `coaches.subscription_tier` | Starter sin nutrición en oferta comercial |

### 3.2 Fallas conocidas (a corregir por olas)

| ID | Falla | Impacto | Mitigación |
|----|--------|---------|------------|
| F1 | Branding = toggle manual sin evidencia | Progreso engañoso, métricas débiles | Olas 1–2: CTA Mi Marca + tour; criterio duro opcional (§13) |
| F2 | Solo check-in para “alumno vivo” | Paso 4 imposible para algunos coaches | Ola 2: OR workout/sesión, misma ventana que feed |
| F3 | Dismiss solo localStorage | Inconsistencia multi-dispositivo | Ola 3: persistencia en `coaches` |
| F4 | Eventos `step_completed` repetibles | Embudo ruidoso | Ola 4: dedupe / política de emisión |
| F5 | Copy “beta” vs revenue | Desconfianza PMM | Ola 1: copy alineado marca |
| F6 | Sin reabrir guía tras dismiss | Usuario perdido | Ola 1: chip / menú “Continuar guía” |
| F7 | Starter igual que Pro | Expectativa nutrición errónea | Ola 4: ramal / upsell claro |
| **F8** | **Checklist poco visual** | No enseña *cómo* se usa cada pieza | **Olas 1–2 + §4**: hero, CTAs, mock alumno, opcional Lottie/video |

---

## 4. Experiencia visual premium y narrativa

### 4.1 Principios (no negociables de diseño)

1. **Show, don’t tell:** cada hito debe **mostrar** el efecto en la app del alumno o en el panel (mock, captura estilizada, preview real, o animación corta), no solo texto.  
2. **Una estética EVA:** mismo lenguaje que el resto del coach panel (glass, `--theme-primary`, tipografía existente). El onboarding no debe parecer otro producto.  
3. **Motion con propósito:** animar **orden** (1→2→3) y **causa → efecto** (asigno plan → el alumno ve X). Evitar motion decorativo sin guion.  
4. **Peso y rendimiento:** priorizar **CSS + Framer Motion + Lottie** ya en el proyecto antes que nuevas dependencias pesadas.  
5. **Coherencia con tours existentes:** Mi Marca ya tiene tour 8 pasos; el onboarding global debe **invitar** a ese tour sin duplicar toda la educación en un segundo mega-tour incompatible.

### 4.2 Direcciones creativas creíbles (elegir 1–2 dominantes + opcionales)

Estas direcciones están pensadas para implementación **incremental**; no hace falta hacerlas todas.

| ID | Nombre | Descripción | Encaja con |
|----|--------|-------------|------------|
| **V1** | **Cine + producto real** | Hero a altura viewport segura (`dvh` + safe area): composición con **mock de teléfono alumno** + fragmento de **panel coach** (puede ser UI esquemática + captura o ruta preview). Línea o “cable” animado que conecta acción coach → resultado alumno. Comunica B2B2C en una mirada. | Ola 1–2, §5 |
| **V2** | **Historieta / capítulos** | Cada paso = “viñeta”: ilustración o Lottie + titular + CTA. Scroll horizontal con snap **o** carrusel accesible en móvil. Muy memorable; exige trabajo de **a11y** (foco, anuncios). | Ola 1 opcional |
| **V3** | **Gemelos: Tú \| Tu alumno** | Dos columnas desktop; en móvil **tabs o acordeón** “Tú” / “Tu alumno” (§5). Demuestra uso sin video. | Ola 1–2 |
| **V4** | **Guía EVA (Lottie)** | `@lottiefiles/react-lottie-player` ya en deps: micro-animaciones por paso o mascota reacciona al completar. Refuerzo de marca sin nuevas librerías. | Ola 1 |
| **V5** | **Celebración medida** | `canvas-confetti` en **un solo** hito fuerte (p. ej. activación completa), no en cada click. | Ola 2–3 |
| **V6** | **Three.js puntual** | Ya existe `three` en deps: **solo** pieza opcional, desktop-first, apagada con `prefers-reduced-motion` y en móvil por defecto **off** o sustituida por estática. Riesgo: GPU, batería, bundle. | P2 / experimento |
| **V7** | **Video corto** | WebM/MP4 15–25 s loop (hosting estático o CDN): mayor claridad “cómo se usa” con coste de producción, no de npm. PMM/CS pueden reutilizarlo. | Ola 2+ |

**Recomendación de producto:** combinar **V1 o V3** (demostración del loop) + **V4** ligero + **V5** puntual. **V2** si hay recursos de diseño motion. **V6** solo si hay tiempo y métricas de performance OK.

### 4.3 Stack visual ya disponible (evitar “mil npm”)

| Capacidad | Dependencia / patrón en repo |
|-------------|------------------------------|
| Layout motion, transiciones | `framer-motion` |
| Animación vectorial | `@lottiefiles/react-lottie-player` |
| Celebración | `canvas-confetti` |
| 3D (opcional, acotado) | `three` |
| Utilidades animación CSS | `tw-animate-css` |
| QR compartir | `qrcode.react` |
| Iconografía | `lucide-react` |
| Gráficos / anillos (si se enseña “seguimiento”) | `recharts`, `react-circular-progressbar`, `react-activity-calendar` |

**Política:** nuevas librerías tipo “driver global de tour” (nombre genérico: product tour / spotlight cross-page) solo tras **evaluación explícita**: tamaño de bundle, mantenimiento, accesibilidad, y solapamiento con el tour de Mi Marca.

### 4.4 Storyboard textual por hito (guion UX)

| Paso | Qué debe “verse” (premium) | Copy guía (iterable) |
|------|----------------------------|----------------------|
| Marca | Mini preview alumno + logo/color; o Lottie “empaquetando marca” | “Así verá tu marca tu alumno antes de entrenar” |
| Primer alumno | Lista o tarjeta ficticia → real vacía con CTA | “Un alumno basta para cerrar el circuito” |
| Primer plan | Esquema semana + asignación | “Asigna un plan; él lo abre en su app” |
| Señal de uso | Notificación / feed / check-in o serie (según v2) | “Cuando entrena o hace check-in, lo ves aquí” |
| Compartir (ola 2) | QR + link + “copiar” | “Envía este enlace o el QR para instalar tu espacio” |
| Nutrición (Pro+) | Tres viñetas alineadas a `COACH_NUTRITION_ONBOARDING_STEPS` | No competir con el loop principal; card secundaria o pestaña |

### 4.5 Accesibilidad y motion

- Respetar **`prefers-reduced-motion`**: confetti off, parallax mínimo, Three off, Lottie estático o primer frame.  
- Contraste WCAG en textos sobre glass/gradientes.  
- No depender solo del color para estado completado (icono + texto).

### 4.6 Legal y contenido de demostración

- Demos con **datos ficticios** o UI genérica; si se usan capturas, **anonimizar** o stock.  
- Check-in con fotos: no mostrar contenido íntimo real en marketing embebido sin consentimiento explícito de modelo.

---

## 5. Responsive y multi-dispositivo — obligatorio

**Toda superficie de onboarding** (checklist ampliado, hero, chip “continuar guía”, modales ligeros, filas de paso con mock, QR, carrusel, tooltips educativos) debe diseñarse y validarse **mobile-first**. No es un añadido: es **criterio de aceptación** de cada olas.

### 5.1 Reglas duras (alineadas AGENTS.md)

| Regla | Requisito |
|-------|-----------|
| Altura viewport | **`min-h-dvh` / `h-dvh`**, no `min-h-screen` / `100vh` en layouts que afecten móvil |
| Safe area | Elementos `fixed`/`sticky` al borde: `pl-safe`, `pr-safe`, `pt-safe`, `pb-safe` según corresponda |
| Scroll horizontal | No introducir overflow; respetar política global `overflow-x: clip` en `html` |
| Touch | Áreas táctiles **mínimo ~44×44 px** en CTAs primarios y cerrar |
| Teclado | Orden de foco lógico en carruseles y modales |
| Tipografía | Legible en 320–390px de ancho; no depender de texto &lt; 12px para decisiones |

### 5.2 Breakpoints y comportamiento

| Rango | Comportamiento esperado |
|-------|-------------------------|
| **320–480px** | Una columna; hero compacto; gemelos coach/alumno como **tabs** o acordeón vertical; QR no smaller que legible escaneo |
| **481–768px** | Más aire; opcional dos columnas débiles si no aprieta CTAs |
| **769px+** | Gemelos lado a lado si el diseño V3; hero más cinematográfico |
| **Landscape móvil** | CTAs y progreso **no recortados**; altura limitada: priorizar fila de acción visible sin scroll forzado |

### 5.3 Rendimiento en móvil

- Lottie: archivos **ligeros**; lazy-load bajo el fold si el hero es pesado.  
- Three: **no** en critical path móvil por defecto.  
- Imágenes: Next `Image` donde aplique (patrón proyecto).

### 5.4 QA responsive (extensión de §10)

Checklist explícito antes de merge de cada olas:

- [ ] iPhone Safari (notch / Dynamic Island): controles no tapados por sistema  
- [ ] Android Chrome: barra de URL show/hide no rompe CTA fija  
- [ ] Tablet portrait y landscape  
- [ ] Zoom 200%: sin solapamiento crítico  
- [ ] `prefers-reduced-motion: reduce` activado: experiencia usable sin animaciones clave

---

## 6. Definiciones de activación

### 6.1 Activación v1 (hoy)

Branding (manual) + ≥1 cliente + ≥1 plan activo + check-in reciente en feed.

### 6.2 Activación v2 (congelada — detalle en §13 D1 y D2)

- **A — Marca:** `logo_url` **o** tour Mi Marca persistido como visto (`eva:brand-settings-tour-seen:{coachId}`); el toggle manual puede convivir hasta persistencia servidor (Ola 3).  
- **B — Primer alumno:** `count(clients) > 0`.  
- **C — Primer plan:** `activePlans > 0` (definición en query documentada al codificar Ola 2).  
- **D — Alumno activo:** en **ventana de 30 días**, check-in **o** al menos un `workout_log` de clientes del coach (alineado a `thirtyDaysAgo` en `dashboard.queries.ts`).

**Sin fallas:** tests con coach “solo pesas / sin check-in” y con alumno que solo hace check-in.

---

## 7. KPIs y analítica

| Métrica | Definición | Uso |
|---------|------------|-----|
| TTFVC | `coaches.created_at` → primer `clients` | Funnel |
| TTFPA | → `activePlans >= 1` | Producto |
| TTFsignal | → primer evento tipo D | “Aha” real |
| Checklist 100% @7d | % coaches 4/4 a 7 días | Eficacia onboarding |
| Drop-off por paso | `coach_onboarding_events` | Prioridad UX |

### 7.1 SQL de apoyo (analista)

**Ingesta (Ola 4):** la API `POST /api/coach/onboarding-events` aplica **rate limit** por coach (48 req/min vía Upstash cuando está configurado) y **dedupe en ventana de 5 s** para el mismo par `(step_key, event_type)` por coach: respuestas HTTP 200 pueden incluir `{ "ok": true, "deduped": true }` (no se inserta fila duplicada). Para embudos y cohortes, preferir agregaciones sobre **último evento** o conteos por coach, no solo filas crudas.

**`guide_engagement` (Ola 10):** evento para interacciones de la guía (viñetas, cinta Three, **confirmar ocultar guía** con `action: 'dismiss_confirm'` y `progress_pct` / `all_done` en `metadata`). **No** entra en la ventana de dedupe anterior: cada POST inserta fila (sigue sujeto al rate limit). Filtrar en SQL con `event_type = 'guide_engagement'` y leer `metadata` JSON (p. ej. `widget`, `action`, `target`).

```sql
select metadata->>'widget' as widget, metadata->>'action' as action, count(*) as n
from coach_onboarding_events
where event_type = 'guide_engagement'
  and created_at > now() - interval '30 days'
group by 1, 2
order by n desc;
```

```sql
select step_key, event_type, count(*) as n
from coach_onboarding_events
where created_at > now() - interval '90 days'
group by 1, 2
order by 1, 2;
```

```sql
select coach_id, step_key, event_type, max(created_at) as last_at
from coach_onboarding_events
group by coach_id, step_key, event_type;
```

```sql
-- Coaches que completaron al menos una vez cada tipo de evento (última ocurrencia en ventana)
select coach_id, step_key, event_type, max(created_at) as last_at
from coach_onboarding_events
where created_at > now() - interval '90 days'
group by coach_id, step_key, event_type;
```

Interpretar `step_completed` como **intento de completado** en cliente; tras dedupe server, el volumen de filas se acerca a “un hit por ventana” por par lógico. Para KPIs estrictos, cruzar con estado en `coaches.onboarding_guide` (jsonb) cuando exista.

---

## 8. Rutas y CTAs

| Intención | Ruta |
|-----------|------|
| Marca / tour | `/coach/settings` (contrato: query `?tour=1` y/o `brand-tour-start` — **un solo** disparo documentado) |
| Alumnos | `/coach/clients` |
| Programas | `/coach/workout-programs` |
| Builder | `/coach/workout-programs/builder` o `/coach/builder/[clientId]` |
| Nutrición (Pro+) | `/coach/nutrition-plans`, `/coach/foods` |
| Preview alumno | `/coach/settings/preview` |

---

## 9. Perspectivas por rol

### 9.1 Product Manager

- P0: narrativa visual **responsive** (§4–5) + CTAs + reabrir + copy no-beta.  
- P1: compartir app + activación v2.  
- P2: persistencia servidor + tier nutrición + E2E.  
- Congelar decisiones §13 antes de Ola 2.

### 9.2 UX/UI Designer

- Implementar **§4.2** elegida en sprint; storyboard §4.4 como acceptance reference.  
- Cada paso: **visual demostrativo** + titular + microcopy máx. 2 líneas + CTA.  
- Progreso: barra + texto accesible (`aria-valuenow` / region live donde aplique).  
- Dismiss con **confirmación** (`AlertDialog`); chip “Continuar guía” **siempre** visible si hay pasos pendientes y usuario dismissó (§5: safe area).  
- Dark mode: validar glass y gradientes.  
- **Nunca** diseñar solo en desktop: entregar **frames móvil** para cada olas visual.

### 9.3 Frontend Developer

- `next/link`; no bloquear UI si falla POST onboarding-events.  
- Ola 3: migración LS → DB sin flash de estado.  
- Integrar `prefers-reduced-motion` en motion/confetti/Three.

### 9.4 Backend Developer

- Migraciones + RLS; API con límites y validación metadata; dedupe §3.2 F4.

### 9.5 DevOps

- Monitoreo 5xx en API eventos; smoke staging post-deploy con viewport móvil.

### 9.6 QA Engineer

- Casos funcionales §10 + **§5.4 responsive**.  
- Regresión tours Mi Marca y nutrición.

### 9.7 Data Scientist

- Embudo post-dedupe; cohortes tier / trial / MP.

### 9.8 PMM

- Mensaje: “Tu marca, tu app, tu método en un solo flujo”.  
- Video WebM (V7) en landings / email si se produce.

### 9.9 Customer Success

- Playbook alineado a pasos visuales (capturas del mismo onboarding).

### 9.10 Legal

- Checklist §4.6 + datos alumnos §1.6.

---

## 10. Matriz QA y regresión

### 10.1 Funcional

- [ ] Dashboard 200; hidratación OK  
- [ ] Settings tour: scroll lock se libera al cerrar  
- [ ] `/c/[slug]` alumno sin regresiones no intencionadas  
- [ ] `/coach/subscription` intacto  
- [ ] Vitest / util nueva si dedupe  
- [ ] Playwright `tests/coach-onboarding-dashboard.spec.ts` (redirect sin auth; con `PERF_COACH_*` opcional: saludo, CTA Mi Marca, viewport móvil + tabs gemelos, “Capítulos”, nav “Saltar a”)

### 10.2 Visual y responsive (obligatorio cada PR de onboarding)

- [ ] §5.1 reglas duras cumplidas  
- [ ] §5.4 dispositivos y reduced motion  
- [ ] Sin F8: cada paso tiene **elemento demostrativo** acordado (aunque sea ilustración ligera)

---

## 11. Roadmap por olas

Tras cada olas: §10 completo + actualizar **Changelog**.

| Olas | Entrega A | Entrega B | Criterio “sin fallas” + visual |
|------|-----------|-----------|--------------------------------|
| **0** | Este documento mantenido en raíz | Opcional: una línea en `nuevabibliadelaapp/02-ROADMAP-PENDIENTES.md` apuntando aquí | PM ha leído §4–5 |
| **1** | Copy premium + CTAs + quitar “beta” + **reabrir guía** | **Hero o franja visual** (V1/V3 simplificado) + CTA Mi Marca + `brand-tour-start` sin doble apertura | **Responsive §5** + a11y foco |
| **2** | Paso compartir (link + copiar + QR) con layout móvil-first | Activación v2 paso D (OR workout/check-in) + query documentada | V5 confetti solo si PM lo aprueba y reduced-motion OK |
| **3** | Estado onboarding en `coaches` + RLS | Hidratar; migración LS → servidor | Multi-dispositivo + sin flash |
| **4** | Tier nutrición + card secundaria visual alineada §4.4 | Dedupe / rate limit API | Sin spam eventos |
| **5** | Playwright: dashboard + viewport móvil + CTA navega | Actualizar §7.1 SQL si esquema cambia | CI verde |
| **6** | V3 móvil: **tabs** gemelos Tu panel / Tu alumno (por debajo de `md`) | **V5** confetti **único** al 100% checklist + `prefers-reduced-motion: reduce` → sin confetti | QA tabs foco + reduced motion |
| **7** | **V1** franja compacta (loop coach → alumno, UI ficticia §4.6) | **V4** acento Lottie (misma URL canónica `lottie-assets`) + reduced motion → icono estático | Sin `dvh` full-bleed; hidración acento segura |
| **8** | **V2** ligero: nav “Saltar a” (anclas + scroll-snap móvil) | **V2+** scrollspy paso activo + scroll suave en clic solo sin `prefers-reduced-motion: reduce`; `aria-current` | QA foco + hash; sin video embebido |
| **9** | **V2** viñetas “Capítulos” (carrusel horizontal snap + flechas a11y) | **V6** cinta Three (`md+`, sin reduced motion; móvil/reduced → gradiente estático; chunk dinámico) | GPU/batería: `powerPreference: low-power`; sin `h-screen` |
| **10** | **`guide_engagement`** en API (sin dedupe) + telemetría viñetas/Three | **D2** paso marca: `logo_url` **o** tour Mi Marca visto (`localStorage`) + toggle manual | Rate limit sigue; legal: no PII en `metadata` |
| **11** | Dismiss guía con **AlertDialog** (confirmar / cancelar) §9.2 | Tour Mi Marca visto: **`storage`** + evento `eva:brand-tour-seen-changed` (`coach-brand-tour.ts`) para actualizar paso sin reload | CS: menos pérdida de progreso percibido |

### 11.1 Pospuesto (backlog explícito)

| ID | Tema | Notas |
|----|------|--------|
| **V7** | Video instructivo en onboarding (slot env, poster, reproducción embebida) | **Retirado del código** hasta tener asset aprobado (WebM/MP4), origen HTTPS estable, CSP/revisión PMM y texto legal acordado. Re-evaluar junto a §4.2 V7. Variables `NEXT_PUBLIC_COACH_ONBOARDING_VIDEO_*` no se usan por ahora. |

**Opcional posterior:** viñetas con ilustración custom / Lottie por paso; Three más elaborado (hero); **V7** ver §11.1.

---

## 12. Checklist pre-merge

- [ ] Copy ES revisado  
- [ ] **§5 responsive** verificado en al menos un dispositivo real o emulación fiel  
- [ ] Sin `h-screen` / `min-h-screen` nuevo en móvil  
- [ ] `prefers-reduced-motion` respetado  
- [ ] Foco visible; contraste OK  
- [ ] `database.types` si migración  
- [ ] Sin secretos

---

## 13. Decisiones tomadas (congeladas para ejecución)

> Responsable de cierre: agente / PM técnico (2026-04-30). Sirven como **fuente de verdad** hasta revisión explícita del dueño de producto.

| # | Tema | Decisión | Motivo breve |
|---|------|----------|--------------|
| D1 | Ventana **N** para “alumno activo” (activación v2, paso D) | **30 días**, alineado a `thirtyDaysAgo` y a la ventana de `workout_logs` en [`dashboard.queries.ts`](src/app/coach/dashboard/_data/dashboard.queries.ts). Paso D = **check-in en últimos 30 días** **OR** **al menos un `workout_log` con `logged_at` en últimos 30 días** (misma ventana que el bloque de logs del dashboard). | Coherencia con KPIs y gráficos ya “30d”; evita falsos negativos en coaches sin check-in. |
| D2 | Branding “completo” (sustituir toggle manual a medio plazo) | **Criterio automático preferido al implementar:** `logo_url IS NOT NULL` **OR** tour Mi Marca considerado “visto/completado” según la persistencia ya usada en `BrandSettingsTourClient` (`eva:brand-settings-tour-seen:{coachId}`). Hasta migrar estado a servidor (Ola 3), el toggle manual puede coexistir sin bloquear Ola 1. | Evita progreso vacío; reutiliza comportamiento existente. |
| D3 | **Reabrir guía** tras dismiss | **Chip “Continuar guía”** en el **flujo del dashboard** (zona superior del contenido principal, p. ej. debajo del saludo o encima del slot del checklist), **no** barra fija full-viewport que compita con safe area. Visible solo si hay pasos incompletos **y** el usuario dismissó el checklist. Responsive §5. | Máxima visibilidad al volver sin romper móvil ni tapar navegación. |
| D4 | Dirección visual **Ola 1** | **V3 Gemelos (Tú \| Tu alumno)** como patrón **dominante** en la tarjeta de onboarding (tabs en móvil, dos columnas en desktop). **V1** hero cinematográfico full-bleed **no** es obligatorio en Ola 1; si hay tiempo, una **franja compacta** encima (mock teléfono + una línea de copy) como acento, sin ocupar `100dvh` completo. | Entrega valor “demuestra el loop” con menos riesgo de layout y más control responsive. |
| D5 | **V4 Lottie** | **Opcional** en Ola 1; no bloquea merge si no hay asset aprobado. | Reduce dependencia de diseño externo. |
| D6 | **V5 Confetti** | **Fuera de Ola 1**. Reevaluar en Ola 2–3 solo al 100% del checklist, con `prefers-reduced-motion` off. | Evita sensación “juguete” y trabajo extra QA. |

### Cuándo empezamos a ejecutar (código)

La **ejecución** del plan (Ola 1 en código: checklist, CTAs, copy, reabrir, V3, Mi Marca) **no** arranca en este mensaje: solo se cerraron decisiones en el documento.

**Empezamos cuando indiques explícitamente** una de estas (o equivalente): *“ejecuta Ola 1”*, *“implementa el onboarding”*, *“dale con el código”*, *“go”*. En ese momento el agente debe seguir §11 Ola 1 + §5 + §12 y actualizar Changelog tras merge.

---

## 14. Changelog

| Fecha | Autor | Cambio |
|-------|--------|--------|
| 2026-04-30 | Plan EVA | Creación inicial del documento en raíz |
| 2026-04-30 | Plan EVA | Gran revisión: TOC, contexto persona, **§4 visual premium** (direcciones V1–V7, stack deps, storyboard, legal demo), **§5 responsive obligatorio**, falla F8, olas alineadas a entregables visuales, QA responsive, reordenación de secciones |
| 2026-04-30 | Plan EVA | **§13 decisiones congeladas** (D1–D6): ventana 30d, branding automático preferido, chip reabrir, V3 Ola 1, Lottie/confetti; **gatillo explícito** para inicio de ejecución en código |
| 2026-04-30 | Implementación | **Ola 1 (par 1) en código:** checklist premium (`CoachOnboardingChecklist.tsx`): copy sin “beta”, CTAs con rutas reales, bloque gemelo Tu panel / Tu alumno (responsive), barra con `aria-*`, chip “Continuar guía”, paso 4 = check-in **o** workout en `recentActivities`; `?tour=1` en Mi Marca (`BrandSettingsTourClient`) sin doble timer; guía movida bajo saludo (`DashboardShell`); `coachSlug` desde página → `DashboardContent` |
| 2026-04-30 | Implementación | **Ola 2 (par 2) en código:** bloque **Compartir app** (URL absoluta vía `resolveMetadataBase`, copiar con `sonner`, QR `qrcode.react`, enlace Mi Marca); **`hasStudentSignal30d`** en `getCoachDashboardDataInner` + tipo `DashboardV2Data` (check-in últimos 30d **o** `workout_logs` ya cargados en ventana 30d); paso 4 del checklist usa ese flag; comentario en query para analistas |
| 2026-05-01 | Implementación | **Ola 3 (par 3):** migración `20260501120000_coaches_onboarding_guide.sql` (`onboarding_guide` jsonb); `persistOnboardingGuideAction` + hidratación en `CoachOnboardingChecklist` (servidor primero, migración one-shot LS→DB); `getCoach` + dashboard pasan `initialOnboardingGuide`; debounce 450ms sync servidor; comentario RLS en SQL |
| 2026-05-01 | Implementación | **Ola 4 (par 4):** bloque **nutrición por tier** en checklist (`getTierCapabilities` + `COACH_NUTRITION_ONBOARDING_STEPS`; Starter → upsell `/coach/subscription`; Pro+ → ruta opcional 3 pasos); `subscription_tier` en `getCoach` + props dashboard; API `/api/coach/onboarding-events`: **Upstash** `rateLimitCoachOnboardingEvents` (48/min coach) + **dedupe** 5s mismo `(step_key, event_type)` |
| 2026-05-01 | Implementación | **Ola 5 (par 5):** Playwright `tests/coach-onboarding-dashboard.spec.ts` (smoke redirect, login opcional, CTA Mi Marca con chip Continuar guía, viewport móvil); **§7.1** ampliado (dedupe/rate limit, SQL cohorte 90d, cruce con `onboarding_guide`); **§10.1** checklist QA |
| 2026-05-01 | Implementación | **Ola 6 (par 6):** gemelos V3 en móvil con `Tabs` (Tu panel / Tu alumno); confetti `canvas-confetti` una sola vez al cerrar 100% (respeta `prefers-reduced-motion`, guard `sessionStorage`); Playwright móvil: tabs + link alumno |
| 2026-05-01 | Implementación | **Ola 7 (par 7):** `OnboardingCompactLoopStrip` (V1 franja + copy circuito); Lottie V4 vía `lottie-assets` + `motion-safe` en conector; `ClientsDirectoryEmpty` reusa URL; checklist oculta franja si 100% (`allDone`) |
| 2026-05-01 | Implementación | **Ola 8 (cerrada):** `OnboardingStepsJumpNav` con anclas, scroll-snap, **scrollspy** (`aria-current`), scroll suave en clic solo sin `prefers-reduced-motion: reduce`; pasos con `scroll-mt` |
| 2026-05-01 | Plan / código | **V7 pospuesto — §11.1:** retirado bloque de video del coach dashboard (sin `NEXT_PUBLIC_COACH_ONBOARDING_VIDEO_*`); hasta asset + CSP + PMM/legal |
| 2026-05-01 | Implementación | **Ola 9 (par 9):** `OnboardingStepsVignetteCarousel` (V2 viñetas + snap + flechas); `OnboardingThreeSlot` / `OnboardingThreeRibbonInner` (V6 Three icosaedro wireframe, solo `md+` y sin reduced motion, chunk async); Playwright “Capítulos” |
| 2026-05-01 | Implementación | **Ola 10:** `guide_engagement` en API (sin dedupe 5s); `onboarding-telemetry.client.ts`; viñetas + Three emiten; paso marca auto con `logo_url` o tour Mi Marca (`localStorage`); §7.1 SQL ejemplo |
| 2026-05-01 | Implementación | **Ola 11:** `AlertDialog` al cerrar guía; `coach-brand-tour.ts` + evento al cerrar tour Mi Marca; checklist escucha `storage` + mismo evento para refrescar paso marca |
| 2026-05-01 | Implementación | **Ola 11b:** al confirmar “Ocultar” en el diálogo, `postGuideEngagement` (`dismiss_confirm`, `progress_pct`, `all_done`); §7.1 texto actualizado |

---

*Documento vivo: tras cada olas, actualizar Changelog. Decisiones nuevas: añadir filas a §13 o versionar con fecha.*
