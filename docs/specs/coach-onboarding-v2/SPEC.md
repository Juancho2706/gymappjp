---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# SPEC — Onboarding del coach v2: «¿A qué te dedicas?» → un panel a tu medida

**Estado: ACTIVA — «go» del owner 2026-08-21 con D1–D8 por default; D4: el socio revisa fuerza y running, nutrición y rehab arrancan con esqueleto provisional. W1 en ejecución. Investigación de base en
`docs/specs/coach-onboarding-v2/RESEARCH.md` (auditoría web+RN, datos de activación de los 44 coaches,
benchmarks SaaS, 26 competidores, personas).**

## Origen

Pedido del owner (2026-08-21): «mejorar HARTO el onboarding del coach nuevo Free (…) preguntarle al coach al
entrar por primera vez info para saber a dónde dirigirlo: si es nutri dale un buen onboarding de nutri, si es
kine, si es cardio, si es coach personalizado (…) que la gente no se quede overwhelm de la app sin saber qué
hacer». Idea original de un compañero del owner.

## Problema, con datos (21-08, 44 coaches reales, excluidas cuentas de prueba)

| Señal | Valor | Fuente |
|---|---|---|
| Volvió al panel (>6 h después del alta) | **57 %** (cohorte Meta ≥18-08: **30 %**) | `coaches.last_active_at` |
| Tocó «Mi Marca» alguna vez | **25 %** (Meta: 5 %) | `onboarding_guide.brand_tour_seen`, `logo_url`, preset |
| Creó su primer alumno | 50 % — y **11 de esos 22 lo hicieron en la 1.ª hora** | `clients.created_at` |
| Alumno **y** programa | 39 % | `workout_programs` |
| Creó un plan de nutrición | **14 %** (mediana alta→plan: **46 días**) | `nutrition_plans_v2` |
| Un alumno suyo entrenó (aha real) | **30 %**, mediana alta→1.er entreno **7,3 días** | `workout_logs` |
| Solo cargó `/coach/dashboard` y nada más (5 d) | **14 de 40** | PostHog `$pageview` |
| `upgrade_gate_hit` 30 d | **37 hits / 16 personas, el 100 % gate `branding` en /coach/settings** | PostHog |
| Activados vs no: tocó marca | **50 % vs 8 %**; `brand_tour_seen`: **5/5 activados, 0/26 no** | DB |

Lectura: **quien activa lo hace en la primera sesión; quien no, casi nunca vuelve.** La marca es la señal
más fuerte de activación y es lo que menos gente alcanza (el paso 1 del checklist mandaba al Free a un
paywall). El onboarding actual es uno solo, de 4 pasos de entrenador de fuerza, para todos.

### Lo que hay hoy y por qué falla (auditoría 21-08, ver RESEARCH.md §A)

1. **Cero señal de persona.** `coaches` no tiene ninguna columna de profesión/especialidad; `enabled_modules`
   es `{}` en 43/44 (y desde pricing v2 los 4 módulos están ON para todos en lectura). Al primer login sabemos
   nombre, marca y correo.
2. **Checklist genérico y con drift v3:** `CoachOnboardingChecklist.tsx:375-384` — paso 1 «Personaliza tu
   marca» → `/coach/subscription` si es Free (ya no corresponde: white-label en todos los planes); paso 3
   «Crea tu primer plan» → **siempre** `/coach/workout-programs` (un nutricionista nunca puede tildarlo);
   paso 4 «Recibe el primer check-in» → `/coach/clients` (no accionable). RN replica el drift
   (`CoachDashboardSections.tsx:1320`, modal Free «Marca personalizada ✗» `:556,571`).
3. **La guía vive al FINAL del dashboard** (web `DashboardShell.tsx:232`; RN `home.tsx:186-191`), bajo hero/KPIs
   vacíos. El dashboard vacío **felicita** al coach nuevo («Todo al día, buen trabajo», RN `:2571`).
4. **No mide nada:** `onboarding_guide.completed = {}` en 41/44 (los pasos se derivan, no se persisten);
   `coach_onboarding_events` re-emite en cada render (**2.293 filas de `first_client` para 19 coaches**);
   `guide_engagement` no está en el CHECK de la tabla (`baseline.sql:886`) → el «Saltar guía» muere en 500.
   RN no persiste el chip al servidor (`home.tsx` no pasa `onboardingGuide`).
5. **El drip no se MIDE desde abril (corrección 21-08, diagnóstico de la sesión BROCITO):** `coach_email_drip_events`
   tiene 12 filas porque su único escritor (`api/internal/email-drip/run`) se borró el 26-04 (`23f3f015`); el drip v2
   (`98469778`, Resend `scheduled_at`) SÍ entrega (bienvenidas jul-ago delivered, 0 bounces) pero no deja ledger en
   la DB. Huecos reales: Google web sin correo hasta `56159d64`, fire-and-forget hasta `0be1130e`, y HOY el alta por
   Google desde la app (`api/mobile/auth/complete-coach-onboarding/route.ts:145`) sin bienvenida ni drip — lo cubre
   `docs/specs/embudo-free-pro/TASKS.md` W2.5-W2.11.
6. **Producto totalmente vacío al entrar:** sin plantillas a la vista, sin alumno de ejemplo; en Free el único
   cupo es caro de gastar «probando». Cinco copys distintos de los mismos 4 pasos (modal, checklist, viñetas
   muertas, HelpCenter, correo D+0). Cuatro componentes de onboarding muertos sin importador
   (`OnboardingThreeSlot`, `ThreeRibbonInner`, `StepsVignetteCarousel`, `StepsJumpNav`, `CompactLoopStrip`) y
   435 líneas muertas en RN (`MobileOnboardingChecklist` + 6 bloques).
7. **El loop no cierra:** 19 coaches tuvieron alumno logueado, solo 13 un alumno que entrenó; el «aha» con
   confeti (`first_checkin`) llega a los 7 días, cuando el 70 % ya se fue.

## Evidencia externa que guía el diseño (RESEARCH.md §B–§D)

- **Una sola pregunta de persona, 3-5 opciones, y que la respuesta cambie algo visible en <5 s**; si no
  cambia nada, envenena los datos (Notion); si cambia, no es fricción (HubSpot). Mandatory sin escape ⇒
  respuestas al azar.
- **Las ramas deben diferir en lo que pasa después, no en la copia** (MYOB: checklists por línea de producto,
  +21 % activación). **Template-first:** el usuario nuevo nunca ve un builder en blanco (Canva).
- **Checklist 3-5 ítems con progreso y el primero pre-tildado** (+12 % completitud, Chameleon 550 M);
  ítems que producen resultado real, no «subí tu avatar».
- **Tours largos fracasan** (7 pasos = 16 % completitud; 3 pasos = 72 %); tarjetas contextuales embebidas
  rinden 1,5× más que pop-ups. Modal de bienvenida solo texto (44 % vs 21 % con video).
- **Aha de EVA pertenece al alumno:** «mi alumno abrió la app con mi marca y completó su primer entreno /
  registró su primera comida». Setup moment = «invitó a su primer alumno» (hoy ~50 %, referencia 60-75 % en
  24 h).
- **Correos por comportamiento, no por calendario;** el más valioso: «creaste tu cuenta y todavía no invitaste
  a tu alumno», con el link adentro. Ventana de re-enganche se cierra a los 90 días.
- **Competidores:** de 26 productos, **solo Everfit** ramifica por tipo de profesional en el alta; tres
  independientes convergen en **alumno demo obligatorio** (Everfit «Invite Myself», Trainerize «Timmy
  Explorer», Nutrium «example client»); PT Distinction nace con 21 plantillas; Hevy/TrueCoach cierran con el
  link de invitación de un toque; Rehab My Patient entrega por WhatsApp. Errores a evitar: onboarding solo
  web (Trainerize/Healthie), decisiones irreversibles (FITR), gatearlo al plan pago (Everfit), 4-8 h de setup.

## Diseño v2 — «Tu panel, a tu medida»

### Principio rector

**La pregunta de persona REDUCE lo que se muestra y SIEMBRA lo que falta.** Cada rama entrega, en la
primera sesión: (1) el panel con los módulos de esa persona y sin los demás, (2) un alumno de ejemplo de su
mundo ya cargado, (3) plantillas de su mundo, (4) un checklist de 5 verbos en el orden de su trabajo, (5) el
mismo flujo en web y en la app. Nada se gatea a Pro; la persona se cambia cuando quiera sin perder datos.

### 1. Pantalla «¿A qué te dedicas?» (web + RN, primer login, una sola vez)

- Aparece antes que cualquier modal de bienvenida, pantalla completa, sin «Saltar» arriba. Cinco tarjetas:

| Orden | Tarjeta | Bajada | `persona` |
|---|---|---|---|
| 1 | **Entreno fuerza y acondicionamiento** | Rutinas, progresiones y seguimiento. Presencial u online. | `strength` |
| 2 | **Soy nutricionista** | Pautas, porciones e intercambios, y evaluación corporal. | `nutrition` |
| 3 | **Trabajo rehabilitación y readaptación** | Screening de movimiento, pauta de ejercicios y evolución. | `rehab` |
| 4 | **Entreno resistencia: running, ciclismo, trail** | Zonas de frecuencia cardíaca, ritmos e intervalos. | `endurance` |
| 5 | **Otra cosa / todavía no lo tengo claro** | Te dejamos el panel completo y lo ajustas cuando quieras. | `other` |

- Segunda pregunta inline (una línea, solo para 1/3/4): **«¿También les armas la alimentación?» [Sí] [No]**;
  para `nutrition`: «¿También les armas el entrenamiento?». Esto reemplaza al «coach integral» como tile.
- Copy: se pregunta por lo que HACE, no por el título; «kinesiólogo/fisioterapeuta» no se nombra (CL vs MX/CO);
  el tile 5 dice qué pasa si lo eliges, no «saltar».
- Persiste `coaches.persona`, `coaches.persona_also_other` (bool: nutrición para 1/3/4, entrenamiento para 2),
  `coaches.persona_set_at`. **Columna propia, no jsonb** (segmenta correos y funnel). Editable en
  Opciones › «Mi panel».
- Telemetría: `persona_selected {persona, also_other, surface: web|rn}`.

### 2. Consecuencia inmediata: el panel se achica

- `@eva/feature-prefs` extiende `FEATURE_DOMAINS` con `training | cardio | movement | bodycomp` (hoy solo
  `nutrition`); `@eva/coach-nav` pone `featureDomain` en Cardio y Movimiento (hoy solo lo tiene Nutrición,
  `nav.ts:98,107,108`). La persona escribe un set de `_enabled` por dominio en `coach_feature_prefs`
  (PK `(coach_id, domain)` con `domain text` libre → **sin migración de tabla**).
- Matriz por defecto (visible ✅ / oculto ⬜, siempre reactivable en Opciones):

| Dominio | strength | nutrition | rehab | endurance | other |
|---|---|---|---|---|---|
| Entrenamiento (builder, programas, ejercicios) | ✅ | ⬜ (✅ si also_other) | ✅ | ✅ | ✅ |
| Nutrición V2 (pautas, porciones, alimentos, plantillas) | ⬜ (✅ si also_other) | ✅ | ⬜ | ⬜ | ✅ |
| Cardio (zonas FC, ritmos, intervalos) | ⬜ | ⬜ | ⬜ | ✅ | ✅ |
| Movimiento (screening 7 patrones) | ⬜ | ⬜ | ✅ | ⬜ | ✅ |
| Composición corporal (BIA/ISAK) | ⬜ | ✅ | ⬜ | ⬜ | ✅ |
| Check-ins, hábitos, marca, alumnos, soporte | ✅ | ✅ | ✅ | ✅ | ✅ |

- RN consume el mismo paquete → el menú móvil se achica igual (evitar el drift documentado en `nav.ts:10-15`).

### 3. Paso 1 del panel: tu marca en 60 segundos (inline, arriba del dashboard)

- Tarjeta inline en el dashboard (no una página): nombre de marca (pre-llenado), color primario (presets
  curados de `@eva/brand-kit` + picker), logo (subida directa), y **vista previa en vivo del login del
  alumno** con el sello «Hecho con EVA». Guarda con la misma acción que Mi Marca.
- Cierra el drift «todo coach nuevo nace verde»: si el coach elige color en el paso 1, el `#10B981` sembrado
  deja de verse; si no elige, el default pasa a `#1462DC` (decisión ya tomada, `[[verde→azul]]`).
- Auto-tildado si ya hay logo o preset. Después del alta, «Mi Marca» completa sigue en Opciones.

### 4. Alumno de ejemplo por persona (sembrado en el alta, borrable de un toque)

- **Prerrequisito duro:** `clients.is_demo boolean default false` y el **conteo de cupo lo excluye** (Free = 1
  alumno; si el demo come el cupo, el onboarding se convierte en un muro). Excluido también de métricas
  financieras y de los correos al alumno.
- Sembrado por server action idempotente y reversible (inventario de ids por coach, patrón
  `seed-catalina-full-qa.json`), **escribiendo nutrición V2** (no V1, la superficie viva del alumno es V2).

| Persona | Alumno demo | Contenido | Plantillas clonables |
|---|---|---|---|
| strength | «Matías, 30, hipertrofia» | programa 3 días + 2 semanas de logs con 1 PR + 2 check-ins | Full body 3 d · Torso/Pierna · PPL |
| nutrition | «Ana, 34, recomposición» | pauta V2 por porciones, 4 tiempos, 7 días de adherencia, 1 BIA + 1 ISAK | 1800 kcal porciones · 2200 kcal híbrida |
| rehab | «Pedro, 45, lumbalgia» | screening 7 patrones con semáforo, pauta domiciliaria en 3 áreas custom (Movilidad/Control motor/Fortalecimiento), 1 reevaluación | pauta domiciliaria · post-op rodilla · hombro |
| endurance | «Javiera, 28, 10K en 52'» | perfil cardio (`resting_hr`, `ref_5k_time_sec`) → zonas calculadas; semana Z2 + 8×400 + fondo; 2 sesiones con curva de FC | Base 4 sem 10K · 21K · retorno |
| other | ninguno | — | — |

- Etiqueta visible «Alumno de ejemplo» en todas las superficies + botón «Borrar ejemplo». No recibe correos,
  no cuenta en KPIs del dashboard (o cuenta aparte, marcado).

### 5. «Vive tu app» — invitarme a mí mismo

- Botón en el paso 2 del checklist: abre la app del alumno **con la marca del coach** (web: `/c/[slug]/login`
  con magic link del alumno demo vía `auth.admin.generateLink`; RN: deep link `eva://` al mismo login). Es el
  único momento en que el Free ve el white-label funcionando: el «wow» que justifica Free = 1 alumno con marca.

### 6. Checklist v2: 5 verbos por persona, arriba del dashboard hasta completarse

| # | Paso (común) | Variante por persona (paso 3) | Auto-tilde (señal real) |
|---|---|---|---|
| 1 | **Pon tu color y tu logo** (pre-tildado si ya hay marca) | — | `logo_url` o preset o `primary_color ≠ default` |
| 2 | **Mira tu app con tu marca** (Vive tu app) | — | `vive_tu_app_opened` |
| 3 | **Arma tu primer [artefacto] desde la plantilla** | strength: rutina de Matías · nutrition: pauta de Ana · rehab: screening de Pedro · endurance: zonas + semana de Javiera | programa / plan V2 / movement_assessment / perfil cardio del demo editado o 1 nuevo |
| 4 | **Invita a tu primer alumno** — link copiado + botón WhatsApp con mensaje redactado | vocabulario: alumno · paciente · paciente · atleta | `clients` real (no demo) ≥1 |
| 5 | **Tu alumno completó su primer entreno / registró su primera comida** — el único confeti | nutrition: primera comida registrada · resto: primer set logueado | `workout_logs` / `nutrition_intake_entries` del alumno real |

- Progreso visible (1/5 ya tildado). Se mueve al pie del dashboard cuando llega a 5/5 o al tocar «Ocultar»
  (persistido en `onboarding_guide.dismissed`, web **y RN**).
- Sin tour automático al entrar. Tours existentes (marca, builder, nutrición) quedan como «?» contextual.
- Modal de bienvenida Free: solo texto, 3 líneas, «Recordármelo después»; copy coherente con v3 (white-label
  incluido). Se unifican los 5 copys en **una** fuente (`@eva/onboarding` o `packages/coach-nav`).

### 7. Estados vacíos por persona (template-first)

- Builder, nutrición, movimiento, cardio: el vacío muestra **plantillas de la persona** + el demo, no una
  ilustración + botón. El «Tu próximo paso» (`nextBestAction.rules.ts`) se resuelve por persona y deja de
  apuntar a `/coach/programs` (404).

### 8. Correos por comportamiento (reemplaza el drip fijo muerto)

| Trigger | Cuándo | Contenido |
|---|---|---|
| Cuenta creada, sin alumno real | +2 h | «Tu app ya está lista con tu marca — invitá a tu primer [alumno]» con el link y el mensaje de WhatsApp |
| Sin volver al panel | +24 h | Persona-específico: qué puede hacer en 5 min (plantilla concreta) |
| Alumno invitado, no entró | +48 h | Texto listo para reenviarle al alumno por WhatsApp |
| Aha (primer entreno/comida del alumno) | inmediato | Felicitación única + «así sigue la semana» |
| 7 d sin activar | +7 d | Último toque + oferta de ayuda humana (WhatsApp del owner; a esta escala es la palanca más barata) |
| 90 d | — | Se corta: no más correos de onboarding |

- Prerrequisito: un **ledger real** de envíos (hoy el drip v2 vive en Resend `scheduled_at` y no escribe la DB)
  para poder disparar por comportamiento y medir; y cerrar el alta Google móvil sin bienvenida (ambos en
  `embudo-free-pro` W2, sesión BROCITO — esta spec no duplica ese trabajo, lo consume).

### 9. Paridad móvil (no negociable)

- Misma pantalla de persona en RN (molde: `components/entry/RoleCards.tsx`), checklist v2 arriba del home y
  **persistido** (hoy `home.tsx` no pasa `onboardingGuide`), demo y plantillas vía la API mobile existente,
  invitación con share sheet nativo + WhatsApp. OTA-able salvo eventos PostHog (la key sigue muda en 1.1.2).

### 10. Medición (definición de éxito)

- **Setup:** % de coaches con alumno real invitado ≤24 h desde el alta — hoy **50 % (Meta 35 %)**, meta **65 %**.
- **Aha:** % con alumno real que entrenó/registró comida ≤7 d — hoy **30 %**, meta **45 %**; mediana alta→aha
  de 7,3 d a **<48 h**.
- **Volvió al panel (>6 h):** 57 % → 75 %. **Tocó marca:** 25 % → 70 % (el paso 1 lo fuerza).
- Contar cabezas por cohorte semanal (44 coaches: los porcentajes tienen intervalos inútiles).
- Eventos nuevos (web + RN, dedupe server-side): `persona_selected`, `onboarding_step_completed {step,
  persona}` (una vez por paso), `demo_student_seeded|deleted`, `vive_tu_app_opened`, `invite_link_copied`,
  `invite_whatsapp_opened`, `student_first_login`, `student_first_workout|intake` (aha), `onboarding_dismissed`.
  Se arregla el re-emit de `coach_onboarding_events` y se amplía su CHECK.

## Fuera de alcance v1 (deuda declarada)

- Vocabulario global por persona («paciente»/«atleta» en todo el nav): v1 solo en la pantalla de persona, el
  checklist y los correos (**opción A**); helper `personaNoun()` compartido web+RN como v1.1.
- Programación grupal (persona «preparador de equipo/box»): no existe; se mide como sub-opción textual dentro
  de `strength` («entreno grupos / box») para decidir después.
- Integraciones Strava/Garmin/TrainingPeaks y potencia/cadencia (nicho ciclismo); ficha clínica (dolor, ROM).
- PDF de la pauta V2 en web (objeción #1 de la nutricionista): **prerrequisito de negocio** de la rama
  `nutrition`; RN ya exporta el día y los intercambios (`nutrition-day-export.ts`). Se lista como tarea aparte.
- A/B testing: con 44 coaches no hay potencia; se compara cohorte antes/después contando cabezas.

## Decisiones que necesita el owner

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Set de personas | A) 4 + «otra cosa» (strength/nutrition/rehab/endurance) · B) 5 con «integral» como tile · C) 3 (fuerza/nutri/otro) | **A** + pregunta 2 binaria |
| D2 | Alumno de ejemplo | A) sembrado automático al elegir persona · B) botón «Crear alumno de ejemplo» · C) sin demo, solo plantillas | **A** (3 competidores lo hacen obligatorio; 11/23 Free en cero alumnos) — exige `is_demo` fuera del cupo |
| D3 | Vocabulario | A) solo onboarding/correos · B) helper global web+RN | **A** en v1, B como v1.1 |
| D4 | Contenido de demos y plantillas | quién lo escribe (socio JP para fuerza/cardio; nutricionista amiga para pautas; kine para rehab) | owner define autores; la spec trae el esqueleto |
| D5 | Posición del checklist | A) arriba del dashboard hasta 5/5 · B) panel lateral · C) como hoy (abajo) | **A** |
| D6 | Correos | A) reemplazar el drip por triggers de comportamiento (tabla §8) · B) arreglar el drip fijo tal cual | **A** |
| D7 | Persona `persona` en DB | A) columna `coaches.persona` · B) key en `onboarding_guide` jsonb | **A** (segmentación de correos y funnel) |

## Riesgos

- **Cupo Free = 1 + demo**: sin `is_demo` excluido del conteo el plan Free se rompe (prerrequisito W1).
- **Drift web↔RN de `FEATURE_DOMAINS`/nav**: sale coordinado o el menú móvil se desincroniza (ya pasó).
- **Prometer lo que no existe**: la rama `endurance` sin bloques por ritmo/zona y la `nutrition` sin PDF web
  quedan como etiquetas vacías — por eso las plantillas y el demo van en la MISMA wave que la pantalla.
- **Seeds escriben en prod**: los seeds actuales son PROD-targeted y coach-hardcodeados; el seed de producto es
  nuevo, parametrizado `(coachId, persona)`, idempotente y reversible.
- **Persona obligatoria sin escape ⇒ respuestas al azar**: el tile 5 es el escape y se mide aparte.
