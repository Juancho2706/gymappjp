---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Onboarding del coach v2 («megaplan», 2026-08-21)

**Estado: ACTIVO — aprobado por el owner el 2026-08-21 (D1–D8 default; D4 = socio para fuerza/running).** Artifact de lectura: «Megaplan Onboarding v2». Spec: [SPEC](SPEC.md).
Canvas del diseño: artifact `3ccbf874` (17 pantallas: flujo, web por persona, PWA, RN, tareas guiadas).

## Objetivo y cómo se mide

| Métrica (cohorte semanal de altas, contando cabezas) | Hoy (44 coaches) | Meta v2 |
|---|---|---|
| **Setup**: alumno real invitado ≤24 h desde el alta | 50 % (Meta 35 %) | **65 %** |
| **Aha**: el alumno real entrenó / registró comida ≤7 d | 30 % | **45 %** |
| Mediana alta → aha | 7,3 días | **< 48 h** |
| Volvió al panel (>6 h) | 57 % (Meta 30 %) | **75 %** |
| Tocó su marca | 25 % | **70 %** |

Una sola celebración en el aha; nada de tours automáticos; nada gateado a Pro; persona cambiable siempre.

## Decisiones asumidas (defaults; el owner puede cambiarlas antes de W1)

| # | Decisión | Default |
|---|---|---|
| D1 | Personas | `strength` · `nutrition` · `rehab` · `endurance` + `other`; pregunta 2 binaria «¿también les armas la alimentación / el entrenamiento?» |
| D2 | Alumno de ejemplo | sembrado automático al elegir persona; `clients.is_demo` **fuera del cupo**; borrable de un toque |
| D3 | Vocabulario | v1 solo en onboarding, guía y correos («paciente»/«atleta»); menú sigue «Alumnos» |
| D4 | Contenido de demos/plantillas | esqueleto escrito por agentes en W3, revisado por: socio (fuerza/running), nutricionista de confianza (pautas), kine por definir |
| D5 | Guía | 5 verbos, ARRIBA del dashboard hasta 5/5 u «Ocultar»; luego tira al pie |
| D6 | Correos | por comportamiento, sobre el ledger que construye la sesión BROCITO (embudo W2) |
| D7 | `persona` | columna propia en `coaches` (+ `persona_also_other`, `persona_set_at`) |
| D8 | Coaches existentes | 0 alumnos ⇒ ven la pantalla completa una vez; ≥1 alumno ⇒ tarjeta «Elige tu especialidad» en el dashboard, sin gate |

## Arquitectura (qué cambia y dónde)

- **Datos (aditivo, por protocolo Supabase):** `coaches.persona text CHECK`, `persona_also_other bool`, `persona_set_at timestamptz`; `clients.is_demo bool not null default false` + índice parcial; `coach_onboarding_events`: CHECK de `event_type` ampliado + UNIQUE `(coach_id, event_type, step_key)` para `step_completed`; column-level grants para lo editable por el coach.
- **Paquetes puros (fuente única web + RN):** `@eva/schemas` (`PersonaSchema`, `personaCopy`: tiles, bajadas, vocabulario, mensaje de WhatsApp por persona); `@eva/feature-prefs` (`FEATURE_DOMAINS` = nutrition · training · cardio · movement · bodycomp + `resolvePersonaPrefs`); `@eva/coach-nav` (`featureDomain` en Programas/Builder/Ejercicios, Cardio, Movimiento, Composición); **nuevo `@eva/onboarding`**: pasos por persona, señales de auto-completado, catálogo de plantillas y demos (ids + copy).
- **Web:** `/coach/onboarding/persona` (pantalla separada, 1 vez) → interstitial «Armando tu panel» → dashboard día 1 (guía v2 arriba + «Tu marca en 60 s» + alumno de ejemplo) → tareas guiadas («Sumar alumno en 3 pasos», builder template-first con tarjetas embebidas y vista del alumno; equivalentes pauta/screening/zonas) → «Vive tu app» (magic link al demo) → tira al pie. `Opciones › Mi panel` para cambiar persona y dominios.
- **RN:** misma pantalla (molde `RoleCards`), gate en `coach/_layout`, home día 1 con la guía arriba y persistida, nav por dominio, alta con share sheet + WhatsApp, tarjetas embebidas en el builder, demo visible/borrable. Todo OTA-able.
- **Demos:** `seedDemoStudent(coachId, persona)` server action idempotente y reversible (inventario de ids), nutrición **V2**, `is_demo`, excluido de cupo/KPIs/correos; `deleteDemoStudent`.
- **Correos:** triggers +2 h sin alumno · +24 h sin volver · +48 h alumno no entró · aha · +7 d · corte 90 d, plantillas por persona, dedupe; se apoya en el ledger del embudo (BROCITO W2).
- **Medición:** eventos nuevos web+RN con dedupe server-side; insights y dashboard «Activación coaches» por cohorte y por persona.

## Waves

| Wave | Qué entrega | Workers (modelo) | Gate de salida | Est. (días-agente) | Depende de |
|---|---|---|---|---|---|
| **W0** | Decisiones D1–D8 confirmadas; autores de contenido; lista de archivos acordada con BROCITO | owner + jefe | decisiones escritas en SPEC | 0,1 | — |
| **W1** | Contratos y datos: migración + grants + tipos; `is_demo` fuera del cupo en los 12 consumidores; eventos CHECK/dedupe; `@eva/feature-prefs`, `@eva/coach-nav`, `@eva/schemas`, `@eva/onboarding` + tests | 2 Opus (DB+servicios · paquetes) | migración en tx-rollback + advisors 0 ERROR; vitest de paquetes y cupo; tsc web+mobile | 1,0 | W0 |
| **W2** | Web primer login + día 1: pantalla persona + action + gate + «Armando tu panel»; guía v2 arriba; «Tu marca en 60 s»; nav por dominio; «Vive tu app»; `Mi panel`; copys unificados; código muerto borrado; «Tu próximo paso» por persona | 2 Opus (persona/nav/mi panel · dashboard/guía/marca/vive) | tests de actions; Playwright smoke por persona (5); lint 0; tsc | 2,0 | W1 |
| **W3** | Demos, plantillas y vacíos: seed action (V2) + delete + inventario; contenido 4 personas (esqueleto → revisión D4); plantillas clonables; `seed-rehab-exercises`; empty states template-first en builder, nutrición, movimiento, cardio; etiqueta «ejemplo» + borrar | 2 Opus (seed/contenido · vacíos/plantillas) + revisores D4 | seed ×4 en tx-rollback; delete deja 0 filas; cupo y KPIs excluyen demo (tests) | 2,0 | W1 (+D4 en paralelo) |
| **W4** | Tareas guiadas: «Sumar alumno en 3 pasos» (stepper inline, WhatsApp con mensaje, correo, QR/solicitud, vista del alumno); «Primera rutina» (entrada template-first, 3 tarjetas embebidas, vista del alumno en vivo, «Asignar y ver como…»); equivalentes pauta (nutri), screening → pauta (kine), zonas → semana (running) | 2 Opus (alumno · builder/pauta/screening/zonas) | smoke Playwright de las 4 tareas; tsc; lint | 2,0 | W2, W3 |
| **W5** | RN paridad: persona + gate; home día 1 (guía arriba, persistida, `dismissed` cruzado); nav por dominio; alta con share + WhatsApp y `UPGRADE_REQUIRED`; tarjetas embebidas del builder; demo visible/borrable; eventos; 435 líneas muertas fuera | 1 Opus | tsc mobile; `expo export`; QA visual emulador light/dark por persona; sin assets ni módulos nativos nuevos (OTA-able) | 1,5 | W1 (contratos), W2 (copys) |
| **W6** | Correos por comportamiento sobre el ledger del embudo: motor de triggers + cron; plantillas por persona; dedupe; corte 90 d; exclusión de cuentas de prueba | 1 Opus | tests de templates/servicio; envío real a `qa-free-v3@evatest.cl` | 1,0 | BROCITO W2 (ledger), W1 (`persona`) |
| **W7** | Medición, QA y salida: insights + dashboard PostHog; docs canónicos (`CURRENT`, `PRODUCT_OVERVIEW`, `MOBILE_PARITY`); QA del owner ×5 personas con `qa-free-v3`; gates completos; merge; OTA a 3 runtimes; backfill D8; aviso opcional a los Free sin alumno | jefe + owner + 1 Opus (insights/docs) | evidencia de QA; vitest completo; build; tsc ×2; lint; docs/tokens/boundaries | 1,0 | todas |

**Total ≈ 10,5 días-agente.** Calendario estimado **8-10 días hábiles**: W1 (día 1) → W2 ‖ W3 ‖ W5 (días 2-4) → W4 (días 4-6) → W6 cuando BROCITO entregue el ledger → W7 (días 7-8) + QA del owner. El jefe (Fable) juzga cada wave antes de abrir la siguiente; lo deficiente vuelve al mismo worker con feedback.

## Coordinación con la sesión BROCITO (embudo Free→Pro)

- **Suyo, no se toca desde acá:** W2 ledger del drip + W2.5 bienvenida en Google móvil; W3 login `?next=`; W6 medidor de cupo en `MobileFreeTierBanner` (RN) y `TIER_LABELS` de perfil coach; W7 `register_submitted` en Google OAuth.
- **Mío que roza lo suyo (acordado 21-08):** `is_demo` fuera del cupo incluye `api/cron/cap-nudge` (`countActiveClients`) y los 4 call sites de `clients`/`import` (OK recibido; ya en master); `CreateClientModal.tsx` RN: BROCITO primero (muro de cupo), mi stepper de alta se monta después y conserva su estado «límite»; `CoachDashboardSections.tsx`: su medidor de cupo (W6.3) va antes que mi home día 1 (W5) — quien toque primero avisa; mis correos por comportamiento entran por su helper `scheduleCoachEmail` (ledger `coach_email_ledger` + webhook Resend, o `coach_onboarding_events` si el owner no quiere DDL) con `trigger = 'behavior'` y dedupe por `(coach_id, template_key)`.
- **Protocolo:** antes de cada wave, intercambio de lista de archivos; commits por path; `fetch + ff-only`; nunca dos sesiones sobre el mismo archivo el mismo día.

## QA y salida

- Cuentas: `qa-free-v3@evatest.cl` (cambia de persona desde Mi panel y re-siembra el demo) + alumna `qa-free-v3-alumna@evatest.cl`; una cuenta Pro existente para verificar que nada del onboarding se gatea.
- Dispositivos: emulador (visual offline) + Xiaomi del owner (flujo real, OTA) + iPhone (TestFlight); web desktop + PWA 390 px.
- Salida: merge a master cuando W7 cierra; OTA a 1.1.0/1.1.1/1.1.2 por `mobile-ota.yml`; eventos PostHog RN dependen de la key en el binario (86 en camino).

## Riesgos y cómo se cubren

- Demo que come el cupo Free → `is_demo` es prerrequisito W1, con tests en cada consumidor.
- Drift web↔RN de dominios/nav → mismos paquetes, mismo PR, gate de paridad en W5.
- Prometer lo que no existe (PDF de pauta V2 web; bloques por ritmo) → plantillas + demo van en la MISMA wave que la pantalla; la spec declara la deuda.
- Contenido D4 tarde → esqueleto provisional etiquetado «borrador» y reemplazable sin código.
- Seeds en prod → server action con servicio y RLS, idempotente, reversible; jamás script manual ni `enabled_modules` a mano.
- Sesiones en paralelo → protocolo de archivos (arriba).
