# 02 — Roadmap y Tareas Pendientes

> **Actualizado:** 2026-04-17 America/Santiago (Sesión 6)
> **Fuentes:** ROAD-TO-100.md (Sesiones 1–6), verificación directa via Supabase MCP
> **Estado global:** ~96% completado. Estimación restante: ~15–18 días de desarrollo.

---

## Tareas Manuales del Usuario — Pendientes

| Tarea | Comando / Acción | Bloquea |
|-------|-----------------|---------|
| Smoke test P1.7 en producción | Ver `05-PAGOS-Y-OPERACIONES.md` | Validar flujo pagos reales |
| Verificar cuenta MercadoPago (KYC) | Panel MP Chile: RUT, cédula, cuenta bancaria | Opera sin riesgo de congelamiento |

> ✅ **`supabase db push` ya NO es necesario** — toda la DB está aplicada en producción via MCP (RLS, columnas, funciones, índices, alimentos). Verificado el 2026-04-17.
> ✅ **BD Alimentos 100% lista** — `is_liquid`, `brand`, alimentos chilenos de marca ya seedeados en producción.

---

## Migraciones SQL Eliminadas (ya aplicadas en producción)

Los siguientes archivos fueron borrados de `supabase/migrations/` el 2026-04-17. Su contenido está confirmado en la DB de producción vía Supabase MCP.

| Archivo eliminado | Contenido confirmado |
|-------------------|---------------------|
| `20260411230000_sprint5_beta_launch_ops.sql` | `coach_onboarding_events`, `coach_email_drip_events` ✅ |
| `20260412100000_sprint6_welcome_message.sql` | `coaches.welcome_message` ✅ |
| `20260412113000_promote_existing_coaches_scale_3y.sql` | Data migration one-shot ✅ |
| `20260413120000_subscription_status_trialing.sql` | Constraint `subscription_status` con `trialing` ✅ |
| `20260413183000_align_tiers_pricing_cycles.sql` | Tier/ciclo alignment ✅ |
| `20260414120000_promote_all_coaches_to_scale.sql` | Data migration one-shot ✅ |
| `20260414183000_superseded_preapproval_and_rls.sql` | RLS 24 tablas + `superseded_mp_preapproval_id` ✅ |
| `20260415120000_goal_weight_kg.sql` | `clients.goal_weight_kg` ✅ |
| `20260415130000_client_payments.sql` | `client_payments` table ✅ |
| `20260416120000_add_liquid_and_brand_support.sql` | `foods.is_liquid`, `foods.brand` ✅ |
| `20260416204400_seed_branded_chilean_foods.sql` | Branded foods chilenos ✅ |
| `20260417120000_perf_pulse_streaks_and_indexes.sql` | Funciones streaks + índices perf ✅ |
| `20260417131500_perf_dashboard_sessions_series.sql` | Función `get_coach_workout_sessions_30d` ✅ |

**Archivos conservados** (en `supabase_migrations` remota o base):
`20260410202446_remote_schema.sql`, `20260411120000_subscription_core_sprint2.sql`, `20260411193000_expand_subscription_status_check.sql`, `20260413220000_normalize_food_units_to_g_un.sql`, `20260413230000_seed_foods_250.sql`

---

## BLOQUE P0 — Pagos (Sprint 8 — completar)

| ID | Tarea | Archivo | Estado |
|----|-------|---------|--------|
| P1.7 | Smoke test manual: coach → pagar → cancelar → verificar grace period | Manual + `docs/SMOKE-TEST-P1-7-PAGOS.md` | ⏳ Pendiente |

---

## BLOQUE P1 — Revenue Crítico

Todas las tareas de este bloque están **completadas** (Sesiones 1–3):

| ID | Tarea | Estado |
|----|-------|--------|
| 04.1 | Register action: slug generation, race condition, redirect | ✅ Sesión 1 |
| 04.2 | Processing page: timeout 5 min → "Hubo un problema" + link reactivate | ✅ Sesión 1 |
| 04.3 | Login bloqueado → middleware redirige a `/coach/reactivate` con mensaje claro | ✅ Sesión 1 |
| 04.4 | Banner trial: `subscription_status === 'trialing'` → días restantes | ✅ Confirmado implementado |
| 05.2 | Historial pagos: fechas `es-CL`, monto y estado por `subscription_event` | ✅ Sesión 1 |
| RLS | RLS en 24 tablas + políticas ownership | ✅ Migración creada (pendiente `supabase db push`) |
| P2.4 | Webhook upgrade: cancelar preapproval anterior, actualizar tier en DB | ✅ Sesión 1 |
| P2.6 | Reactivación desde `canceled`: `start_date = now + 60s` | ✅ Sesión 1 |

---

## BLOQUE P1.5 — BD Alimentos Chilenos

| ID | Tarea | Estado |
|----|-------|--------|
| N1.1 | Migración `is_liquid` + `brand` en tabla `foods` | ✅ Sesión 5 |
| N1.2 | Líquidos marcados con `is_liquid=true`, `serving_unit='ml'` | ✅ Sesión 5 |
| N1.3 | Script auditoría USDA para alimentos frescos | ✅ Sesión 5 |
| N1.4 | Script fetch OpenFoodFacts productos marca chilena | ✅ Sesión 5 |
| N1.5 | Script generador migración desde CSV | ✅ Sesión 5 |
| N1.6 | UI FoodSearchDrawer: `ml` para líquidos, `g` para sólidos | ✅ Sesión 5 |
| N1.7 | Obtener USDA API key + ejecutar auditoría frescos | ⏳ **Pendiente (usuario)** |
| N1.8 | Ejecutar fetch OpenFoodFacts + revisar CSV | ⏳ **Pendiente (usuario)** |
| N1.9 | Aprobar CSV (`APROBADO=S`) + generar migración | ⏳ **Pendiente (usuario)** |

---

## BLOQUE P2 — Core Loop Polish

| ID | Tarea | Archivo clave | Esfuerzo | Estado |
|----|-------|--------------|----------|--------|
| 08 | **Check-in medidas corporales**: migración SQL + paso 4 wizard + Zod + visualización en B6 | `supabase/migrations/` + `CheckInForm.tsx` + `ProgressBodyCompositionB6.tsx` | 2d | ⏳ Pendiente |
| 10.1 | **Workout optimistic updates**: `useOptimistic` en LogSetForm | `LogSetForm.tsx` | — | ✅ Ya implementado (Sesión 6) |
| 10.2 | **Retry automático server action**: 3 intentos con backoff (500ms, 1s, 2s) + toast "Reintentando..." | `WorkoutExecutionClient.tsx` | 0.5d | ⏳ Pendiente |
| 10.3 | **Banner offline**: `navigator.onLine === false` → banner "Sin conexión. Los datos se guardarán al reconectar." | `WorkoutExecutionClient.tsx` | 0.5d | ⏳ Pendiente |
| 11 | **Botones de ayuda por sección** (coach + alumno): `InfoTooltip` en 11 secciones | múltiples | — | ✅ Implementado (Sesión 6) |
| 11.1 | **Fix UX edición sets**: hint visual "Cambia y presiona ✓ para actualizar" en sets guardados | `LogSetForm.tsx` | — | ✅ Implementado (Sesión 6) |

---

## BLOQUE P2 — Dashboard Coach (completado en Sesión 2)

| ID | Tarea | Estado |
|----|-------|--------|
| 11.1 | Stat card "MRR Estimado" con delta % | ✅ Sesión 2 |
| 11.2 | AreaChart sesiones 30 días | ✅ Sesión 2 |
| 11.3 | BarChart crecimiento alumnos 6 meses | ✅ Sesión 2 |
| 11.4 | Activity feed (check-in, workout, nuevo alumno) | ✅ Sesión 2 |

---

## BLOQUE P2 — Resto de Features

| ID | Tarea | Archivo clave | Esfuerzo | Estado |
|----|-------|--------------|----------|--------|
| 12.1 | **Mi Marca preview real**: mock del dashboard alumno actual | `src/app/coach/settings/preview/` | 1.5d | ⏳ Pendiente |
| 13.1 | **Ejercicios coach upload GIF/video**: max 5MB, bucket `exercises` | `src/app/coach/exercises/` | 1.5d | ⏳ Pendiente |
| 13.4 | **Ejercicios coach filtro por muscle_group** en lista | `src/app/coach/exercises/` | 0.5d | ⏳ Pendiente |
| 14 | **Login coach rediseño visual**: layout split o centered premium | `src/app/(auth)/login/` | 1d | ⏳ Pendiente |
| 16.1 | **Ejercicios alumno favoritos**: tabla `client_exercise_favorites` + botón ❤️ + filtro "Mis favoritos" | `supabase/migrations/` + catálogo alumno | 1d | ⏳ Pendiente |
| 16.3 | **Ejercicios alumno historial**: tab "Mi historial" — últimas 5 sesiones por ejercicio desde `workout_logs` | Catálogo alumno | 1d | ⏳ Pendiente |
| 23.2 | **Forgot/Reset password**: verificar redirect correcto y flujo completo | `src/app/(auth)/` | 0.5d | ✅ Sesión 4 (verificado) |
| 27 | **PrintProgramDialog**: logo del coach, nombre alumno, fecha; explorar PDF real | Coach builder | 1d | ⏳ Pendiente |

---

## BLOQUE P3 — Crecimiento y Escala

| ID | Tarea | Área | Esfuerzo | Estado |
|----|-------|------|----------|--------|
| 17 | **Panel CEO**: coaches activos por tier, MRR total, churn, alumnos totales | `src/app/admin/` (nuevo) | 4d | ⏳ Pendiente |
| 18 | **Testing E2E**: pago sandbox MP, flujo alumno completo, unit tests server actions, test RLS | `tests/` | 5d | ⏳ Pendiente |
| 19.1 | **SEO técnico**: `sitemap.xml` dinámico, `robots.txt`, JSON-LD `SoftwareApplication` | `src/app/` | 1d | ⏳ Pendiente |
| 20 | **i18n**: migrar strings hardcoded del dashboard alumno + onboarding a keys | Toda la app | 3d | ⏳ Pendiente |
| 21.4 | **Email confirmación de pago** al coach cuando webhook confirma `approved` | `src/app/api/payments/webhook/` | 1d | ⏳ Pendiente |
| 22 | **PWA push notifications**: handler en `sw.js`, endpoint subscribe/send, casos workout/programa | `public/sw.js` + nuevas API routes | 3d | ⏳ Pendiente |
| 25 | **Nav alumno reestructura**: "Entrenar", "Progreso", "Más" en lugar de estructura actual | `src/app/c/[coach_slug]/` | 1d | ⏳ Pendiente |

---

## Resumen Ejecutivo de Prioridades

| Categoría | Item | Prioridad | Esfuerzo | Estado |
|-----------|------|-----------|----------|--------|
| Pagos | Smoke test grace period + reactivar | 🔴 P0 | 0.5d | ⏳ |
| DB | `supabase db push` (RLS + goal_weight_kg) | 🔴 P0 | — | ⏳ (usuario) |
| DB | BD Alimentos: USDA key + ejecutar scripts + CSV | 🔴 P0 | — | ⏳ (usuario) |
| Pagos | Verificar cuenta MP (KYC completo) | 🔴 P0 | — | ⏳ (usuario) |
| Features | Check-in medidas corporales | 🟠 P1 | 2d | ⏳ |
| Features | Workout optimistic updates + retry + offline | 🟠 P1 | 2d | ⏳ |
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

**Total estimado restante al 100%: ~22–25 días de desarrollo**

---

## Opiniones UI/UX — Qué cambiar y mejorar

### 🔴 Crítico (impacta conversión o retención directamente)

#### Historial de pagos ausente en `/coach/subscription`
La página solo muestra estado actual y próximo cobro. No hay historial de transacciones ni forma de descargar facturas. Para un coach que paga $30.000+ CLP/mes, esto genera desconfianza.
**Solución:** sección "Historial de pagos" que liste cada `subscription_event` con fecha, monto, estado. Botón "Descargar recibo" (PDF server-side).

#### Página `/coach/reactivate` muy básica
La página de reactivación (donde van los coaches bloqueados) no transmite urgencia ni claridad.
**Solución:** (a) explicación del motivo del bloqueo, (b) mini tabla comparativa de planes, (c) CTA prominente por plan, (d) garantías de seguridad de pago.

### 🟡 Importante (afecta experiencia daily use)

#### Empty states faltantes
Coaches nuevos no tienen guía visual de qué hacer al abrir:
- Lista de alumnos (primera vez)
- Catálogo de ejercicios (sin resultados de búsqueda)
- Sección check-in del alumno (sin historial)
**Solución:** componentes `EmptyState` con ícono + texto + CTA específico.

#### Feedbacks inconsistentes (toasts)
67 llamadas a `toast()` pero concentradas en nutrición y builder. Acciones como guardar perfil del alumno, enviar check-in, o actualizar settings no muestran confirmación visual.
**Solución:** audit de server actions sin toast de éxito/error. Agregar feedback en: guardar perfil cliente, completar check-in, actualizar marca.

#### Post-workout summary incompleto
`WorkoutSummaryOverlay` le falta:
- Volumen total (kg × repeticiones por ejercicio)
- Tiempo total de sesión
- Comparativa vs sesión anterior ("Hoy levantaste 5% más")
- Recomendación para mañana

### 🟢 Deseables (polish de largo plazo)

#### Settings del alumno sin link en nav
No hay acceso directo a Settings o Perfil desde la nav del alumno. Agregar al tab "Más".

#### Workout execution — navegación por bloque
En rutinas largas (6+ ejercicios) el scroll es la única forma de navegar. Agregar tabs por día/bloque o sticky header del bloque actual.

---

## Seguridad — Hallazgos y acciones pendientes

### ✅ Bien implementado (no cambiar)
- Webhook MercadoPago: token + HMAC SHA256 con comparación timing-safe ✅
- Rate limiting en auth: 40 req/min con Upstash Redis ✅
- Rate limiting en payments: 15 req/min ✅
- Rate limiting en recipes/search: 30 req/min ✅
- Upload logos: validación MIME type + tamaño máximo 2MB ✅
- Inputs: Zod validation en todas las server actions ✅
- SQL injection: riesgo bajo, Supabase usa queries parametrizadas ✅
- Secrets: ningún hardcoded en código ✅
- Email drip: `Authorization: Bearer` exclusivo ✅
- RLS: migración creada para 24 tablas (pendiente `supabase db push`) ✅

### 🟡 Pendiente — Sin verificación de email al registrar
Coaches se registran y tienen acceso inmediato sin verificar su email. Facilita cuentas con emails falsos.
**Solución:** habilitar confirmación de email en Supabase Auth settings. Agregar pantalla "Verifica tu email" post-registro.

---

## Performance — Hallazgos y acciones pendientes

### ✅ Bien implementado (no cambiar)
- `React.cache()` en 8+ funciones (nutrición, dashboard) ✅
- `Promise.all()` para queries paralelas en dashboard (10 queries paralelas) ✅
- Next.js `<Image>` en todos lados (0 `<img>` sin optimizar) ✅
- Fonts con `display: 'swap'` (Inter + Montserrat) ✅
- React Compiler habilitado en `next.config.ts` ✅
- `getFoodLibrary` + `getCoachFoodsCatalog`: columnas específicas (no `SELECT *`) ✅
- `unstable_cache` → `React.cache` en directory pulse (fix producción) ✅

### 🟡 Pendiente — Bundle analyzer
`framer-motion`, `browser-image-compression`, `canvas-confetti`, `googleapis` pueden no estar en uso real o ser demasiado pesados.

**Cómo diagnosticar:**
```bash
ANALYZE=true npm run build
```

Instalar `@next/bundle-analyzer` si no está. Remover dependencias sin uso real.

### 🟡 Pendiente — Sin baseline de Core Web Vitals
`reactCompiler: true` está activo pero sin Lighthouse CI configurado no hay medición en producción.

**Target:** Landing ≥90, Dashboard alumno ≥80.
