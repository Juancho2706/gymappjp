# EVA Nutrición V2 — validación, riesgos y bloqueos conocidos

**Fecha:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**PR:** #121, draft

Este archivo debe actualizarse cada vez que se cierre o descubra un bloqueo. Es la fuente de verdad para no confundir infraestructura creada con producto terminado.

---

## 0. ACTUALIZACIÓN 2026-07-14 — merge a `rnmobiledenuevo` + estabilización

La rama se mergeó (fast-forward) a `rnmobiledenuevo`; PR #121 quedó MERGED y la rama
`Nuevascosasrnopenai` fue eliminada. Se corrió una revisión multi-agente completa del
código entrante (13 áreas, verificación adversarial). Cambios de estado:

### Cerrado en la ola de estabilización (rama `fix/nutrition-v2-stabilization`)

- **P0.1 Vitest** → VERDE. Era 1 solo test: `tests/mobile/flags.test.ts` asertaba el
  registro de flags sin `nutritionV2Student/Coach`. Expectativa actualizada.
- **P0.2 Gateways profesionales** → RESUELTO end-to-end. Contrato nuevo
  `NutritionV2CoachScopeSchema` (`packages/nutrition-v2/read-models.ts`) con invariantes
  cruzadas; web (`nutrition-v2-read.service.ts` + pages coach) y API móvil
  (`api/mobile/nutrition-v2/coach/route.ts`) llaman las RPC scoped con
  `p_scope_type/p_team_id/p_org_id`; RN obtiene el workspace de `useWorkspace()`
  (NO de `useEntitlements()` como decía el handoff — ese hook no expone scope) vía
  `lib/nutrition-v2-scope.ts` (puro, testeable) y la cache local pliega el workspace
  en la key. 14 tests nuevos (contrato, 400 fail-closed, cache keys).
- **P1.1 Cancelación RN** → RESUELTO en `alumno/nutrition-v2/index.tsx` con
  `mountedRef`+`controllerRef` (variante ref porque `load` tiene 4 call sites).
- **P0 NUEVO (no documentado): `packages/nutrition-v2` sin `package.json`** → RESUELTO.
  pnpm no registraba el paquete y Metro no resuelve `@eva/nutrition-v2` → el bundle RN
  no compilaba (web/vitest lo ocultaban vía tsconfig paths). Fix: package.json +
  `"@eva/nutrition-v2": "workspace:*"` en `apps/mobile` + lockfile.
- **CI boundaries roto en GitHub** → RESUELTO. `paths` con `[coach_slug]` literal es
  character-class de glob: GitHub ni registraba el workflow (runs `push`, 0 jobs).
  Reemplazado por `c/**/nutrition-v2/**`.
- **vercel.json CSP**: se restauró `https://us.i.posthog.com` explícito (sin regresión
  funcional — `*.posthog.com` ya lo cubría — pero se elimina el token duplicado).
  `ignoreCommand` (pausa de builds) SE MANTIENE hasta CI verde y bloque listo.

### Hallazgos NUEVOS de la revisión (backlog priorizado)

**P1 — SQL, requieren migración de seguimiento (validar con protocolo DB: EXPLAIN +
tx-rollback antes de prod; riesgo INACTIVO hoy: rollout cerrado, 0 datos V2):**

1. `nutrition_v2_guard_intake_mutation` (mig 190000 ~L349): en UPDATE solo inspecciona
   `OLD.idempotency_key` → un authenticated puede promover una fila V1 propia a entrada
   "V2" forjada (idempotency_key null→valor + snapshot_* arbitrarios) saltando el RPC
   canónico y la auditoría. Fix: rechazar transición null→not-null fuera del allowlist.
2. `publish_idempotency_key` (mig 190000 ~L241 + 190500 L486): índice único GLOBAL y
   lookup cross-tenant ANTES del check de permisos → colisión entre tenants devuelve el
   version id ajeno. Fix: unicidad por `(plan_id, key)` y filtrar el pre-check.
3. History read model (mig 210500 ~L24): `candidate_dates` UNION sin cota inferior
   escanea TODO el historial del alumno por página, y el CTE se recomputa 2 veces →
   O(total) por página. Fix: empujar `p_before` a cada rama + índices `(client_id,
   log_date DESC)` + un solo pase.
4. `supabase/tests/nutrition_v2_domain_rollback.sql`: nunca ejercita los read models
   nuevos ni denegación cross-tenant (42501 para un sub sin relación). Ampliar.

**P1 — aplicación:**

5. Pantalla alumno V1 web: `NutritionDailyOverview` (nuevo) + hero de `NutritionShell`
   muestran DOS totales de kcal contradictorios cuando hay intake off-plan (el nuevo
   suma off-plan a lo prescrito; el shell solo plan). Unificar antes de que llegue a
   usuarios (hoy solo vive en `rnmobiledenuevo`).

**P2 seleccionados (lista completa en los reportes de revisión):**

- Rate limiting ausente en POST intake / catalog search+report (Upstash ya existe en el repo).
- Cola offline V2 = código muerto: `enqueueNutritionV2Mutation` sin productor (la
  pantalla alumno V2 es read-only); `flushPromise` singleton no segmentado por usuario.
- `clearNutritionV2CacheForUser`/`clearNutritionV2QueueForUser` sin cablear en logout.
- Scanner add-food V1 (RN) re-dispara en bucle ante not_found (falta `scannerPaused`
  como en scanner.tsx V2); idempotency key del reporte PWA usa `Date.now()` (anula dedup).
- Cambios V1 (add-food, guidance, "Consumo real") van SIN flag → llegan al 100% al
  mergear a master; decidir si se gatean.
- `/c/[slug]/nutrition/add` no aplica el gate de dominio de nutrición (bypass por URL).
- `FoodCatalogCurationQueue` muta PostgREST directo desde el cliente (RLS lo acota,
  pero rompe el data-flow del repo); `getDailyHabits` usa `getUser()` en hot path.
- SQL: publish futuro expone versión no vigente; drafts no borrables por authenticated;
  `serving_size=0` explota macros (greatest 0.0001); payloads sin LIMIT; ventanas 7d en
  UTC; `normalize_text` IMMUTABLE sobre unaccent STABLE; importador permite
  auto-declarar `eva_verified` y `--apply` no es atómico; checker de boundaries se
  bypasea con re-exports barrel.
- Bucket `food-media` público permite listing (advisor WARN; vacío hoy).

### ACTUALIZACIÓN 2026-07-15 (madrugada) — Tandas 6 y 7 del alumno + catálogo

- **Tanda 6 CERRADA (web + RN):** Hoy del alumno con registro completo — "Lo comí"
  por item prescrito, registro libre desde catálogo (búsqueda + scanner), editar
  vía correction chain, retirar = corrección a contribución cero (paridad
  web/RN, cadena de auditoría intacta; NO existe RPC de void — un intento de
  usarlo fue cazado por la revisión adversarial), cierre del día idempotente.
  RN con offline real: productor de la cola cableado (A3 cerrada: suites de
  cache y cola con dedup/backoff/dead-letter/corrupción/aislamiento).
- **Tanda 7 RN CERRADA:** tabs Hoy/Plan/Historial; Plan con estrategia/objetivos/
  franjas; Historial con cursor pagination + dedupe + detalle lazy por día.
- **Quick-wins:** doble-total V1 explicado (Plan vs extras), gate de dominio en
  /nutrition/add, getClaims en habits, curación por server action.
- **Navbar coach RN:** rebote exagerado corregido (port al patrón Reanimated del
  alumno; causa: Moti+useState reiniciando springs). Logout coach a 1 tap.
- **Catálogo:** 586 genéricos globales (270 USDA nuevos traducidos + 316
  calibrados). Semilla OFF Chile: 4.312 productos con barcode LISTOS en lotes
  locales (gate de calidad aplicado) — PENDIENTE de OK del CEO para el apply.
- **Pendiente de las Tandas:** 8 (Centro/Ficha coach completos), 9 (Builder V2),
  10 (gamificación), 11-12 (hardening y canary). E2E/device QA sin correr.

### Estado CI tras la ola

Vitest 2374/2374 ✅ (local), typecheck web ✅, mobile tsc ✅ (tras cierre del WIP de
NutricionTab), boundaries por primera vez registrable en GitHub. `ignoreCommand`
sigue activo en `vercel.json` (retirar cuando el CEO decida generar Preview).

---

## 1. Estado de CI observado

Última corrida revisada después de corregir errores móviles:

| Gate | Estado |
|---|---|
| instalación frozen lockfile | PASS |
| lint | PASS |
| typecheck web | PASS |
| paridad de tokens | PASS |
| typecheck Expo React Native | PASS |
| Vitest | FAIL |
| dependency audit | no ejecutado por fallo previo |
| E2E | omitido por fallo de quality |
| nutrition smoke | omitido por fallo de quality |

No solicitar merge ni quitar el estado draft mientras Vitest esté rojo.

---

## 2. Bloqueadores P0

### P0.1 Vitest falla

Síntoma:

```txt
npx vitest run → failure
```

Lint/typecheck/tokens pasan antes del fallo.

Acción:

1. ejecutar la suite completa localmente;
2. capturar todos los tests fallidos en una sola corrida;
3. diferenciar regresión real, contrato desactualizado o problema de entorno;
4. corregir implementación o expectation;
5. no usar `.skip`, `.only` ni reducir cobertura;
6. ejecutar nuevamente todos los gates.

### P0.2 Gateway profesional desalineado con Supabase

Supabase revocó para authenticated:

```txt
get_nutrition_coach_hub_v2
```

RPC vigentes:

```txt
get_nutrition_coach_hub_scoped_v2
get_nutrition_client_detail_scoped_v2
```

Los gateways actuales todavía llaman RPC sin scope en:

```txt
apps/web/src/services/nutrition-v2-read.service.ts
apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts
apps/mobile/lib/nutrition-v2.api.ts
```

Impacto:

- Hub/ficha del coach pueden fallar aunque el rollout esté abierto;
- el UI afirma respetar el workspace, pero el contrato de aplicación no lo transporta;
- riesgo de regresión de aislamiento si alguien reabre el RPC viejo.

Resolución:

- scope explícito standalone/team/organization;
- teamId/orgId validados server-side;
- tests positivos y negativos;
- cache key con workspace;
- jamás reotorgar el RPC sin scope como atajo.

### P0.3 No generar Preview final con CI rojo

`vercel.json` mantiene pausa temporal:

```json
"ignoreCommand": "exit 0"
```

No retirar hasta:

- Vitest verde;
- scope profesional corregido;
- bloque listo para una única build.

---

## 3. Bloqueadores P1

### P1.1 Cancelación RN incorrecta

Archivo:

```txt
apps/mobile/app/alumno/nutrition-v2/index.tsx
```

Problema:

- `load()` crea AbortController;
- devuelve cleanup desde una función async;
- `useEffect` no recibe ese cleanup;
- request puede seguir después de navegar.

Resolver con controller en efecto/ref y guard de mounted state.

### P1.2 Offline queue sin suite dedicada

Existe implementación de queue, backoff y dead letter, pero faltan tests para:

- deduplicación;
- separación entre usuarios;
- retry 408/429/5xx;
- error terminal 4xx;
- máximo de intentos;
- replay tras reconectar;
- persistencia corrupta;
- logout/account switch.

### P1.3 Cache RN sin pruebas completas

Falta validar:

- key por usuario/alumno/workspace;
- TTL;
- stale permitido/no permitido;
- schema mismatch;
- payload >750 KB;
- limpieza por usuario;
- cambio de workspace;
- datos privados nunca compartidos.

### P1.4 Scanner PWA usa RPC directo

Archivo:

```txt
apps/web/src/components/nutrition-v2/FoodScannerClient.tsx
```

Riesgos:

- observabilidad distinta al endpoint móvil;
- sin rate limiting central;
- error contract diferente;
- más superficie de grants públicos.

Recomendación: usar gateway server-side protegido por sesión/gate.

### P1.5 Sin catálogo real

Infraestructura lista, datos no:

```txt
barcode: 0
productos CL: 0
food_media: 0
```

El scanner no puede considerarse funcional para producción hasta importar un lote piloto.

---

## 4. Riesgos de Supabase

### 4.1 Base productiva única

No existe entorno aislado con copia de datos reales. Mantener:

- migraciones aditivas;
- rollback tests;
- cero pruebas con datos reales;
- scopes explícitos;
- grants mínimos.

### 4.2 Drift de nombres de migración

Los nombres en Git usan timestamps planificados; Supabase registra timestamps de aplicación diferentes. Comparar por nombre, no asumir igualdad exacta de versión temporal.

### 4.3 Functions SECURITY DEFINER

Revisar siempre:

- `search_path = ''`;
- referencias fully-qualified;
- revoke public/anon;
- execute solo para roles requeridos;
- validación de `auth.uid()`;
- scope de alumno/workspace.

### 4.4 Índices sin tráfico

Advisors pueden marcar índices V2 como unused porque tablas están vacías. No borrarlos antes de canary; primero medir queries reales.

### 4.5 Snapshots vacíos

El sistema permite snapshot honesto sin plan. Verificar UX para no confundir “sin plan” con error de carga.

---

## 5. Riesgos de seguridad y privacidad

### Acceso profesional

- team/org/standalone no deben mezclarse;
- private notes solo profesionales;
- alumno no actualiza versión publicada;
- intake V2 solo RPC;
- correcciones conservan original.

### Storage

- `food-media` es público: solo assets curados/licenciados;
- `food-submissions` es privado: ruta por userId;
- falta validar imagen real antes de upload;
- falta proceso de moderación/promoción.

### Analytics

No enviar:

- nombre del alumno;
- texto de notas;
- alimentos personalizados;
- diagnóstico;
- objetivos clínicos;
- imágenes privadas.

Eventos solo con IDs técnicos, duración, resultado y categorías no sensibles.

---

## 6. Riesgos de rendimiento

Aún no medido:

- p50/p95 de RPC;
- payload Today/Plan/History/Hub/Detail;
- request count;
- Web Vitals;
- bundle scanner;
- FPS/memoria RN;
- egress de media;
- hit/miss de cache;
- offline replay.

Budgets rectores:

- Today: 1 read principal, máximo 2 críticos;
- intake: 1 escritura idempotente;
- Hub: resumen paginado;
- History: cursor;
- imágenes de lista: thumbnail, no original.

---

## 7. Riesgos UX/UI

### Vertical slices incompletos

Las rutas canary prueban arquitectura, pero no representan toda la experiencia aprobada.

Faltan:

- Today completo;
- Plan/History RN;
- intake integrado;
- edición/copia/eliminación;
- Builder;
- swaps/intercambios;
- navegación final;
- Pro completo;
- gamificación controlada.

### White label

Probar siempre:

1. EVA claro;
2. EVA oscuro;
3. white label claro;
4. white label oscuro.

No usar color de marca para success/error.

### Accesibilidad

Pendientes de QA:

- tab order;
- screen reader;
- dynamic text RN;
- targets;
- orientación/tablet;
- reduced motion;
- scanner con fallback no visual.

---

## 8. Matriz de validación mínima

| Área | Unit | Integration | E2E/device | Estado |
|---|---:|---:|---:|---|
| contratos Zod | parcial | no | no | pendiente |
| publicación/versiones | sí, SQL rollback | sí | no | parcial |
| intake/correction | sí, SQL rollback | parcial | no | parcial |
| Today read model | parcial | SQL | no | parcial |
| History | parcial | SQL | no | parcial |
| Hub scoped | no suficiente | SQL puntual | no | bloqueado gateway |
| cache RN | no | no | no | pendiente |
| offline queue | no | no | no | pendiente |
| catálogo/GTIN | unit parcial | SQL rollback | no | parcial |
| scanner PWA | no | no | no | pendiente |
| scanner RN | no | no | no | pendiente |
| themes/white label | tokens | no | no | pendiente |

---

## 9. Condiciones antes de merge

- [ ] CI completo verde.
- [ ] RPC scoped conectado.
- [ ] Vercel pause retirada solo al final.
- [ ] Preview final aprobado.
- [ ] SQL rollback tests repetibles.
- [ ] E2E canary.
- [ ] QA RN real.
- [ ] datos piloto controlados.
- [ ] documentación actualizada.
- [ ] plan de rollback.
- [ ] aprobación manual de Juan.

PR #121 debe permanecer draft hasta entonces.
