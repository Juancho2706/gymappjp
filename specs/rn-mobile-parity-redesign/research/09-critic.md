# 09 — Auditoría de completitud (critic) de los 8 recon + 11 gaps

> Fecha: 2026-07-08. Solo lectura. Objetivo: encontrar los ángulos muertos que impedirían al arquitecto
> escribir un mega-plan de paridad 1:1 RN↔web sin agujeros. No repito el contenido de los informes; señalo
> lo que FALTA, lo que se CONTRADICE, lo SUBESTIMADO y los riesgos sistémicos no cubiertos.
>
> Método: leí los 8 recon (01-08) y los 11 gaps (G01-G11) completos, y crucé contra el árbol REAL de rutas
> (`apps/web/src/app` + `apps/mobile/app`), el `package.json` de mobile y varias pages web. Rutas verificadas
> con `find`/`Read`. Los 11 gaps esperados existen y están todos presentes; ninguno vino vacío ni truncado.

---

## 0. Veredicto general

Los 19 informes son de alta calidad, con rutas archivo:línea reales y una tesis correcta y consistente
("la fundación de tokens ya está en mobile; el gap real es fidelidad de pantalla + funcional + entitlements").
La cobertura por dominio es sólida. PERO hay **agujeros de cobertura de pantallas**, **prerequisitos
duplicados sin dueño único**, **conflictos de límites de paquetes entre dominios**, y **tres riesgos
sistémicos que el brief pidió explícitamente y que NINGÚN informe aborda** (testing/QA por etapa,
estrategia de releases + coexistencia app vieja/nueva, y política de upgrade Expo/EAS durante la migración).
Sin resolver esos, el arquitecto tendría ángulos muertos.

---

## 1. PANTALLAS/RUTAS WEB SIN DUEÑO EN NINGÚN DOMINIO (agujeros de cobertura)

Crucé las 63+ rutas reales de `apps/web/src/app/{coach,c/[coach_slug],(auth)}` contra el scope declarado de
G01-G11. Estas quedaron **sin dominio asignado** o solo mencionadas de pasada:

1. **`coach/onboarding` + `coach/onboarding/complete` — SIN DUEÑO.** Es el flujo de onboarding post-registro
   del COACH (`CompleteOnboardingForm`: nombre, etc.). Mobile NO lo tiene (registra coach free en
   `register.tsx` y salta directo al dashboard). G06 menciona `CoachOnboardingChecklist` (embebido en el
   dashboard, otra cosa) pero nadie posee el flujo `/coach/onboarding/complete`. **Decidir:** ¿se porta a RN
   o el registro mobile ya cubre el intake mínimo? No está en ningún gap.

2. **`coach/reactivate` — SIN DUEÑO (money-adjacent).** Pantalla de reactivación para coach pausado/cancelado
   (`ReactivateClient`, tier/status, cupón-aware `COUPON_REDEMPTION_ENABLED`, `recentlyCancelledAddons`). G09
   menciona la *tab* "Reactivar" en el nav registry (T15) pero **nadie posee la pantalla ni su gate**. Como la
   reactivación termina en checkout (web-only), el patrón RN sería link-out — pero eso hay que DECIDIRLO y
   nadie lo hizo. Mobile no tiene equivalente ni tab de reactivación (los gates de acceso mobile no
   contemplan estado `cancelled` del coach).

3. **`coach/tools` (hub "Herramientas") — SIN DUEÑO REAL.** Es el LAUNCHER donde el coach USA los módulos que
   compró (cardio/movement/bodycomp) con picker de alumno para Composición — distinto del catálogo de COMPRA
   (`settings/modules`, que sí posee G10 V9). G06 solo menciona `toolsEnabled` como gate y G10 posee las
   pantallas de módulo, pero **el hub `/coach/tools` (`ToolsHub`) — la puerta de entrada a los módulos desde
   el rail — no lo construye nadie**. Es el punto de navegación que conecta ficha/directorio con las
   pantallas de G10. Gap de navegación.

4. **`(auth)/verify-email` — SIN DUEÑO.** Pantalla de verificación de email. No aparece en G02 (que se limita
   explícitamente a alumno) ni en ningún otro. Mobile no la tiene. Menor pero es un estado de auth real.

5. **AUTH DEL COACH — cobertura ambigua.** G02 posee "Alumno · Auth + chrome" y **excluye explícitamente el
   coach**. Pero el grupo `(auth)` de mobile es COMPARTIDO: `login.tsx` (role=coach|alumno), `register.tsx`
   (coach free), `forgot`/`reset`. **¿Quién re-skinea el login coach, el register coach (delta §4.2 radio-cards
   "Tu plan"), y el Google Sign-In coach (G11 B1)?** G11 posee el Google nativo funcional, pero el RE-SKIN
   visual de register/login del coach no tiene dominio. Seam de cobertura entre G02 (alumno) y "coach auth"
   (huérfano).

6. **`coach/settings/preview` / `coach/brand-preview` (mobile)** — G09 lo menciona al pasar (T2 preserva
   preview); OK-ish, cubierto flojo.

7. **`workspace/select` (página dedicada web)** — G09 posee el switcher como bottom-sheet (T13) pero la web
   también tiene una PÁGINA `/workspace/select` (usada por el avatar del topbar desktop). En RN probablemente
   se resuelve solo con el sheet; conviene que el arquitecto lo declare, no queda claro.

8. **`coach/templates`** = redirect a `workout-programs` (verificado, legacy). No requiere port, pero ningún
   informe lo lista como "redirect a ignorar" (G07 posee workout-programs pero no nota el alias).

**Correctamente fuera de scope (verificado, no son agujeros):** `admin/*`, `org/*`, `enterprise/*`
(enterprise diferido), `pricing`/`legal`/`privacidad` (público web), `t/*` `e/*` (fachadas del árbol alumno
por rewrite), `join/*` (kill /join, G02 §2.9 lo confirma), landing v2 (01 §1.7).

---

## 2. RIESGOS SISTÉMICOS QUE EL BRIEF PIDIÓ Y NINGÚN INFORME ABORDA

El brief pidió explícitamente buscar: "upgrade Expo/EAS, testing/QA por etapa, estrategia de releases durante
la migración, coexistencia app vieja/nueva". Estado real:

### 2.1 Testing / QA por etapa — AUSENTE (blind spot mayor)
Ningún informe (ni recon ni gaps) define una estrategia de QA por ola. Lo máximo es el recordatorio de
CODEX_HANDOFF (`tsc --noEmit` + `expo export --platform android`) citado en doc 08. **No hay:** matriz de
dispositivos (iOS/Android, tamaños), estrategia de E2E (Detox/Maestro), regresión visual (el proyecto ES un
re-skin — un snapshot/visual-diff sería lo natural y nadie lo menciona), plan de smoke por pantalla migrada,
ni gate de "no mergear sin QA en device real". Para un re-skin de ~40 pantallas esto es crítico. El arquitecto
debe inventarlo de cero.

### 2.2 Estrategia de releases + coexistencia app vieja/nueva — AUSENTE
La migración es de meses y patrón A/B conviven HOY (doc 06 §0: ~50% pantallas en patrón B). Ningún informe
plantea: (a) cómo se envía incrementalmente sin exponer a usuarios una app mitad-vieja mitad-nueva; (b)
feature flags para ocultar pantallas nuevas incompletas; (c) si se hace por trunk o rama/worktree largo (el
repo está en `feat/pagos-flow-mercadopago`, worktree `rnmobiledenuevo` — no hay decisión de rama para el
trabajo RN); (d) si se congela la app en stores durante la migración o se libera por olas. G11 solo toca
OTA/`expo-updates` (D1, hook de foreground, P3) y `runtimeVersion: appVersion`. Doc 08 §9 dice "el usuario
hace commits/builds" pero no hay política de release. **Blind spot que el brief nombró textualmente.**

### 2.3 Upgrade Expo / EAS durante la migración — NO TRATADO
Verificado: `expo ~54.0.33`, `expo-router ~6.0.23`, RN 0.81.5, NativeWind 4.2.4, React 19.1, Reanimated
4.1.1, Skia 2.2.12 (coincide con doc 06). Todos los informes tratan SDK 54 como FIJO. Nadie discute: (a) si
conviene subir de SDK durante la migración (doc 08 nota que los widgets home/lock de `native-advantages`
"requieren subir a SDK 56"); (b) que cada lib nativa nueva del plan (Google Sign-In, `react-native-view-shot`
para share-cards, posiblemente notifee/`@sentry/react-native`) **fuerza build EAS nuevo, no OTA** (G11 A/B lo
nota puntualmente pero no lo consolida como riesgo de fragmentación de versiones en campo); (c) política de
versión de EAS CLI. **El brief nombró "upgrade Expo, EAS" — merece una sección de decisión que no existe.**

### 2.4 Trabajo en `apps/web` requerido — regla "solo apps/mobile" en conflicto, sin consolidar
Varios dominios requieren TOCAR `apps/web` (nuevos endpoints `/api/mobile/*` y extracción de lógica a
`packages/`): G04 (notas/shopping/off-plan/micros/recap NO tienen endpoint mobile — hay que crearlos), G09/T4
(bridge de `subscription-status`), G06/B10 (forma de `dashboard` V2), y TODA la extracción de paquetes (§4).
CODEX_HANDOFF (doc 08 §11) tiene la regla "solo `apps/mobile` salvo `.well-known`". **Ningún informe consolida
que esa regla DEBE relajarse** para este proyecto, ni entrega la lista maestra de trabajo web-side. Riesgo:
el plan asume mobile-only y choca con la necesidad de endpoints/paquetes en web.

### 2.5 Refactor de `apps/web` por extracción de paquetes — riesgo acumulado sin gate
Las tareas SEAM mueven fuera de `apps/web` a `packages/`: `domain/cardio`, `domain/bodycomp`,
`workout-block-grouping`, `workout-areas`, `builderReducer`, `session-logs.reconcile/optimistic`,
`reconcileMeals`, `profile-analytics`, `nutrition-engine` (ya hecho). Eso toca decenas de imports en web y
**debe dejar web verde (typecheck+tests) tras cada extracción**. Ningún informe declara un gate "verificar web
tras cada seam". G03 B0 dice "verificar pureza primero"; insuficiente. El riesgo de romper prod web mientras
se extrae para mobile no está consolidado ni asignado.

---

## 3. PREREQUISITO DUPLICADO SIN DUEÑO ÚNICO: entitlements / paquetes @eva

**Nueve dominios** (G03,G04,G05,G06,G07,G08,G09,G10,G11) declaran como prerequisito "adoptar
`@eva/feature-prefs` + `@eva/module-catalog`, leer `enabled_modules`, respetar gate server-side". Cada uno
propone su propia tarea:
- G10 F1/T4 "capa de entitlements", G11 A4 "cliente de entitlements + `useEntitlements()`", G09 T8, G05 T8,
  G06 B2, G04 B3, G08 C1, G07 (dependencia externa), G03 B8.

Es **UN cimiento transversal escrito 9 veces**. Si no se unifica en una sola tarea de Ola 0 con un dueño,
habrá 9 implementaciones divergentes del mismo gate (justo el anti-patrón que causó el drift de
`macro-calculator`/`nutrition-utils`). Los informes dicen "coordinar" pero nadie es dueño. **El arquitecto
debe crear UNA tarea foundation de entitlements (hook + fetch + kill-switch vía `/api/mobile/config`) y que
todos los dominios dependan de ella, no la reimplementen.**

---

## 4. CONFLICTO DE LÍMITES DE PAQUETES ENTRE DOMINIOS (contradicción real)

Distintos gaps proponen extraer la MISMA lógica pura a paquetes DISTINTOS, sin coordinarse:

- **`workout-block-grouping` + `workout-areas`**: G03 B0 los mete en `@eva/workout-engine`; G07 B1 los mete en
  `@eva/plan-builder` (junto al `builderReducer`). **Colisión: ¿en qué paquete viven?** Los usa tanto el
  ejecutor (alumno) como el builder (coach).
- **`domain/cardio`**: G10 T1 lo extrae a `@eva/cardio`; G07 B1 lo co-extrae con `@eva/plan-builder`; G03 B8
  lo necesita para HR zones. Tres dueños distintos del mismo domain.
- **`domain/bodycomp`**: G10 T2 → `@eva/bodycomp`; G05/G06 lo necesitan para vistas de composición. OK si G10
  es el dueño, pero nadie lo declara autoritativo.
- **`reconcileMeals`**: G08 B2 lo mueve a `@eva/nutrition-engine` o `@eva/nutrition-sync` (indeciso).
- **`session-logs.reconcile`**: G03 B0 lo mete en `@eva/workout-engine`; G11 C1 lo quiere para la cola offline
  genérica. Dos consumidores, un paquete a definir.
- **`profile-analytics`**: G06 B1 → `packages/profile-analytics`; requiere leer 3 archivos web fuente antes de
  fijar firma (logs anidados vs planos) — nadie lo hizo aún.

**No existe un mapa único de extracción de paquetes.** El arquitecto DEBE definir de antemano el conjunto
canónico de paquetes nuevos (`@eva/workout-engine`, `@eva/plan-builder`, `@eva/cardio`, `@eva/bodycomp`,
`@eva/profile-analytics`, y qué va en cada uno) y el ORDEN de extracción, o los dominios pisarán los límites
entre sí. Este es el conflicto más concreto entre informes.

---

## 5. CONTRADICCIONES Y DECISIONES SIN RESOLVER ENTRE INFORMES

1. **`surface-inverse` dark (token)**: recon 02 y G01 §1.1 marcan mismatch (web `#2A323D` neutro vs mobile
   `#16273C` brand-tinted). G01 pide "ruling del arquitecto" (¿el tinte de marca del hero es intencional o
   bug?). Sin resolver — no es contradicción entre informes sino **decisión pendiente** que bloquea el fix de
   tokens. Igual con `surface-inverse-2` y `text-muted` dark.

2. **Gate de creación de ejercicios (G07 §2.7)**: web = por WORKSPACE (team member sí, enterprise coach no);
   mobile = por TIER (free no). **Divergencia REAL de regla de negocio** que G07 D3 marca "validar con CEO".
   Ningún otro informe la cruza. Un coach free-en-team puede crear en web pero no en mobile, y viceversa.
   Requiere decisión de producto ANTES de codear.

3. **Tabs de ficha del alumno (G06 §1.3)**: web 5 tabs (Facturación REMOVIDA del chrome); mobile 6 (mantiene
   "Pagos" + nombres "Análisis"/"Plan" vs web "Entreno"/"Programa"). G06 A7 lo marca "decisión de producto".
   Sin resolver.

4. **Ubicación de HabitsTracker (G04 §1.2)**: mobile lo mete en Nutrición; web en Dashboard. G03 (dashboard) y
   G04 (nutrición) ambos lo tocan. **Cruce de dominios sin dueño de la decisión** — ¿dónde viven los hábitos?

5. **Check-in fotos (G05 §2.1 vs G08 §2.7)**: G05 dice que el upload directo del alumno mobile es VÁLIDO (sin
   WAF/Vercel en el medio) → excepción intencional. G08 §2.7 dice que el coach mobile solo firma/muestra
   front+back y **pierde la foto lateral (side)**. No se contradicen (lados distintos), pero juntos revelan que
   el modelo de 3 fotos (front/side/back) no está parejo entre captura (alumno) y vista (coach) — coordinar.

6. **"Aprender" coach (delta 01 §3.8, commit `0cf292da` "Aprender optimizado")**: no hay ruta `coach/aprender`
   en el árbol; el delta lo lista como cambio pero ningún gap lo ubica. Probablemente es contenido de
   onboarding/dashboard. Ambigüedad menor sin dueño.

---

## 6. DOMINIOS CON ESFUERZO SOSPECHOSAMENTE BAJO / SUB-ESCOPADOS

- **G02 (alumno auth+chrome) — la cápsula flotante marcada S es sub-estimada.** A1 (reescribir
  `AlumnoMobileChrome` a cápsula flotante con píldora deslizante spring + tokens) está en S, pero ES EL PATRÓN
  DE NAV CENTRAL de toda la app alumno (hide-on-scroll A2, sheet rico A3). En conjunto es M-L, no 3×S. Y es
  dependencia visual de todo el árbol alumno.

- **G09 (hub Opciones + Team + Módulos + Funciones + Áreas + switcher + news + suscripción rica) —
  SOBRECARGADO, no sub-estimado, pero mal proporcionado.** Es el dominio con MÁS pantallas net-new (7 pantallas
  que "NO EXISTEN en mobile" + display rico de suscripción + contexto de workspace que es "bloqueante"). Sus
  tareas son mayormente M con 2 L. Construir 7 pantallas desde cero + resolver el contexto de workspace
  (que G09 §2.1 llama "BLOQUEANTE de casi todo el dominio" y puede tocar JWT/RLS) es plausiblemente el dominio
  coach más pesado y debería SPLITEARSE (p.ej. "settings/marca" vs "team/workspace" vs "módulos/funciones").

- **G03 dashboard alumno bundleado con workout (Ola C, S/M) — sub-cubierto.** El dashboard alumno son 13
  secciones (recon 03 §4) y G03 lo trata como apéndice del ejecutor. El re-skin del dashboard (cápsula, días
  pendientes, weight quick-log, PR detail sheet, macro bars, momentum) probablemente merece su propio bloque,
  no 4 tareas S/M al final de G03.

- **G01 "purga Inter/Montserrat" (D.1, L incremental) — riesgo de subestimación.** 408 usos en 69 archivos;
  marcado L incremental pero toca CADA pantalla y la trampa `font-semibold→Inter` (G01 §1.2) puede resembrar
  Inter durante el re-skin si F0.3 no va PRIMERO. Es más "gate de orden" que "tarea L".

- **G07/G06 re-skins de archivos gigantes (clientes.tsx 1224L, program-builder.tsx 1234L, builder.tsx
  1279L) marcados L** — plausible, pero en G07 el program-builder además necesita RECONSTRUCCIÓN funcional
  (áreas dinámicas + polimórfico, Ola C), no solo re-skin; el riesgo es que "L visual" oculte que la pantalla
  se toca dos veces (re-skin legacy + reconstrucción) con round-trip destructivo entre medio (G07 riesgo
  crítico). Bien flagged por G07 pero el arquitecto no debe leer "L" como el costo total.

---

## 7. DELTA POST-21-JUN: features con dueño flojo o sin confirmar

El delta (recon 01) está bien repartido en general, pero:
- **Búsqueda global del topbar coach** (01 §3.2, `/api/coach/search`): G06 B8 la menciona junto con
  switcher+news, pero como paquete es M para 3 features distintas. La búsqueda global (command palette) también
  es primitiva faltante (G01 §2.3 F1.6). Dueño difuso entre G06, G09 y G01.
- **Share-cards v2 branded** (01 §2.4/§3.5): aparecen en G03 (workout summary/dashboard B10), G05 (perfil B13)
  y G06 (ficha). Tres dominios reimplementan el mismo motor canvas nativo (`view-shot`/Skia). Riesgo de
  triplicar. Nadie declara un componente `ShareCard` compartido RN.
- **Glow de marca full-bleed / `GlowBorderCard` / `AmbientBrandGlow`** (01 §1.4): G01 (F1.5), G06 (hero A4),
  G09 (Mi Marca T16) lo piden. Es una primitiva de fundación (G01 P2) de la que dependen 3 dominios; si no se
  hace en fundación, cada uno lo aproxima distinto.
- **Badging nativo** (01 §1.6): G05 §2.2 y G11 B2 ambos lo piden (perfil/check-in vs infra). Coordinar (uno
  solo debe cablear `setBadgeCountAsync`).
- **Login alumno brandeado** (01 §2.8): bien en G02 (A4+B1), pero DEPENDE de ampliar `branding.ts` con GRANT a
  `anon` (G02 riesgo) — prerequisito DB que puede requerir migración; nadie confirmó los grants aún.

---

## 8. COORDINACIÓN CRUZADA no consolidada (seams entre dominios)

El arquitecto debe resolver estos cruces que los gaps mencionan por separado pero nadie orquesta:
- **Preferencia de sonido de descanso**: se define en Perfil (G05 §2.5) y se consume en el ejecutor (G03). Dos
  dominios, una key (`restTimerSound`).
- **CheckInBanner + umbrales (3/7 días)**: vive en dashboard (G03) pero el check-in P0 (G05 §2.2) y el badge
  dependen de él.
- **HR zones cardio**: cálculo en G10 (`@eva/cardio`), consumo en el ejecutor de rutina (G03 B8) — no
  duplicar `hrRangeForZone`.
- **Entitlements**: §3 arriba — el cruce maestro.
- **Contexto de workspace/team**: G09 §2.1 lo declara bloqueante para settings/team/suscripción; G06 (switcher)
  y G02 (suspended team-aware B5) también lo necesitan. Un solo `getWorkspaceContext` mobile debe servir a
  todos.

---

## 9. OTROS HUECOS PUNTUALES DIGNOS DE NOTA

- **SDD no iniciado**: `specs/rn-mobile-parity-redesign/` solo tiene `research/`. No hay `SPEC.md`/`PLAN.md`/
  `TASKS.md` (CLAUDE.md exige SPEC antes de código). Es trabajo del arquitecto, pero conviene notar que el
  esqueleto SDD aún no existe.
- **Data-loss ACTIVO en prod mobile (G08 §2.2)**: `saveClientPlan`/`propagateTemplate` borran comidas con logs
  (cascade) — NO es solo gap de paridad, es un BUG vivo hoy en la app RN. Debería priorizarse aunque no sea
  "visual". Igual el drift de `macro-calculator` (G08/G10 F7) devuelve macros distintos coach-vs-app HOY.
- **Bug heredable de empty-state 0 alumnos (G10 F9)**: `/coach/cardio` y `/coach/movement` web crashean con 0
  alumnos (memoria confirmada). Solo G10 lo nota; cualquier dominio que transcriba listas de alumnos (G06
  directorio, G08 board) debe construir empty-states, no copiar el crash.
- **RLS del bucket `checkins` y de tablas bodycomp/movement**: G05/G10 piden CONFIRMAR que la RLS aísla por
  `client_id` antes de servir lecturas por PostgREST directo. Es una verificación DB pendiente (no hecha en
  lectura), prerequisito de seguridad para vistas read-only del alumno.
- **`assetlinks.json` con `PLACEHOLDER_SHA256` + iOS sin `associatedDomains` (G11 §1.5)**: los deep/universal
  links NO funcionan en prod HOY. P0 de infra que no es "visual" pero rompe el flujo `/c/`/`/invite/`.
- **Tabla `checkins` vs `check_ins` (G08 riesgo, recon 06 §C)**: dos nombres tocados en mobile; posible fuente
  de filas faltantes en check-ins coach. Verificar.
- **Endpoints mobile SIN backend (G04)**: notas/shopping/off-plan/micros/recap NO tienen `/api/mobile/*` — sus
  queries web son server-only. Es trabajo WEB nuevo, no solo cliente RN. Cuello de botella de la ola de
  nutrición.

---

## 10. QUÉ NECESITA EL ARQUITECTO ANTES DE ESCRIBIR EL MEGA-PLAN (checklist accionable)

1. **Asignar dueño a las pantallas huérfanas** (§1): coach onboarding/complete, reactivate, tools-hub,
   verify-email, y el re-skin de auth COACH (login/register/Google). Decidir port vs excepción para reactivate.
2. **Crear UNA tarea foundation de entitlements** (§3) de la que dependan los 9 dominios — no 9 copias.
3. **Definir el mapa canónico de paquetes nuevos y su orden de extracción** (§4): resolver dónde viven
   `workout-block-grouping`/`workout-areas`/`domain/cardio`/`reconcile`/`profile-analytics`.
4. **Escribir la estrategia de QA por etapa** (§2.1): device matrix, E2E, regresión visual, gate de merge.
5. **Escribir la estrategia de release + coexistencia A/B** (§2.2): feature flags, incrementalidad, rama, OTA
   vs build, congelar stores o liberar por olas.
6. **Decidir política Expo/EAS** (§2.3): congelar SDK 54 o subir; presupuestar que cada lib nativa fuerza
   build EAS; versión de EAS CLI.
7. **Consolidar el trabajo requerido en `apps/web`** (§2.4/§2.5): lista de endpoints `/api/mobile/*` nuevos +
   extracciones de paquete + gate de "web verde tras cada seam". Relajar formalmente la regla "solo mobile".
8. **Resolver las decisiones de producto pendientes** (§5): gate de ejercicios (workspace vs tier), tabs de
   ficha (5 vs 6), tokens dark (surface-inverse), ubicación de hábitos.
9. **Priorizar los bugs vivos** (§9): data-loss de nutrición (G08 §2.2), drift de macros, deep links rotos —
   no son "visual" pero son daño activo.
10. **Confirmar prerequisitos DB** antes de codear: GRANT a `anon` de branding (login alumno), GRANT UPDATE de
    columnas nuevas (biometría/sexo/sustitución), RLS de buckets y tablas de módulos.

---

## 11. Limitaciones de esta auditoría
- Solo lectura. No corrí typecheck/tests/build.
- Leí los 19 informes completos + crucé contra el árbol real de rutas (`find`), `package.json` mobile, y
  spot-check de pages web (onboarding/complete, reactivate, tools, templates). No abrí el interior de cada
  pantalla mobile ni verifiqué línea a línea las afirmaciones de cada gap (confié en su verificación, que fue
  consistente donde crucé).
- No verifiqué en runtime los GRANTs de columna ni las policies RLS que varios gaps marcan "por confirmar" —
  quedan como prerequisitos abiertos para el arquitecto.
