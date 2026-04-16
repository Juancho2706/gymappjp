# EVA Fitness Platform — Road to 100%
## Documento de Auditoría Completa: Features, UX/UI, Seguridad y Performance

> **Generado:** 2026-04-14 America/Santiago
> **Última actualización:** 2026-04-16 — Sesión 3 completada
> **Base:** Auditoría de 225+ archivos, 41 rutas, 3 agentes de análisis paralelo (seguridad, performance, UX).
> **Estado actual:** ~92% completitud global (Sesiones 1+2+3 completadas)

---

## Índice

1. [Tareas Pendientes para 100%](#1-tareas-pendientes-para-100)
2. [Opiniones UI/UX — Qué cambiar y mejorar](#2-opiniones-uiux)
3. [Seguridad — Hallazgos y acciones](#3-seguridad)
4. [Performance — Optimización de carga](#4-performance)

---

# 1. Tareas Pendientes para 100%

Las tareas están ordenadas por prioridad. Las marcadas ✅ están completadas.

## BLOQUE P0 — Pagos (completar Sprint 8)

| ID | Tarea | Archivo | Estado |
|----|-------|---------|--------|
| P1.7 | Smoke test manual: coach → pagar → cancelar → verificar grace period | Manual | ⏳ Pendiente |
| P2.4 | Webhook: cuando nuevo preapproval se `authorized`, cancelar el anterior en MP y actualizar `subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id` en DB | `src/app/api/payments/webhook/route.ts` | ✅ Sesión 1 |
| P2.6 | Verificar que coach en status `canceled` que reactiva crea preapproval con `start_date = now + 60s` (no hereda fecha anterior) | `src/app/coach/reactivate/` | ✅ Sesión 1 |

## BLOQUE P1 — Revenue Crítico

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 04.1 | Auditar register action: slug generation, race condition duplicate check, redirect correcto con query params | `src/app/(auth)/register/` | 0.5d | ✅ Sesión 1 |
| 04.2 | Processing page: si polling detecta `pending_payment` tras 5 min, mostrar "Hubo un problema" + link a `/coach/reactivate` | `src/app/coach/subscription/processing/page.tsx` | 0.5d | ✅ Sesión 1 |
| 04.3 | Login bloqueado: verificar que cuando status es bloqueado el middleware redirige a `/coach/reactivate` con mensaje claro (no error genérico) | `src/middleware.ts` + `/coach/reactivate/` | 0.5d | ✅ Sesión 1 |
| 04.4 | Banner trial: en dashboard, si `subscription_status === 'trialing'` y `trial_ends_at`, mostrar días restantes | `src/app/coach/dashboard/CoachDashboardClient.tsx` | 0.5d | ✅ Sesión 3 (confirmado ya implementado) |
| 05.2 | Historial de pagos: formatear fechas en español (`es-CL`), mostrar monto y estado de cada `subscription_event` | `src/app/coach/subscription/page.tsx` | 1d | ✅ Sesión 1 |
| RLS | **CRÍTICO**: Habilitar RLS en todas las tablas del proyecto + políticas de ownership coach → datos propios | Supabase migrations | 2d | ✅ Sesión 1 (migración `20260414183000`) |

## BLOQUE P2 — Core Loop Polish

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 06.4 | Dots de actividad en DayNavigator del perfil coach (días con workout_logs + daily_nutrition_logs) | `src/app/coach/clients/[clientId]/` | 1d | ✅ Sesión 2 |
| 07.4 | KPI card sidebar perfil alumno: reducir padding, eliminar blur decorativo, quitar "Racha Interact." duplicada | `ClientProfileDashboard.tsx` | 0.5d | ✅ Sesión 2 |
| 08 | Check-in medidas corporales: migración SQL + paso 4 wizard + Zod + visualización en B6 | `supabase/migrations/` + `CheckInForm.tsx` + `ProgressBodyCompositionB6.tsx` | 2d | ⏳ Pendiente |
| 09 | Goal weight: migración `goal_weight_kg`, campo en perfil coach, ReferenceLine en WeightProgressChart | `supabase/migrations/` + coach profile + chart | 1d | ✅ Sesión 2 (migración `20260415120000`) |
| 10.1 | Workout optimistic updates: `useOptimistic` de React 19 en LogSetForm | `WorkoutExecutionClient.tsx` | 1d | ⏳ Pendiente |
| 10.2 | Retry automático en server action: 3 intentos con backoff (500ms, 1s, 2s) + toast "Reintentando..." | `WorkoutExecutionClient.tsx` | 0.5d | ⏳ Pendiente |
| 10.3 | Banner offline: `navigator.onLine === false` → banner "Sin conexión. Los datos se guardarán al reconectar." | `WorkoutExecutionClient.tsx` | 0.5d | ⏳ Pendiente |

## BLOQUE P2 — Dashboard Coach

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 11.1 | Stat card "MRR Estimado": suma de `amount` en `subscription_events` del mes actual vs mes anterior | Dashboard coach | 1d | ✅ Sesión 2 |
| 11.2 | AreaChart sesiones 30 días: unique sessions por día con deduplicación client+day | Dashboard coach | 1d | ✅ Sesión 2 |
| 11.3 | BarChart crecimiento alumnos: clientes activos por mes (últimos 6 meses) | Dashboard coach | 1d | ✅ Sesión 2 |
| 11.4 | Activity feed: check-ins con foto miniatura, workouts completados hoy/ayer (deduplicados) | Dashboard coach | 0.5d | ✅ Sesión 2 |

## BLOQUE P2 — Resto de Features

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 12.1 | Mi Marca: preview real con mock del dashboard alumno actual | `src/app/coach/settings/preview/` | 1.5d | ⏳ Pendiente |
| 12.2 | Mi Marca: logo preview en tiempo real con `URL.createObjectURL` antes de subir | `LogoUploadForm` | 0.5d | ✅ Sesión 2 |
| 13.1 | Ejercicios coach: upload de GIF/video (max 5MB, bucket `exercises`) | `src/app/coach/exercises/` | 1.5d | ⏳ Pendiente |
| 13.4 | Ejercicios coach: filtro por muscle_group en lista | `src/app/coach/exercises/` | 0.5d | ⏳ Pendiente |
| 14 | Login coach: rediseño visual (layout split o centered premium) | `src/app/(auth)/login/` | 1d | ⏳ Pendiente |
| 15.1 | Onboarding alumno: barra de progreso visual (step 1/3, 2/3, 3/3) | `OnboardingForm.tsx` | 0.5d | ⏳ Pendiente |
| 15.3 | Onboarding alumno: validación inline por campo (no solo al submit) | `OnboardingForm.tsx` | 0.5d | ⏳ Pendiente |
| 16.1 | Ejercicios alumno: tabla `client_exercise_favorites` + botón ❤️ + filtro "Mis favoritos" | `supabase/migrations/` + catálogo alumno | 1d | ⏳ Pendiente |
| 16.3 | Ejercicios alumno: tab "Mi historial" — últimas 5 sesiones por ejercicio desde `workout_logs` | Catálogo alumno | 1d | ⏳ Pendiente |
| 23.2 | Forgot/Reset password: verificar redirect correcto a `/reset-password` y flujo completo | `src/app/(auth)/` | 0.5d | ⏳ Pendiente |
| 27 | PrintProgramDialog: mejorar con logo del coach, nombre alumno, fecha; explorar descarga PDF | Coach builder | 1d | ⏳ Pendiente |
| 28 | `admin-raw.ts`: reemplazar `any` por `SupabaseClient<Database>` | `src/lib/supabase/admin-raw.ts` | 0.5d | ✅ Sesión 2 (ya tipado correctamente) |

## BLOQUE P3 — Crecimiento y Escala

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 17 | Panel CEO `/admin/`: coaches activos por tier, MRR total, churn, alumnos totales | `src/app/admin/` (nuevo) | 4d | ⏳ Pendiente |
| 18 | Testing: E2E pago sandbox MP, flujo alumno completo, unit tests server actions críticas, test RLS | `tests/` | 5d | ⏳ Pendiente |
| 19.1 | SEO: `sitemap.xml` dinámico, `robots.txt`, JSON-LD `SoftwareApplication` en landing | `src/app/` | 1d | ⏳ Pendiente |
| 20 | i18n: migrar strings hardcoded del dashboard alumno + onboarding a keys | Toda la app | 3d | ⏳ Pendiente |
| 21.4 | Email de confirmación de pago al coach cuando webhook confirma `approved` | `src/app/api/payments/webhook/` | 1d | ⏳ Pendiente |
| 22 | PWA push notifications: handler en `sw.js`, endpoint subscribe/send, casos de uso workout/programa | `public/sw.js` + nuevas API routes | 3d | ⏳ Pendiente |
| 25 | Nav alumno: "Entrenar", "Progreso", "Más" en lugar de estructura actual | `src/app/c/[coach_slug]/` | 1d | ⏳ Pendiente |

**Estimación total restante al 100%: ~22-25 días de desarrollo**

---

## Resumen Sesión 3 (2026-04-16) — Lo que se implementó

### Bug Fixes críticos
- **Fix ✅** 404 botón NUTRICION: `href="/coach/nutrition"` → `href="/coach/nutrition-plans"`
- **Fix ✅** Sistema de colores verde/azul: `SYSTEM_PRIMARY_COLOR = '#007AFF'` en `brand-assets.ts`; `coach/layout.tsx` y `middleware.ts` usan el nuevo valor cuando `use_brand_colors_coach === false` (antes usaban `BRAND_PRIMARY_COLOR` verde #10B981)
- **Fix ✅** NutritionModal ("Cumplimiento de Macros") responsive: `w-[95vw] sm:max-w-2xl md:max-w-4xl`, grid `2→4 cols`, header `flex-wrap`, `MacroItem` sin corte de texto
- **Fix ✅** Emails legales: `opcoach49@gmail.com` → `contacto@eva-app.cl` en `/legal` y `/privacidad`

### Confirmaciones
- **04.4 ✅** Banner trial ya estaba implementado en `CoachDashboardClient.tsx` (líneas 207-228) — confirmado y documentado

### Cuentas de prueba (Supabase)
- Creadas 2 cuentas coach con plan **pro activo hasta 2026-05-16**:
  - `Joaquinamr7@gmail.com` (slug: `joaquinamr7`)
  - `robertocarrasco154@gmail.com` (slug: `robertocarrasco154`)
  - Password provisional: `evaprueba123`, `max_clients: 50`

### Build fixes (2026-04-15 — sesión previa en Cursor)
- **Fix ✅** `database.types.ts`: reescrito de UTF-16 LE a UTF-8 (fix build Vercel "is not a module")
- **Fix ✅** Tipos `video_start_time` y `video_end_time` añadidos a `exercises` en `database.types.ts`

---

## Resumen Sesión 2 (2026-04-15) — Lo que se implementó

### Seguridad
- **F1 ✅** Email drip endpoint migrado a `Authorization: Bearer` header exclusivamente (eliminado query param inseguro)
- **F2 ✅** `/api/recipes/search` con rate limiting Upstash 30 req/min (`ratelimit:recipes`)

### Dashboard Coach Analytics
- **11.1 ✅** MRR Estimado stat card con delta % vs mes anterior
- **11.2 ✅** AreaChart "Sesiones 30 días" — unique sessions/día deduplicadas por client+day
- **11.3 ✅** BarChart "Crecimiento de Alumnos" — nuevos clientes por mes (últimos 6)
- **11.4 ✅** Activity feed con tipos (check-in, workout, nuevo alumno), color coding y thumbnails de check-in

### UX Polish
- **07.4 ✅** KPI cards: padding reducido, blur decorativo eliminado, "Racha Interact." duplicada removida
- **12.2 ✅** Logo preview en tiempo real con `URL.createObjectURL` + limpieza en unmount
- **B3 ✅** Dark mode completo en `/coach/subscription` (cards, tabla, modal)
- **B4 ✅** Página 404 personalizada con branding EVA (`src/app/not-found.tsx`)
- **B5 ✅** `aria-label` añadido en botones de ícono (sidebar coach, nav alumno, workout, exercise block)
- **Fix ✅** `subscription-status/route.ts` ahora retorna `subscription_mp_id` y `superseded_mp_preapproval_id`

### Performance
- **G1 ✅** `getFoodLibrary` y `getCoachFoodsCatalog` — columnas específicas (eliminado `SELECT *`)
- **D6 ✅** `admin-raw.ts` ya tipado correctamente (`SupabaseClient<Database>`) — sin cambios necesarios

### Core Loop Features
- **06.4 ✅** Dots de actividad en DayNavigator — `getClientWorkoutActivityDates` + `getClientNutritionActivityDates` server actions, cargados on-mount en TrainingTabB4Panels y NutritionTabB5
- **09 ✅** Goal weight: migración `20260415120000_goal_weight_kg.sql`, server action `updateClientGoalWeight`, input UI inline en Panel de Progreso, `<ReferenceLine>` amarilla dashed en WeightProgressChart

### Pendiente de `supabase db push` (usuario debe ejecutar)
- `20260414183000_superseded_preapproval_and_rls.sql` — RLS 24 tablas
- `20260415120000_goal_weight_kg.sql` — columna `goal_weight_kg` en `clients`

---

# 2. Opiniones UI/UX

## Crítico (impacta conversión o retención directamente)

### 🔴 Historial de pagos ausente en `/coach/subscription`
La página de suscripción solo muestra estado actual y próximo cobro. **No hay historial de transacciones, recibos ni forma de descargar facturas.** Para un coach que paga $30.000+ CLP/mes, esto genera desconfianza. En cualquier SaaS serio (Linear, Notion, etc.) esto es estándar.

**Qué hacer:** Agregar sección "Historial de pagos" que liste cada `subscription_event` con fecha, monto, estado, y opcionalmente un botón "Descargar recibo" (PDF generado server-side).

### 🔴 Página `/coach/reactivate` es muy básica
La página de reactivación (a donde van los coaches bloqueados) necesita transmitir urgencia y claridad. Actualmente es funcional pero sin comparativa de planes, sin explicación de qué perdieron, sin apoyo visual. Es el momento donde el coach decide si paga o abandona.

**Qué hacer:** Rediseñar con: (a) explicación clara del motivo del bloqueo, (b) mini tabla comparativa de planes, (c) CTA prominente por plan, (d) garantías de seguridad de pago.

### 🟡 Empty states faltantes en secciones clave
Cuando un coach recién se registra y abre el directorio de clientes, la lista de ejercicios, o la sección de check-ins — no hay ninguna guía visual de qué hacer. Esto crea confusión en el onboarding.

**Falta estado vacío en:**
- Lista de alumnos del coach (primera vez)
- Catálogo de ejercicios (sin resultados de búsqueda)
- Sección check-in del alumno (sin historial)

**Qué hacer:** Componentes `EmptyState` con ícono ilustrativo + texto + CTA específico ("Crea tu primer alumno", "Busca en el banco global", etc.).

### 🟡 Feedbacks inconsistentes (toasts)
Hay 67 llamadas a `toast()` pero están concentradas en nutrición y builder. Acciones importantes como guardar cambios en perfil del alumno, enviar check-in, o actualizar settings del coach **no muestran confirmación visual**. El usuario no sabe si la acción se procesó.

**Qué hacer:** Audit completo de server actions sin toast de éxito/error. Agregar feedback en: guardar perfil cliente, completar check-in, actualizar marca.

## Importante (afecta experiencia daily use)

### 🟡 Post-workout summary incompleto
La pantalla de resumen tras completar un workout existe (`WorkoutSummaryOverlay`) pero le falta información valiosa que los alumnos quieren ver:
- **Volumen total** (kg × repeticiones por ejercicio)
- **Tiempo total** de la sesión
- **Comparativa vs sesión anterior** ("Hoy levantaste 5% más que la semana pasada")
- **Recomendación para mañana** (día de descanso o próximo entrenamiento)

### 🟡 PrintProgramDialog — solo impresión del navegador
El diálogo de impresión del programa hace un `window.print()`, que depende de que el usuario configure su impresora/PDF. Para exportar como PDF real (con logo del coach) se necesita generación server-side. No es urgente pero es una feature que coaches piden frecuentemente para compartir con sus alumnos por WhatsApp/email.

## Deseables (polish de largo plazo)

### 🟢 Barra de progreso en onboarding alumno
El wizard de onboarding funciona pero no tiene indicador visual de steps. El alumno no sabe si faltan 1 o 4 pasos más. Una barra simple (step 1/3) reduce abandono.

### 🟢 Settings del alumno sin link en nav
La navegación del alumno tiene Dashboard, Nutrición, Ejercicios y Check-in pero **no hay acceso directo a Settings o Perfil**. El alumno no puede cambiar su foto de perfil ni preferencias sin buscar manualmente. Agregar al tab "Más" cuando se reestructure la nav.

### 🟢 Workout execution — navegación por bloque
En rutinas largas (6+ ejercicios), el scroll es la única forma de navegar. No hay tabs por día/bloque ni scroll-snap. En móvil esto es tedioso. Agregar navegación rápida tipo tabs o sticky header del bloque actual.

---

# 3. Seguridad

## ✅ RLS Implementado — pendiente `supabase db push`
Migración `20260414183000_superseded_preapproval_and_rls.sql` cubre 24 tablas críticas con políticas de ownership. El usuario debe ejecutar `supabase db push` para activarla en producción.

## ✅ Email drip token — solucionado
`/api/internal/email-drip/run` ahora acepta solo `Authorization: Bearer DRIP_CRON_TOKEN`. Query param eliminado.

## ✅ Rate limiting en recipes/search — solucionado
`/api/recipes/search` ahora aplica 30 req/min con Upstash Redis (mismo patrón que auth y payments).

## 🟡 MEDIO — Sin verificación de email al registrar

**Hallazgo:** Coaches se registran y tienen acceso inmediato sin verificar su email. Sin verificación, es fácil crear cuentas con emails falsos, lo que complica soporte y análisis.

**Qué hacer:** Habilitar confirmación de email en Supabase Auth settings. Agregar pantalla "Verifica tu email" post-registro. Actualmente hay código para ello (`TASK-23.1`) pero no está activo.

## ✅ Bien implementado (no cambiar)
- Webhook de MercadoPago: token + HMAC SHA256 con comparación timing-safe ✅
- Rate limiting en auth: 40 req/min con Upstash Redis, fallback graceful ✅
- Rate limiting en payments: 15 req/min ✅
- Rate limiting en recipes/search: 30 req/min ✅ (nuevo)
- Upload de logos: validación MIME type + tamaño máximo 2MB ✅
- Inputs: Zod validation en todas las server actions ✅
- SQL injection: riesgo bajo, Supabase usa queries parametrizadas ✅
- Secrets: ningún hardcoded en código ✅

---

# 4. Performance

## ✅ SELECT * → columnas específicas — solucionado
`getFoodLibrary()` y `getCoachFoodsCatalog()` ahora especifican columnas exactas (`id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id`).

## ✅ loading.tsx — 6 nuevos creados (Sesión 1)
`/coach/builder/[clientId]/`, `/coach/meals/`, `/coach/nutrition-plans/[templateId]/edit/`, `/coach/nutrition-plans/new/`, `/coach/recipes/`, `/coach/workout-programs/builder/`

## ✅ dynamic() en builders (Sesión 1)
`WeeklyPlanBuilder` y `PlanBuilder` ahora usan `next/dynamic` con skeletons.

## 🟡 MEDIO — Dependencias posiblemente no utilizadas

**Hallazgo:**
- `framer-motion` — usado en ClientProfileDashboard y otros (confirmar scope real)
- `browser-image-compression` — no detectado en uso activo
- `canvas-confetti` — usado en TrainingTabB4Panels (confetti semanal PRs)
- `googleapis` — paquete muy pesado, si es para una sola feature debe ser lazy-loaded

**Qué hacer:** Instalar `@next/bundle-analyzer` y ejecutar:

```bash
ANALYZE=true npm run build
```

Remover dependencias sin uso real.

## 🟡 MEDIO — Sin baseline de Core Web Vitals

**Hallazgo:** `reactCompiler: true` está activo en `next.config.ts` — positivo. Pero sin Lighthouse CI configurado no hay medición del impacto en producción.

**Qué hacer:** Establecer baseline con Lighthouse antes del lanzamiento. Target: Landing ≥90, Dashboard alumno ≥80.

## ✅ Bien implementado (no cambiar)
- `React.cache()` usado extensamente en queries (8+ funciones cacheadas en nutrición) ✅
- `Promise.all()` para queries paralelas en dashboard (10 queries paralelas) ✅
- Next.js `<Image>` usado en todos lados (0 `<img>` tags sin optimizar) ✅
- Fonts con `display: 'swap'` (Inter + Montserrat) ✅
- React Compiler habilitado en next.config ✅

---

# Resumen Ejecutivo — Prioridades Restantes

| Categoría | Item | Prioridad | Esfuerzo | Estado |
|-----------|------|-----------|----------|--------|
| Pagos | Smoke test grace period + reactivar | 🔴 P0 | 0.5d | ⏳ |
| DB | `supabase db push` (RLS + goal_weight_kg) | 🔴 P0 | — | ⏳ (usuario) |
| Features | Banner trial en dashboard | 🟠 P1 | 0.5d | ✅ |
| Features | Check-in medidas corporales | 🟠 P1 | 2d | ⏳ |
| Features | Workout optimistic updates + retry + offline | 🟠 P1 | 2d | ⏳ |
| UX | Onboarding barra progreso + validación inline | 🟡 P2 | 1d | ⏳ |
| UX | Forgot/Reset password verificar flujo | 🟡 P2 | 0.5d | ⏳ |
| UX | Nav alumno reestructura (Entrenar/Progreso/Más) | 🟡 P2 | 1d | ⏳ |
| Features | Login coach rediseño visual | 🟡 P2 | 1d | ⏳ |
| Features | Mi Marca preview real | 🟡 P2 | 1.5d | ⏳ |
| Features | Ejercicios coach GIF upload + filtro | 🟡 P2 | 2d | ⏳ |
| Features | Ejercicios alumno favoritos + historial | 🟡 P2 | 2d | ⏳ |
| Features | PrintProgramDialog mejorado + PDF | 🟡 P2 | 1d | ⏳ |
| Seguridad | Verificación email al registrar | 🟡 P2 | 1d | ⏳ |
| Features | Panel CEO superadmin | 🟢 P3 | 4d | ⏳ |
| Features | Testing E2E + RLS tests | 🟢 P3 | 5d | ⏳ |
| Features | Push notifications PWA | 🟢 P3 | 3d | ⏳ |
| Features | i18n migración strings | 🟢 P3 | 3d | ⏳ |
| Features | SEO técnico (sitemap, JSON-LD) | 🟢 P3 | 1d | ⏳ |
| Features | Email confirmación de pago | 🟢 P3 | 1d | ⏳ |

**Total estimado restante al 100%: ~22-25 días de desarrollo**
