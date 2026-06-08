# Alumno RN Mobile — Auditoría web→mobile (standalone) + mapa de paridad

_2026-06-06 · `apps/mobile/app/alumno/*` vs `apps/web/src/app/c/[coach_slug]/*` · 9 áreas auditadas con verificación adversarial contra el código actual + oportunidades nativas por área._

> **Severidad:** S1 = rompe flujo core del alumno o corrompe/pierde datos · S2 = feature importante o UX que duele · S3 = polish. **Esfuerzo:** S < 0.5d · M ~1-3d · L ~1-2sem · XL > 2sem.
> **Importante:** el alumno mobile **NO está vacío** — ya hay scaffolding real de todas las tabs (home, workout, nutrición, check-in, historial, ejercicios, perfil) + onboarding + código + offline básico. El problema es **profundidad incompleta vs web** + **bugs de datos en el flujo core** + **cero aprovechamiento de ventajas nativas** (cámara/push/HealthKit/widgets instalados pero sin usar).

---

## 1. Veredicto por área

| Área | Veredicto | Resumen honesto |
|------|-----------|-----------------|
| Auth / onboarding / código / suspendido | 🟡 partial | Funciona, pero **faltan gates de acceso S1** (suspendido, force-password) y consentimiento legal |
| Dashboard / home | 🟡 partial | Bien animado y con datos reales, pero **progreso del workout hardcodeado** + sin acciones inline (QuickLog, peso) |
| **Ejecución de workout (núcleo)** | 🟡 partial | ~80% de la web, pero **2 bugs S1 de datos** (duplica series, fecha en UTC) |
| Nutrición (log diario) | 🟡 partial | Cubre el esqueleto, pero **offline roto (S1)** + no aplica swaps + sin porción parcial |
| Check-in semanal | 🟡 partial | Completo (3 pasos, foto, energía), pero **fallo silencioso al subir foto** + sin bounds de peso |
| Progreso / historial | 🟡 partial | Tab existe, pero faltan charts ricos (peso full, PRs, heatmap) |
| Catálogo de ejercicios | 🟡 partial | Catálogo funcional, sin video inline (mismo patrón que coach) |
| **Offline / PWA** | 🟡 partial | Cimientos reales pero **frágiles**: comidas y series offline se pierden/duplican (S1) |
| **Perfil / cuenta / push / privacidad** | 🔴 mobile-missing | Solo-lectura: sin baja de cuenta (S1 legal), sin control de push, sin editar perfil |

---

## 2. Bloqueantes / integridad de datos (S1 consolidados)

> Estos son los que **corrompen datos del coach** o **pierden datos del alumno** o **rompen el control de acceso**. Prioridad máxima antes de pulir nada.

| # | S1 | Evidencia | Fix | Esf. |
|---|----|-----------|-----|------|
| **A1** | **Workout: `upsert` sin `onConflict`/`id` → duplica filas.** `workout_logs` no tiene constraint UNIQUE (solo PK uuid), así que cada `upsert` es de facto INSERT. Reguardar/corregir una serie crea duplicados → **corrompe volumen y PRs que ve el coach**. La cola offline (`flushLogQueue`) usa INSERT → mismo daño. | `alumno/workout/[planId].tsx:267`, `lib/offline-cache.ts:44`, `baseline.sql:1855` | Select-then-update/insert manual como web (`workout-log.actions.ts:59-75`) o agregar UNIQUE + `onConflict`. | M |
| **A2** | **Workout: "logs de hoy" en UTC, sin `client_id`.** `loadTodayLogs` usa `toISOString().slice(0,10)` y `gte logged_at UTC` sin límite superior ni filtro de cliente → en Chile los sets de la tarde caen en el "día" UTC siguiente y aparecen perdidos. `getTodayInSantiago`/`getSantiagoUtcBoundsForDay` **ya existen y no se usan**. | `[planId].tsx:181-188`, `lib/date-utils.ts:8-39` | Usar los bounds Santiago + filtrar por `client_id`. Fix trivial, alto valor. | S |
| **A3** | **Nutrición offline = código muerto → comidas marcadas sin señal se pierden.** `isOnline` arranca `true` y solo pasa a `false` si no hay plan en cache; con el plan ya cargado, perder señal no activa el encolado → `toggleMealCompletion` falla y el dato se pierde en silencio (solo Alert). NetInfo no está instalado. | `nutricion.tsx:151,196,281-285`, `lib/offline-cache.ts:79` | Instalar `@react-native-community/netinfo`; encolar por estado real de red / error offline (como web). | M |
| **A4** | **Offline workout: series encoladas no reaparecen en la UI al recargar** → el alumno cree que se perdieron, re-registra → **duplica** al sincronizar (agravado por A1). | `[planId].tsx:181-204,272-274` | Fusionar la cola pendiente con los logs en `loadPlan`/`loadTodayLogs`. | M |
| **A5** | **Auth: sin gate de suspendido/archivado.** Un alumno pausado por el coach entra igual a toda la app y registra workout/nutrición. La `suspended.tsx` existe pero es **código muerto** (nadie navega a ella). | `login.tsx:52-61`, `lib/client.ts:16`, `alumno/suspended.tsx` | Traer `is_active/is_archived` al resolver el alumno y rutear a `/alumno/suspended`. (Compartido con coach → cimientos.) | M |
| **A6** | **Auth: sin gate de `force_password_change`.** El alumno entra con la clave temporal del coach y nunca se le obliga a cambiarla; `change-password.tsx` ni siquiera limpia el flag. | `login.tsx:60`, `change-password.tsx:25` | Gate post-login → `/change-password`; limpiar flag. (Cimientos compartidos.) | M |
| **A7** | **Dashboard: barra de progreso del workout hardcodeada a 18%.** Feedback falso: el alumno ve siempre el mismo progreso sin importar las series hechas; sin estado "completado". | `home.tsx:436` | Derivar de `totalSetsLogged/totalSetsTarget` (como `WorkoutHeroCard`). | M |
| **A8** | **Perfil: sin baja de cuenta del alumno (Ley 21.719).** No hay supresión in-app; la política de privacidad **promete una ruta que no existe** (texto redactado para coaches). El alumno aporta datos de salud sensibles. | `alumno/perfil.tsx:171`, `privacidad/page.tsx:147-160` | Flujo de baja/supresión del alumno (o mailto trazable a corto plazo) + corregir el texto legal. (Ver doc legal del coach.) | M |
| **A9** | **Nutrición: no se pueden aplicar swaps/alternativas.** El alumno no puede cambiar un alimento por su alternativa; peor, los macros del día **ignoran swaps** ya hechos en web. | `FoodItemRow.tsx:22`, `nutricion.tsx:466-481` | Pasar `activeSwapMealIds` + handler `onApplySwap` (lógica web `handleApplySwap`). | M |

---

## 3. Gaps importantes (S2) por área

**Dashboard:** sin QuickLog de series (1 tap desde home), sin WeightQuickLog inline, compliance de workout con heurística ingenua (no program-aware), sin `ProgramPhaseBar` (semana/fase/A-B), sin lista de planes navegable.
**Workout exec:** resumen sin detección de PRs + 1RM + confeti (el momento de recompensa), rest timer **sin alarma sonora/vibración al terminar ni aviso en background**, no se puede editar una serie ya registrada, RPE a columna integer con CHECK falla en silencio (parseFloat 7.5 → error tratado como "offline").
**Nutrición:** sin porción parcial (25/50/75/100% — el motor ya lo soporta, falta UI), sin instrucciones del coach, export/share pobre (vs PDF+WhatsApp web).
**Check-in:** fallo silencioso al subir fotos, sin validación de bounds de peso, copy semanal vs mensual inconsistente.
**Offline:** detección de red por inferencia de error (no NetInfo), check-in y home sin offline, flush no se dispara al reconectar en foreground, flush todo-o-nada (un registro malo bloquea la cola), `logged_at` se pierde (fecha del sync, no del entreno).
**Perfil:** sin control/revocación de push (auto-registro silencioso), sin editar perfil (rectificación), modal de cambio de clave sin confirmación.

(El detalle S3/cosmético — tildes, copy, rachas divergentes, sin estado "sin datos" en anillos, sin OrgAnnouncement — está en el output del audit; se barre en la ola de polish.)

---

## 4. Lo que YA está bien (no romper)

- **Lógica pura compartida 1:1 con web** en nutrición (`nutrition-utils.ts`: `calculateConsumedMacrosWithCompletionFallback`, etc.), date-utils (Santiago), y el motor de cálculo de macros.
- **Workout exec funcional**: registra series, timer con anillo, secciones, superseries, progresiones, técnica con GIF, cache del plan offline.
- **Home animado** con WeekCalendar, ComplianceRings, PRs, sparkline de peso, mini-hábitos.
- **Check-in completo** (3 pasos, compresión de imagen, last-check-in card).
- **Detalles nativos ya presentes**: haptics en toggle de comida, pull-to-refresh, RefreshControl, AppState flush, HabitsTracker con campo "Notas" extra que la web no tiene.

---

## 5. Oportunidades NATIVAS (superar a la web) — por área

> El objetivo del proyecto: que el alumno mobile **supere** a la PWA usando el teléfono. Estas salieron del audit; se priorizan y consolidan en [mobile-native-advantages.md](mobile-native-advantages.md).

- **Nutrición:** recordatorios LOCALES de comidas con acción rápida "Marcar" desde la notificación (sin servidor); **escaneo de código de barras** para registrar comida fuera del plan (Edamam ya en stack); auto-rellenar pasos/sueño desde **HealthKit/Google Fit**; **widget/Live Activity** con anillo de macros + "3/5 comidas".
- **Workout:** **rest timer como Live Activity / Dynamic Island** + alarma sonora + háptica al terminar (corre con pantalla bloqueada — imposible en web); confeti + háptico al batir PR; charts con scrub táctil + háptico al cruzar PR.
- **Check-in:** cámara nativa con guía de pose/overlay del anterior para comparar; recordatorio push semanal que abre directo al flujo de fotos.
- **Progreso:** **widget de home** (racha + peso + último PR); heatmap de actividad anual offline-first; gráficos animados (Skia) con gestos.
- **Transversal:** **offline-first robusto** (entrenar/comer sin señal sin perder nada), **Face ID** para entrar, **haptics con carácter** en cada hito.

---

## 6. Patrón transversal (causas raíz, alineado con el coach)

Los bugs del alumno comparten las MISMAS causas raíz del informe del coach ([coach-mobile-readiness-review.md](coach-mobile-readiness-review.md) §5):
- **Sin capa de datos / manejo central:** queries directas a Supabase en componentes (home, workout, nutrición), loaders sin try/catch, sin punto único para offline/sesión.
- **Contratos no compartidos:** validaciones a mano (password 6 vs 8, RPE sin schema), lógica de scoring duplicada (compliance, racha) que ya diverge de web.
- **Offline frágil:** detección por inferencia de error en vez de NetInfo; colas no resilientes per-item en workout.
- **Acceso/gates no portados:** suspendido/force-password viven en el middleware web (`proxy.ts`) y no existen en mobile → **esto es cimiento compartido coach+alumno**.

→ Por eso conviene **arreglar los cimientos compartidos primero** (ver [mobile-shared-foundation.md](mobile-shared-foundation.md)) antes de pulir pantallas: varios S1 del alumno se cierran ahí de una.

---

## 7. Detalle completo

El output verificado por área (todos los hallazgos con `archivo:linea`, status confirmed/partial/refuted, y las `nativeOpportunities` completas) está en el resultado del workflow de auditoría. Este documento es el resumen accionable; para la evidencia línea-por-línea, ver el transcript del workflow `alumno-web-vs-mobile-audit`.
