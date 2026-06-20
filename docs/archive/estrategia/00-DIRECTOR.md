# 00 · DIRECTOR — Estrategia "Teams-first" (archivar enterprise, modulos add-on, planes consolidados)

> Indice + decisiones + bitacora del esfuerzo estrategico decidido por los socios el 2026-06-11. Leer al iniciar cada sesion de este frente. Hermano del director Movida (`docs/plans/movida/00-DIRECTOR.md`) — **el gate consolidado de Movida sigue siendo PRIORIDAD 1 y nada de este set lo bloquea**.

- **Doc fuente (decisiones + auditoria + research):** [2026-06-11-teams-first-modulos-addons.md](2026-06-11-teams-first-modulos-addons.md)
- **Branch de trabajo:** `feat/movida-platform` (o sub-ramas). Commit/push solo cuando el dueno lo pida.
- **Memorias relacionadas:** `project-teams-first-strategy` (la decision y sus gotchas) · `project-plan1-gate-pending` (gate Movida) · `project-movida-commercial` (regla de precios pre-cierre).

---

## 1. Los 5 planes

| # | Plan | Que ejecuta | Estado | Depende de |
|---|---|---|---|---|
| 01 | [Archivado enterprise](01-PLAN-archivado-enterprise.md) | Org de prueba a `active`, crons fuera, copy legal, noindex/neutralizar precios viejos googleables, guarda DNS, docs. CERO DDL, cero landing | ✅ Autorado + review 14 lentes | — (urgente pre-12-jun la parte de precios googleables) |
| 02 | [Landing Teams UI](02-PLAN-landing-teams-ui.md) | SOLO UI de landing: fuera seccion/nav/CTAs enterprise, nueva `LandingTeamsSection` (SIN precios), CTA Empresas mailto, i18n, specs | ✅ Autorado + review | 01 (noindex /enterprise); F3 (4 cards) bloqueada por 04 |
| 03 | [Modulos compra-only](03-PLAN-modulos-compra-only.md) | Migracion grants (REVOKE tabla + GRANT allowlist de columnas en coaches/teams — cierra el auto-toggle gratis), catalogo read-only con explicaciones ricas (que hace + donde estan sus utilidades), bloque modulos en admin coaches, grupo "MODULOS" en nav | ✅ Autorado + review | Gate Movida (la migracion va en branch efimero) |
| 04 | [Consolidacion planes + ciclos](04-PLAN-consolidacion-planes-ciclos.md) | `SALE_TIERS` (free/starter/pro/elite a la venta; union/CHECK intactos = grandfather), **trimestral+anual en TODOS los pagos**, mobile en la misma tanda, fix RPCs MRR stale, grandfathering growth/scale | ✅ Autorado + review | F0 (decisiones del dueno: techo elite, precios) |
| 05 | [Billing add-ons self-service](05-PLAN-billing-addons-selfservice.md) | Tabla `coach_addons` (+trigger sync `enabled_modules`), monto compuesto en create-preference, PUT de monto MP, seccion Add-ons en suscripcion + signup, 5 reglas de pago visibles con aceptacion, compromiso minimo 1 ciclo, sandbox MP | ✅ Autorado + review | 03 y 04; decisiones de precio |

**Orden de ejecucion recomendado:** gate Movida → 01 (la parte anti-ancla de precios ANTES del 12-jun si se puede) → 02 → 03 → 04 → 05. El plan 02-F3 (recorte a 4 cards) y la `TeamsPlanCard` se ejecutan en la tanda del 04.

## 2. Reglas transversales del set

- **Testing:** cada plan lista sus tests como tareas de ESCRITURA; la ejecucion de Playwright/SQL/sandbox vive en la seccion "GATE DEL PLAN" de cada uno y **SIEMPRE pregunta al usuario antes** (regla 2026-06-10; el dueno tiene gates pendientes de planes anteriores). typecheck+vitest por tanda si.
- **Movida exenta:** nada de precios de lista publicado antes del cierre (reunion 12-jun). Su contrato es custom.
- **Migraciones:** todas aditivas, compatibles con el protocolo de branch efimero del director Movida §3. Candidatas a compartir branch: grants del 03 + RPCs MRR del 04 (si el timing de deploy lo permite — ver secuencia F2 del plan 03: la migracion de grants NO puede llegar a prod antes de que el codigo que la acompana este DESPLEGADO).
- **Mobile:** `apps/mobile` duplica el mapa de tiers → toda tanda del 04 toca los 4 archivos mobile en el mismo cambio.

## 3. Decisiones — RESUELTAS (dueno, 2026-06-11)

**F0 (las 5 de arranque):**
1. ✅ Techo de `elite`: **sube a 100 alumnos**, bump REGALADO a elite activos (UPDATE idempotente, plan 04 F4.5).
2. ✅ Precios starter/pro/elite: **SIN cambios** ($19.990/$29.990/$44.990) — mas valor mismo precio; revision post-Movida.
3. ✅ Precio de modulos: **$9.990/mes uniforme** (standalone). Team: por contrato (sugerencia interna ~$29.990, no publica).
4. ✅ Add-ons **CON descuento de ciclo** (-10% trim / -20% anual). Caso trim/anual: **cortesia solo en mensual**; en trimestral/anual la alta cobra one-shot prorrateado inmediato (adelanto del v2 solo para esos ciclos).
5. ✅ IVA: **silencio total** en copy de precios hasta constituir EVAapp SpA (en proceso, jun-2026); tarea de revision al constituirse.

**Operativas (defaults aplicados — el dueno puede vetar):**
6. ✅ F0 plan 01 empaquetado con la sesion del gate Movida. 7. ✅ `payment-reminder` se quita. 8. ❌ Search Console removal **INNECESARIO** (dueno verifico 2026-06-11: Google no tiene NADA indexado de enterprise — el noindex queda como cinturon). 9. ✅ Redirect 308 `/enterprise`→`/pricing` post-plan-02. 10. ✅ Nav landing: item "Teams" (title SEO conserva 'Gyms'). 11. ✅ SLA suavizado: "Te contactamos a la brevedad". 12. ✅ Dropear policies muertas SI + 9na persona e2e con modulos ON. 13. ⏳ Query prod del GATE 04: sigue pidiendo OK al momento. 14. ✅ starter NO compra `nutrition_exchanges` (Pro+). **15. ✅ NUEVA (2026-06-11): subdominio `enterprise.eva-app.cl` → redirect 308 a `eva-app.cl`** (Vercel) + guard `/org/*` del proxy a `/login` en el mismo deploy — la landing de venta enterprise queda invisible por doble redirect (subdominio→home, `/enterprise`→`/pricing`); el CODIGO no se borra (reversible en minutos). Plan 01 §F3 actualizado de condicional a ejecutable.

**Restriccion global:** cero servicios pagos nuevos — todo con el stack ya contratado (Supabase, Resend, PostHog, Vercel, Upstash).

## 4. Mejoras descubiertas — TODAS APROBADAS (2026-06-11) e integradas a sus planes

El dueno aprobo el backlog completo (unica condicion: nada que cueste plata — verificado: todas usan stack existente). Integradas como tareas en cada plan (workflow `integrar-decisiones-planes`). Referencia rapida de las destacadas:

| Mejora | Origen | Costo | Nota |
|---|---|---|---|
| Quick-win noindex en `/enterprise` HOY (1 linea) | 02 | trivial | Mata el ancla "$89.990" googleable sin esperar el plan 01 completo |
| REVOKE de columnas de scoping en `clients` (org_id/team_id/coach_id) | 03 | migracion chica | Misma clase de hueco que enabled_modules: un coach podria mover clientes de scope por PATCH |
| Hardening fail-closed de los 8 guards de cron (`if (!CRON_SECRET) return true`) | 01 | 8 lineas | Hoy un cron sin env var queda ABIERTO |
| Set-once de `invite_code` a nivel DB | 03 | trigger 3 lineas | Evita hijack/rotacion del identificador primario del coach |
| Mapa de tiers a `packages/` compartido web+mobile | 04 | refactor mediano | Mata la clase entera de drift (ya divergio: EditSheet perdio free/growth; RPC MRR con precio viejo) |
| Bug pre-existente: admin manda `yearly`, CHECK exige `annual` | 04 | 2 lineas | La palanca admin de billing_cycle anual esta ROTA hoy |
| Recibo email transaccional en alta/baja de add-on (Resend) | 05 | chico | Evidencia SERNAC + menos tickets |
| Snapshot de desglose por cobro (`billing_snapshots`) | 05 | tabla chica | "Que me cobraron este mes" exacto ante reclamos |
| Eventos PostHog del funnel de add-ons | 05 | chico | Valida la decision anti-hostigamiento con datos |
| Telemetria de intencion de compra en el catalogo (pre-plan-05) | 03 | chico | Datos reales de demanda ANTES de fijar precios |
| Tabla de crons activos en MANUAL_TASKS/RUNBOOK | 01 | doc | Hoy solo vercel.json + codigo lo saben |
| Test de paridad i18n GLOBAL (no solo landing.*) | 02 | trivial | Detecta keys huerfanas en todos los namespaces |

## 5. Bitacora

| Fecha | Que se hizo | Estado |
|---|---|---|
| 2026-06-11 | Doc fuente (auditoria 3 agentes + verify + 3 research jun-2026) → decisiones de socios | ✅ |
| 2026-06-11 | 5 planes autorados (5 autores) + review con 14 lentes de rol (5 reviewers; ~40 mustFix aplicados con evidencia verificada contra codigo real; hallazgos extra: precio enterprise $49.990 publicado en /legal/contrato-enterprise y $89.990 en /enterprise — anti-ancla pre-12-jun agregada al plan 01) + director + cross-links | ✅ Set completo |
| 2026-06-11 | **Decisiones F0 del dueno integradas + backlog de mejoras COMPLETO integrado** (workflow 5 agentes, ~90 cambios): elite→100 con bump regalado, precios sin cambios, modulos $9.990 uniforme, descuento de ciclo en add-ons con bifurcacion mensual-cortesia / trim-anual-one-shot-prorrateado, IVA en silencio hasta EVAapp SpA (en proceso). Fases nuevas: 01-F6 (admin orgs status, redirect 308, fix statusTone) + 01-F7 (fail-closed de 10 guards de cron — el sweep encontro 10, no 8) + 02-F2bis (medicion CTA /api/contact-teams) + 03-F1.4/F1.5/F2.1b (hallazgo NUEVO: revoke de scoping de clients ROMPERIA reasignacion por org admin — apps/enterprise/lib/org-admin.ts:172 escribe coach_id user-scoped → refactor prerrequisito) + 04-F6 (paquete @eva/tiers compartido web+mobile) + 05 rediseñado para bifurcacion por ciclo (Riesgo 9: flujo one-shot MP nuevo, bloqueante de sandbox). Doc fuente alineado. | ✅ Planes listos para ejecutar (orden: gate Movida → 01…) |
| 2026-06-11 | **Decision 15 + verificacion Google:** dueno verifico `site:` queries — Google NO tiene nada de enterprise indexado → Search Console removal INNECESARIO (decision 8 invertida). Nueva decision: subdominio `enterprise.eva-app.cl` → **redirect 308 a eva-app.cl** + guard proxy `/org`→`/login` mismo deploy; landing de venta enterprise invisible por doble redirect, codigo queda dormido. Plan 01 §F3 reescrito (condicional → ejecutable), doc fuente §1.4 supersedido, memoria actualizada. | ✅ |
