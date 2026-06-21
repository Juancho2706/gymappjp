# OVERNIGHT — Backlog paridad RN mobile (scope: Medio T1-T4)

> Playbook para una corrida autónoma con `/goal` en la rama `feat/rn-parity-overnight`.
> Fuente del scope: `docs/audits/rn-web-parity-2026-06-21.md`. Releer ESTE archivo al inicio de CADA turno.

## REGLAS DURAS (no negociar, releer cada turno)
1. SOLO editar archivos bajo `apps/mobile/`. PROHIBIDO tocar `apps/web` (excepto `.well-known`), `packages/`, `supabase/migrations/`, o service-role. Si una tarea lo exige → marcarla `blocked` y seguir.
2. pnpm exclusivo. Sin deps nuevas salvo que la tarea lo exija y sea trivial (agregar en `apps/mobile`, revalidar bundle).
3. Sin cambios de DB. Tablas ya existen. Mutaciones bajo sesión del coach (RLS).
4. NO push, NO merge, NO PR. Solo commits locales en `feat/rn-parity-overnight`.
5. Si una tarea pide una decisión de producto/UX ambigua → `blocked` con la pregunta. No inventar producto.

## PROTOCOLO POR TURNO
1. Releer este archivo. Elegir la PRIMERA tarea con estado `todo` (saltear `done`/`blocked`).
2. Implementar SOLO esa tarea. Si se siente grande, partirla y hacer la primera mitad (dejar la otra como subtarea `todo`).
3. VALIDAR con output redirigido (el log de expo es ENORME — jamás volcarlo al contexto):
   - `cd apps/mobile`
   - `npx tsc --noEmit` → redirigir a `../../.overnight-logs/tsc.log`, imprimir SOLO `exit=<code>` + últimas ~8 líneas.
   - `npx expo export --platform android` → redirigir a `../../.overnight-logs/expo.log`, imprimir SOLO `exit=<code>` + últimas ~8 líneas.
   - PASS = ambos exit 0 (expo termina en "Exported: dist").
4. Si PASS: `git add apps/mobile` + commit `feat(mobile): <tarea> (overnight)`. Marcar la tarea `done` acá abajo.
   Si FALLA: arreglar y revalidar, MÁXIMO 2 intentos. Si sigue roja → `git restore` los cambios de la tarea, marcarla `blocked` con el error (de los logs), seguir.
5. Append a `apps/mobile/OVERNIGHT_PROGRESS.md`: timestamp, tarea, estado, archivos, exit tsc/expo, próxima, learnings.
6. SURFACEAR en el chat (para el evaluador del /goal): los dos `exit=` + la lista de tareas con su estado actual.

## DEFINICIÓN DE "HECHO" (completion condition del /goal)
Todas las tareas T1-T4 quedan `done` o `blocked`, y cada `done` muestra en el transcript `tsc exit=0` + `expo exit=0` + un commit. (Bound: o parar tras 25 turnos / 90 min.)

---

## T1 — Paleta macro canónica  [estado: done]
**Por qué:** mobile usa la paleta vieja (naranja/azul/amarillo); web migró a la canónica calma. Drift visible en toda pantalla de nutrición.
**Archivos:** `apps/mobile/components/MacroRingSummary.tsx` (const `MACRO_COLORS`), `apps/mobile/lib/theme.ts`, `apps/mobile/tailwind.config.js`, `apps/mobile/global.css`. Consumidores que importan `MACRO_COLORS` (ej. `FoodSearchSheet`, `MacroPill`, `NutritionDailySummaryWidget`) deben seguir compilando.
**Web ref:** `apps/web/src/app/globals.css` → `--color-macro-protein #5E9FD6`, `--color-macro-carbs #FFB74D`, `--color-macro-fats #81C784`, over `#EF4444`, goal/kcal `#10B981`.
**Pasos:** centralizar los tokens macro en `lib/theme.ts` (+ exponerlos en `tailwind.config.js`/`global.css` si aplica), flip de `MACRO_COLORS` a los valores canónicos, agregar variantes dark si la web las tiene, apuntar consumidores al token central (no const local duplicada).
**AC binario:** tsc exit=0 + expo exit=0; `MacroRingSummary` y consumidores leen el token central; valores = canónicos.

## T2 — Filtros de ejercicios "Con video" / "Personalizados"  [estado: done]
**Por qué:** web tiene toggles que mobile no.
**Archivos:** `apps/mobile/app/coach/(tabs)/ejercicios.tsx`, `apps/mobile/app/alumno/(tabs)/exercises.tsx`, helpers en `apps/mobile/lib/exercises.ts` (`exerciseThumb`/`youtubeId`/video).
**Web ref:** `apps/web/src/app/coach/exercises/page.tsx` (toggles "Personalizados" y "Con video" con chequeo real de video).
**Pasos:** agregar 2 chips toggle; filtro 100% client-side: "Con video" = tiene gif/imagen/youtube real (reusar helper existente); "Personalizados" = `coach_id` propio (no system). Combinable con search+músculo+origen ya existentes.
**AC binario:** tsc exit=0 + expo exit=0; los toggles filtran la lista en ambas pantallas.

## T3 — Subscription display parity (solo lectura)  [estado: done]
**Por qué:** mobile muestra payload fino; web tiene precio/addons/tarjeta/historial. ACCIONES de pago siguen web-only (no tocar).
**Archivos:** `apps/mobile/lib/coach-subscription.ts` (`getCoachSubscriptionOverview` hoy fino), `apps/mobile/app/coach/(tabs)/subscription.tsx`. Reusar el `apiFetch` bearer ya usado en otras libs mobile.
**Web ref:** endpoint `/api/payments/subscription-status` (devuelve `billing` base+addons+total, `addons[]` con `source` admin_grant=Cortesía, `card_last4`/`brand`, `events[]`).
**Pasos:** que la lib consuma `/api/payments/subscription-status`; en la pantalla mostrar total compuesto (base+addons), lista de addons activos (badge "Cortesía EVA" si `source=admin_grant`), tarjeta brand+last4, e historial de pagos (`events[]`). Mantener el deep-link "Gestionar en la web" para acciones. TODO render debe degradar elegante si un campo viene vacío/undefined.
**AC binario:** tsc exit=0 + expo exit=0; renderiza los campos nuevos cuando el API responde; sin crash con payload vacío.
**Nota:** la correctitud runtime se verifica en device (no en esta corrida). AC = compila + render seguro.

## T4 — Login alumno brandeado (logo + nombre + welcome_message)  [estado: todo]
**Por qué:** mobile aplica el COLOR del coach pero dropea logo + brand_name + welcome_message en el login del alumno (header genérico).
**Archivos:** `apps/mobile/app/(auth)/login.tsx` (branch `role=alumno`), `apps/mobile/lib/branding.ts` (tipo `CoachBranding` + `fetchBrandingByCoachIdentifier` — sumar `welcome_message`), `apps/mobile/context/ThemeContext.tsx` (payload de branding).
**Web ref:** `apps/web/src/app/c/[coach_slug]/login/ClientLoginForm.tsx` (logo 80x80, título brand_name, subtítulo welcome_message).
**Pasos:** sumar `welcome_message` a `CoachBranding` (leer la columna `coaches.welcome_message` con el mismo select anon/RLS ya usado); en `login.tsx role=alumno` renderizar logo del coach + brand_name como título + welcome_message como subtítulo, tomados de `ThemeContext.branding`. Fallback a Dumbbell/heading genérico si no hay branding.
**AC binario:** tsc exit=0 + expo exit=0; el login `role=alumno` muestra logo+nombre+welcome desde `ThemeContext.branding`; el de coach queda igual.

---

## EXCLUIDO (no intentar en esta corrida)
`apps/web` (salvo `.well-known`), `packages/`, migraciones DB, módulos pagos completos (cardio/movement/bodycomp/nutrition-Pro), nav refactor, workout polimórfico, nutrition overhaul alumno, Áreas/Funciones/Módulos/Team settings, cualquier flujo de pago, push a remoto.
