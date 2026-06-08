# Coach RN Mobile — Revisión de Readiness Multidisciplinaria

_2026-06-06 · `apps/mobile` (coach standalone + enterprise) vs `apps/web` · Producido con 2 auditorías multi-agente (ingeniería + 14 roles), cada hallazgo verificado adversarialmente contra el código actual._

> **Cómo leer este doc:** primero el veredicto y los bloqueantes consolidados (lo accionable). Luego las causas raíz (por qué muchos "bugs" son el mismo problema). Después el roadmap por olas. Al final, el detalle por disciplina (14 roles) con evidencia `archivo:linea`.
> **Severidad:** P0 = bloquea lanzamiento/venta · P1 = alto (arreglar antes de escalar) · P2 = medio · P3 = nice-to-have. **Esfuerzo:** S < 0.5d · M ~1-3d · L ~1-2sem · XL > 2sem.

---

## 1. Veredicto ejecutivo (honesto)

El coach mobile **standalone** es un producto sorprendentemente maduro: dashboard, builder de programas (reducer 1:1 con web), alumnos, nutrición y onboarding con "aha-moment" están sólidos, y en varias áreas (CRUD de ejercicios, scope/limit de alimentos) **supera a la web**. En el camino feliz online, funciona y se ve premium.

**Pero NO está listo para lanzar/vender en serio**, por tres frentes:

1. **Release roto / a ciegas:** el build de producción puede salir con auth muerta (env no inyectado), sin crash-reporting ni ErrorBoundary (un throw = pantalla blanca invisible), sin CI mobile ni rollback OTA. Hoy no podemos afirmar "este APK pega a esta DB" desde git.
2. **Enterprise inexistente en mobile:** un coach de gimnasio no puede unirse a su org (sin canje de invite), no hay workspace switch, y el dueño/admin no tiene ninguna superficie mobile. **El diferenciador B2B se cae en vivo en una demo.**
3. **Compliance frágil (Ley 21.719):** consentimiento de edad "teatral" (`ageConfirmed:true` hardcodeado), términos/privacidad sin links, derechos ARCOP por mailto, push que ignora la oposición del usuario, datos de salud sin política de retención. Se cumple la apariencia, no la sustancia.

**Go/No-Go por segmento:**
- **Coach standalone B2C (self-serve/trial):** 🟡 condicional — lanzable tras cerrar los P0 de release + biometría + deep-link + confirmación de email.
- **Enterprise B2B (gimnasios/academias):** 🔴 No-Go — el flujo coach-enterprise no existe en mobile. No demostrar ni prometer hasta construirlo.
- **Compliance:** 🔴 condicional — cerrar P0 legales antes de procesar datos de menores a escala.

---

## 2. Bloqueantes de lanzamiento (P0 consolidados)

> Deduplicados entre disciplinas. La columna "Roles" muestra quién lo marcó como bloqueante.

| # | Bloqueante | Evidencia | Fix | Esf. | Roles |
|---|-----------|-----------|-----|------|-------|
| **P0-1** | **Build de prod sin env Supabase → auth muerta.** `eas.json` solo inyecta `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` en `staging` (y apunta a IP LAN `10.93.54.116`); `production`/`prodpreview` no. `supabase.ts` usa non-null assertions → `createClient(undefined!)` sin error de compilación. `EXPO_PUBLIC_EAS_PROJECT_ID` también falta. | `eas.json`, `lib/supabase.ts:5-7`, `mobile-build.yml` | Verificar/crear EAS secrets de prod **YA**. Migrar a `app.config.ts` con `extra` + assert al boot (throw legible, no `!`). Smoke-test en device limpio fuera de la VPN como gate de release. | M | Architect, Mobile, DevOps, QA, Security, PM, Sales, SDR |
| **P0-2** | **Sin ErrorBoundary ni crash-reporting.** 0 matches de Sentry/Crashlytics/ErrorBoundary en `apps/mobile`. Un throw en cualquier tab = pantalla blanca sin telemetría. Amplifica todos los demás bugs. | grep = 0 | `app/+error.tsx` (Expo Router) + `@sentry/react-native` con source maps en EAS + `ErrorUtils.setGlobalHandler`. | M | Mobile, DevOps, QA |
| **P0-3** | **Loader infinito ante fallo de red.** `load()` de clientes/nutrición/settings hace `await` sin try/catch + `getCoachProfile()` sin try/catch → `setLoading(false)` nunca corre → spinner permanente, sin pull-to-refresh (la lista no se renderiza). *(home.tsx ya está mitigado, pero su error-state es callejón sin retry.)* | `clientes.tsx:692`, `nutricion.tsx:47`, `settings.tsx:96`, `lib/coach.ts:26` | Hook de carga con estados `{loading\|error\|empty\|data}` + componente `ErrorState` con retry reutilizable. | M | Mobile, QA, PM, UX, SDR, CSM |
| **P0-4** | **Biometría escribe a la tabla equivocada.** `OverviewTab` guarda `height_cm/initial_weight_kg` en `clients`, donde NO existen (viven en `client_intake`; `initial_weight_kg` no existe en ninguna). `updateCoachClient` hace UPDATE directo sin fallback → **Error siempre** + IMC/altura/peso inicial en "—". | `OverviewTab.tsx:254`, `coach-client-detail.ts:802`, `database.types.ts` (client_intake) | Leer/escribir `client_intake` (upsert por `client_id`) como web; reusar `UpdateClientDataSchema` de `@eva/schemas`. Endpoint PATCH si RLS lo exige. | M | Backend, Frontend, PM, SDR, Legal |
| **P0-5** | **Push roto en device.** `getExpoPushTokenAsync({ projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID })` con esa var **undefined** → lanza en cada login en device real (unhandled rejection); el coach nunca recibe push. | `lib/push.ts:28`, `_layout.tsx:105` | Leer `Constants.expoConfig?.extra?.eas?.projectId`; try/catch y bailar limpio si falta. | S | Mobile |
| **P0-6** | **Reset de contraseña por email roto en device.** `forgot-password` manda `redirectTo:'eva://reset-password'` pero el handler solo parsea tokens en el **hash** y nunca canjea `?code=` (PKCE). El link del email abre la app y la pantalla de reset nunca recibe sesión. | `forgot-password.tsx:30`, `_layout.tsx:43`, `app.json` (scheme/intentFilter) | Unificar flujo: parsear `?code` + `exchangeCodeForSession`, una sola URL de recovery (universal link o `eva://`), alinear `app.json` + `redirectTo`. Probar en iOS/Android real. | M | Mobile |
| **P0-7** | **Enterprise coach inusable (bloquea venta B2B).** Sin pantalla de canje de invite-code (unirse a org) y sin workspace switch — pese a que `AGENTS.md` lo exige. `getCoachProfile` null → un coach enterprise recién invitado cae a `/alumno/home`. El dueño/admin no tiene NADA mobile. | `app/index.tsx:34`, `lib/org.ts:10-27`, `login.tsx` | Fase 1 (M): rutear por `org_role` del JWT, no solo por fila `coaches`. Fase 2 (L): pantalla "Unirse con código" (reusar `EnterpriseCoachLoginSchema` + endpoint web). Fase 3 (L): selector de workspace. | L–XL | Architect, Frontend, PM, Sales, SDR, Fintech |
| **P0-8** | **Consentimiento inválido (Ley 21.719).** Alta individual manda `ageConfirmed:true` **hardcodeado** sin checkbox; el import envía `true` literal ignorando el toggle real. Términos/privacidad: checkbox sin links accesibles. No hay registro probatorio de consentimiento — y se crean cuentas de terceros (alumnos, posibles menores) con datos de salud. | `clientes.tsx:541,1136`, `register.tsx:150` | Checkbox real de edad/tutor en ambos flujos; enviar el valor REAL; persistir registro de consentimiento (timestamp, versión, coach). Links tappables a términos/privacidad + versión aceptada. | M | Legal, PM |

**Lectura cruda:** P0-1/2/3/5/6 son **absolutos** (la app no arranca o se rompe sin señal). P0-4 destruye confianza en demo/uso. P0-7 bloquea el segmento de mayor ticket. P0-8 es exposición regulatoria con datos de menores.

---

## 3. Alto (P1) — antes de escalar

**Seguridad / Release**
- **ATS/cleartext en producción:** `NSAllowsArbitraryLoads:true` (iOS) + `usesCleartextTraffic` global (Android) horneados en el binario de prod → MITM de datos de salud + fricción en review de stores. Gatear por `APP_ENV`. (`app.json`, `plugins/with-android-cleartext.js`) — Security, DevOps, Mobile.
- **`apiFetch` sin manejo de 401** → sesión zombi; con riesgo extra de **pago duplicado** (sin idempotencia) que infla el MRR. Refresh+retry o signOut. (`lib/api.ts:42`) — Backend, Mobile, Security, DevOps, CSM, Fintech.
- **Push token no se revoca al logout/toggle off** → el device sigue recibiendo push de la cuenta anterior (fuga de datos + viola derecho de oposición). (`lib/push.ts`, sin DELETE) — Security, Mobile, Legal, CSM, UX.
- **Login sin gate de rol/estado:** rutea por query param `role`, no valida que sea coach ni bloquea alumno suspendido/archivado/force-password-change. (`login.tsx:52-61`) — Backend, Security, QA, Mobile.
- **Credenciales débiles:** `reset-password` emite temp de **6 dígitos numéricos** (keyspace 1M, brute-forceable) sobre cuentas con datos de salud; `.p12` de firma iOS con password `1234567890` en `Downloads`; `eas.json` versionado con anon key + IP LAN. — Backend, Security, DevOps.
- **Sin rate-limit en `/api/mobile/coach/*`** (service-role, bypass RLS) salvo signup. — DevOps, Security.
- **Sin CI mobile** (typecheck/lint/expo-export solo corren sobre web) ni tests (0 archivos) → cada refactor es ruleta rusa. — DevOps, QA.
- **Sin rollback OTA / feature flags** → ante bug crítico en prod, única vía es re-submit (días). — DevOps.
- **Tokens/PII en `AsyncStorage` sin cifrar** (no SecureStore/Keychain) + logout no limpia caches → datos de salud legibles en device robado/compartido. — Security, Legal.

**Datos / Backend**
- **Doble fuente de verdad del attention-score:** lista (cálculo local ad-hoc) vs pulse (server) usan flags y pesos distintos → el mismo alumno sale "urgente" en la lista y "on track" en su ficha; el filtro `nutrition_low` busca un flag que el cálculo local nunca produce. (`clients-directory.ts:168`) — Backend.
- **`selectWithFallback` puede degradar el aislamiento cross-org a solo-RLS** por match de substring de error ("does not exist"). Restringir a códigos PG exactos; fallar cerrado. (`db-compat.ts`) — Security, Backend.

**Producto / Negocio**
- **Suscripción solo-lectura pierde revenue de expansión:** correcto NO meter checkout in-app (comisión stores), pero falta **upsell contextual al 90% de uso**, precios CLP visibles, y deep-link al checkout con el coach ya identificado (sin re-login). Upgrade/reactivación **sí** deberían iniciarse desde mobile (MercadoPago `init_point` es URL web). — PM, Fintech, CSM, UX.
- **Cobranza coach→alumno incompleta:** sin adjuntar comprobante, sin estado "pendiente", sin marcar morosidad (el endpoint fuerza `status:'paid'`). — Fintech.
- **`mp-reconcile` detecta drift MP↔DB pero no corrige ni avisa al coach** → revenue leakage (acceso gratis tras fallo de cobro). — Fintech.
- **Intake del alumno no editable** (objetivo/experiencia/lesiones/condiciones) → el coach no puede personalizar, que es el core. — Backend, Frontend, PM.
- **Soporte = mailto genérico** (sin form tipado, sin adjuntos, sin rate-limit, falla en silencio si no hay cliente de correo en Android) vs web con form+Zod+Resend. — CSM, Sales, SDR, Backend.
- **Sin red de retención:** sin save-flow de cancelación, sin health-score/alertas de churn del coach, sin NPS. — CSM.
- **Gate de confirmación de email corta el trial self-serve** justo entre alta y primer uso. — SDR.
- **Sin datos de demo sembrados** → el coach nuevo entra a un panel vacío; el "wow" (rings, heatmap, triage) no se puede mostrar. — SDR.

**UX / Compliance**
- **Error de red disfrazado de "Alumno no encontrado"** → pánico ("¿se borró mi alumno?"), sin retry. (`cliente/[clientId].tsx:75`) — UX.
- **Accesibilidad casi nula:** touchables icon-only sin `accessibilityLabel`; `Button` sin `accessibilityRole`. Riesgo en licitaciones/stores. — UX.
- **ARCOP por mailto** (sin acuse, sin autenticar al titular, sin plazo) + **datos de salud sin política de retención** (fotos de menores) + **FAQ afirma "Cumplimos Ley 21.719"** (riesgo de publicidad engañosa hasta cerrar los gaps). — Legal.

---

## 4. Medio / bajo (P2–P3) — backlog

Deuda estructural y polish (detalle por rol en §7):
- **Compartir lógica vía `packages/`:** adoptar `@eva/schemas`/`@eva/types` (hoy 6 imports, 66 interfaces a mano); mover `plan-builder/reducer`, tier-config, attention-score, isPaidStatus/MRR, brandScore, greeting a paquetes puros. Mata clases enteras de drift.
- **Capa de datos en mobile:** 103 `supabase.from` directos (incluso en componentes) violan los 4 pilares de `CLAUDE.md`; sin punto central para error/401.
- **Estrategia `db-compat`:** decidir un solo schema por APK; separar "columna no existe" (bug/migración) de "feature no disponible".
- **Paridad de nutrición:** historial/ciclos/plantillas/duplicar/swaps/macros-consumidos-hoy.
- **Polish:** skeletons (Skeleton existe pero es código muerto), FlashList en clientes/check-ins, i18n/LanguageContext, saludo por hora, defaults de bloque, redondeo de macros, chip de filtro con enum crudo, copy de errores de auth en inglés, doble email de contacto (soporte@/contacto@).
- **Org-admin mobile** (billing `org_invoices`, roster de coaches) — al menos lectura.
- **DPA coach↔EVA**, subprocesadores/transferencia internacional declarados, validación de URL de media (allowlist), branding de deep-link sin validar (spoofing).
- **Force-update / minimum-version gate**, changelog in-app, prompt de reseña atado a momento de valor.

---

## 5. Causas raíz (por qué muchos "bugs" son el mismo problema)

El Software Architect lo resume: **arreglar los síntomas uno por uno deja la fábrica de bugs intacta.** Hay 6 causas raíz que explican ~80% de los hallazgos:

1. **Contratos no compartidos.** `@eva/schemas`/`@eva/types` existen y están en `tsconfig` pero mobile casi no los usa (re-declara 66 interfaces, re-valida a mano). → biometría a tabla equivocada, password 6-vs-8, brandScore divergente, tier-config duplicado (riesgo de revenue), attention-score doble, MRR con set de strings distinto.
2. **Sin capa de datos ni manejo central de error/sesión.** 103 accesos directos a Supabase + 2 data-planes (supabase + apiFetch) sin política única. → loader infinito, sesión zombi (401), imposible inyectar try/catch en un solo lugar.
3. **Entorno de build no reproducible.** El env de prod vive solo en el dashboard EAS; `staging` apunta a IP LAN; non-null assertions ocultan el faltante. → auth muerta en prod, ATS/cleartext, secrets versionados.
4. **Sin observabilidad / tests / CI mobile.** → ceguera en prod (no sabemos si los coaches ven pantallas blancas), regresiones invisibles, fallos que degradan **en silencio** (db-compat, retry muerto) y pasan tests de "no crashea".
5. **Enterprise no portado.** El flujo coach-enterprise (invite, workspace, org-admin) está en web pero no en mobile, pese a que `AGENTS.md` lo exige. → segmento B2B no vendible en mobile.
6. **Consentimiento/retención implementados en apariencia, no en sustancia.** → exposición Ley 21.719 con datos de menores/salud.

---

## 6. Roadmap por olas (priorizado por valor/riesgo)

### Ola 0 — Desbloquear lanzamiento standalone (días)
Gate de release. Hasta cerrar esto, **no entregar builds a prospectos**.
- P0-1 verificar/cablear EAS env prod + assert al boot + smoke-test device limpio.
- P0-2 ErrorBoundary + Sentry.
- P0-3 hook de carga con error/retry (clientes/nutrición/settings + error-state de home).
- P0-5 push projectId. · P0-6 deep-link recovery. · P0-4 biometría → `client_intake`.
- P1 rápidos: `apiFetch` 401→signOut, push toggle revoca token, gate de rol en login, password 8 unificado (UI+server+reset), ATS/cleartext solo dev/staging.
- **CI mobile** (typecheck + expo export en PR) + smoke E2E (login→home→alumno→builder reorder→guardar).

### Ola 1 — Confianza y revenue (1–2 sem)
- Upsell contextual de suscripción (precios CLP + deep-link a checkout sin re-login); upgrade/reactivación in-app.
- Cobranza: comprobante + estado pendiente + indicador de morosidad; idempotencia en pago manual.
- `mp-reconcile` auto-corrección segura + banner dunning al coach.
- Soporte: form tipado + adjuntos + Resend (con `org_id` en el ticket).
- Intake editable completo. · Estados error/empty/loading + accesibilidad base.
- Demo seed + ajustar gate de confirmación de email (cuentas demo pre-confirmadas / deep-link de confirmación).

### Ola 2 — Enterprise B2B (2–4 sem) — _spec primero (SDD)_
- Canje de invite-code + routing por `org_role` + workspace switch.
- Org-admin mobile mínimo (roster coaches, invitar, uso agregado, estado de `org_invoices`).
- Branding de la org en el chrome del coach + soporte priorizado con SLA.

### Ola 3 — Estructural (continuo, en paralelo)
- Mover lógica pura a `packages/` (schemas, reducer, tiers, attention-score, MRR, brandScore).
- Capa `infrastructure/` en mobile + wrapper único de error/401.
- Compliance: ARCOP in-app + política de retención + jobs de purga (`purge_audit`) + DPA + subprocesadores + suavizar claim de Ley 21.719 hasta cerrar.
- Observabilidad (SLO/alertas de PULSE_FAILED y 401), OTA rollback, feature flags, SecureStore, RLS-isolation tests desde mobile.

---

## 7. Detalle por disciplina (14 roles)

> Veredicto + bloqueante + hallazgos clave de cada rol. Evidencia `archivo:linea` en el cuerpo. Severidades del propio rol.

### 7.1 Software Architect — _conditional_
> "No es la misma app en otra plataforma: es un segundo stack de datos paralelo (103 llamadas Supabase, 66 interfaces a mano) que comparte 6 imports con web — la paridad depende de disciplina humana, no de arquitectura."
- **P0** Config de build no reproducible (env solo en dashboard EAS). · **P0** `@eva/schemas`/`@eva/types` infrautilizados → drift garantizado (causa de ~8 bugs del audit).
- **P1** Tier-config duplicado a mano (riesgo de revenue). · **P1** Sin capa de datos (103 accesos directos, viola `CLAUDE.md`). · **P1** `db-compat` codifica incertidumbre de a qué DB pega el APK.
- **P2** Sin estrategia de paridad mecánica. · **P2** Dos data-planes (supabase + apiFetch) sin política de sesión.

### 7.2 Backend Engineer — _conditional_
> "Grieta de integridad de datos: el attention-score se calcula con dos fórmulas distintas según la pantalla; columnas inexistentes; import serial sin idempotencia."
- **P1** Doble fuente de verdad del riesgo (lista vs pulse). · **P1** Biometría a columnas inexistentes (`clients` vs `client_intake`). 
- **P2** Import serial sin idempotencia/pre-chequeo de límite; tempPassword generado en cliente. · **P2** Reset emite password de 6 dígitos. · **P2** `apiFetch` sin 401. · **P2** Detalle de alumno recalcula adherencia/nutrición en RN (drift con pulse). · **P2** Org-scope por heurística de string. · **P3** Endpoints gatean por workspace, no por rol/ownership explícito.

### 7.3 Frontend Engineer (Web) — _conditional_
> "Corrige al audit: el catálogo de ejercicios web NO es create-only — ambos tienen CRUD, pero **duplicado**. El riesgo real es drift de lógica re-escrita a mano."
- **P1** Biometría: mobile escribe a la **tabla** equivocada (no es 'columnas faltantes'). · **P1** Login enterprise-coach: el schema y flujo ya existen en web; mobile no los consume (+ mojibake `Email invÃ¡lido` en `auth.ts`).
- **P2** Catálogo ejercicios duplicado (no huérfano) — corregir el audit. · **P2** Password 6-vs-8 nace del propio `packages/schemas/auth.ts` (dos reglas conviviendo). · **P2** Reducer "ported 1:1" = copia manual, bomba de drift → mover a `packages/`. · **P2** Nutrición: ciclos/plantillas son features estructuradas en web, no botones. · **P3** i18n inexistente.

### 7.4 Mobile Engineer (iOS/Android) — **yes (bloquea)**
> "UI sorprendentemente completa, pero tres bombas nativas que el audit no nombró: sin ErrorBoundary/crash-reporting, push token con projectId undefined, recovery deep-link roto."
- **P0** Sin ErrorBoundary/Sentry. · **P0** Push `projectId` undefined → rejection en cada login. · **P0** Recovery deep-link (eva:// + hash vs PKCE). · **P0** `production` EAS sin Supabase env.
- **P1** Push toggle no revoca. · **P1** `apiFetch` sin 401. · **P1** ATS off + cleartext en prod.
- **P2** FlatList con animación por item (jank). · **P2** Doble fuente de sesión + posible loop de navegación. · **P2** Import N requests secuenciales. · **P3** Tap de push navega a ruta cruda sin validar.

### 7.5 DevOps Engineer — **yes (bloquea)**
> "No release-ready: `production` no inyecta NINGUNA env, cero observabilidad, sin CI mobile en PR, y se ships cleartext+arbitrary-loads en prod."
- **P0** `production` sin env (CI parchea el profile equivocado, `prodpreview`). · **P0** `apiFetch` → PROD por defecto: staging = Supabase LAN + API prod (cross-env). · **P0** Cero observabilidad (sin Sentry/source maps).
- **P1** Sin CI mobile en PR. · **P1** Cleartext/ATS no gateado por entorno. · **P1** `expo-updates` sin runtime (rollback OTA muerto). · **P1** Endpoints mobile sin rate-limit (service-role).
- **P2** Sin monitoreo del pulse que degrada. · **P2** Sin feature flags/kill-switch. · **P3** `eas.json` versionado con infra (IP LAN/anon key).

### 7.6 QA Automation — _conditional_
> "CERO tests automatizados sobre flujos que mueven dinero, datos de salud y RLS multi-tenant; cada S1 es justo un bug que un test de regresión habría atrapado."
- **P0** Sin infra de testing (sin runner/E2E/gate). · **P0** Sin test que blinde el env del build prod. · **P0** Sin test de contrato DB↔código (biometría usa `as any`/`as never`).
- **P1** Sin tests del camino degradado (donde viven los S1/S2). · **P1** Sin tests del gate de rol/estado en login. · **P1** Builder DnD/reducer sin regresión pese a refactor. · **P1** Sin RLS-isolation desde mobile.
- **P2** Sin matriz de dispositivos. · **P2** Sin tests de push toggles. · **P2** Validación cliente↔server divergente sin test. · **P2** Sin observabilidad → QA ciego post-release.

### 7.7 Security Engineer — _conditional_
> "Fundamentos razonables (RLS, mutaciones scoped), pero fallback que degrada aislamiento, secretos embebidos, ATS off global, tokens push que sobreviven al logout."
- **P1** `eas.json` versionado con anon key + IP LAN. · **P1** `credentials.json` con password `.p12` `1234567890` en claro. · **P1** `selectWithFallback` degrada org-scope a solo-RLS por match de string. · **P1** Cleartext/ATS global → MITM. · **P1** Push token no revocado en logout.
- **P2** Logout no limpia AsyncStorage (PII de salud sin cifrar; migrar a SecureStore). · **P2** Login sin rate-limit/captcha + sin gate de rol. · **P2** `apiFetch` sin 401. · **P2** Non-null assertions ocultan config faltante.
- **P3** Validación débil de URL de media (SSRF/contenido a alumnos). · **P3** Deep-link resuelve branding sin validar (spoofing de marca en login).

### 7.8 Product Manager — _conditional_
> "Maduro en el core y en varias cosas supera a web, pero 2-3 fallas rompen la promesa de venta: build sin auth, biometría que se pierde, y el coach enterprise no puede usar la app."
- **P0** Build sin env = cero conversión + reseñas 1★. · **P0** Enterprise coach inusable (bloquea B2B). · **P0** Biometría se pierde en silencio (rompe el value-prop de seguimiento).
- **P1** Fallas silenciosas en cadena erosionan retención sin que te enteres.
- **P2** Suscripción solo-lectura: decisión correcta, ejecución filtra conversión (falta upsell contextual). · **P2** Fricciones de copy que generan tickets (password, push, asignar sin fecha/duración). · **P2** Separar "paridad necesaria" de over-engineering (intake SÍ; i18n/skeletons al backlog). · **P3** Onboarding fuerte — conectar al funnel (activación D1/D7).

### 7.9 UX/UI Designer — _conditional_
> "Visualmente sólido pero deuda seria de estados de error/empty/loading y feedback de acciones engañosas: hay toggles que mienten y errores de red disfrazados de 'no existe'."
- **P1** Push toggle miente (apaga visual, sigue recibiendo, se auto-revierte). · **P1** Error de red disfrazado de "Alumno no encontrado". · **P1** Cero accesibilidad en touchables icon-only.
- **P2** Doble email de contacto. · **P2** Loading único (Skeleton existe pero es código muerto). · **P2** Chip de filtro con enum crudo (`no_program`). · **P2** Error del dashboard sin retry/pull-to-refresh. · **P2** Errores de auth crudos en inglés. · **P2** Password "Mín. 6" vs server 8.
- **P3** brandScore divergente web↔mobile. · **P3** Suscripción solo-lectura "se lee capada". · **P3** Saludo/defaults inconsistentes.

### 7.10 Head of Sales (B2B Enterprise) — _conditional_
> "Standalone excelente, pero como pieza enterprise está incompleto: el coach no puede unirse a su org, no hay workspace switch, y el dueño no tiene NADA mobile. La promesa 'multi-coach bajo tu marca' se cae en vivo."
- **P0** Sin onboarding enterprise-coach (invite no canjeable). · **P0** Dueño/admin sin producto mobile (toda `/org/*` es web-only).
- **P1** Sin workspace switch. · **P1** `getCoachProfile` null → enterprise-coach cae al flujo de alumno (catastrófico en demo). · **P1** Soporte enterprise = mailto sin SLA. · **P1** Riesgo de demo por build de prod.
- **P2** Cero diferenciación visible del plan enterprise (debilita pricing power).

### 7.11 SDR — _conditional_
> "Se ve premium, pero hoy NO sobrevive una demo en frío: build con login muerto, error del dashboard sin salida, biometría que revienta, y confirmación de email que corta el trial."
- **P0** Build de demo con login muerto. · **P0** Confirmación de email corta el flujo alta→primer uso. · **P0** Error del dashboard = callejón sin salida.
- **P1** Biometría falla siempre. · **P1** Sin cuenta/dataset de demo (panel vacío, sin "wow").
- **P2** Error de login crudo en inglés. · **P2** Demo enterprise imposible. · **P3** Soporte/baja por mailto (no captura el lead caliente).

### 7.12 Customer Success Manager — _conditional_
> "Resuelve el 'qué hace mi negocio' pero no el 'cuando algo sale mal': soporte mailto sin triage, push que miente, sin manejo de sesión, y CERO instrumentos de retención."
- **P1** Push toggle engañoso (generador de tickets). · **P1** Soporte mailto sin ticket/triage/SLA/adjuntos (falla en silencio en Android). · **P1** Cancelación sin churn-save + sin health-score/alertas de churn del coach. · **P1** Sesión expirada sin re-login (tickets "la app está rota"). · **P1** Datos que no se guardan en silencio = churn invisible (peor que un crash).
- **P2** Sin NPS/CSAT/reseña/changelog. · **P2** Sin force-update gate (coaches atrapados en builds con bugs ya resueltos). · **P2** Expansión friccionada por delegar todo a web.

### 7.13 Legal & Compliance (Chile, Ley 21.719) — _conditional_
> "Recolecta datos sensibles de TERCEROS (alumnos, posibles menores) con consentimiento defectuoso: edad 'teatral', términos sin documento, ARCOP por mailto. Cumple la apariencia, no la sustancia."
- **P0** `ageConfirmed:true` hardcodeado → sin prueba de consentimiento (datos de menores). · **P0** Checkbox de términos/privacidad sin documento accesible = consentimiento no informado.
- **P1** Supresión/portabilidad por mailto (sin acuse/plazo/autenticación del titular). · **P1** Push que no revoca = ignora derecho de oposición. · **P1** Datos de salud/biometría sin finalidad/retención/minimización documentada (fotos de menores).
- **P2** Contraseñas de alumnos por WhatsApp en claro (brecha notificable). · **P2** FAQ afirma "Cumplimos Ley 21.719" (publicidad engañosa hasta cerrar). · **P2** Sin DPA coach↔EVA. · **P3** Subprocesadores/transferencia internacional no declarados.

### 7.14 Fintech / Integrations — _conditional_
> "El cobro coach→alumno existe y funciona, pero incompleto; la suscripción coach→EVA es solo-lectura con riesgo real de drift de estado."
- **P1** Sin comprobante en pago manual. · **P1** Sin estado 'pendiente'/morosidad (endpoint fuerza `paid`). · **P1** Imposible pagar/cambiar/reactivar suscripción desde mobile (fuga de conversión; `init_point` MP es URL web, no hay impedimento técnico).
- **P2** Sin manejo de retorno de checkout/refresh de estado. · **P2** `mp-reconcile` detecta drift pero no corrige ni avisa (revenue leakage). · **P2** `apiFetch` 401 → riesgo de pago duplicado (sin idempotencia) que infla MRR. · **P2** Borrado de pago bypasea capa de validación/auditoría. · **P2** Cero billing enterprise (`org_invoices`) en mobile.
- **P3** Sin precios CLP/tiers visibles. · **P3** MRR puede divergir web↔mobile por set de strings de 'pagado'.

---

## 8. Correcciones al audit de ingeniería previo (honestidad)

La verificación adversarial encontró 2 imprecisiones del primer audit que conviene corregir antes de mostrarlo externamente:
1. **Catálogo de ejercicios web NO es create-only.** Tiene CRUD completo cableado (`exercises.actions.ts` + `ExerciseFormModal`). El problema real es **lógica duplicada**, no acciones huérfanas. (Frontend)
2. **Biometría no es "columnas que no existen" a secas.** Existen en `client_intake`; mobile escribe a la **tabla equivocada** (`clients`). El fix es de mapeo, no de migración. (Backend, Frontend)

Además, varios issues del dashboard del primer audit viven **solo en el camino degradado** (endpoint falla 2×), y `home.tsx` ya tiene try/catch (el loader infinito aplica a clientes/nutrición/settings, no a home).

---

## 9. Una línea por stakeholder

- **Ingeniería:** no arreglen los S1 sueltos — 6 causas raíz explican casi todo; cada fix debe venir con su test de regresión y CI mobile que lo blinde.
- **Producto:** standalone es lanzable tras Ola 0; enterprise NO se promete hasta Ola 2.
- **Ventas:** no entregar builds a prospectos sin smoke-test en device limpio; no demostrar enterprise en mobile todavía.
- **Legal:** cerrar consentimiento + ARCOP + retención antes de escalar datos de menores; suavizar el claim de Ley 21.719 mientras tanto.
- **DevOps:** antes que nada, poder responder "este APK pega a esta DB" con evidencia en git, con Sentry y rollback OTA.
