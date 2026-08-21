---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Onboarding del coach v2

Estimación: ~6-8 días de agentes en 6 waves + contenido de demos/plantillas del owner y socios (paralelo) +
QA del owner en web, iOS y Android (2 h). Orquestación: jefe (Fable) planifica y juzga; workers Opus para
implementación guiada; Sonnet solo para swaps mecánicos de copy.

## Waves

| Wave | Qué | Workers | Gate de salida |
|---|---|---|---|
| W0 | Decisiones D1–D7 + autores de contenido (D4) + diagnóstico del drip muerto | owner + jefe | decisiones escritas en SPEC §Decisiones |
| W1 | **Datos y contratos (aditivo):** `coaches.persona/persona_also_other/persona_set_at` + column grants; `clients.is_demo` + exclusión del cupo en TODOS los conteos (servicios web, RPCs SQL, `api/mobile`, import, reactivate, OverLimitBanner, finanzas); `coach_onboarding_events` CHECK ampliado + dedupe server-side; `FEATURE_DOMAINS` ampliado en `@eva/feature-prefs` + `featureDomain` en `@eva/coach-nav` (Cardio/Movimiento/Entrenamiento/Bodycomp); tipos regenerados; tests de cupo con demo | 1 Opus (DB+servicios) + 1 Opus (paquetes) | migración por protocolo AGENTS (tx-rollback + advisors 0 ERROR); vitest de tiers/feature-prefs/coach-nav/cupo; tsc web+mobile |
| W2 | **Web — pantalla de persona + panel a medida:** `/coach/onboarding/persona` (gate: `persona IS NULL` ⇒ redirect una vez; exento en `proxy.ts` como `/coach/onboarding/*`); server action que escribe persona + `coach_feature_prefs`; nav filtrado; checklist v2 por persona ARRIBA del dashboard (reusa `persistOnboardingGuideAction`, `autoCompleted`, `nextBestAction.rules`); tarjeta inline «Tu marca en 60 s» con preview; «Vive tu app» (magic link al demo); unificación de copys; borrado de los 5 componentes muertos; `FreeWelcomeModal` solo texto y coherente con v3; «Tu próximo paso» por persona | 1 Opus (persona+nav) + 1 Opus (dashboard/checklist/marca) | tests de actions; Playwright smoke del primer login por persona; lint 0; tsc |
| W3 | **Demos y plantillas por persona:** seed de producto `seedDemoStudent(coachId, persona)` (server action, idempotente, reversible por inventario, nutrición **V2**, `is_demo`), contenido según D4, plantillas clonables por persona, empty states template-first (builder, nutrición, movimiento, cardio), `seed-rehab-exercises` al catálogo del sistema, etiqueta «Alumno de ejemplo» + «Borrar ejemplo» en web y RN | 1 Opus (seed+contenido) + 1 Opus (empty states) | seed ×4 personas en tx-rollback; borrado deja 0 filas; tests de exclusión de cupo/KPIs |
| W4 | **RN — paridad:** pantalla de persona (`RoleCards`), gate en `coach/_layout`, checklist v2 arriba del home y persistido (`onboardingGuide` por la API existente), nav móvil por `featureDomain`, share sheet + WhatsApp, demo visible y borrable, modal Free corregido, `captureAppEvent` de los eventos nuevos, borrado de las 435 líneas muertas | 1 Opus | tsc mobile; harness visual (emulador) por persona; OTA-able verificado (sin assets nuevos) |
| W5 | **Correos por comportamiento:** arreglar bienvenida (`auth/confirm` await) y causa del drip muerto; motor de triggers (`+2 h sin alumno`, `+24 h sin volver`, `+48 h alumno no entró`, aha, `+7 d`, corte 90 d) sobre `coach_email_drip_events`; plantillas por persona; dedupe por `admin_audit_logs`/evento; prueba a cuenta QA | 1 Opus | tests de templates + servicio; envío de prueba a `qa-free-v3@evatest.cl` |
| W6 | **Medición + QA + salida:** insights PostHog (setup ≤24 h, aha ≤7 d, volvió, marca) por cohorte semanal; `docs/status/CURRENT.md`, `PRODUCT_OVERVIEW`, `MOBILE_PARITY`; QA del owner con la cuenta QA Free v3 (web + app) por las 4 personas; OTA a 3 runtimes; correo de aviso opcional a los Free sin alumno (copy de W5) | jefe + owner | gates completos pre-push (vitest, build, tsc ×2, lint, docs:check, tokens, boundaries); evidencia de QA |

## Dependencias y orden

- W1 es prerrequisito de todo (persona, `is_demo`, dominios). W2 y W4 dependen de W1; W3 depende de W1 y
  del contenido de D4 (puede empezar con el esqueleto y reemplazar copy después). W5 es independiente salvo
  por `persona` (segmentación). W6 cierra.
- W2 y W4 pueden correr en paralelo con contratos congelados tras W1 (mismo `@eva/feature-prefs` y
  `@eva/coach-nav`).

## Riesgos de ejecución

- **Conteo de cupo en N lugares**: el `is_demo` tiene que excluirse en todos (web services, RPC SQL, mobile
  API, import, reactivate, banner, finanzas) o un Free con demo queda bloqueado. Lista exhaustiva en TASKS F1.3.
- **Gate de redirect a `/coach/onboarding/persona`** debe exceptuar org/team managed y coaches existentes
  (backfill `persona = NULL` ⇒ se pregunta una sola vez en el próximo login, con «Otra cosa» visible).
- **OTA vs binario**: RN W4 no agrega assets ni módulos nativos; los eventos PostHog en RN dependen de la key
  en el binario 1.1.2 (hoy muda) — medir en web hasta el próximo binario.
- **Seeds escriben en prod**: el seed de producto corre como server action con RLS/servicio, nunca como script
  manual; reversible por inventario; nunca toca `enabled_modules` a mano (trigger `trg_coach_addons_sync`).
