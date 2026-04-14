DELETE FROM public.coaches WHERE id = 'd6cf4ea8-8848-4e9e-8022-deeadc0f1a41';# Plan Maestro — EVA al 100%

> Generado: 2026-04-14 | Estado base: ~76% | Meta: 100%
> Divide el trabajo en fases ordenadas por impacto en revenue y experiencia de usuario.

---

## Context

La app EVA está al ~76% de completitud. Los módulos core (builder, directorio, dashboard alumno, nutrición) están al 90–98%. Los gaps principales son: producción de pagos MP, branding por defecto cuando el coach no configuró "Mi Marca", historial por fecha en perfil coach, polish de módulos secundarios y panel CEO. Este plan los cubre todos con tasks y subtasks concretas priorizadas para llegar al 100%.

---

## FASE 0 — Producción inmediata (P0, <1 día)

### TASK-01: MercadoPago → Modo Producción

**Subtasks (manuales — DEBES HACERLO TÚ):**
- [ ] **01.1** Ir a https://www.mercadopago.cl/developers/panel → Mis aplicaciones
- [ ] **01.2** Crear o seleccionar la aplicación EVA; ir a "Credenciales de producción"
- [ ] **01.3** Copiar el **Access Token de producción** (empieza con `APP_USR-`, NO con `TEST-`)
- [ ] **01.4** Ir a la app en Vercel → Settings → Environment Variables:
  - Actualizar `MERCADOPAGO_ACCESS_TOKEN` → pegar el token de producción
  - Asegurarse que `MERCADOPAGO_WEBHOOK_TOKEN` tenga un valor seguro (string random largo)
  - Asegurarse que `NEXT_PUBLIC_SITE_URL` = tu dominio de producción (ej: `https://eva-app.cl`)
- [ ] **01.5** En el panel MP → Sección "Notificaciones IPN/Webhooks": configurar la URL del webhook:
  `https://[tu-dominio]/api/payments/webhook?token=[MERCADOPAGO_WEBHOOK_TOKEN]`
  - Activar eventos: `subscription_preapproval` o `subscription_authorized_payment`
- [ ] **01.6** Opcional pero recomendado: copiar el `x-signature` secret del panel MP y guardarlo en `MERCADOPAGO_WEBHOOK_SIGNING_SECRET`

**Subtasks (código):**
- [x] **01.7** Verificar que `NEXT_PUBLIC_SITE_URL` se use en la `notification_url` al crear preapproval
  - Archivo: `src/lib/payments/providers/mercadopago.ts`
  - Buscar donde se arma `notification_url` y confirmar que usa la env var, no hardcode
- [ ] **01.8** Smoke test post-deploy con tarjeta real de prueba:
  - Registrar un coach de prueba, elegir tier Starter, ir al checkout MP
  - Completar pago con tarjeta real (o tarjeta aprobadora de MP)
  - Verificar: coach queda en `subscription_status = 'active'` en BD
  - Verificar: webhook llegó correctamente (revisar tabla `subscription_events`)
- [x] **01.9** Documentar las credenciales y proceso en `docs/archive/MP-PRODUCCION.md`

---

### TASK-02: Branding por defecto — Logo EVA + Colores del sistema

Cuando un coach no ha configurado "Mi Marca", el alumno ve una letra o nada. La meta es que vea el logo y colores de EVA como fallback.

**Archivos clave:**
- `src/lib/brand-assets.ts` — constantes de logo/color EVA
- `src/middleware.ts` — setea headers `x-coach-logo-url`, `x-coach-primary-color`
- `src/app/c/[coach_slug]/layout.tsx` — aplica CSS vars al layout del alumno
- `src/components/client/ClientNav.tsx` — renderiza logo en nav del alumno
- `src/app/coach/layout.tsx` — fallback de color en panel del coach
- `src/app/coach/settings/LogoUploadForm.tsx` — preview cuando no hay logo
- `src/app/api/manifest/[coach_slug]/route.ts` — ya usa BRAND_APP_ICON de fallback ✅

**Subtasks:**
- [x] **02.1** En `src/lib/brand-assets.ts`: añadir `BRAND_PRIMARY_COLOR = '#10B981'` (o el color primario EVA definido en el sistema) como export constante
- [x] **02.2** En `src/middleware.ts`: cuando `coach.logo_url` es null/vacío, setear header `x-coach-logo-url` con `BRAND_APP_ICON` (`/LOGOS/eva-icon.png`)
- [x] **02.3** En `src/components/client/ClientNav.tsx`: cuando el logo recibido sea el icon de EVA, renderizar `<Image src="/LOGOS/eva-icon.png">` con tamaño apropiado (igual que si fuera logo del coach)
- [x] **02.4** En `src/app/c/[coach_slug]/layout.tsx`: cuando no hay color de coach, usar `BRAND_PRIMARY_COLOR` en vez de `#007AFF`
- [x] **02.5** En `src/app/coach/layout.tsx`: mismo cambio — fallback a `BRAND_PRIMARY_COLOR` en vez de `#007AFF`
- [x] **02.6** En `src/app/coach/settings/LogoUploadForm.tsx`: mostrar el logo EVA (`BRAND_LOGO_WEB`) como preview placeholder cuando no hay logo cargado (en vez de letra inicial)
- [x] **02.7** Verificar en PWA manifest default (`/api/manifest/default/route.ts`): `theme_color` debe usar `BRAND_PRIMARY_COLOR`

---

## FASE 1 — Revenue Enablement (P0/P1, ~3–5 días)

### TASK-03: Alineación Pricing / Landing

Verificar estado actual (el código puede estar más avanzado que los docs):

**Subtasks:**
- [x] **03.1** Auditar `/pricing/page.tsx`: confirmar que usa CLP y los 5 tiers (Starter Lite, Starter, Pro, Elite, Scale) — si todavía está en USD, actualizar
- [x] **03.2** Asegurar que los CTAs de `/pricing` apunten a `/register?tier={id}&cycle={billingCycle}` con los mismos tier IDs que usa el register
- [x] **03.3** Landing (`/page.tsx`): confirmar que los precios en `#precios` son los mismos que en `/pricing` (ambos desde la misma fuente `TIER_CONFIG`)
- [x] **03.4** Agregar link "Ver todos los planes" en la landing → `/pricing`
- [x] **03.5** FAQ en `/pricing`: 3–5 preguntas frecuentes sobre suscripción, cancelación, qué incluye cada tier

### TASK-04: Registro Coach + Gate de Pago

Según los docs, el registro está al 35–78% dependiendo de qué fuente se cree. Verificar estado real:

**Subtasks:**
- [ ] **04.1** Auditar `src/app/(auth)/register/` — verificar que el flujo 3 pasos (datos → tier → checkout MP) está completo y funcional end-to-end en producción
- [ ] **04.2** Callback post-pago (`/coach/subscription/processing`): verificar que en caso de fallo MP el coach NO queda activo; en caso de éxito redirige a `/coach/dashboard` con banner de bienvenida
- [ ] **04.3** Página `/coach/reactivate`: si subscription está expired/cancelled, coach debe llegar aquí (o a `/coach/subscription`). Verificar que el middleware hace el redirect correcto
- [ ] **04.4** Verificar trial `trialing`: coaches con `subscription_status = 'trialing'` deben poder acceder con banner de countdown mostrando días restantes
- [ ] **04.5** Login coach (`/login`): asegurarse que si coach existe pero no tiene suscripción activa ni trial, el flujo le explica qué debe hacer (no un error genérico)

### TASK-05: Suscripción Coach — Gestión Self-Service

**Archivo principal:** crear/verificar `src/app/coach/subscription/page.tsx`

**Subtasks:**
- [ ] **05.1** Página `/coach/subscription`: mostrar plan actual, fecha próximo cobro, billing cycle, estado
- [ ] **05.2** Botón "Ver factura" o "Historial de pagos": listar `subscription_events` del coach
- [ ] **05.3** Botón "Cambiar plan": redirigir a nueva preferencia MP para upgrade/downgrade (o documentar que es manual por ahora)
- [ ] **05.4** Botón "Cancelar suscripción": flow con confirm dialog + llamada a `cancelCheckoutAtProvider` ya existente
- [ ] **05.5** Agregar "Suscripción" al sidebar del coach (`src/components/coach/CoachSidebar.tsx` o similar)

---

## FASE 2 — Core Loop Polish (P1, ~5–7 días)

### TASK-06: Historial por Fecha en Perfil Coach (DayNavigator)

El coach no puede navegar a una fecha específica para ver qué comió/entrenó un alumno.
Nota: verificar primero si el commit `feat: implement nutrition and workout history by date for clients` ya lo agregó.

**Archivos:**
- `src/app/coach/clients/[clientId]/NutritionTabB5.tsx`
- `src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx`
- `src/app/coach/clients/[clientId]/actions.ts`

**Subtasks:**
- [ ] **06.1** Verificar si `NutritionTabB5.tsx` ya tiene DayNavigator. Si no:
  - Importar `DayNavigator` de `src/app/c/[coach_slug]/nutrition/_components/DayNavigator.tsx`
  - Agregar state `selectedDate` (useState, default hoy)
  - Pasar `selectedDate` a las queries de nutrición
- [ ] **06.2** Crear server action `getClientNutritionForDate(clientId, date)` en `actions.ts`:
  - Query a `daily_nutrition_logs` + `nutrition_meal_logs` + `food_items` filtrado por fecha
  - Retornar macros, comidas y adherencia del día seleccionado
- [ ] **06.3** Verificar si `TrainingTabB4Panels.tsx` ya tiene DayNavigator. Si no:
  - Agregar DayNavigator con state `selectedDate`
  - Crear server action `getClientWorkoutForDate(clientId, date)`: query a `workout_logs` filtrado por fecha
  - Mostrar ejercicios completados ese día con series/reps/peso
- [ ] **06.4** Indicadores visuales en el calendario: marcar días con actividad (dots) como en el DayNavigator del alumno

### TASK-07: Optimización Tabs Perfil Alumno (Coach)

**Archivos:**
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` (tab labels)
- `src/app/coach/clients/[clientId]/ProgramTabB7.tsx` (quitar mini-logs)
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` (KPI sidebar card)

**Subtasks:**
- [ ] **07.1** Rename tab "Entrenamiento" → "Análisis" en `ProfileTabNav` y `ClientProfileDashboard`
- [ ] **07.2** Rename tab "Programa" → "Plan"
- [ ] **07.3** En `ProgramTabB7`: quitar la sección de logs históricos por ejercicio (esos datos pertenecen a la tab Análisis). Solo mantener el grid semanal/cíclico, variante A/B y sheet de prescripción
- [ ] **07.4** En `ClientProfileDashboard.tsx` sidebar KPI card (~línea 396–462):
  - Reducir `p-6` a `p-4`
  - Eliminar blur/efectos decorativos
  - Quitar "Racha Interact." (duplicada en el grid de 6 KPIs de B3)
  - Dejar solo Peso Actual + Var. Semanal

### TASK-08: Check-in — Medidas Corporales

**Archivos:**
- `supabase/migrations/` — nueva migración
- `src/app/c/[coach_slug]/check-in/CheckInForm.tsx`
- `src/app/c/[coach_slug]/check-in/actions.ts`
- `src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.tsx`

**Subtasks:**
- [ ] **08.1** Migración SQL: agregar columnas en `check_ins`:
  ```sql
  waist_cm numeric, chest_cm numeric, arm_cm numeric,
  hip_cm numeric, thigh_cm numeric, notes text
  ```
- [ ] **08.2** Agregar paso opcional (paso 4) al wizard de check-in: "Medidas" con inputs para cada medida + campo notas. Indicar claramente que son opcionales.
- [ ] **08.3** Actualizar schema Zod y server action `submitCheckIn` para incluir las nuevas columnas
- [ ] **08.4** En `ProgressBodyCompositionB6.tsx`: si hay datos de medidas, mostrar mini-cards de tendencia (cintura, brazo, etc.) o gráfico de área simple con las medidas más recientes

### TASK-09: Goal Weight — Línea objetivo en chart de peso

**Subtasks:**
- [ ] **09.1** Migración SQL: `ALTER TABLE clients ADD COLUMN goal_weight_kg numeric;`
- [ ] **09.2** Formulario en perfil del alumno (coach view) o en onboarding: campo para ingresar peso objetivo
- [ ] **09.3** En `WeightProgressChart`: agregar `<ReferenceLine y={goal_weight_kg} stroke="var(--theme-primary)" strokeDasharray="4 4" label="Objetivo" />`

### TASK-10: Workout Execution Polish

**Archivos:**
- `src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx`
- `src/app/c/[coach_slug]/workout/[planId]/actions.ts`

**Subtasks:**
- [ ] **10.1** Optimistic updates en `LogSetForm`: al hacer submit, mostrar el set como "guardado" inmediatamente mientras la server action se resuelve en background (usando `useOptimistic` de React 19)
- [ ] **10.2** Retry automático: si la server action falla (offline/timeout), mostrar toast "Reintentando..." y reintentar hasta 3 veces con backoff exponencial
- [ ] **10.3** Indicador offline: banner sutil cuando `navigator.onLine === false` explicando que los logs se guardarán al reconectar
- [ ] **10.4** Scroll automático al siguiente bloque después de completar uno (ya parcialmente implementado — verificar y pulir)

---

## FASE 3 — Coach Experience (P2, ~7–10 días)

### TASK-11: Dashboard Coach — Comparativas Avanzadas

**Archivos:** `src/app/coach/dashboard/_data/dashboard.queries.ts`, `_components/`

**Subtasks:**
- [ ] **11.1** Stat card "MRR Estimado": sumar pagos de alumnos activos de `client_payments` del mes actual, mostrar en CLP con variación vs mes anterior
- [ ] **11.2** Chart de tendencia de adherencia 30 días: AreaChart con la adherencia global de todos los alumnos (promedio diario de `daily_nutrition_logs.completed + workout_logs`)
- [ ] **11.3** Chart de crecimiento de alumnos: BarChart simple de alumnos activos por mes (últimos 6 meses) usando fecha `created_at` de `clients`
- [ ] **11.4** Activity feed enriquecido: check-ins con foto miniatura, workouts completados hoy/ayer con nombre del ejercicio más relevante
- [ ] **11.5** Quick action "Ver todos en riesgo": link directo a `/coach/clients` con filtro riesgo=alto preactivado

### TASK-12: Mi Marca — Preview Moderno + Branding Extendido

**Archivos:**
- `src/app/coach/settings/preview/page.tsx`
- `src/app/coach/settings/LogoUploadForm.tsx`
- `src/app/coach/settings/BrandSettingsForm.tsx`

**Subtasks:**
- [ ] **12.1** Actualizar `StudentDashboardPreview` en `/settings/preview`: reemplazar la vista obsoleta con un mock del dashboard alumno actual (mostrar hero card, compliance rings, workout card — simplificado pero fiel al diseño real)
- [ ] **12.2** `LogoUploadForm`: agregar preview en tiempo real del logo que acaba de subir antes de confirmar (usando FileReader o URL.createObjectURL)
- [ ] **12.3** `LogoUploadForm`: agregar crop básico o instrucciones claras de dimensiones recomendadas (512x512px)
- [ ] **12.4** `BrandSettingsForm`: agregar campo "Color secundario" opcional para personalización más profunda
- [ ] **12.5** En la preview, mostrar cómo se ve el logo en la nav del alumno (en contexto, no solo el logo suelto)

### TASK-13: Ejercicios Coach — Upload GIF + Bulk Edit

**Archivos:**
- `src/app/coach/exercises/` (verificar estructura actual)
- `supabase/migrations/`

**Subtasks:**
- [ ] **13.1** En el formulario de ejercicio coach: agregar campo para subir GIF/video demostrativo (hasta 5MB, bucket `exercises` en Supabase Storage)
- [ ] **13.2** Migración SQL si no existe: `ALTER TABLE exercises ADD COLUMN gif_url text;`
- [ ] **13.3** Bulk edit básico: selección múltiple + edición de muscle group o difficulty en batch
- [ ] **13.4** Filtrado por muscle group en la lista de ejercicios del coach

### TASK-14: Login Coach — Rework Visual

**Archivos:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/actions.ts`

**Subtasks:**
- [ ] **14.1** Rediseño visual del login: layout split (lado izquierdo con screenshot/mockup de la app, lado derecho con el form) — o diseño centered premium
- [ ] **14.2** Agregar rate limiting en la server action de login: máximo 5 intentos fallidos por email en 15 minutos (usando KV/Redis o simple contador en BD)
- [ ] **14.3** "Recordarme" checkbox: usa la opción de `persistSession` de Supabase

### TASK-15: Onboarding Alumno — Refinamiento

**Archivos:** `src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx`

**Subtasks:**
- [ ] **15.1** Verificar que la barra de progreso visual existe y es clara (step 1/3, 2/3, 3/3)
- [ ] **15.2** Agregar paso opcional de "Foto de perfil": subida de foto al bucket `avatars` y guardado en `clients.avatar_url`
- [ ] **15.3** Validación de formulario: mostrar mensajes de error inline por campo (no solo al submit)
- [ ] **15.4** Animaciones direction-aware entre pasos (siguiente→izquierda, anterior→derecha) usando Framer Motion

### TASK-16: Catálogo Ejercicios Alumno — Favoritos e Historial

**Archivos:** `src/app/c/[coach_slug]/exercises/`

**Subtasks:**
- [ ] **16.1** Migración SQL: tabla `client_exercise_favorites(client_id, exercise_id)` o columna en tabla existente
- [ ] **16.2** Botón ❤️ en cada ejercicio del catálogo; filtro "Mis favoritos"
- [ ] **16.3** Tab "Mi historial" por ejercicio: al abrir ejercicio, mostrar mis últimas 5 sesiones con ese ejercicio (peso, reps, fecha) — query a `workout_logs`

---

## FASE 4 — Platform Completeness (P2/P3, ~8–12 días)

### TASK-17: Panel CEO / Superadmin

**Ruta:** crear `src/app/admin/` (o `src/app/(admin)/`)

**Subtasks:**
- [ ] **17.1** Middleware: proteger `/admin/*` con `ADMIN_SECRET_KEY` o rol superadmin en Supabase (tabla `admin_users` o claim en JWT)
- [ ] **17.2** Dashboard métricas globales:
  - Total coaches activos / por tier
  - MRR total (suma de precios por tier × coaches activos)
  - Nuevos coaches esta semana/mes
  - Churn rate mensual
  - Total alumnos en la plataforma
- [ ] **17.3** Lista de coaches con estado de suscripción, tier, alumnos activos, último login
- [ ] **17.4** Acciones admin: suspender coach, cambiar tier manualmente, ver eventos de suscripción
- [ ] **17.5** Chart MRR histórico (últimos 12 meses)

### TASK-18: Testing — Cobertura Razonable

**Archivos:** `tests/`, `src/**/*.test.ts`

**Subtasks:**
- [ ] **18.1** E2E test flujo completo de pago: `tests/payment-production-smoke.spec.ts` (usando credenciales de sandbox MP, no producción)
- [ ] **18.2** E2E test flujo alumno completo: register → onboarding → dashboard → ejecutar workout → check-in → ver nutrición
- [ ] **18.3** Unit tests server actions críticas:
  - `logSet` en workout execution
  - `submitCheckIn`
  - `addFoodToMeal` en nutrición
- [ ] **18.4** Test RLS: verificar que coach A no puede ver datos de coach B (ya existen tests en `tests/rls/` — ampliar)
- [ ] **18.5** CI: configurar GitHub Actions para correr `vitest run` en cada PR

### TASK-19: SEO + Performance Landing

**Archivos:** `src/app/page.tsx`, `src/app/layout.tsx`

**Subtasks:**
- [ ] **19.1** `sitemap.xml` generado dinámicamente en `src/app/sitemap.ts`
- [ ] **19.2** `robots.txt` adecuado (permitir landing, bloquear `/coach/`, `/c/`, `/api/`)
- [ ] **19.3** Structured data (JSON-LD) en landing: `SoftwareApplication` schema
- [ ] **19.4** Optimizar LCP: hacer defer de animaciones Framer Motion en above-the-fold; preload del logo EVA
- [ ] **19.5** OG tags dinámicos en landing verificados (og:image, og:title, twitter:card)

### TASK-20: i18n — Completar Internacionalización

**Archivos:** `src/i18n/es.json`, `src/i18n/en.json`, `src/contexts/LanguageContext.tsx`

**Subtasks:**
- [ ] **20.1** Auditar qué partes de la app del alumno (dashboard, workout, nutrition, check-in) tienen strings hardcoded en español
- [ ] **20.2** Migrar strings del dashboard alumno a keys de i18n (mayor impacto, usado por todos los alumnos)
- [ ] **20.3** Agregar selector de idioma en settings del alumno (ya existe en landing)
- [ ] **20.4** Strings del onboarding: migrar a i18n

### TASK-21: Email Transaccional — Completar Flujos Pendientes

**Archivos:** `src/lib/email/transactional-templates.ts`, `src/app/api/internal/email-drip/`

**Subtasks:**
- [ ] **21.1** Email de bienvenida al alumno: enviado al crear cliente (ya implementado — verificar que llega)
- [ ] **21.2** Email de asignación de programa: cuando coach asigna workout plan al alumno (verificar implementación)
- [ ] **21.3** Email reminder check-in: si alumno no hizo check-in en 30 días, enviar reminder (drip automático via `/api/internal/email-drip/run`)
- [ ] **21.4** Email de confirmación de pago al coach: cuando el webhook confirma `approved`, enviar receipt de suscripción

### TASK-22: Push Notifications PWA

**Archivos:** `public/sw.js`, `src/app/api/` (nueva route para push)

**Subtasks:**
- [ ] **22.1** Implementar `push` event handler en `public/sw.js`
- [ ] **22.2** API route `POST /api/push/subscribe`: guardar `PushSubscription` en tabla `push_subscriptions(client_id, endpoint, keys)`
- [ ] **22.3** API route `POST /api/push/send`: enviar notificación usando `web-push` npm
- [ ] **22.4** Casos de uso iniciales:
  - Recordatorio de workout: "Hoy es día de entrenamiento" a las 8am
  - Nuevo programa asignado por el coach
  - Coach le envió un mensaje / check-in revisado

### TASK-23: Auth Coach — Mejoras

**Subtasks:**
- [ ] **23.1** Verificación de email: después del registro, enviar email de confirmación (Supabase ya lo soporta — activar en Auth settings)
- [ ] **23.2** Forgot/Reset password flow: verificar que el link del email llega con el redirect correcto a `/reset-password`
- [ ] **23.3** Página de "cuenta suspendida" cuando `subscription_status = 'suspended'`

### TASK-24: Dark Mode Audit + Accessibility

**Subtasks:**
- [ ] **24.1** Audit sistemático de contraste WCAG AA en componentes nuevos (usar browser devtools accessibility checker)
- [ ] **24.2** Verificar que todos los charts usan `var(--theme-primary)` y no colores hardcoded que no respetan dark mode
- [ ] **24.3** `useReducedMotion` en todos los componentes hijo del perfil del alumno coach que no lo tienen
- [ ] **24.4** Tooltip en todos los íconos sin texto visible (`InfoTooltip` o `title` en SVGs)

---

## FASE 5 — Polish Final (P3, ~3–5 días)

### TASK-25: Nav Alumno — Reestructurar

Según el plan maestro, la nav ideal del alumno es: Dashboard | Entrenar | Nutrición | Progreso | Más

**Subtasks:**
- [ ] **25.1** Agregar tab "Entrenar" que lleva al workout activo del día (reutiliza el link del hero card)
- [ ] **25.2** Agregar tab "Progreso" que consolida: peso (chart), fotos (check-in), PRs recientes
- [ ] **25.3** Tab "Más": agrupar ejercicios, settings, check-in

### TASK-26: Sidebar Coach — Mejoras Menores

**Subtasks:**
- [ ] **26.1** Renombrar "Planes Nutricionales" → "Nutrición" en sidebar
- [ ] **26.2** Agregar "Suscripción" al sidebar (link a `/coach/subscription`)
- [ ] **26.3** Confirmar que Foods está accesible desde dentro de Nutrición (ya implementado — verificar UX)

### TASK-27: PrintProgramDialog — Refinamiento

**Archivos:** `src/app/coach/builder/[clientId]/components/PrintProgramDialog.tsx`

**Subtasks:**
- [ ] **27.1** Mejorar layout de impresión: incluir logo del coach, nombre del alumno, fecha de generación
- [ ] **27.2** Opción de descarga PDF con el programa estructurado por días

### TASK-28: `admin-raw.ts` — Tipado

**Subtasks:**
- [ ] **28.1** En `src/lib/supabase/admin-raw.ts`: reemplazar `any` por el tipo correcto de `SupabaseClient<Database>`

---

## Verificación Final (Post todas las fases)

- [ ] `npm run build` limpio sin warnings
- [ ] Smoke test completo en producción: registro coach → pago → crear alumno → asignar plan → alumno ejecuta workout → check-in → coach revisa perfil
- [ ] Lighthouse audit: Landing ≥90, Dashboard alumno ≥80
- [ ] Verificar que webhook MP recibe y procesa eventos en producción
- [ ] Revisar tabla `subscription_events` para confirmar audit trail funciona
- [ ] PWA: instalar en iOS y Android, verificar A2HS, splash screen y logo correcto por coach

---

## Resumen de Estimación

| Fase | Tasks | Estimación |
|------|-------|------------|
| Fase 0 — Producción inmediata | TASK-01, 02 | 1–2 días |
| Fase 1 — Revenue Enablement | TASK-03 a 05 | 3–5 días |
| Fase 2 — Core Loop Polish | TASK-06 a 10 | 5–7 días |
| Fase 3 — Coach Experience | TASK-11 a 16 | 7–10 días |
| Fase 4 — Platform Completeness | TASK-17 a 24 | 8–12 días |
| Fase 5 — Polish Final | TASK-25 a 28 | 3–5 días |
| **TOTAL** | **28 tasks** | **~27–41 días** |

**Meta: ~100% al cerrar TASK-28**
