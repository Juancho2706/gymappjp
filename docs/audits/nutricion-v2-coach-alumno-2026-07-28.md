---
status: complete
owner: engineering
last_verified: 2026-07-28 @ 0fbf850d
canonical: false
---

# Auditoría de código — Nutrición V2 coach/alumno

Fecha: **2026-07-28** · commit **`0fbf850d`** · rama **`rnmobiledenuevo`**.

Método: revisión estática transversal de web, React Native, paquetes compartidos, RPC/RLS,
migraciones y pruebas; ejecución de gates focalizados.

> Evidencia puntual del commit indicado. No prueba prevalencia en producción, no reemplaza los
> documentos canónicos y no autoriza por sí sola un despliegue.

## 1. Alcance y límites

Incluido:

- alumno web standalone `/c/[coach_slug]/nutrition-v2` y Team `/t/[team_slug]/nutrition-v2`;
- alumno mobile `apps/mobile/app/alumno/(tabs)/nutrition-v2/*`;
- coach web `/coach/nutrition-v2/*` y coach mobile `apps/mobile/app/coach/nutrition-v2/*`;
- lectura, prescripción, publicación, asignación, catálogo, scanner, ingesta, corrección,
  offline, historial, curation, contratos, SQL/RPC/RLS y tests;
- V1 solo cuando afecta entrada, rollback o paridad de V2.

Excluido:

- **Enterprise/organizaciones no es parte del flujo soportado.** El alcance funcional es
  **standalone + Team**. `/e`, `/org` y `apps/enterprise` no se auditaron como variantes a
  preservar; sus referencias restantes se consideran deuda de retiro.
- No se consultaron producción, Edge Config, Vercel, Sentry ni datos reales.
- No hubo QA física Android/iOS, Playwright E2E con usuarios reales ni mutaciones externas.

## 2. Resultado ejecutivo

Hay controles valiosos —RLS, historial, read models tipados, idempotencia por clave y cobertura
unitaria amplia—, pero el flujo completo **no es consistente ni tiene un boundary autoritativo
uniforme** en este commit.

Se registran **42 hallazgos**: 5 P0, 11 P1, 19 P2 y 7 P3. P0/P1 expresan prioridad de
remediación antes de ampliar tráfico, no prevalencia confirmada en producción.

Conclusiones principales:

1. **Sí hay un camino reproducible de duplicación para el alumno:** offline, dos toques sobre
   “Lo comí” crean claves distintas y ambas operaciones quedan activas al sincronizar.
2. Existe otra duplicación independiente: coach mobile puede crear una segunda raíz de plan al
   elegir “Nueva versión”.
3. La escala de macros usa `serving_size` aunque el catálogo expresa nutrientes por 100 g/ml.
4. Mobile vuelve a escalar macros ya totalizados al marcar un alimento prescrito.
5. Coach mobile escribe directo a Supabase; rollout OFF y Nutrition Pro no se revalidan en varias
   RPC/RLS.
6. Las mutaciones web Team rechazan `/t/...` porque el schema solo acepta `/c/...`.
7. Persistir/publicar un plan no ocurre dentro de una transacción única.

## 3. Mapa observado

```text
coach web    → Server Actions → sesión/rollout/Pro → PostgREST/RPC
coach mobile → Supabase directo con JWT           → RLS/RPC
alumno web   → Server Action → guards              → RPC intake/correction
alumno RN    → API o cola offline                  → RPC → read model
```

La asimetría crítica está en coach mobile: varias mutaciones no atraviesan el mismo boundary
server-authoritative que web.

### Convención de ubicaciones abreviadas

Cuando un hallazgo repite solo el nombre, corresponde a esta ruta exacta; toda migración sin
prefijo vive en `supabase/migrations/`.

| Nombre abreviado | Ruta exacta |
|---|---|
| `nutrition-today.logic.ts` | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.ts` |
| `nutrition-today.logic.test.ts` | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.test.ts` |
| `TodayExperience.tsx` | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/TodayExperience.tsx` |
| `intake.actions.ts` | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_actions/intake.actions.ts` |
| `PlanBuilderClient.tsx` | `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx` |
| `builder.actions.ts` | `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_actions/builder.actions.ts` |
| `plan-persistence.ts` | `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts` |
| `quick-edit.actions.ts` | `apps/web/src/app/coach/nutrition-v2/_actions/quick-edit.actions.ts` |
| `nutrition-assign.actions.ts` | `apps/web/src/app/coach/nutrition-v2/_actions/nutrition-assign.actions.ts` |
| `curation.actions.ts` | `apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts` |
| `item-substitutions.data.ts` | `apps/web/src/app/coach/nutrition-v2/_data/item-substitutions.data.ts` |
| `FoodScannerClient.tsx` | `apps/web/src/components/nutrition-v2/FoodScannerClient.tsx` |
| `QuickEditMode.tsx` | `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx` |
| `nutrition-v2-builder.ts` | `apps/mobile/lib/nutrition-v2-builder.ts` |
| `nutrition-v2-quick-edit.ts` | `apps/mobile/lib/nutrition-v2-quick-edit.ts` |
| `nutrition-v2-read.service.ts` | `apps/web/src/services/nutrition-v2-read.service.ts` |

## 4. Hallazgos P0

### NUT-001 — La escala de macros del catálogo usa una base incompatible

El catálogo y el motor canónico expresan nutrientes por 100 g/ml, pero V2 divide la cantidad por
`serving_size`. Evidencia:

- contrato: `packages/nutrition-engine/macros.ts:3,105-127` y
  `docs/operations/FOOD_CATALOG_CL_IMPORT.md:87-94`;
- factor SQL: `supabase/migrations/20260714210000_nutrition_v2_today_plan_read_models.sql:62-77`
  y su consumo en el read model vigente:
  `supabase/migrations/20260720120000_nutrition_v2_item_media_read_models.sql:41-82`;
- réplica mobile: `apps/mobile/lib/nutrition-v2-intake.ts:339-385`;
- catálogo entrega macros crudos y porción:
  `supabase/migrations/20260714220500_food_catalog_v2_rpc.sql:139-172`;
- payloads: `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.ts:145-186`,
  `apps/mobile/lib/nutrition-v2-intake.ts:117-142` y
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/add-food-v2.tsx:300-329`.

Ejemplo: 155 kcal/100 g con porción de 60 g. Registrar 100 g debería dar 155 kcal; la fórmula
actual da aproximadamente 258,3. Registrar una unidad de 60 g puede conservar 155 en vez de 93.
Los tests dominantes usan `servingSize = 100`, donde ambas fórmulas coinciden:
`nutrition-today.logic.test.ts:97-141` y `tests/mobile-nutrition-v2-intake.test.ts:199-212`.

**Impacto:** macros, calorías e historial materialmente incorrectos. **Acción:** una función pura
compartida; g/ml contra 100 y unidad convertida por peso/volumen. Probar 30/60/125/250 y unidad.

### NUT-002 — “Lo comí” mobile vuelve a escalar macros ya totalizados

Web normaliza el total prescrito a una unidad estable en
`apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.ts:100-142`.
Mobile envía macros totales, cantidad original y `servingSize = null` en
`apps/mobile/lib/nutrition-v2-intake.ts:177-223`; se usa individual y masivamente en
`apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:527-572,719-779`.
La prueba `tests/mobile-nutrition-v2-intake.test.ts:108-127` valida el payload, no el total
reconstruido. Un ítem de 200 g y 330 kcal puede terminar en 660 kcal.

**Impacto:** el CTA principal duplica/multiplica intake. **Acción:** compartir el normalizador web
y probar el total persistido para cantidades 1, 100 y 200.

### NUT-003 — Doble toque offline duplica “Lo comí”

Este es el hallazgo que mejor coincide con el reporte de alumnos viendo duplicados.

Reproducción derivada del código: abrir Hoy → modo avión → tocar “Lo comí” → esperar que se
encole → volver a tocar → reconectar. Ambas operaciones son válidas.

- `consumedIds` solo refleja servidor, no el overlay offline:
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:486-493`.
- Cada toque crea `operationId/idempotencyKey` nuevos: mismo archivo `:527-552`.
- Al encolar se limpia pending y se rehabilita el botón: `:572-585,1581-1618`.
- La cola deduplica solo por idempotency key:
  `apps/mobile/lib/nutrition-v2-offline.ts:131-160`.
- La base solo exige `(client_id, idempotency_key)` único:
  `supabase/migrations/20260714190000_nutrition_v2_domain.sql:249-251`.

**Impacto:** dos entradas activas, dos filas y macros duplicados. **Acción:** overlay queued por
ítem, clave determinista mientras esté pendiente y defensa server-side por intención lógica;
E2E doble toque → reconexión → una entrada.

### NUT-004 — “Nueva versión” mobile puede crear otra raíz de plan

- Los CTA construyen `/builder/{clientId}` sin `planId`:
  `apps/mobile/lib/nutrition-v2-hub.ts:246-247`,
  `apps/mobile/app/coach/nutrition-v2/index.tsx:274,524` y
  `apps/mobile/app/coach/nutrition-v2/[clientId].tsx:362,464,666`.
- Builder toma `planId` solo de query params:
  `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:271-273`.
- Aunque carga `existingPlan`, arma persistencia con el ID de ruta: mismo archivo `:483-543`,
  especialmente `:505`.
- Con ID nulo, inserta plan nuevo: `apps/mobile/lib/nutrition-v2-builder.ts:1039-1080`.
- La base garantiza current por plan, no una raíz lógica por alumno:
  `supabase/migrations/20260714190000_nutrition_v2_domain.sql:30-60,237-254`.
- El selector de Plan carece de desempate por raíz/ID en
  `supabase/migrations/20260720120000_nutrition_v2_item_media_read_models.sql:550-559`; el hub sí
  desempata por publicado/fecha/ID en
  `supabase/migrations/20260716120000_nutrition_v2_prefer_published_plan_selection.sql:99-106`,
  pero solo oculta la raíz extra en vez de impedirla.
- El test codifica la URL incompleta: `tests/mobile-nutrition-v2-parity-helpers.test.ts:60-64`.
- Web sí pasa el plan existente:
  `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx:1209-1211`.

**Impacto:** Hub, Today y Plan pueden alternar entre raíces; archivar la nueva puede hacer
reaparecer la anterior. **Acción:** propagar `existingPlan.id`, imponer una raíz activa por
alumno/scope y ordenar por `published_at + version + id`.

### NUT-005 — Coach mobile salta rollout OFF y Nutrition Pro

- Selección/persistencia/archivado directos:
  `apps/mobile/lib/nutrition-v2.api.ts:262-273,329-363,396-417` y
  `apps/mobile/lib/nutrition-v2-builder.ts:1019-1208`.
- `publishDraftRN` confía en `hasNutritionPro` del cliente: mismo archivo `:1242-1274`; el
  comentario sobre revalidación server-side en `:1246-1247` no coincide con el camino real.
- Helpers RLS revisan auth/scope/draft, no billing, `enabled_modules` ni Edge Config:
  `supabase/migrations/20260714190500_nutrition_v2_security_rpc.sql:4-67,137-152,983-1047`.
- Publish valida auth/scope/idempotencia/estructura, no rollout/entitlement:
  `supabase/migrations/20260717130000_nutrition_v2_same_day_republish.sql:41-117,221-222`.
- Grants directos: `20260714190500_nutrition_v2_security_rpc.sql:1121-1125,1153-1156` y
  `20260718140000_nutrition_portions_v2.sql:84-85`.
- Web sí revisa rollout/Pro:
  `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:115-145` y
  `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_actions/builder.actions.ts:57-76`.
- Historia Pro se recorta post-fetch en
  `apps/web/src/app/coach/nutrition-v2/_lib/nutrition-pro.ts:10-27,69-84`; la RPC queda concedida
  según `supabase/migrations/20260714210500_nutrition_v2_history_coach_read_models.sql:394-400`.

**Impacto:** un coach autenticado dentro de su scope puede usar operaciones Pro o publicar aunque
el kill-switch esté OFF. No se demostró fuga arbitraria entre tenants; el bypass probado es de
rollout, entitlement y boundary. **Acción:** mutaciones coach sensibles detrás de un boundary que
derive workspace, rollout y entitlement desde sesión/DB.

## 5. Hallazgos P1

### NUT-006 — Web Team rechaza varias mutaciones de intake V2

`RevalidatePathSchema` solo acepta `/c/` en
`apps/web/src/app/c/[coach_slug]/nutrition-v2/_actions/intake.actions.ts:42-77`, mientras Team
genera `/t/` mediante `apps/web/src/lib/client/base-path.ts:5-11` y
`apps/web/src/proxy.ts:522,555,630,705`. La página y scanner pasan esa ruta en
`apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:254-260` y
`apps/web/src/app/c/[coach_slug]/nutrition-v2/scanner/page.tsx:57`.

**Impacto:** registrar, corregir, retirar, bulk registrar/bulk retirar y cierre del día pueden
devolver `INVALID_PAYLOAD` en Team; ajustes de porciones siguen otro camino y no tienen este bug.
**Acción:** derivar revalidación en servidor desde workspace; no aceptar la ruta del cliente.

### NUT-007 — Notas privadas se escriben donde el read model no lee

La fuente canónica es `nutrition_plan_private_notes_v2`:
`supabase/migrations/20260714191500_nutrition_v2_private_notes.sql:3-14,72-77,142-143`; detalle
lee esa tabla en `20260714210500_nutrition_v2_history_coach_read_models.sql:371-376`. Web/RN insertan
`private_notes` en la versión: `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:480-494`
y `apps/mobile/lib/nutrition-v2-builder.ts:1082-1096`. Quick edit fija `privateNotes: null` en
`quick-edit.actions.ts:165-176` porque asume preservación separada; no se observa copy-forward de
esa nota a la nueva versión.

**Impacto:** guardar parece exitoso, pero la nota no vuelve y se pierde al versionar. **Acción:**
upsert/copy-forward transaccional y test guardar → publicar → leer → nueva versión.

### NUT-008 — Quick edit puede borrar sustituciones por fallo o carrera

Web degrada un error a `[]` en
`apps/web/src/app/coach/nutrition-v2/_data/item-substitutions.data.ts:36-52`, lo pasa
desde `apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx:135-159` y reemplaza el árbol en
`quick-edit.actions.ts:202-214` más
`plan-persistence.ts:566-578`. Mobile inicia vacío y puede publicar antes de resolver:
`QuickEditMode.tsx:149-155,200-213,455-479`; su loader también degrada a mapa vacío en
`apps/mobile/lib/nutrition-v2-quick-edit.ts:826-864`.

**Impacto:** una lectura temporalmente fallida publica sin sustituciones. **Acción:** estados
loading/error/loaded, bloqueo de publish y merge server-side de colecciones no editadas.

### NUT-009 — Permisos del alumno no se imponen al ejecutar intake

La UI dice “Solo alimentos prescritos” en
`apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:345-358` y mobile
`apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:2223-2235`, pero mantiene CTA libres en
`TodayExperience.tsx:304-325` y mobile
`apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:1294-1304`. Acciones/API/RPC no imponen
`canRegisterFreely`, ajuste, sustitución o
movimiento: `intake.actions.ts:111-170,231-242`,
`apps/web/src/app/api/mobile/nutrition-v2/intake/route.ts:90-143` y
`supabase/migrations/20260718140000_nutrition_portions_v2.sql:180-239`.
La RPC acepta snapshots de macros aportados por cliente en `:180-207,259-328`; el Zod de
`packages/nutrition-v2/contracts.ts:188-227` no protege una llamada PostgREST directa.

**Impacto:** cliente modificado ignora restricciones y forja nutrientes. **Acción:** resolver
permisos y macros canónicos dentro de RPC/servicio; aceptar solo ID, cantidad/unidad e intención.

### NUT-010 — Brecha semántica: “Retirar” deja un reemplazo activo con macros cero

Web/mobile conservan cantidad positiva y construyen una corrección de contribución cero en
`nutrition-today.logic.ts:236-280` y
`apps/mobile/lib/nutrition-v2-intake.ts:277-327`. La RPC corrige original e inserta reemplazo activo:
`supabase/migrations/20260721130000_nutrition_v2_correct_intake_inherit_original_link.sql:89-126`. El read model lo
devuelve en `20260720120000_nutrition_v2_item_media_read_models.sql:373-473`, y bulk considera
consumido cualquier intake activo vinculado: `packages/nutrition-v2/bulk-mark.ts:42-53`. El E2E
`tests/nutrition-v2/alumno-hoy.spec.ts:37-80` acepta explícitamente que siga “Registrado” y solo
comprueba ausencia de error runtime; no verifica el estado posterior autoritativo.

Los comentarios del código declaran este comportamiento intencional para conservar auditoría, por
lo que el hallazgo es una brecha entre el verbo de producto y el modelo, no corrupción probada.
**Impacto:** si “retirar” significa dejar de aparecer como consumido, el ítem puede seguir marcado.
**Acción:** confirmar la semántica; si debe desaparecer, usar void terminal o excluir reemplazos
de macros cero con causa void en read/bulk y probar el estado final.

### NUT-011 — Persistencia/publicación no es atómica

El archivo se llama transaccional en `plan-persistence.ts:30-37`, pero ejecuta pasos secuenciales
y reconoce que no hay transacción en `:349-355,461-620,583-586`. RN duplica el flujo en
`apps/mobile/lib/nutrition-v2-builder.ts:1000-1215`. Otros factores:

- `max(version)+1` en cliente: `plan-persistence.ts:420-459`;
- reutiliza una raíz sin publicación, pero no recupera/limpia su versión o árbol parcial:
  `:361-379`;
- retry genera nueva clave: `PlanBuilderClient.tsx:1184-1194,1223` y
  `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:511-519`;
- builder omite CAS: `plan-persistence.ts:393-399`, `builder.actions.ts:33-37` y comentario SQL
  `20260717130000_nutrition_v2_same_day_republish.sql:129-135`;
- archive + replace son dos operaciones: `PlanBuilderClient.tsx:1327-1335` y
  `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:557-621`;
  guardan referencias para reanudar en la sesión, pero una recarga pierde esa continuidad.

**Impacto:** árboles parciales, colisión de `version_number` bloqueada por unique pero con orphan,
otra versión lógica tras respuesta perdida/clave nueva, o ventana sin plan publicado. **Acción:**
una RPC transaccional con lock por alumno/plan, asignación de versión,
árbol completo, notas/sustituciones, CAS, publish e idempotencia.

### NUT-012 — Asignar en mobile puede copiar versión obsoleta

Mobile arma fuente desde el read model renderizado en
`apps/mobile/app/coach/nutrition-v2/[clientId].tsx:690-700` y la envía sin relectura/CAS en
`:915-943`; `apps/mobile/lib/nutrition-v2.api.ts:283-290` documenta ese snapshot. Web relee y
compara en `nutrition-assign.actions.ts:70-82`.

**Impacto:** una publicación concurrente deja asignada la versión anterior. **Acción:** enviar
`sourcePlanId + expectedVersionId` y resolver/copiar server-side.

### NUT-013 — Canary Team mobile se evalúa antes de conocer scope

Config sí pasa team/client en `apps/web/src/app/api/mobile/config/route.ts:199-222,325-349`, pero
el gate coach corre con scope nulo en `apps/web/src/app/api/mobile/nutrition-v2/_shared.ts:70-87,108-115`.
La ruta parsea scope después en
`apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts:31-55,89-111`. El test fuerza rollout ON
sin inspeccionar argumentos:
`apps/web/src/app/api/mobile/nutrition-v2/coach/route.test.ts:53-60`.

**Impacto:** si el canary depende solo de `teamId/clientId`, la UI puede habilitarse y la API dar
404; un coach/global allowlist puede ocultarlo. **Acción:** autorizar workspace antes del gate y
probar allowlist Team positiva, negativa y workspace distinto.

### NUT-014 — Curation mezcla standalone y Teams activos

Web valida rollout con workspace y luego descarta scope en
`apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts:40-76,96-170`. Mobile usa scope
solo visualmente en `apps/mobile/app/coach/nutrition-v2/curation.tsx:68-117`; su helper carece de
scope en `apps/mobile/lib/nutrition-v2-curation.api.ts:134-200`. RLS permite propio más Teams
activos en `20260714073000_nutrition_catalog_cl_and_intake_v2.sql:191-210`,
`20260714151500_food_catalog_missing_codes_curation.sql:7-33` y
`20260609160000_team_rls_optimized.sql:25-48`.

**Impacto:** el workspace seleccionado no separa bandeja/mutación. **Acción:** `workspaceRef`
autorizado y filtro exacto en repository/RPC.

### NUT-015 — Entrada legacy puede ocultar V2 sin plan V1

`apps/web/src/app/c/[coach_slug]/nutrition/page.tsx:51-80` decide el estado V1 antes del redirect
V2. `apps/web/src/components/client/ClientNav.tsx:117-154` aún enlaza la ruta legacy; E2E V2 entra
directo a `/nutrition-v2`.

**Impacto:** alumno V2 sin plan V1 ve “sin plan” legacy. **Acción:** gate/workspace antes de leer
V1 y E2E desde el nav para standalone + Team.

### NUT-016 — Snapshot futuro/timezone inválido puede congelar el día

La creación acepta cualquier fecha y texto timezone en
`supabase/migrations/20260714190500_nutrition_v2_security_rpc.sql:437-455`. Snapshot es
único/create-once por cliente/fecha en `20260714190000_nutrition_v2_domain.sql:152-172`; ensure devuelve el
existente en `20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql:4-30`. Solo el
día local actual puede rederivarse en
`20260716230000_nutrition_v2_same_day_plan_and_legacy_history.sql:24-55,90-104`. API solo valida
forma en `apps/web/src/app/api/mobile/nutrition-v2/read/route.ts:14-22,42-48`. Publish evalúa el
timezone guardado en `20260717130000_nutrition_v2_same_day_republish.sql:193-203`. El smoke de
rollback usa 2099 e ilustra ese supuesto, sin dejar datos persistidos:
`supabase/tests/nutrition_v2_domain_rollback.sql:3-8`.

**Impacto:** un request adelantado materializa un futuro vacío/antiguo; timezone inválido puede
bloquear publicación. **Acción:** timezone de perfil validado contra `pg_timezone_names`, ventana
de fechas y no materializar futuros arbitrarios.

## 6. Hallazgos P2

- **NUT-017 — Cambiar unidad conserva cantidad.** `TodayExperience.tsx:966-975,1040-1062`;
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/add-food-v2.tsx:219-226,568-590`;
  `FoodScannerClient.tsx:448-570` y
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/scanner.tsx:613-765`. Puede transformar 100 g en 100
  unidades. Convertir cantidad o exigir confirmación.
- **NUT-018 — Mobile congela la fecha al montar.**
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:269,392-404,527-572,2039` y
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/add-food-v2.tsx:114`. Al cruzar medianoche registra/lee ayer. Recalcular en foreground
  y cambio de día.
- **NUT-019 — Undo de tanda mixta no cancela operaciones offline.**
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:719-816`. Si todo queda en cola no ofrece
  undo; si unas entradas se registran y otras se encolan, “Deshacer” solo corrige las registradas
  y las queued sincronizan después. Cancelar operation IDs o explicitar el alcance del undo.
- **NUT-020 — Error de catálogo parece cero resultados.**
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/add-food-v2.tsx:172-201,496-507`.
  Separar empty/error/offline y ofrecer retry.
- **NUT-021 — Scanner queda pausado tras lookup fallido.**
  `apps/mobile/app/alumno/(tabs)/nutrition-v2/scanner.tsx:154-174,303-378`. El éxito debe seguir
  pausado mientras se revisa; despausar específicamente en `catch`, no en `finally`.
- **NUT-022 — Mismo alimento puede agregarse varias veces al slot.** `PlanBuilderClient.tsx:574-595`,
  `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder.ts:204-217` y
  `apps/mobile/lib/nutrition-v2-builder.ts:236-249`. Definir si es intención válida; si no,
  advertir o fusionar.
- **NUT-023 — Curation informa éxito con cero updates.**
  `curation.actions.ts:155-170,264-282` y
  `apps/mobile/lib/nutrition-v2-curation.api.ts:185-200,351-367`. Puede dejar alimento creado y
  solicitud pendiente. Exigir fila retornada y transacción.
- **NUT-024 — Error inicial del hub parece No hay alumnos.**
  `apps/mobile/app/coach/nutrition-v2/index.tsx:160-198,451-456`.
  Separar vacío de fallo de red/sin cache.
- **NUT-025 — Web V2 no tiene error boundary local.** El servicio lanza en
  `apps/web/src/services/nutrition-v2-read.service.ts:44,120`; no existe
  `apps/web/src/app/c/[coach_slug]/nutrition-v2/error.tsx`. Agregar recuperación contextual.
- **NUT-026 — Pickers topan en 400 alumnos.**
  `apps/web/src/app/coach/nutrition-v2/page.tsx:53-75`,
  `apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx:89-113` y
  `apps/mobile/app/coach/nutrition-v2/[clientId].tsx:838-873`: 8 páginas × 50 y búsqueda local.
  Implementar búsqueda paginada server-side.
- **NUT-027 — Deep link `/coach/foods` no selecciona Foods.**
  `apps/mobile/app/coach/foods.tsx:1-10` envía `?tab=foods`;
  `apps/mobile/app/coach/nutrition-v2/index.tsx:104-106` ignora el query y
  `apps/mobile/app/coach/(tabs)/nutricion.tsx:145-174` retorna V2 antes de que legacy procese
  `params.tab`. Parsearlo o apuntar a la ruta real.
- **NUT-028 — Meal groups hace delete + insert sin transacción.**
  `apps/web/src/app/coach/meal-groups/_actions/meal-groups.actions.ts:37-78` y
  `apps/mobile/lib/meal-groups.ts:92-123`. Un fallo intermedio borra la composición anterior.
- **NUT-029 — Alumno pausado/archivado puede leer por RPC directa.** API bloquea en
  `apps/web/src/app/api/mobile/nutrition-v2/_shared.ts:99-106`; DB permite
  `auth.uid() = client_id` en `20260714190500_nutrition_v2_security_rpc.sql:69-77`. Llevar estado
  activo al helper/RLS.
- **NUT-030 — RPC coach antigua sin workspace sigue ejecutable.** La migración scoped solo revoca
  hub en `20260714211000_nutrition_v2_scoped_coach_reads.sql:264-266`; detalle anterior conserva grant en
  `20260714210500_nutrition_v2_history_coach_read_models.sql:394-400`. Revocar al migrar consumidores.
- **NUT-031 — Retry de corrección no es idempotente en orden.**
  `20260721130000_nutrition_v2_correct_intake_inherit_original_link.sql:67-111` revisa original activo antes de buscar
  la operación previa. Un retry puede fallar en vez de devolver el éxito anterior.
- **NUT-032 — Sustituciones carecen de FK compuesta de versión.**
  `20260721150000_nutrition_item_substitutions_v2.sql:24-53,79-105`; contraste correcto en porciones
  `20260718140000_nutrition_portions_v2.sql:28-30,57-60`. Un item podría pertenecer a
  otra versión. Agregar constraint y test negativo.
- **NUT-033 — `student_write_allowed` falla abierto sin identidad/anclas de billing.**
  `20260719190000_student_write_gate_blocked_clients.sql:9-26`; diseño anterior
  `20260718120000_student_access_grace_gate.sql:96-121`. Revisar si debe fallar cerrado cuando no
  existe fila client/coach o faltan `paid_access_ended_at/current_period_end`.
- **NUT-034 — `updated_by` es falsificable en writes directos.** Policies
  `20260714190500_nutrition_v2_security_rpc.sql:1005-1013,1036-1047`; triggers
  `20260714191000_nutrition_v2_hardening.sql:111-150`. Derivar actor desde `auth.uid()`.
- **NUT-035 — Grants históricos son demasiado amplios.** Baseline
  `supabase/migrations/00000000000001_baseline.sql:3544,3628,3646,3658,3688,3712`. RLS mitiga,
  pero roles/anon amplían superficie. Auditar y revocar con pruebas de roles reales.

## 7. Hallazgos P3

- **NUT-036 — Tipos DB generados no incluyen V2.** `apps/web/src/lib/database.types.ts` no contiene
  sus tablas/RPC. Los casts aparecen en `apps/web/src/services/nutrition-v2-read.service.ts:147-154`,
  `item-substitutions.data.ts:21-28` y `apps/mobile/lib/nutrition-v2.api.ts:149-154`.
- **NUT-037 — Boundary de arquitectura roto.** Services/actions V2 acceden directo a Supabase,
  por ejemplo `nutrition-v2-read.service.ts:24-44` y `plan-persistence.ts`; falta repository/caso
  de uso compartido para reglas críticas.
- **NUT-038 — El checker de boundaries omite rutas reales.**
  `scripts/check-nutrition-v2-boundaries.mjs:16-23` inspecciona
  `apps/mobile/app/alumno/nutrition-v2`, pero la ruta real incluye `(tabs)`; `:28-40` solo prohíbe
  imports legacy. Workflow: `.github/workflows/nutrition-v2-boundaries.yml:12`. No cubre helpers
  mobile donde se duplicaron fórmulas.
- **NUT-039 — Monolitos y duplicación web/RN.** `PlanBuilderClient.tsx` ~1.448 LOC,
  `TodayExperience.tsx` ~1.276; student RN index ~2.562, builder coach ~2.228,
  `nutrition-v2-quick-edit.ts` ~1.486 y `nutrition-v2-builder.ts` ~1.383. La deuda puntual de
  consolidar `nutrition-pro` ya figura en `docs/status/MOBILE_PARITY.md:69,116`; la divergencia de
  macros demuestra el costo más amplio de duplicar lógica.
- **NUT-040 — Tabs web con ARIA incompleto.**
  `apps/web/src/app/coach/nutrition-v2/_components/NutritionHubTabs.tsx:27-65` carece de relación
  `id/aria-controls`, foco roving y flechas.
- **NUT-041 — Ficha coach web carece de empty state para “Últimos días”.** Alumno web sí lo tiene
  en `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:508-516`; coach mapea `recentDays` sin
  fallback en `apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx:341-353`.
- **NUT-042 — Paridad estática no equivale a QA física.**
  `docs/status/MOBILE_PARITY.md:19-52` mantiene pendiente Android/iOS. Nutrición requiere cámara,
  offline, foreground/medianoche, teclado, safe areas, EVA/custom y light/dark reales.

## 8. Paridad funcional V1 → V2 pendiente de decisión

V2 cubre Hoy, Plan, Historial, catálogo, scanner, favoritos, porciones, sustituciones y compartir.
V1 todavía expone capacidades sin reemplazo equivalente demostrado: recetas, lista de compras,
notas/comentarios, recap semanal, push, contexto del entrenamiento, PDF/export, parte del offline
PWA, adherencia, rachas y paneles de apoyo.

Dónde se observa:

- V1: `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx:91-135,181-242`;
- shell/imports/colas V1:
  `apps/web/src/app/c/[coach_slug]/nutrition/_components/NutritionShell.tsx:24-26,488-590,852,879,1203`;
- entrada V2: `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:52-120`;
- inventario físico: `docs/audits/v1-deprecation-map-2026-07-18.md`.

No implica migrar todo: el owner debe decidir por capacidad **migrar, reemplazar o retirar**.
Encender V2 antes de esa matriz puede quitar funciones de forma silenciosa.

## 9. Cobertura y gates

Ejecutado en este corte:

| Comando | Resultado |
|---|---|
| `pnpm exec vitest run nutrition-v2` | **64 archivos, 837 tests aprobados**, 32,77 s |
| `pnpm check:nutrition-v2-boundaries` | **Aprobado**, 162 archivos inspeccionados |

El segundo verde no invalida NUT-038: termina bien porque no incluye varias rutas/reglas que
debería inspeccionar.

Cobertura que no cierra el flujo:

- `package.json:17` define `test:e2e:nutrition` sobre `tests/nutrition-student-smoke.spec.ts`;
- ese smoke aún afirma V1 `/nutrition`: `tests/nutrition-student-smoke.spec.ts:25-40`;
- CI lo ejecuta focalizadamente: `.github/workflows/ci.yml:81-112`;
- V2 Playwright es proyecto separado: `playwright.config.ts:51-52,71-74`;
- requiere setup especial y puede quedar inerte: `tests/nutrition-v2/README.md:3-10`;
- separación Team todavía afirma headings V1 en
  `tests/separation/nutrition-exchanges.spec.ts:138-181`;
- el smoke SQL `supabase/tests/nutrition_v2_domain_rollback.sql` no aparece cableado a scripts/CI
  y antecede sustituciones/porciones recientes.

Matriz mínima faltante:

1. Standalone + Team, web + RN, con JWT reales.
2. `mode=off` y Pro apagado contra RPC/writes directos.
3. Team web: registrar, corregir, retirar, bulk registrar/retirar y cierre del día.
4. Doble toque offline → reconexión.
5. Macros 30/60/125/250 g, ml y unidad; prescrito con cantidad distinta de 1.
6. Cambio g ↔ unidad y app abierta al cruzar medianoche.
7. Snapshot futuro/timezone inválido.
8. Nota privada round-trip y error/race de sustituciones.
9. Publish concurrente, retry tras respuesta perdida y assign con fuente cambiante.
10. Corrección reintentada con la misma clave.
11. Más de 400 alumnos/resultados.
12. RLS negativa: otro Team y alumno pausado/archivado.

## 10. Controles positivos a preservar

- Las RPC/read models V2 revisadas con `SECURITY DEFINER` fijan `search_path = ''` y califican
  objetos.
- RLS deriva identidad/membership desde sesión/DB. No se demostró lectura arbitraria de un
  outsider sin relación.
- API mobile alumno usa bearer/JWT del usuario; no entrega `service_role` al dispositivo.
- Server Actions de intake web validan identidad, rollout, dominio, suscripción y rate limit.
- Quick edit web ya tiene CAS y clave estable dentro de un intento.
- Correction chain conserva historial; no hace hard-delete del original.
- Cola offline es user-scoped, con backoff, errores terminales y tests amplios.
- Read models se validan con Zod antes de UI.
- Hay trabajo consistente de safe areas, dark mode, white-label y accesibilidad.
- Los gates de lectura fallan cerrados en app cuando falta configuración válida.

## 11. Contradicciones documentales detectadas y corregidas

Al iniciar la auditoría, estas fuentes no coincidían con el camino ejecutable. Se corrigieron en
el mismo cambio que incorpora este informe:

- `docs/status/CURRENT.md:63-65` ahora reconoce que el gate no contiene todos los writes coach;
- `docs/architecture/FLOWS_AND_COMPONENTS.md:121-138` ahora describe el boundary mobile real;
- `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md:13-17,90-99` ahora advierte que OFF puede ser un
  rollback parcial;
- `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:30-37`: describe como
  transaccional una secuencia sin transacción compartida; esta contradicción vive en código y
  sigue pendiente de corrección.

También quedan referencias Enterprise dentro del dominio Nutrition en documentos/código. Por
decisión de alcance del owner, **no se interpretan como Nutrition soportado**; su inventario y retiro físico deben ir en una
tarea separada, sin mezclarlos con la reparación standalone + Team.

## 12. Orden de corrección recomendado

### Ola A — Contención e integridad

1. Corregir fórmula canónica y doble escala de “Lo comí”.
2. Bloquear doble toque offline y deduplicar la intención en servidor.
3. Impedir múltiples raíces de plan y arreglar “Nueva versión” RN.
4. Mover publish/assign/operaciones Pro mobile detrás de autoridad server-side.
5. Hasta entonces, no tratar Edge Config como kill-switch completo de escrituras.

### Ola B — Flujos funcionales

6. Reparar acciones Team `/t`.
7. Hacer persistencia/publicación atómica, con CAS e idempotencia.
8. Corregir notas privadas, sustituciones y assign stale.
9. Imponer permisos en backend y derivar macros desde catálogo/plan.
10. Modelar void sin reemplazo activo de contribución cero.

### Ola C — Scope y bordes

11. Hacer curation y canary conscientes del Team activo.
12. Proteger snapshots/timezones, usuarios archivados y RPC antiguas.
13. Corregir unidad, medianoche, undo offline y estados de error.
14. Ejecutar la matriz E2E/RLS con identidades reales.

### Ola D — Sostenibilidad

15. Regenerar tipos DB.
16. Extraer fórmulas/contratos puros compartidos web/RN.
17. Llevar datos a repositories/casos de uso.
18. Ampliar boundary checker y dividir monolitos.
19. Cerrar matriz V1 → V2 y retirar residuos Enterprise de Nutrition en un trabajo separado.

## 13. Criterio de salida propuesto

Nutrition V2 standalone + Team puede considerarse candidata a rollout amplio cuando:

- NUT-001 a NUT-016 estén corregidos o aceptados explícitamente con mitigación;
- ninguna mutación sensible dependa solo de flags/entitlements del cliente;
- doble toque/retry produzca exactamente una intención persistida;
- fixtures reales validen una sola fórmula compartida;
- publicación sea atómica y concurrent-safe;
- Team completo pase web/RN con JWT reales;
- rollback OFF rechace lecturas **y escrituras** V2;
- la matriz E2E/RLS esté verde;
- QA física Android/iOS cierre offline, cámara, medianoche y reconciliación.

## 14. Referencias técnicas de criterio

- Next.js, autorización en Server Actions y Route Handlers:
  <https://nextjs.org/docs/app/guides/authentication>
- Supabase, seguridad de funciones:
  <https://supabase.com/docs/guides/database/functions>
- Supabase, Row Level Security:
  <https://supabase.com/docs/guides/database/postgres/row-level-security>
