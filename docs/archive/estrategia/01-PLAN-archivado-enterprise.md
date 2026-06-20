# 01 · PLAN — Archivado de Enterprise (visibilidad OFF, motor intacto)

> Ejecuta la **Parte I** de la decisión de socios [Teams-first (2026-06-11)](2026-06-11-teams-first-modulos-addons.md). Volver al [Director de estrategia](00-DIRECTOR.md).
> Planes hermanos: [02 · Landing Teams](02-PLAN-landing-teams-ui.md) (la landing NO se toca aquí — es scope del 02) · [03 · Módulos compra-only](03-PLAN-modulos-compra-only.md) · [04 · Consolidación de planes](04-PLAN-consolidacion-planes-ciclos.md) · [05 · Billing add-ons](05-PLAN-billing-addons-selfservice.md).
> Memorias aplicables: `project-teams-first-strategy`, `project-plan1-gate-pending` (gate Movida = prioridad 1, este plan no lo bloquea), `project-movida-commercial` (reunión 12-jun; nada de precios de lista se publica antes del cierre).
> **Excepción Movida:** su contrato es custom; nada de este plan cambia lo pactado con ellos.

## Objetivo

Quitar las **puertas de entrada visibles** de enterprise (crons operativos, copy legal con oferta/precios y metadata googleable de la página de marketing `/enterprise` — tarea delegada por el plan 02) sin tocar el motor: el código enterprise ya es "orgánicamente invisible" (auditoría Parte I §1.1) y es infraestructura viva de teams. **Archivar visibilidad, no borrar nada.** Cero migraciones, cero DDL — este plan NO entra al branch efímero del gate Movida y no choca con las 7 migraciones `20260611*` pendientes.

## Decisiones ya tomadas (doc fuente — no se re-litigan)

1. **Archivar, no eliminar** (Parte I §1.3-1.4): el codigo de `/org`, `/e` y `/enterprise` NO se borra. **ACTUALIZADO 2026-06-11 (decision del dueno — reemplaza el "subdominio se mantiene"):** `enterprise.eva-app.cl` pasa a **redirect 308 → eva-app.cl** (configuracion de dominio en Vercel) acompañado OBLIGATORIAMENTE del cambio del redirect `/org/*` del proxy (F3, que deja de ser condicional). La landing de venta enterprise queda INVISIBLE por doble via: el subdominio redirige al home y `eva-app.cl/enterprise` redirige 308 a `/pricing` (F6, post-plan 02). El codigo queda dormido (reversible en minutos: re-apuntar dominio + revertir 1 condicional).
2. **`/admin/orgs` queda como la única puerta enterprise** para administrar la org de prueba.
3. **Copy legal → "planes empresariales a medida vía contacto@eva-app.cl"** (Paso 3 del doc fuente). El patrón de copy ya existe en el callout de `/pricing` (`apps/web/src/app/pricing/page.tsx:189-197`).
4. ~~El DNS no se mata todavía~~ **REEMPLAZADA 2026-06-11:** el subdominio se redirige (no se borra el dominio de Vercel ni el DNS — el registro queda apuntando a Vercel, Vercel responde 308). Ver F3 ejecutable. Consecuencias aceptadas por el dueno: panel `/org` inaccesible en prod (afecta SOLO a la org de prueba; `/admin/orgs` en el dominio principal NO se toca; el flujo del alumno `/e` vive en el dominio principal y NO se afecta; suites E2E corren contra localhost, exentas).
5. **La landing es scope del [plan 02](02-PLAN-landing-teams-ui.md)** — este plan no toca `app/page.tsx`, `LandingPillNav`, `LandingEnterpriseSection`, `LandingFinalCTA` ni `LandingPricingPreview`.
6. **Decisiones del dueño (2026-06-11, definitivas — integradas en este plan):** (a) **F0 se empaqueta con la sesión del gate Movida** (una sola ventana de riesgo sobre prod); (b) **`payment-reminder` SE QUITA** junto con `org-health-alert` (el "opcional" del doc fuente queda resuelto: SÍ); (c) **backlog de mejoras aprobado COMPLETO** — acción mínima de status en `/admin/orgs`, redirect 308 `/enterprise` → `/pricing` (post-deploy plan 02), tabla de crons activos, anotación del health score congelado, removal en Search Console pre-12-jun, documentar el Block 4 del cron, sweep fail-closed de los guards de cron, fix `statusTone` — integradas en F2/F4 y en las fases nuevas F6/F7; (d) **D5 — IVA:** silencio total sobre IVA en todo copy de precios hasta constituir EVAapp SpA (en proceso, jun-2026); el copy nuevo de F2 no menciona IVA (cumple por diseño) y queda tarea de revisión al constituirse (F2). Las decisiones D1-D4 (techo elite 100, precios de tiers sin cambios, precio de lista de módulos $9.990, add-ons con descuento de ciclo) son scope de los planes 03/04/05 — no se ejecutan acá.
7. **Restricción global del dueño:** cero servicios pagos NUEVOS — todo con el stack ya contratado (Supabase, Resend, PostHog, Vercel, Upstash). Ninguna tarea de este plan lo requiere (Search Console y los crons de Vercel son parte del stack actual, costo $0).

## Lista NO-TOCAR (infra compartida con teams — verificada adversarialmente, doc fuente §1.2)

Ningún diff de este plan puede tocar estos archivos/objetos (chequear en el review de la tanda con `git diff --stat`):

1. `apps/web/src/proxy.ts` — salvo **el diff declarado de F3** (decision 2026-06-11): cambio del redirect `/org/*` en `:145-147` (dominio principal → `/login` en vez del subdominio) + comentario. Ningun otro diff en proxy.ts.
2. Workspace engine: `apps/web/src/services/auth/workspace.service.ts`, `workspace-route-guard.service.ts`, `infrastructure/db/workspace.repository.ts`.
3. `apps/web/src/services/org/org.service.ts` (lo importa `team.actions.ts` y el panel CEO de teams).
4. `apps/web/src/infrastructure/db/org.repository.ts` (re-exportado por el barrel que consume standalone).
5. Scoping 3-vías: `apps/web/src/services/client/client-scope.service.ts`, `services/auth/coach-scope.service.ts` (los `.is('org_id', null)` SON el aislamiento).
6. JWT hook `custom_access_token_hook` (incluye el chequeo MFA).
7. Guards de pago `org_managed` en webhook MP y mp-reconcile (protegen también `team_managed`).
8. DB enterprise completa (9+ tablas, ~30 migraciones) — JAMÁS DROP (el merge de branches re-ejecuta el historial).
9. `/admin/orgs` (`apps/web/src/app/admin/(panel)/orgs/*`) — queda operativa. **Únicos diffs permitidos: los declarados en F6** (acción mínima de status + anotación "(congelado 2026-06)" en la columna Health), aprobados por el dueño 2026-06-11; cualquier otro diff acá sigue prohibido.
10. `tests/enterprise/*` + 3 personas e2e enterprise `@evatest.cl` + org de prueba — fixture NEGATIVA de las suites que protegen a teams (`tests/separation/separation-invariants.sql:98,125`).
11. `apps/web/src/app/join/[invite_code]/_lib/resolve-invite.ts` — el orden org→team→standalone no se toca.
12. Crons que se quedan: `trial-expiry` (solo coaches — verificado: cero referencias a `organizations` en su route), `purge-data`, `audit-checksum` (la integridad tamper-evident de audit logs sigue valiendo), `mp-reconcile`, `nutrition-*`. **Único diff permitido: el hardening fail-closed del guard `CRON_SECRET` (F7)** — 1 línea por route, cero cambio de lógica de negocio; diff declarado y aprobado por el dueño 2026-06-11.

---

## F0 — Pre-paso operativo: org(s) de prueba a `active` (ANTES de tocar crons)

**Por qué primero:** el cron `org-health-alert` corre DIARIO (`vercel.json:20-21`, 13:00 UTC) y su Block 1 **auto-suspende** toda org `status='trial'` con `trial_ends_at` vencido (`apps/web/src/app/api/cron/org-health-alert/route.ts:27-61`). **Precisión del panel de revisión (verificada en código):** hoy NADA gatea acceso por `organizations.status` — `get_enterprise_alumno_context` (migración `20260608230000`) no lee el status de la org y el redirect a `/suspended` de `proxy.ts:445-450` depende de flags del CLIENTE (`is_active`/`is_archived`), no de la org; el layout `/org/[slug]/layout.tsx` tampoco gatea. El impacto real de la auto-suspensión es de datos/estado: badge "suspended" en `/admin/orgs` y `/org/[slug]/settings`, y el Block 3 deja de calcular health score para esa org (filtra `status IN ('active','trial')`, `route.ts:103`). Aun así F0 va primero: (a) higiene de datos antes de congelar el cron; (b) un `suspended` residual es bomba latente si código futuro gatea por status (teams YA gatea por `suspended_at`, `workspace.repository.ts:112,145` — patrón copiable a orgs); (c) el doc fuente lo ordena explícitamente ANTES de quitar el cron. El cron sigue corriendo hasta que el deploy con F1 llegue a producción.

**Hallazgo de auditoría (corrige al doc fuente):** `/admin/orgs` **NO tiene acción de cambio de status** — `orgs.actions.ts:13-48` solo expone `resendOwnerInviteAction`; la página solo muestra el badge (`orgs/page.tsx:65-66`). El "vía /admin/orgs" del doc fuente no es ejecutable hoy.

**Juicio técnico:** NO construir UI de cambio de status para una feature que se archiva. La vía correcta es **1 UPDATE service-role idempotente, data-only** (sin DDL → no requiere branch efímero; el protocolo Director Movida §3 aplica a DDL). Alternativa descartada: correr `trial_ends_at` a futuro lejano — deja el badge "trial" y el aviso "revisar cierre" en `/org/[slug]/settings` (`settings/page.tsx:64`); `active` es estado terminal limpio y Block 1 solo mira `status='trial'`.

**Actualización 2026-06-11 (decisiones del dueño — el juicio de arriba se conserva por trazabilidad):**
- **F0 se EMPAQUETA con la sesión del gate Movida** (default operativo decidido): el UPDATE no corre suelto — entra en la MISMA ventana autorizada del gate consolidado (una sola ventana de riesgo sobre prod). La disciplina de "OK puntual del usuario" se mantiene dentro de esa sesión.
- El dueño aprobó además construir la **acción mínima de cambio de status en `/admin/orgs`** (~30 líneas, ver F6) para no depender de SQL manual en el futuro. NO reemplaza este F0: el UPDATE service-role sigue siendo la vía del gate (la acción puede no estar deployada cuando corra). Si la acción F6 ya está en prod al momento del gate, puede usarse como vía de ejecución equivalente (deja el mismo audit log).

Tareas:

- [ ] **(⚠️ toca prod — pedir OK puntual del usuario antes de ejecutar, misma disciplina del gate)** Inventario: `SELECT id, slug, name, status, trial_ends_at FROM organizations WHERE deleted_at IS NULL;` — se esperan la org de prueba manual y la org e2e "E2E Performance Lab" (`/e/e2e-performance-lab`, `tests/separation/happy-paths.spec.ts:9`).
- [ ] UPDATE explícito por slug (no blanket): `UPDATE organizations SET status='active' WHERE slug IN ('<slugs del inventario>') AND status='trial';` + verificación SELECT post-update.
- [ ] Registrar en `admin_audit_logs` (espejo del patrón del cron, `org-health-alert/route.ts:47-53`): `action='org.status_manual_active'`, `payload.reason='archivado enterprise F0'`.
- [ ] Si alguna org ya fue auto-suspendida por el cron antes de llegar acá: mismo UPDATE desde `'suspended'`, documentado en el audit log.

DoD F0: cero orgs en `status='trial'` o `'suspended'` no intencional; flujo `/e` de la org e2e navegable.

## F1 — Crons: quitar `org-health-alert` y `payment-reminder` de `vercel.json`

Evidencia verificada:
- `vercel.json:19-22` — `/api/cron/org-health-alert` (diario 13:00 UTC).
- `vercel.json:27-30` — `/api/cron/payment-reminder` (días 1, 6 y 11 de cada mes; solo lee `org_invoices`, `payment-reminder/route.ts:83`, y manda emails "[Urgente] Pago pendiente" a org admins).

Tareas:

- [ ] Quitar ambas entradas de `crons` en `vercel.json`. **Juicio:** quitar también `payment-reminder` (el doc fuente lo marca opcional) — con cero `org_invoices` pendientes es no-op, pero si alguien crea una invoice de prueba mandaría emails de cobranza de un plan que ya no se vende; quitarlo cuesta 1 línea y restaurarlo es revertir esa línea. **RESUELTO 2026-06-11 (decisión del dueño): SÍ se quita junto con `org-health-alert` — el "opcional" deja de serlo.**
- [ ] **NO borrar** los route handlers (`app/api/cron/org-health-alert/route.ts`, `payment-reminder/route.ts`). Juicio: código dormido no cobra renta; ambos exigen `Bearer CRON_SECRET` cuando la env var está seteada (`route.ts:6-11` — ojo del lente seguridad: el guard hace `if (!expected) return true`, o sea con `CRON_SECRET` ausente el handler queda ABIERTO; está declarada en todos los envs según CLAUDE.md, no quitarla — **y el sweep fail-closed de F7, aprobado 2026-06-11, elimina este fail-open en los 10 routes con el patrón, incluidos estos 2 handlers archivados**), así que sin entrada en `vercel.json` son inalcanzables en la práctica; desarchivar enterprise = re-agregar 2 líneas. Borrarlos solo agrega riesgo de merge sin beneficio.
- [ ] Comentario de 1 línea en cada route handler: `// ARCHIVADO 2026-06: sin cron en vercel.json — ver docs/plans/estrategia/01-PLAN-archivado-enterprise.md`.

Efectos colaterales aceptados y documentados:
- `last_health_score` de orgs y `organization_members` deja de refrescarse (Blocks 3 y 5 del cron) → el health score en `/admin/orgs` queda congelado al último valor. Aceptable: es data de una feature archivada; el panel sigue cargando. F6 anota la columna con "(congelado 2026-06)" para que nadie lea data vieja como fresca.
- **(mejora aprobada 2026-06-11) Block 4 también se apaga** (`org-health-alert/route.ts:167-270`): el digest por email "alumnos inactivos ≥14 días" a org owners/admins (`buildOrgInactiveClientsEmail`, `route.ts:253-260`) deja de enviarse al quitar el cron. Aceptable: los destinatarios son admins de orgs archivadas (solo la org de prueba y la e2e); ningún coach standalone ni team lo recibe — el digest es exclusivo de `organizations`. Documentarlo en la tabla de crons de F4 para que el apagón quede visible en operaciones.

## F2 — Copy legal: de oferta "Plan Enterprise" a "planes empresariales a medida"

**Análisis Legal & Compliance (Chile) — ¿el cambio exige nota de versión / aviso previo?**
- `legal/page.tsx` §5.1 publica una **oferta con precios** ($49.990 + $9.990/coach + 30 días trial, `legal/page.tsx:110-111`). Retirarla es retiro prospectivo de oferta: bajo Ley 19.496 el precio publicado obliga mientras esté publicado, no después; y la propia sección 6 "Modificaciones" (`legal/page.tsx:130-135`) reserva el derecho a modificar sin aviso. **No hay clientes enterprise reales** (solo la org de prueba) → nadie con derechos adquiridos sobre ese copy.
- `privacidad/page.tsx` §12 (`:201-206`) promete email con 15 días de anticipación solo para **cambios materiales**. Reescribir §11 no altera el tratamiento de datos de ningún usuario existente (no hay orgs reales; el framing responsable/encargado se conserva) → **no es cambio material, no exige notificación**.
- **Sí exige** (buena práctica + coherencia con Ley 21.719): actualizar `LAST_UPDATED` en ambas páginas (`legal/page.tsx:11`, `privacidad/page.tsx:11`) a la fecha de despliegue. El historial git queda como registro de versiones (el aviso legal ya declara "Versión" solo en contrato-enterprise; no introducir versionado nuevo).

Tareas:

- [ ] **`apps/web/src/app/legal/page.tsx:102-118`** — reescribir §5.1 como **"5.1 Planes empresariales (organizaciones y equipos)"**, sin precios. Borrador de copy (afinar en la tanda):
  > EVA ofrece planes empresariales a medida para centros de salud, gimnasios, academias y equipos multidisciplinarios. El alcance, precio y nivel de servicio se pactan por contrato con cada organización. Para recibir una propuesta, escribe a contacto@eva-app.cl.
  >
  > Las organizaciones con contrato vigente se rigen por su Contrato de Servicios, que complementa este Aviso Legal. En caso de conflicto, prevalece el contrato firmado.

  Juicio: este wording cubre a la vez el legacy enterprise y los futuros contratos de **teams** (Movida incluida) — evita una segunda pasada legal cuando el plan 05 publique add-ons/teams.
- [ ] **`apps/web/src/app/legal/page.tsx:185`** — quitar el link del footer a `/legal/contrato-enterprise` (quedan Aviso Legal + Privacidad).
- [ ] **`apps/web/src/app/privacidad/page.tsx:183-199`** — reescribir §11 como **"11. Organizaciones y equipos con contrato empresarial"**: conservar el framing responsable/encargado del tratamiento, el aislamiento RLS+JWT y la mención al DPA, pero desacoplado de la marca "plan Enterprise" ("las organizaciones que contratan un plan empresarial a medida actúan como responsables del tratamiento…"). Juicio: ese framing es exactamente el que Movida necesitará — se conserva, no se borra.
- [ ] **`apps/web/src/app/legal/contrato-enterprise/page.tsx`** — queda **dormida pero no rota** (la URL puede estar en historiales/emails):
  - Aviso bajo el h1 (`:42-50`): "Documento de referencia histórica (v1.0). EVA no comercializa actualmente el plan Enterprise de lista; las condiciones empresariales vigentes se pactan contrato a contrato. Contacto: contacto@eva-app.cl".
  - **Neutralizar precios** en §3 (`:75-78`): reemplazar "$49.990 CLP/mes… $9.990 CLP/mes" por "según la propuesta comercial pactada con cada organización". Juicio (comercial, crítico pre-12-jun): un precio enterprise de $49.990 vivo en una URL pública es un ancla regalada contra la negociación Movida ($890k); con la reunión encima, esto es lo más urgente de F2.
  - `metadata` (`:6-9`): agregar `robots: { index: false, follow: false }`. La página no está en `sitemap.ts` (verificado: solo `/`, `/pricing`, `/register`, `/login`, `/legal`, `/privacidad`) pero el footer de `/legal` la enlazaba → pedir recrawl no es necesario, el noindex basta.
  - `LAST_UPDATED` (`:11`) NO se cambia: el contrato v1.0 es histórico; el aviso nuevo lleva su propia fecha.
- [ ] **`LAST_UPDATED`** de `legal/page.tsx:11` y `privacidad/page.tsx:11` → fecha de despliegue.
- [ ] **`apps/web/src/app/enterprise/page.tsx:15-25`** — tarea DELEGADA explícitamente por el [plan 02](02-PLAN-landing-teams-ui.md) (su F1: "van en el plan 01… el noindex/redirect de la página de marketing `eva-app.cl/enterprise`"): la página de marketing queda **públicamente alcanzable en el dominio principal** (el proxy solo host-gatea `/org/*`, `proxy.ts:145-147`) con "Desde $89.990 CLP/mes" en la meta description (`:18`). (a) agregar `robots: { index: false, follow: false }` a `metadata`; (b) quitar el precio de `description` (el `openGraph.description` de `:21-22` no tiene precio — verificado). Juicio: mismo criterio que contrato-enterprise — un segundo precio enterprise googleable es otra ancla regalada contra la negociación Movida; urge antes del 12-jun. El CONTENIDO de la página (sección `EnterprisePricing` con precios en pantalla) NO se toca en este plan: queda dormida sin links entrantes tras el plan 02; si se quiere cero precio incluso para visitas con URL directa, es decisión del dueño — **RESUELTA 2026-06-11: SÍ, vía redirect 308 `/enterprise` → `/pricing`, SECUENCIADO post-deploy del plan 02 (tarea concreta en F6)**. Mientras el redirect no esté activo, el noindex + description sin precio de esta tarea son la red de seguridad; cuando esté activo, la página deja de servirse y los precios en pantalla dejan de ser alcanzables.
- [ ] NO tocar `apps/web/src/app/enterprise/_components/sections/EnterpriseFooter.tsx:15-16,33` (links a contrato-enterprise dentro del marketing `/enterprise`): esa ruta queda dormida cuando el [plan 02](02-PLAN-landing-teams-ui.md) le quite los links entrantes de la landing — links dormida→dormida no requieren cambio.
- [ ] NO tocar el callout de `/pricing` (`pricing/page.tsx:189-197`): ya tiene el patrón destino ("planes empresariales… contacto@eva-app.cl"); su mención "más de 500 alumnos" es scope del [plan 04](04-PLAN-consolidacion-planes-ciclos.md).
- [ ] NO tocar `legal/page.tsx:137-145` (§7 "Suscripción y Cobros Recurrentes"): menciona "planes de 31-60 y hasta 500 alumnos" — copy de los tiers growth/scale, scope del [plan 04](04-PLAN-consolidacion-planes-ciclos.md). Si el 04 corre en la misma ventana, coordinar para editar `LAST_UPDATED` una sola vez.
- [ ] ~~Search Console removal~~ **INNECESARIO — verificado por el dueno 2026-06-11:** `site:eva-app.cl/enterprise`, `site:enterprise.eva-app.cl` y busquedas de precio devuelven CERO resultados (nada indexado) → el riesgo de ancla via Google es ~cero y el removal no aplica (no hay nada que remover). El noindex de las tareas de arriba QUEDA como cinturon (evita indexacion futura mientras el redirect 308 no este activo).
- [ ] **(D5 — IVA, decisión del dueño 2026-06-11)** Verificar que el copy nuevo de F2 mantiene **silencio total sobre IVA** (los borradores de arriba no lo mencionan — cumple por diseño; no agregar "+IVA", "IVA incluido" ni notas tributarias a NINGUNA superficie de este plan). Dejar tarea de seguimiento en `docs/operations/MANUAL_TASKS.md`: "al constituirse EVAapp SpA (en proceso jun-2026), revisar copy de precios y páginas legales (tratamiento de IVA, razón social en aviso legal y privacidad)".

## F3 — Apagar el subdominio: redirect 308 `enterprise.eva-app.cl` → `eva-app.cl` + guard del proxy (DECISION 2026-06-11 — deja de ser condicional)

**Decision del dueno (2026-06-11, opcion B del analisis):** el subdominio no se mantiene vivo — se configura como redirect permanente al dominio principal. Con esto la landing de venta enterprise deja de ser visible por el subdominio (su raiz era el rewrite `/`→`/enterprise`); la otra via (`eva-app.cl/enterprise`) la cierra el redirect 308 → `/pricing` de F6. **El codigo NO se borra** (filosofia archivar — reversible en minutos).

Contexto tecnico:
- Hoy `apps/web/src/proxy.ts:145-147` redirige todo `/org/*` del dominio principal a `getEnterpriseUrl() + pathname` (`lib/enterprise/domain.ts:10`). Con el subdominio redirigiendo al home, ese camino queda muerto/confuso → **obligatorio cambiarlo en el MISMO deploy**.
- `defaultWorkspaceHome` (`services/auth/workspace-route-guard.service.ts:48`) rutea cuentas con membership org hacia `/org/[slug]` → con el guard nuevo terminan en `/login`. Molestia menor SOLO en cuentas de prueba (cero clientes enterprise reales).
- Las sesiones enterprise mueren solas (cookies scoped por subdominio — politica intencional, CLAUDE.md "Cookie Domain Policy") sin afectar `eva-app.cl`.
- El flujo del alumno enterprise `/e/[org_slug]` vive en el DOMINIO PRINCIPAL (rama 1.5 del proxy) → NO se afecta; `happy-paths.spec.ts` sigue valido.
- Suites Playwright: corren contra `127.0.0.1:3000` (exento del redirect, `playwright.config.ts:34`) → siguen verdes.

Tareas (ORDEN dentro de la tanda):

- [ ] **(1 — codigo, mismo deploy de la tanda)** `proxy.ts:145-147`: cambiar el redirect de `/org/*` en dominio principal → `redirect('/login')` (en vez de `getEnterpriseUrl()+pathname`) + comentario `// ARCHIVADO 2026-06: subdominio enterprise redirige al home — ver docs/plans/estrategia/01-PLAN-archivado-enterprise.md §F3`. Diff DECLARADO en la lista NO-TOCAR item 1.
- [ ] **(2 — manual en Vercel, DESPUES de que el deploy con (1) este en prod)** Dashboard Vercel → proyecto → Domains → `enterprise.eva-app.cl` → configurar **Redirect 308 → `https://eva-app.cl`**. NO borrar el dominio ni el DNS (el registro sigue apuntando a Vercel; Vercel responde el 308 con cert valido).
- [ ] Entrada en `docs/operations/RUNBOOK.md`: estado del subdominio (redirect 308 desde 2026-06), como revertir (quitar redirect en Vercel + revertir el condicional del proxy), y nota de que el panel `/org` queda inaccesible en prod a proposito.
- [ ] Ajuste del spec F5: agregar assert 7 — `GET https://enterprise.eva-app.cl/` → 308 con `Location: https://eva-app.cl/` (assert de prod, va en la verificacion manual del GATE si Playwright corre solo contra localhost).

DoD F3: subdominio responde 308 al home; `/org/*` en dominio principal → `/login`; cero acceso publico a la landing de venta enterprise por NINGUNA via (subdominio 308 + `/enterprise` 308 a `/pricing` via F6); reversibilidad documentada en RUNBOOK.

## F4 — Docs canónicas (misma tanda)

- [ ] **`CLAUDE.md:126-129`** ("Three protected zones"): anotar la línea de `/org/[slug]/*` con "— **enterprise archivado comercialmente 2026-06** (motor vivo, sin puertas públicas; única puerta: `/admin/orgs`; ver `docs/plans/estrategia/01-PLAN-archivado-enterprise.md`)". La env var `ENTERPRISE_DOMAIN` se queda (el host sigue vivo).
- [ ] **`apps/mobile/AGENTS.md:8`** ("The enterprise coach also logs in through THIS app — support workspace switch"): agregar nota "(enterprise desprioritizado/archivado 2026-06: el workspace switch se mantiene funcionando, pero no se construyen features enterprise nuevas en mobile)".
- [ ] **`docs/plans/movida/00-DIRECTOR.md` §9 Bitácora** (`:134`): 1 línea — archivado de visibilidad enterprise ejecutado (crons + copy legal); rutas `/org`, `/e`, `/enterprise` dormidas; cero impacto en teams ni en el gate.
- [ ] **`docs/status/NEXT_STEPS.md`**: reflejar el estado (enterprise archivado; siguiente: plan 02 landing).
- [ ] **(mejora aprobada 2026-06-11) Tabla "crons activos y qué hace cada uno"** en `docs/operations/RUNBOOK.md` (sección operaciones; si calza mejor, en `MANUAL_TASKS.md` — uno de los dos, con link cruzado): los 6 crons que quedan en `vercel.json` post-F1 — `nutrition-cycles` (11:00 UTC diario), `nutrition-reminder` (00:00 diario), `trial-expiry` (12:00 diario, solo coaches), `purge-data` (dom 03:00), `audit-checksum` (dom 02:00), `mp-reconcile` (vie 10:00) — con 1 línea de "qué hace" por cada uno. Incluir: (a) nota de los 2 quitados (`org-health-alert`, `payment-reminder`: handlers vivos sin schedule, cómo desarchivarlos) con el apagón del Block 4 (digest alumnos inactivos) explícito; (b) los 2 endpoints de trigger manual sin schedule (`weekly-snapshot`, `weekly-report-email`); (c) que TODOS los guards son fail-closed desde F7.
- [ ] NO barrer las ~795 menciones de enterprise en 37 docs (doc fuente Paso 5): solo las canónicas de arriba; el resto es histórico.

## F5 — Tests del plan (TAREAS DE ESCRITURA — la ejecución va al GATE)

**Qué protege esto hoy (QA):**
- `tests/enterprise/rls-isolation.spec.ts` — aislamiento RLS org/coach/cliente; corre contra **Supabase local hardcodeado** (`:21-22`, `127.0.0.1:54321` + seed) — requiere `supabase start` + `db reset` (ojo: memoria `project_v2_working_rules` advierte que el stack local está desactualizado; validar seed antes de confiar en un rojo).
- `tests/separation/separation-invariants.sql` — INV1-14; usa las personas enterprise como **fixture negativa** del aislamiento de teams (`:98,125`).
- `tests/separation/happy-paths.spec.ts` — incluye el flujo org `/e/e2e-performance-lab` (`:9`) → detecta guards/rewrites rotos del flujo `/e`. (Ojo: NO detectaría una org suspendida — el status de org no gatea ese flujo, ver la precisión de F0 — por eso el inventario F0 se verifica por SELECT, no por E2E.)
- `playwright.config.ts:43-63` — projects `setup`/`separation` (con storageState de personas, `--workers=1`) y `chromium` (resto, sin auth).

Tareas de escritura:

- [ ] **Nuevo spec `tests/archive/enterprise-archive.spec.ts`** (project `chromium`, sin auth — páginas públicas):
  1. `GET /legal` → 200; NO contiene "Plan Enterprise" ni "$49.990"; SÍ contiene "planes empresariales" + `contacto@eva-app.cl`; el footer NO linkea `/legal/contrato-enterprise`.
  2. `GET /privacidad` → 200; §11 reescrita (sin oferta "plan Enterprise"; conserva "responsables del tratamiento"/"encargado").
  3. `GET /legal/contrato-enterprise` → 200 (dormida ≠ rota); contiene el aviso histórico; NO contiene "$49.990".
  4. `GET /enterprise` → 200; el `<head>` tiene `<meta name="robots">` con `noindex`; la meta description NO contiene "$89.990". **(Vigencia: hasta que el redirect 308 de F6 se active post-plan 02 — en ese momento este assert se REEMPLAZA por el 5.)**
  5. **(post-activación del redirect F6 — se escribe ya, `test.skip` condicionado o ajuste en esa tanda)** `GET /enterprise` (sin seguir redirects) → 308 con `Location: /pricing`.
  6. **(F7 — guards fail-closed)** `GET /api/cron/purge-data` y `GET /api/cron/org-health-alert` SIN header `Authorization` → 401 (hoy, en un env sin `CRON_SECRET`, devolverían 200 y EJECUTARÍAN el handler — el assert protege también los entornos de test).
  Juicio: asserts de contenido público son el nivel correcto acá — un unit test sobre `vercel.json` sería frágil y no prueba nada que el review del diff no vea; lo que importa proteger es lo que un visitante (o Ani) puede leer.
- [ ] Verificar que NINGÚN spec existente asserte el copy viejo de `/legal`/`/privacidad` (grep "Plan Enterprise" en `tests/` — hoy no hay matches fuera de `tests/enterprise/` que es de flujos, no de copy; confirmar en la tanda).
- [ ] Por tanda (permitido por la regla 2026-06-10): `pnpm typecheck` + `pnpm test` (vitest no toca Supabase). `pnpm build` al cierre de la tanda de código.

## F6 — Mejoras aprobadas por el dueño (2026-06-11) — tanda de código

Backlog de la review previa, aprobado COMPLETO por el dueño. Va en la MISMA tanda de código que F1-F5, salvo el redirect 308 (secuenciado post-deploy del plan 02). Cero servicios pagos nuevos.

- [ ] **Acción mínima "cambiar status" en `/admin/orgs`** (~30 líneas — espejo de `setTeamSuspendedAction` de admin/teams: `apps/web/src/app/admin/(panel)/teams/_actions/teams.actions.ts:170` + botón en `_components/TeamEditSheet.tsx:94`): server action `setOrgStatusAction(orgId, status: 'active' | 'suspended')` en `apps/web/src/app/admin/(panel)/orgs/_actions/orgs.actions.ts` (hoy solo expone `resendOwnerInviteAction`, `orgs.actions.ts:13-48`) + botón activar/suspender por fila en `orgs/page.tsx` + insert en `admin_audit_logs` (`action='org.status_manual_active'` / `'org.status_manual_suspended'`, mismo patrón del cron en `org-health-alert/route.ts:47-53`) + `revalidatePath`. Nota de alcance: NO reemplaza el UPDATE de F0 (que va empaquetado en el gate Movida) — es la herramienta para que el futuro no dependa de SQL manual; `/admin/orgs` sigue siendo la única puerta enterprise (decisión 2 de este plan, intacta).
- [ ] **Columna Health en `/admin/orgs` anotada** (mejora aprobada; default: anotar, no ocultar): header "Health" → "Health (congelado 2026-06)" en `apps/web/src/app/admin/(panel)/orgs/page.tsx:48`; el render de `last_health_score` (`page.tsx:82-88`) NO se toca. Juicio: anotar conserva el último dato útil a costo cero; ocultar borraría señal sin necesidad.
- [ ] **Fix cosmético `statusTone`** (aprobado explícitamente — riesgo cero, feature dormida): `apps/web/src/app/org/[slug]/settings/page.tsx:34` compara `status === 'trialing'`, pero el valor real de `organizations.status` es `'trial'` (evidencia: el cron filtra `.eq('status', 'trial')`, `org-health-alert/route.ts:31`; F0 opera sobre `'trial'`) → cambiar `'trialing'` por `'trial'` (1 línea). Tras F0 las orgs quedan `active`, así que el tone trial casi no se verá — es corrección, no urgencia.
- [ ] **Redirect 308 `/enterprise` → `/pricing`** (default operativo aprobado; **SECUENCIADO: POST-deploy del plan 02** — antes de eso la landing viva aún linkea `/enterprise` y el redirect rompería esa navegación): 1 entrada en `redirects()` de `apps/web/next.config.ts` — `{ source: '/enterprise', destination: '/pricing', permanent: true }` (Next emite 308; `/enterprise` no tiene subrutas — verificado, solo `app/enterprise/page.tsx`). Al activarse, el noindex + description sin precio de F2 quedan superseded (la página deja de servirse) — NO revertir F2: si algún día se quita el redirect, F2 vuelve a ser la red de seguridad. Ajustar el spec de F5 (assert 4 → assert 5) en la misma tanda del redirect.

DoD F6: acción de status operativa con audit log; columna Health anotada; `statusTone` corregido; redirect 308 activo (este último puede cerrar DESPUÉS del resto del plan, atado al deploy del 02).

## F7 — Hardening fail-closed de los guards de cron (mejora aprobada — ⚠️ toca crons VIVOS)

**Problema (hallazgo del lente seguridad en F1, ahora con sweep aprobado 2026-06-11):** los guards hacen `if (!expected) return true` — con `CRON_SECRET` ausente el endpoint queda ABIERTO a cualquier visitante (fail-open). Fail-closed correcto: sin env var → el guard devuelve `false` y el handler responde 401 (la rama 401 ya existe en todos, p. ej. `org-health-alert/route.ts:14-16`).

**Alcance verificado (grep 2026-06-11): son 10 routes con el patrón, no 8.** Los "8" aprobados = los 8 crons de `vercel.json`; el grep encontró 2 endpoints más SIN schedule pero con el mismo guard fail-open y URL pública alcanzable (`weekly-snapshot`, `weekly-report-email` — trigger manual). El sweep cubre los 10 (mismo cambio de 1 línea; dejar 2 de 10 abiertos no tiene sentido):

| Route (`apps/web/src/app/api/cron/`) | Línea del fail-open | En `vercel.json` |
|---|---|---|
| `org-health-alert/route.ts` | `:8` | Sí (se quita en F1) |
| `payment-reminder/route.ts` | `:8` | Sí (se quita en F1) |
| `nutrition-cycles/route.ts` | `:8` | Sí |
| `nutrition-reminder/route.ts` | `:8` | Sí |
| `trial-expiry/route.ts` | `:14` | Sí |
| `purge-data/route.ts` | `:6` | Sí |
| `audit-checksum/route.ts` | `:9` | Sí |
| `mp-reconcile/route.ts` | `:8` | Sí |
| `weekly-snapshot/route.ts` | `:14` | No (manual) |
| `weekly-report-email/route.ts` | `:15` | No (manual) |

Tareas:

- [ ] Sweep en los 10 guards: `if (!expected) return true` → `if (!expected) return false` (cero cambio de lógica de negocio; los 2 handlers archivados en F1 TAMBIÉN se endurecen — defensa en profundidad, quedan vivos sin schedule).
- [ ] **Pre-deploy (manual, 2 min):** verificar en el dashboard de Vercel que `CRON_SECRET` está seteada en Production (y en Preview si los crons corren ahí). Vercel manda `Authorization: Bearer <CRON_SECRET>` automáticamente en las invocaciones de cron cuando la env var existe — con la var presente, el fail-closed es transparente para los crons programados.
- [ ] Tarea de test (se ESCRIBE acá, se CORRE en el GATE — regla 2026-06-10): asserts 401 en el spec de F5 (ítem 6) — `GET /api/cron/purge-data` y `GET /api/cron/org-health-alert` sin `Authorization` → 401.
- [ ] **Nota de riesgo:** si `CRON_SECRET` faltara en algún env, los 6 crons vivos dejarían de ejecutarse (401 silencioso, sin alerta nativa). Mitigación: (a) verificación pre-deploy de arriba; (b) post-deploy, revisar en logs de Vercel la primera corrida programada de al menos 1 cron diario (`nutrition-cycles` o `trial-expiry` — ambos loguean al completar); (c) rollback = revertir 1 línea por archivo. Esto NO contradice el "no quitarla" de F1 — al contrario: fail-closed hace que quitar la env var por accidente falle ruidoso (401) en vez de abrir los endpoints.

DoD F7: 10 guards fail-closed; `CRON_SECRET` verificada en Vercel; asserts 401 escritos; primera corrida post-deploy verificada en logs.

## Archivos clave

`vercel.json` (2 entradas de cron) · `apps/web/src/app/api/cron/{org-health-alert,payment-reminder}/route.ts` (comentario F1 + guard fail-closed F7) · los otros 8 routes de `apps/web/src/app/api/cron/*/route.ts` (solo 1 línea de guard, F7) · `apps/web/src/app/legal/page.tsx` · `apps/web/src/app/privacidad/page.tsx` · `apps/web/src/app/legal/contrato-enterprise/page.tsx` · `apps/web/src/app/enterprise/page.tsx` (solo metadata: noindex + description sin precio) · `apps/web/next.config.ts` (redirect 308, post-plan 02 — F6) · `apps/web/src/app/admin/(panel)/orgs/_actions/orgs.actions.ts` + `orgs/page.tsx` (acción de status + anotación Health — F6) · `apps/web/src/app/org/[slug]/settings/page.tsx:34` (fix `statusTone` — F6) · `apps/web/src/proxy.ts` (solo comentario-guarda) · `CLAUDE.md` · `apps/mobile/AGENTS.md` · `docs/plans/movida/00-DIRECTOR.md` · `docs/status/NEXT_STEPS.md` · `docs/operations/RUNBOOK.md` (guarda DNS + tabla de crons) · `docs/operations/MANUAL_TASKS.md` (Search Console + seguimiento IVA/EVAapp SpA) · nuevo `tests/archive/enterprise-archive.spec.ts`.

## Orden sugerido

1. ~~Search Console removal~~ INNECESARIO (verificado 2026-06-11: nada indexado). 2. Tanda única de código: F1 + F2 + **F3 paso 1 (condicional del proxy)** + F4 + F5 (escritura de spec) + F6 (salvo redirect 308) + F7 (sweep + verificación `CRON_SECRET` pre-deploy) — typecheck + vitest + build. 3. Commit separado del trabajo pre-gate de Movida que esté en working tree (no mezclar tandas; único solape esperado: docs del director). 4. **F3 paso 2 (redirect 308 del subdominio en Vercel)** — manual, DESPUÉS de que el deploy con el condicional del proxy esté en prod. 5. **F0 — empaquetado en la sesión del gate Movida** (decisión 2026-06-11; toca prod, data-only, con OK puntual del usuario dentro de esa sesión). 6. **GATE** (abajo). 7. **Redirect 308 `/enterprise` → `/pricing` (F6)** — recién POST-deploy del plan 02, con su ajuste de spec (assert 4 → 5 de F5).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El cron suspende la org de prueba antes de F0/deploy | F0 primero; si ya ocurrió, UPDATE de vuelta a `active` + audit log (F0 lo contempla). Impacto acotado: el status no gatea acceso hoy (precisión F0) — es higiene, no incendio |
| Precios enterprise googleables ($49.990 en contrato-enterprise, $89.990 en la meta de `/enterprise`) contaminan la negociación Movida | **Riesgo Google verificado ~CERO (2026-06-11: nada indexado — removal innecesario).** Neutralizar precios + noindex (F2) quedan como cinturón; URL directa: subdominio → 308 al home (F3) y `/enterprise` → 308 `/pricing` (F6, post-plan 02) |
| Subdominio redirigido rompe acceso al panel `/org` en prod | ACEPTADO por el dueño (2026-06-11): solo afecta la org de prueba (cero clientes reales); `/admin/orgs` y el flujo del alumno `/e` viven en el dominio principal (intactos); suites E2E corren contra localhost (exentas); reversible en minutos (quitar redirect Vercel + revertir condicional) |
| Cambio legal interpretado como material (aviso 15 días de privacidad §12) | Análisis F2: no altera tratamiento de datos de usuarios existentes y no hay clientes enterprise → no material; `LAST_UPDATED` actualizado + git history como registro de versiones |
| Lead pregunta por enterprise (CSM) | Respuesta canónica: "planes empresariales a medida → contacto@eva-app.cl" (mismo copy de `/pricing` y `/legal`); nada se borró → si aparece una cadena grande, enterprise se desarchiva en ~1 semana (doc fuente Parte VIII) |
| Romper sin querer infra compartida con teams | Lista NO-TOCAR + check `git diff --stat` en el review de la tanda: ningún archivo de la lista aparece (salvo los 2 comentarios declarados) |
| Choque con el gate Movida pendiente | Este plan tiene CERO DDL; F0 es data-only, NO entra al branch efímero y va EMPAQUETADO en la sesión del gate (decisión 2026-06-11 — una sola ventana de riesgo); los specs nuevos se corren en el mismo gate autorizado |
| Health scores congelados en `/admin/orgs` | Documentado en F1; aceptado (feature archivada, panel sigue cargando); F6 anota la columna "(congelado 2026-06)" para que nadie lea data vieja como fresca |
| F7 fail-closed: si `CRON_SECRET` falta en algún env, los 6 crons vivos devuelven 401 silencioso y dejan de correr | Verificación manual de la env var en Vercel ANTES del deploy + revisar en logs la primera corrida programada post-deploy + rollback de 1 línea por archivo (nota de riesgo completa en F7) |
| Redirect 308 activado ANTES del deploy del plan 02 rompería los links de la landing viva hacia `/enterprise` | Secuenciado explícito en F6 y en el Orden sugerido (paso 6, post-plan 02); mientras tanto F2 (noindex + description sin precio) es la red de seguridad |
| Los diffs de F6 en `/admin/orgs` y de F7 en crons vivos rozan la lista NO-TOCAR | Excepciones DECLARADAS en los ítems 9 y 12 de la lista (solo los diffs de F6/F7, nada más); el check `git diff --stat` del review valida que no haya diffs adicionales |

## Definition of Done

- [ ] Orgs de prueba en `status='active'` (verificado por SELECT) y flujo `/e` e2e navegable.
- [ ] `vercel.json` sin `org-health-alert` ni `payment-reminder`; route handlers intactos con comentario de archivado.
- [ ] `/legal` y `/privacidad` sin oferta ni precios "Plan Enterprise", con copy "planes empresariales a medida → contacto@eva-app.cl" y `LAST_UPDATED` al día; footer de `/legal` sin link a contrato.
- [ ] `/legal/contrato-enterprise` dormida: 200, aviso histórico, sin precios de lista, `noindex`, cero links entrantes desde superficies vivas.
- [ ] `/enterprise` (dominio principal) con `noindex` y meta description sin "$89.990"; contenido de la página sin cambios (queda dormida vía plan 02).
- [ ] **F3:** condicional del proxy aplicado (`/org/*` → `/login` en dominio principal) + redirect 308 del subdominio activo en Vercel + entrada en RUNBOOK (estado + reversión); landing de venta enterprise inalcanzable por subdominio.
- [ ] Docs canónicas actualizadas (CLAUDE.md, AGENTS.md mobile, bitácora director, NEXT_STEPS).
- [ ] Spec `enterprise-archive.spec.ts` escrito (incluye asserts 401 de F7 y el assert 308 condicionado de F6); `pnpm typecheck`/`test`/`build` verdes en la tanda.
- [ ] **F6:** acción `setOrgStatusAction` en `/admin/orgs` operativa con audit log; columna Health anotada "(congelado 2026-06)"; fix `statusTone` (`'trialing'`→`'trial'`) aplicado.
- [ ] **F6 (secuenciado):** redirect 308 `/enterprise` → `/pricing` activo POST-deploy del plan 02 (puede cerrar después del resto del plan).
- [ ] **F7:** 10 guards de cron fail-closed; `CRON_SECRET` verificada en Vercel pre-deploy; primera corrida programada post-deploy verificada en logs.
- [ ] **Manuales:** ~~removal Search Console~~ (innecesario — Google limpio, verificado 2026-06-11); redirect 308 del subdominio configurado en Vercel (F3 paso 2); tabla de crons activos en RUNBOOK/MANUAL_TASKS; tarea de seguimiento IVA/EVAapp SpA registrada (D5).
- [ ] Lista NO-TOCAR con cero diffs no declarados (los de F6/F7 están declarados en los ítems 9 y 12).
- [ ] GATE ejecutado en verde (sección siguiente) — suites enterprise y separation siguen verdes (el archivado no debe mover NINGÚN assert de aislamiento).

---

## ⚠️ GATE DEL PLAN (ejecución de Playwright/SQL — NO correr sin autorización)

> **⚠️ ANTES DE CORRER: preguntar al usuario — tiene tests pendientes de otros planes (gate Movida) y la regla 2026-06-10 exige autorización explícita.** Recomendación: adjuntar estos specs al MISMO gate consolidado de Movida (1 sola corrida autorizada, `--workers=1`, contra build prod) para no gastar Disk IO Budget dos veces (memoria `project_supabase_micro_limits`). **RATIFICADO 2026-06-11 (decisión del dueño): F0 y estos specs van EMPAQUETADOS en la sesión del gate Movida — una sola ventana de riesgo. La autorización explícita dentro de esa sesión sigue siendo obligatoria.**

Con OK explícito del usuario, en este orden:

1. **F0** (si no se ejecutó aún — corre ACÁ, dentro de la sesión del gate, por decisión 2026-06-11): inventario + UPDATE de orgs (prod, data-only, idempotente) + audit log. Si la acción F6 ya está deployada, puede usarse como vía equivalente (mismo audit log).
2. `npx playwright test tests/archive/enterprise-archive.spec.ts` (project chromium, páginas públicas — verifica el copy nuevo).
3. `npx playwright test --project=separation --workers=1` — incluye `happy-paths` (flujo org `/e/e2e-performance-lab` sigue vivo con la org en `active`), `module-matrix` e invariantes de navegación.
4. Suite SQL `tests/separation/separation-invariants.sql` (INV1-14 — la fixture enterprise sigue siendo el negativo del aislamiento de teams).
5. `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1` — requiere stack local (`supabase start` + `db reset`); si el seed local está desactualizado (memoria `project_v2_working_rules`), reportar y NO bloquear el plan por un rojo de seed: esta suite no cubre nada que este plan cambie (el plan no toca RLS).
6. Manual (7 min): `/admin/orgs` carga, muestra la org en `active`, el botón activar/suspender de F6 responde (probar 1 toggle ida y vuelta sobre la org de prueba + verificar el audit log) y la columna Health dice "(congelado 2026-06)"; `/legal`, `/privacidad` y `/legal/contrato-enterprise` en prod muestran el copy nuevo (sin menciones de IVA — D5); `eva-app.cl/enterprise` responde con `noindex` y meta sin precio (o 308 → `/pricing` si el redirect F6 ya está activo post-plan 02); `GET /api/cron/org-health-alert` sin header en prod → 401 (F7); **`https://enterprise.eva-app.cl/` responde 308 → `https://eva-app.cl/` (F3)**; `eva-app.cl/org/cualquier-cosa` redirige a `/login` (guard F3); flujo del alumno `/e/e2e-performance-lab` en dominio principal sigue navegable.
7. Post-deploy de F7 (no bloquea el gate, queda agendado): verificar en logs de Vercel la primera corrida programada de un cron diario (`nutrition-cycles` 11:00 UTC o `trial-expiry` 12:00 UTC) — confirma que el fail-closed no apagó los crons vivos.
