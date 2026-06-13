# Estrategia "Teams-first": archivar Enterprise, modulos como add-ons de pago y consolidacion de planes

> **Fecha:** 2026-06-11 · **Decision de los socios:** archivar enterprise para un futuro lejano, apostar por Teams como segunda forma comercial de EVA, convertir los 4 modulos nuevos en add-ons de pago controlados por el CEO, y consolidar los planes de suscripcion (eliminar Growth y Scale).
>
> **Base de este documento:** auditoria multi-agente del codigo real (3 auditores + 1 verificador adversarial, evidencia file:line) + 3 investigaciones web con fuentes fechadas junio 2026 (monetizacion de add-ons, pricing de teams en fitness SaaS, capacidades de MercadoPago). Workflow `estrategia-teams-first` (wf_583197b3).

---

## Resumen ejecutivo

| Decision | Veredicto de factibilidad | Esfuerzo |
|---|---|---|
| Archivar enterprise (quitar visibilidad) | ✅ Totalmente factible y BARATO: ~6 archivos de landing + 1 cron. El 95% del codigo enterprise ya es "organicamente invisible" | Bajo (1 tanda) |
| Eliminar subdominio enterprise.eva-app.cl | ⚠️ Factible PERO no recomendado todavia: matarlo rompe la org de prueba, 3 cuentas e2e permanentes y deja un redirect roto. Mantener el host (costo $0) y archivar solo la visibilidad | — |
| Modulos como add-ons de pago (self-service en standalone / CEO en teams) | ✅ Factible. El wiring ya esta listo (nav, gates, kill-switch). Faltan 4 piezas: bloqueo RLS (CRITICO — hoy un coach puede auto-activarse modulos por API sin pagar), settings read-only, panel admin para coaches standalone, y la pieza de cobro self-service | Medio |
| Consolidar a 3 planes pagos + free | ✅ Factible. ~15 archivos web + 4 mobile + 1 CHECK de DB. Gotcha: `scale` es el placeholder interno de cuentas team/org-managed | Medio |
| Cobro de add-ons con MercadoPago | ✅ Factible con UN preapproval por coach (monto = base + add-ons, actualizable via PUT). MP **no tiene prorrateo nativo** — se emula o se simplifica | Medio-alto |
| Pricing de lista para Teams | ✅ Modelo recomendado: tramos de **alumnos activos** + coaches ilimitados (nadie en la industria cobra por seat de coach) | Decision comercial |

---

# PARTE I — Archivar Enterprise

## 1.1 Que tan entrelazado esta realmente (hallazgo central)

La auditoria mapeo **~120 archivos** de rutas enterprise (`/org`, `/e`, `/enterprise` marketing), 3 ramas del proxy, 6 tipos de workspace (3 de ellos enterprise), 4 crons, el JWT hook y ~30 migraciones de DB. La conclusion es mejor de lo esperado:

**El codigo enterprise ya es "organicamente invisible".** Un coach standalone o de team jamas ve nada enterprise: las ramas del workspace engine solo materializan para usuarios con filas en `organization_members`, el panel `/org` solo es alcanzable via subdominio + membresia, y el alumno `/e` requiere `clients.org_id`. **No hay nada que "apagar" en el motor — solo hay que quitar las puertas de entrada visibles.**

## 1.2 Lo que NO se puede tocar (infra compartida con Teams — verificado adversarialmente)

El verificador confirmo que estas piezas "enterprise" son en realidad **infraestructura viva de teams/standalone**. Tocarlas rompe el build o el aislamiento:

1. **Workspace engine completo** (`workspace.service.ts`): genera los workspaces enterprise JUNTO a `coach_team`/`student_team`/standalone en el mismo loop. Filtrarlas romperia el multi-contexto de josefit y las personas e2e.
2. **`services/org/org.service.ts`**: `team.actions.ts` (crear coach de pool) y el panel CEO de teams **importan** `generateTempPassword`/`generateUniqueCoachSlug` de ahi. Borrar org.service rompe el flujo Movida.
3. **`org.repository.ts`**: re-exportado por el barrel `infrastructure/db/index.ts` que consumen los dashboards de coach standalone y `/c`. Borrarlo rompe el build de standalone.
4. **Scoping 3-vias** (`client-scope.service.ts`, `coach-scope.service.ts`): los filtros `.is('org_id', null)` de la rama standalone son **exactamente lo que aisla** standalone/team de las filas enterprise. Quitarlos mezclaria pools.
5. **JWT hook** (`custom_access_token_hook`): el chequeo MFA es parte del mismo hook. NO desactivar.
6. **Guards de pagos** (`org_managed` en webhook MP y mp-reconcile): protegen TAMBIEN a `team_managed`. Compartidos.
7. **DB enterprise (9+ tablas, ~30 migraciones)**: JAMAS DROP — el merge de branches Supabase re-ejecuta todo el historial; un DROP romperia el flujo Movida. Ademas `workspace.repository` consulta `organization_members` en cada resolucion de workspace de CUALQUIER usuario.
8. **Cuentas e2e enterprise (3 personas @evatest.cl) + org de prueba + `tests/enterprise/`**: son la fixture NEGATIVA de las suites de aislamiento que protegen a teams (`separation-invariants.sql` las usa para probar que el team NO ve datos de org). Nunca borrarlas.
9. **`resolve-invite.ts`**: resuelve codigos de org ANTES que team y standalone en el MISMO archivo — no tocar el orden.

## 1.3 Plan de archivado minimo (orden de ejecucion)

**Paso 1 — Landing (el cambio visible):**
- `app/page.tsx`: quitar import + render de `LandingEnterpriseSection` → crear **`LandingTeamsSection`** en su lugar (ver Parte VI). Ajustar meta description (menciona "planes enterprise").
- `LandingPillNav` (x2 desktop/mobile): quitar item "Para Gyms".
- `LandingFinalCTA` y `LandingPricingPreview`: cambiar links enterprise a CTA "Empresas → contacto@eva-app.cl" (el callout de `/pricing` **ya tiene exactamente ese patron** con mailto — usarlo de modelo).

**Paso 2 — Crons (1 linea c/u en vercel.json, opcional):**
- ⚠️ `org-health-alert` corre DIARIO y **puede auto-suspender la org de prueba** cuando expire su trial → antes de nada, poner la org de prueba en status `active` (o trial lejano) via `/admin/orgs`, y luego quitar el cron.
- `payment-reminder` (recordatorios de org_invoices): no-op con cero invoices pendientes; quitar opcional.

**Paso 3 — Copy legal (baja prioridad):** `legal/page.tsx` seccion 5.1 "Plan Enterprise" + link del footer a `/legal/contrato-enterprise`; `privacidad/page.tsx` seccion 11. Reescribir hacia "planes empresariales a medida via contacto@eva-app.cl".

**Paso 4 — NO tocar:** proxy, workspaces, DB, `/admin/orgs` (queda como la unica puerta enterprise, para administrar la org de prueba), rutas `/org` y `/e` (quedan dormidas: sin links entrantes, inaccesibles para el publico).

**Paso 5 — Docs en la misma PR:** CLAUDE.md (zonas protegidas), AGENTS.md de mobile (nota "enterprise coach entra por esta app" → desprioritizado), bitacora del director. Hay 795 menciones de enterprise en 37 docs — actualizar solo las canonicas, el resto es historico.

## 1.4 Sobre eliminar enterprise.eva-app.cl (DNS/Vercel)

> **DECISION DEL DUENO (2026-06-11, supersede la recomendacion de abajo):** el subdominio pasa a **redirect 308 → eva-app.cl** (config de dominio en Vercel, sin borrar dominio ni DNS), acompañado del cambio del guard `/org/*` del proxy en el MISMO deploy. Contexto que habilito el cambio: Google verificado LIMPIO (nada indexado de enterprise) → riesgo de ancla ~cero, y el dueno quiere la landing de venta enterprise invisible. Consecuencia aceptada: panel `/org` inaccesible en prod (solo org de prueba; `/admin/orgs` y el flujo `/e` del alumno viven en el dominio principal, intactos; E2E exentas por localhost). Ejecucion: plan 01 §F3. El analisis original queda abajo por trazabilidad.

**Recomendacion original (superseded): NO eliminarlo todavia. Costo de mantenerlo: $0.**

Si se quita el host hoy:
- `proxy.ts:145-147` redirige TODO `/org/*` del dominio principal a `https://enterprise.eva-app.cl` muerto (NXDOMAIN) → la org de prueba y e2e-org-owner pierden todo acceso.
- `defaultWorkspaceHome` rutea cuentas con membership org a `/org/[slug]` → cualquier login de esas cuentas en eva-app.cl termina en host muerto.
- Las suites Playwright NO se rompen (corren contra localhost, eximido del redirect), pero los flujos manuales si.

Si igual se quiere matar el DNS a futuro: **primero** cambiar el redirect de `proxy.ts:146` a `/login` o 404 (1 condicional). Las sesiones enterprise existentes mueren solas con el subdominio (cookies scoped) sin afectar eva-app.cl.

**El subdominio sin links entrantes y sin marketing es invisible** — nadie llega ahi sin conocer la URL. Archivar visibilidad logra el objetivo comercial sin romper nada.

---

# PARTE II — Modulos como add-ons de pago (modelo SAP)

## 2.1 Respuesta directa: ¿ya funcionan como menus en la barra?

**SI — ya funciona exactamente como lo imaginas, con un matiz.** El menu del coach es un registro unico (`NAV_MODULES` en `coach-nav.ts`) donde cada item declara sus contextos y, los modulos, su `entitlement`. Hoy:

- **Cardio** y **Movimiento** tienen item propio en la barra → aparecen SOLO si el modulo esta ON (OFF = ni se ven, sin candados).
- **Composicion corporal** vive dentro de la ficha del alumno (link condicional) y **Intercambios** dentro de Nutricion (modo del plan) — no tienen item propio de barra, por diseño (son funciones de otra superficie).
- El layout resuelve los modulos del contexto activo UNA vez por request (pool manda en team, propios en standalone) + aplica el kill-switch de operador, y se los pasa al sidebar. **El gate real es server-side (`assertModule`) en cada accion — el menu es espejo visual.**

Lo que CAMBIA con tu decision no es el mecanismo (ya esta listo) sino **quien escribe el toggle**.

## 2.2 Hallazgo CRITICO de la auditoria: hoy cualquiera puede auto-activarse modulos

No es solo que exista la UI self-service en Settings > Modulos. El problema de fondo es la RLS:

- **`coaches_update_own`** (baseline) permite a un coach hacer `PATCH /rest/v1/coaches?id=eq.<su_id>` con `{"enabled_modules": {...}}` **directo contra la API de Supabase** y activarse los 4 modulos gratis, aunque borremos la UI.
- **`team_teams_manager_update`** permite al owner/co-gestor setear `teams.enabled_modules` **e incluso `teams.seat_limit`** por API, saltandose al CEO.

**Fix obligatorio (aditivo, va en una migracion):** REVOKE a nivel de columna (`REVOKE UPDATE(enabled_modules) ON coaches/teams FROM authenticated` — PostgREST respeta grants de columna; agregar `seat_limit` de teams) o trigger guard estilo `coaches_org_managed_guard`. De paso proteger `subscription_tier`/`max_clients`/`subscription_status` de coaches, que estan igual de expuestos. Tras esto, la escritura queda SOLO en service-role (admin/webhook).

## 2.3 Modelo de activacion (decision del dueno, 2026-06-11)

**El principio: nadie se activa un modulo GRATIS. Pero el camino de activacion difiere por forma:**

- **Coach standalone → SELF-SERVICE de pago.** El coach agrega el add-on desde `/coach/subscription` (seccion Add-ons), acepta las reglas de pago visibles, el monto se suma a su suscripcion y el modulo se activa al confirmar — **sin esperar al CEO**. La escritura del entitlement la hace el SERVIDOR (service-role) como consecuencia del pago, jamas el coach directo contra la DB — por eso el hardening RLS (2.2) sigue siendo obligatorio: cierra el camino gratis, no el de compra.
- **Teams → activacion por el CEO** desde `/admin/teams`, porque el billing de teams es manual/por contrato (link MP o transferencia). El precio del modulo se pacta en el contrato del team.
- **Override del CEO:** el CEO ademas puede activar/desactivar modulos a CUALQUIER cuenta (standalone incluido) desde el panel admin — cortesias, demos, cuentas de prueba, soporte. Es la palanca administrativa, no el flujo comercial.

**Reglas de pago — claras y VISIBLES en el momento de activar (y en la pagina de precios):**

1. El modulo se activa de inmediato al confirmar.
2. Se cobra completo desde el proximo corte de facturacion. **La cortesia de la fraccion restante aplica SOLO en ciclo mensual** (decision 2026-06-11); en trimestral y anual la alta cobra de inmediato un pago unico prorrateado por la fraccion restante (si no, un anual usaria hasta 12 meses gratis).
3. **Compromiso minimo: 1 ciclo cobrado.** Activar el add-on compromete el cobro del proximo corte aunque se desactive antes (cierra el exploit activar→usar→desactivar sin pagar).
4. Cancelacion cuando quiera, efectiva al fin del ciclo ya pagado. Sin reembolsos de fracciones.
5. Estas reglas aplican a los precios de LISTA; los contratos custom (ej. Movida) se rigen por su contrato.

Estas 5 reglas se muestran en el modal/paso de confirmacion de compra (checkbox de aceptacion), en la seccion Add-ons de `/coach/subscription` y en la pagina publica de precios. Nada de letra chica.

## 2.4 Cambios necesarios (4 piezas)

1. **Migracion de hardening RLS** (la de arriba). Aditiva, entra al protocolo de branch.
2. **Settings > Modulos → catalogo read-only.** El componente YA tiene estado read-only construido (banner + switches disabled para miembros no-gestores). Cambio: `canEdit=false` para todos los roles coach, reemplazar switches por badges ("Activo" / "Disponible como add-on") + descripcion comercial (ya existe) + CTA a `/coach/subscription#modulos`. `saveModulesAction` se elimina del flujo coach.
3. **Panel CEO para coaches standalone (GAP — no existe).** `/admin/teams` YA tiene los toggles de modulos (create + edit sheet, con audit log) — es el patron exacto a copiar. Pero el editor admin de coaches (`UpdateCoachSchema`) NO incluye `enabled_modules`: sin construir ese bloque, los add-ons standalone quedan inalcanzables (ni CEO ni coach podrian activarlos). Es prerequisito de todo lo demas.
4. **Pieza de cobro self-service** (Parte IV) — incluye el paso de aceptacion de las reglas de pago (2.3).

## 2.5 Menu mejorado: grupo "Modulos" en la barra

Propuesta (cambio chico, 2-4 archivos, derivado del campo `entitlement` que ya existe):

- **Desktop:** sidebar con dos bloques separados por un divisor con label "MODULOS" — items core arriba, modulos comprados abajo. En modo colapsado el divisor es una linea. El grupo solo se renderiza si hay ≥1 modulo ON.
- **Mobile/PWA (bottom bar con scroll):** modulos contiguos al final del scroll (hoy cardio/movement estan ENTRE Ejercicios y Nutricion — moverlos al final). Si a futuro hay 4+ items de modulo: item "Mas" que abre un sheet.
- Los specs E2E (`module-matrix.spec.ts`) assertan el ORDEN EXACTO del nav → actualizar las listas esperadas en el mismo cambio.

Esto escala solo: cualquier modulo futuro que declare `entitlement` cae al grupo automaticamente.

## 2.6 Anti-hostigamiento (tu regla) vs "gating honesto" (lo que dice el research)

Tu regla: jamas decirle al coach "esto solo con el add-on X" mientras usa la app. El diseño actual ya juega a favor: **los modulos OFF se OCULTAN del nav** (no candados), y el alumno solo ve modulos ON.

El research 2026 (Stigg/Docsie) matiza: mostrar el feature bloqueado con badge convierte 12% vs 5% del paywall generico, y "el cliente no puede desear lo que no sabe que existe". **Sintesis recomendada — lo mejor de ambos:**

- **Nav y superficies de trabajo: ocultamiento total** (tu regla). Cero banners en dashboard, builder, clientes, app del alumno.
- **Exactamente 2 superficies de venta:** (1) Settings > Modulos como catalogo (muestra los 4 con descripcion y estado), (2) seccion "Add-ons" en `/coach/subscription` (donde el coach ya esta en mentalidad de pago — es lo que pediste). Ahi si se muestra lo disponible con precio y CTA.
- URLs directas a modulos OFF: redirect amable a `/coach/settings/modules` en vez de error seco.
- Maximo de prompts: el research documenta que >3 prompts por sesion genera churn — con el diseño de 2 superficies ni nos acercamos.

## 2.7 Cuentas de prueba ON

- Teams de prueba: el CEO ya puede activar modulos via `/admin/teams` (manual, hoy mismo).
- Standalone de prueba (juanmvr, e2e-solo-coach): requiere la pieza 3 (panel admin) o update directo service-role.
- ⚠️ Las 8 personas e2e de la matriz de separacion estan seedeadas con modulos `{}` y `module-matrix.spec.ts` asserta el nav SIN modulos. **No prender modulos en las personas de la matriz** — usar las cuentas manuales (yolomon/juanmvr/team Movida test) para probar con modulos ON, o agregar personas dedicadas "con modulos" al seed con sus propias listas esperadas.

## 2.8 Precio de los modulos (benchmarks junio 2026)

Regla de industria: cada add-on al **20-50% del plan base** (bajo 20% se subvalora; sobre 50% deberia ser tier). Benchmarks fitness reales: Trainerize nutricion avanzada $20-45 USD/mes, video coaching $10, MyPTHub Check-Ins AI $30, Everfit Meals $33-39, Automation $24. Con 4 add-ons EVA queda en el rango sano (4-6).

**Precios DECIDIDOS por el dueno (2026-06-11):**

| Modulo | Standalone (por coach) | Team (flat por team) |
|---|---|---|
| Cardio | **$9.990/mes** | por contrato (sugerencia interna ~$29.990, NO publica) |
| Screening de movimiento | **$9.990/mes** | por contrato |
| Composicion corporal (ISAK/BIA) | **$9.990/mes** | por contrato |
| Intercambios + PDF branded | **$9.990/mes** | por contrato |
| Bundle los 4 | post-v1 (4x$9.990=$39.960 → bundle ~$29.990 si se hace) | por contrato |

Precio uniforme $9.990 = simplicidad de mensaje y de codigo (un solo precio en el calculo compuesto). Los add-ons escalan con los descuentos de ciclo (-10% trimestral / -20% anual) — decision D4. **Copy de IVA: silencio total hasta constituir EVAapp SpA (en proceso, jun-2026).**

Racionales: (a) **flat por team, jamas por coach** — en un pool plano el alumno es compartido (¿que pasaria si el coach A tiene cardio ON y el B no?); toda la industria cobra add-ons flat por cuenta. (b) Evaluaciones (movement + bodycomp) soportan el extremo alto: son el diferenciador kine/nutri. (c) Patron "comprable abajo, incluido arriba" (Trainerize Studio Plus, DeepL): **considerar** incluir los 4 en el tier pago mas alto de standalone como motor de upgrade — PERO ver el conflicto con Movida en Parte V (recomendacion: NO incluirlos en tiers de lista hasta cerrar Movida).

---

# PARTE III — Consolidacion de planes (matar Growth y Scale)

## 3.1 Lo que existe hoy (auditado)

6 tiers en `constants.ts` / `domain/coach/types.ts`:

| Tier | Precio CLP/mes | Alumnos | Capacidades |
|---|---|---|---|
| free | $0 | 3 | nada extra |
| starter | $19.990 | 10 | branding, import, ejercicios custom — SIN nutricion |
| pro | $29.990 | 30 | todo ON |
| elite | $44.990 | 60 | todo ON + trimestral |
| **growth** | $84.990 | 120 | todo ON (a eliminar) |
| **scale** | $190.000 | 500 | todo ON, anual $1.9M hardcodeado (a eliminar) |

Descuentos: trimestral -10%, anual -20%. Quedarian: **free + starter + pro + elite** (3 pagos + 1 free ✅).

## 3.2 Impacto tecnico del recorte

- **Web (~15 archivos):** union type, `TIER_CONFIG`, `TIER_CAPABILITIES`, `TIER_ALLOWED_BILLING_CYCLES`, validaciones Zod (create-preference, register, onboarding, admin), `getRecommendedTier` (su fallback hoy es `'scale'`), `ReactivateClient`, pricing page (grupo "Negocio establecido" y FAQ), landing (grid dimensionado para 6 cards → 4), tests de constants.
- **Mobile (4 archivos):** `apps/mobile` DUPLICA el mapa de tiers literal (no importa de web) — actualizar en el mismo cambio o divergen.
- **DB:** CHECK `coaches_subscription_tier_check` incluye los 6 valores; indice parcial `idx_coaches_growth_tier`; 3 RPCs de MRR del admin hardcodean precios (y `scale=64990` esta DESACTUALIZADO hoy — bug pre-existente, aprovechar de corregir).

## 3.3 GOTCHA critico: `scale` es el placeholder de cuentas gestionadas

`/admin/teams` crea owners de team con `subscription_tier: 'scale'` + status `team_managed`; la migracion de backfill paso miembros de team de free a scale; org hace lo mismo. **Decision necesaria antes de tocar el CHECK:**

- **Opcion recomendada:** dejar `scale` como **valor legacy solo-DB** (sale del union type de venta y de toda UI, pero el CHECK lo conserva) — cero migracion riesgosa, las cuentas gestionadas no cambian. Documentar.
- Alternativa: introducir tier `managed` + backfill — mas limpio, mas trabajo, requiere migracion con backfill de filas existentes.

## 3.4 Subscribers existentes (grandfathering)

Antes del recorte, consultar en prod cuantos coaches activos tienen `subscription_tier IN ('growth','scale')` con preapproval real. **Politica recomendada: grandfather** — mantienen su plan y precio mientras no cambien; los tiers solo salen de la VENTA. Es lo mas seguro (no exige tocar el CHECK ni migrar preapprovals vivos) y es el estandar de la industria. Un webhook de un preapproval growth/scale en vuelo hoy caeria a fallback sin crashear, pero congelaria el tier — con grandfather ese caso no existe.

## 3.5 Decisiones de producto que el codigo fuerza

1. **Techo de plataforma — DECIDIDO (2026-06-11): elite sube a 100 alumnos** (bump regalado a los elite activos), con puente "mas de 100 o mas de un coach → Teams". Precios de tiers SIN cambios ($19.990/$29.990/$44.990): mas valor mismo precio, cero riesgo pre-Movida; revision post-cierre.
2. **Trimestral** existe solo en elite+ → si elite queda tope, queda solo ahi (OK).
3. Layout de pricing/landing pasa de 6 a 4 cards (+ card Teams, Parte VI).

---

# PARTE IV — Billing de add-ons con MercadoPago (lo que se puede y lo que no)

## 4.1 Capacidades reales de MP (verificado contra docs oficiales, jun-2026)

| Necesidad | ¿MP lo soporta? | Detalle |
|---|---|---|
| Actualizar monto de suscripcion activa | ✅ SI | `PUT /preapproval/{id}` con `auto_recurring.transaction_amount`. El helper `mpPutJson` YA existe en el codigo (hoy solo se usa para cancelar) |
| ¿Cuando aplica el nuevo monto? | ⚠️ No documentado | Comportamiento efectivo: proximo cobro (el PUT no genera cargo). **Validar en sandbox antes de lanzar.** MP notifica el cambio al pagador por email |
| Prorrateo a mitad de ciclo | ❌ NO | Solo existe `billing_day_proportional` en la PRIMERA factura de planes mensuales. Todo prorrateo es logica nuestra |
| Cambiar frecuencia (mensual↔trimestral↔anual) | ❌ NO via PUT | `frequency` es inmutable → se mantiene el patron actual de EVA (preapproval nuevo con `start_date = fin del ciclo` + supersede), que ya funciona |
| Trimestral/anual | ✅ SI | EVA YA cobra months=1/3/12 en produccion |
| Cancelar a fin de ciclo | ⚠️ Emulable | `cancelled` es TERMINAL e irreversible; no hay cancel_at_period_end nativo → emular con `end_date` actualizable o flag en DB + cron |
| Varias suscripciones por pagador (base + addon separados) | ⚠️ Viable pero MALO | Cada preapproval exige SU PROPIO checkout/autorizacion del coach (friccion brutal para un add-on chico) + N superficies de dunning + el webhook asume UN subscription_mp_id por coach |

## 4.2 Arquitectura de cobro recomendada

**UN solo preapproval por coach. Monto = plan base + suma de add-ons activos.**

- **Punto unico de calculo ya existe:** `create-preference/route.ts:83` (`getTierPriceClp`) — ahi se suma el precio de los modulos.
- **Tabla nueva `coach_addons`** (o `billing_items`): module_key + estado + precio congelado, escrita SOLO por service-role (admin/webhook). El monto en MP es opaco — la fuente de verdad de entitlements sigue siendo la DB reconciliada por webhook + mp-reconcile. `enabled_modules` se deriva/sincroniza de ahi.
- **Alta de add-on a mitad de ciclo (self-service del coach standalone, sin intervencion del CEO):**
  - *v1 (decision final 2026-06-11 — bifurcada por ciclo):* el coach agrega el add-on y acepta las reglas de pago (2.3) → entitlement ON inmediato en DB (server action service-role) → `PUT` del nuevo monto. **Ciclo MENSUAL: el add-on es de cortesia hasta el proximo corte** y se cobra completo desde ahi. **Ciclo TRIMESTRAL/ANUAL: la alta cobra de inmediato un one-shot prorrateado por la fraccion restante** (si no, un anual usaria hasta 12 meses gratis) — adelanto del prorrateo solo para esos ciclos; detalle e implementacion en el plan 05.
  - **Regla anti-abuso (obligatoria con self-service): compromiso minimo de 1 ciclo cobrado.** Activar compromete el cobro del proximo corte aunque el coach desactive antes — sin esto, activar→usar→desactivar dentro del mismo ciclo seria gratis e infinitamente repetible. Implementacion: la baja solicitada antes del primer cobro del add-on toma efecto DESPUES de ese cobro (flag en `coach_addons` + el cron mp-reconcile la aplica).
  - *v2 con prorrateo:* igual + un **pago one-shot** por la fraccion restante del ciclo calculada por EVA (MP no prorratea; el one-shot es otra autorizacion → friccion). Solo si el dinero de la fraccion importa.
- **Baja de add-on:** PUT bajando el monto, efectivo proximo ciclo, acceso hasta el corte, **sin reembolso** (estandar de industria — exactamente lo que pediste), respetando el compromiso minimo de arriba.
- **Cambio de ciclo con add-ons:** patron supersede existente (preapproval nuevo con el monto compuesto).
- **Teams:** mientras el billing de teams sea manual (link/transferencia, como Movida), los add-ons de team van por contrato + toggle CEO en `/admin/teams` — **ya implementado hoy**.

## 4.3 Flujo de compra del coach (UX)

1. **Signup:** elegir plan → paso opcional "Add-ons" con toggles que actualizan el total en vivo (patron Aircall/2026) → un solo checkout MP con el monto compuesto. Las reglas de pago (2.3) visibles en ese paso.
2. **In-app:** `/coach/subscription` gana seccion "Add-ons" (estado + agregar/quitar, **self-service sin esperar al CEO**) — unica superficie de gestion junto al catalogo de Settings > Modulos. El paso de confirmacion muestra precio + las 5 reglas + checkbox de aceptacion.
3. **Cancelacion de add-on:** misma seccion, "se desactiva al fin del ciclo actual" (con compromiso minimo de 1 ciclo cobrado si aun no hubo cobro) — igual que prometemos para downgrades de plan.
4. **Teams:** sin self-service de add-ons — el owner conversa con EVA y el CEO los activa segun contrato (billing manual). El catalogo de Settings los muestra igual (read-only) con CTA "conversemos".

---

# PARTE V — Pricing de lista para Teams (research jun-2026)

## 5.1 El hallazgo que ordena todo: nadie cobra por seat de coach

En TODO el mercado fitness 2026, el seat de coach NO es el eje de cobro:

- **Plataformas de coaching** cobran por **alumnos activos** con coaches gratis: Everfit Studio ($105/50 → $430/500 clientes), Trainerize ($23/5 → $248 Studio Plus por ubicacion), TrueCoach (coaches adicionales sin costo).
- **Gym management** cobra **flat por ubicacion con staff ilimitado**: PushPress ($159-229), Mindbody ($99-699), el chileno **Boxmagic** (por alumnos activos: $18.000+IVA/25 → $69.990+IVA/250).

Para el pool plano de EVA es ademas el unico metric coherente: cobrar por coach desincentiva sumar profesionales (que es justo lo que genera lock-in — mas profesionales adentro = mas dificil irse), y el add-on por coach es incoherente cuando el alumno es compartido (¿que veria el alumno que entrena con un coach que tiene cardio y otro que no?).

**Y es el metric que protege la infra:** el alumno es quien genera el costo, no el coach. Un coach extra = un login mas y algunas queries; un alumno genera escrituras DIARIAS (logs de entrenamiento, registros de comida, check-ins, fotos en Storage, push) — los 300 alumnos de un team son el grueso del Disk IO del Supabase Micro (el cuello de botella real, incidente 2026-06-10). Cobrar por tramos de alumnos hace que el precio escale exactamente con el costo: team que pasa de 100 a 300 alumnos → la infra lo siente y la factura sube; team que pasa de 5 a 12 coaches con los mismos alumnos → la infra ni se entera y no se les castiga. El `seat_limit` existente NO desaparece: queda como tope anti-abuso fijado por contrato, solo deja de ser el eje del precio.

## 5.2 Estructura recomendada (CLP +IVA, convencion local estilo Boxmagic)

| Nivel | Precio/mes | Incluye | Benchmark |
|---|---|---|---|
| **Team S** | $119.990 | hasta 100 alumnos activos, coaches ilimitados, marca del centro | Everfit Studio-100 = $165 USD ≈ $149k; ~2.7x el top standalone |
| **Team M** | $269.990 | hasta 300 alumnos, panel de equipo completo, soporte prioritario | rango internacional 300 alumnos: $229-430 USD |
| **Team L** | **"desde $499.990 — conversemos"** | 300+ alumnos, white-label por coach, onboarding dedicado, SLA | patron contact-sales de Mindbody/Glofox |
| Add-ons | flat por team (tabla Parte II) | nunca por coach | Trainerize/Everfit add-ons flat $8-45 USD |

"Precios conversables al correo" (tu idea) calza exactamente con el patron del tier L; S y M pueden publicarse con numero para anclar.

## 5.3 Coherencia con el deal Movida (CRITICO, deadline 12-jun)

El precio fundador Movida (~$890k, lista $1.2M) esta POR ENCIMA del benchmark de software puro para 300 alumnos (~$207-390k CLP equivalente). Es defendible **solo si la config Movida computa mas alto que cualquier tier de lista**: Team L base + los 4 modulos + white-label por coach + onboarding ISAK + soporte dedicado deben sumar a lista ~$1.1-1.2M, haciendo creible el descuento fundador.

**Regla derivada: NO publicar un tier de teams barato "todo incluido", y NO incluir los 4 modulos en ningun tier de lista (ni de teams ni el elite de standalone) hasta cerrar Movida.** Publicar hoy "Team M $269.990 con modulos incluidos" destruiria la negociacion con Ani antes del viernes. El patron "incluido en el tier alto" (Parte II) queda para revisar POST-cierre.

**Excepcion Movida (explicita):** TODO lo de este documento — precios de lista, self-service, reglas de pago estandar, tramos de alumnos — **NO aplica a Movida**. Movida es contrato custom (bundle Team L + 4 modulos + white-label + onboarding, precio fundador ~$890k) y se rige por lo que se pacte en su contrato. Reunion con ellos el 12-jun: nada de lo de lista se menciona ni se publica antes ni durante esa negociacion.

---

# PARTE VI — La landing nueva

1. **Fuera:** `LandingEnterpriseSection` ("Para Gyms" → enterprise.eva-app.cl + Calendly), item "Para Gyms" del nav, links enterprise de CTA final y pricing preview.
2. **Entra: `LandingTeamsSection`** — "EVA Teams: tu centro completo en una sola plataforma": pool compartido (todo tu equipo ve a todos los alumnos), marca del centro en la app de cada alumno, modulos profesionales (cardio, screening kine, antropometria ISAK, nutricion por intercambios), gestion self-service del equipo. CTA: "Conversemos → contacto@eva-app.cl" (o formulario, ver abajo). Anclar con Team S/M si se decide publicar numeros.
3. **CTA Empresas (lo que pediste):** entre tus dos opciones — **mailto es la v1 correcta** (cero codigo nuevo, el callout de /pricing ya lo tiene). El formulario que llega a contacto@eva-app.cl es v2 facil (server action + Resend que ya esta integrado) y captura mas leads (no depende del cliente de correo del visitante). Sugerencia: mailto YA en la tanda de archivado, formulario cuando se haga la seccion Teams completa.
4. **Pricing page:** 4 cards (free/starter/pro/elite) + card Teams "desde $119.990 — conversemos" + seccion Add-ons con los 4 modulos y sus precios (cuando la venta este lista; mientras tanto "proximamente").
5. **Registro:** el paso de add-ons en el signup entra junto con la pieza de cobro (Parte IV), no antes.

---

# PARTE VII — Roadmap de implementacion sugerido

**Contexto: el GATE consolidado de Movida (7 migraciones + suites + E2E) sigue pendiente y es PRIORIDAD 1 — nada de esto lo bloquea ni debe retrasarlo.**

| Fase | Que | Esfuerzo | Depende de |
|---|---|---|---|
| **F0** (ya) | Decisiones de los socios: precios finales, techo elite, politica grandfather | — | este doc |
| **F1** | Archivado enterprise: landing swap + Teams section v1 + CTA Empresas mailto + org de prueba a `active` + quitar cron + copy legal | 1 tanda | gate Movida NO la bloquea |
| **F2** | Modulos compra-only: migracion RLS hardening (entra al MISMO branch efimero del gate si se quiere) + settings → catalogo read-only + bloque modulos en admin coaches (override CEO) | 1-2 tandas | gate (la migracion) |
| **F3** | Consolidacion de planes: constants + UI + mobile + grandfather (scale queda como valor legacy solo-DB) | 1-2 tandas | F0 (decisiones) |
| **F4** | Menu: grupo "Modulos" en sidebar + reorden mobile + specs actualizados | 1 tanda chica | — |
| **F5** | Cobro de add-ons SELF-SERVICE (standalone): tabla coach_addons + suma en create-preference + PUT de monto + seccion Add-ons en subscription (agregar/quitar sin CEO) + reglas de pago visibles con aceptacion + compromiso minimo 1 ciclo + signup con add-ons + sandbox MP | la mas grande | F2, F3; validar sandbox |
| **F6** | Landing completa: seccion Teams con pricing + formulario Empresas + pricing page con add-ons | 1-2 tandas | F0, F5 (precios visibles) |

Orden recomendado: F1 ya mismo (es marketing, barato y sin riesgo) → gate Movida → F2/F3 → F4 → F5 → F6.

---

# PARTE VIII — Mi opinion honesta y veredicto de factibilidad

**Sobre archivar enterprise: decision correcta, y llegan en buen momento.** Los datos del codigo la respaldan: enterprise son ~120 archivos con CERO clientes reales (solo la org de prueba), mientras teams ya tiene un cliente ancla de $890k/mes en negociacion. La trampa que evitaron sin saberlo: como teams se construyo con tablas propias copiando patrones (en vez de reusar las de enterprise), el desacople es casi gratis — si se hubiera construido encima de `organizations`, este archivado seria un refactor de meses. Mi unica advertencia fuerte: **no borren nada, archiven visibilidad.** El codigo dormido no cobra renta (el subdominio tampoco), y la infraestructura compartida (workspace engine, scoping, org.service) es el esqueleto de teams. Borrar "lo enterprise" romperia lo que quieren potenciar. Si en 12-18 meses teams funciona y aparece una cadena grande pidiendo jerarquia y asignacion 1:1, enterprise se desarchiva en una semana.

**Sobre modulos como add-ons: es LA decision de producto correcta de este año, y el research lo confirma.** Los que cobran add-ons en fitness (Trainerize, Mindbody, PushPress, Everfit) facturan 1.5-3x el plan base via add-ons; los que no (TrueCoach, Hevy) compiten por precio y se estancan. EVA ademas tiene una ventaja rara: sus 4 modulos son CLINICOS (screening kine, ISAK, intercambios de nutricionista) — eso no lo tiene ningun competidor masivo, soporta el extremo alto del rango de precio, y es exactamente lo que un centro multidisciplinario valora. El timing tambien es bueno: el wiring tecnico (entitlements, nav, kill-switch, gates) quedo listo esta semana, ANTES de venderlos — implementar la politica compra-only (self-service pagado en standalone, contrato via CEO en teams) ahora cuesta poco; hacerlo con 50 coaches auto-activados habria sido doloroso. El hallazgo de la RLS (cualquier coach puede auto-activarse modulos por API) hay que cerrarlo ANTES de ponerles precio — si no, estarias vendiendo algo que se puede tomar gratis con un curl.

**Sobre matar growth/scale: de acuerdo, con una condicion.** 6 tiers para un SaaS con un solo fundador tecnico es paralisis de eleccion (el research da 3-4 como optimo) y growth/scale ($84.990/$190.000) compiten contra el producto que quieren vender a ese segmento: Teams. El recorte convierte el techo de standalone en el puente natural ("¿mas de 60-100 alumnos o mas de un coach? → Teams"). La condicion: **grandfather a los suscriptores existentes** y `scale` queda como valor legacy interno de cuentas gestionadas — la alternativa (migrar el CHECK + preapprovals vivos) es riesgo sin retorno.

**Sobre el cobro con MercadoPago: factible, pero es la pieza con mas trabajo real y la unica con riesgo tecnico.** MP no es Stripe: no hay prorrateo nativo, ni cancel-at-period-end, ni subscription items — toda esa logica vive en nuestra DB. La arquitectura de UN preapproval con monto compuesto + PUT es solida y la comunidad LATAM la valida, pero exige sandbox antes de lanzar (el timing del PUT no esta documentado) y una tabla de billing items bien diseñada. Mi consejo: **v1 sin prorrateo** ("el add-on se activa ya, se cobra desde el proximo corte") — es el estandar de SaaS de este tamaño, evita el 80% de la complejidad, y nadie se queja de recibir dias gratis.

**Sobre el pricing de Teams: la unica parte donde freno el entusiasmo.** El instinto de publicar precios de teams YA choca con el deadline de Movida (viernes 12). Cualquier numero publico se vuelve el ancla de Ani. Recomendacion operativa: esta semana la landing dice "Teams: conversemos" SIN numeros; los precios de lista (S $119.990 / M $269.990 / L desde $499.990) se publican DESPUES del cierre, calibrados para que la config Movida compute ~$1.1-1.2M a lista y el fundador $890k sea un descuento real.

**¿Se puede hacer todo? Si — y casi todo es barato.** F1 (archivado + landing) es una tanda. F2-F4 son tandas normales con una migracion que puede subirse al mismo branch del gate. F5 (cobro) es el unico proyecto de verdad (~1-2 semanas de trabajo cuidadoso con sandbox). Nada de esto toca el camino critico de Movida. El orden importa: **gate Movida primero** (es el cliente que paga todo lo demas), archivado de visibilidad en paralelo cuando quieras, y el motor de add-ons despues del cierre comercial.

---

*Generado con auditoria de codigo verificada (evidencia file:line en transcript del workflow `wf_583197b3`) + research web con fuentes citadas. Decisiones de precio finales: de los socios.*
