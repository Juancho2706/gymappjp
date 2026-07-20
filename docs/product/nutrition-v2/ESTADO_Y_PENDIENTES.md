# Nutrición V2 — Estado y pendientes (doc vivo)

> Fuente única de verdad del estado actual. Reemplaza a los handoffs/roadmaps congelados
> (archivados en `docs/archive/nutrition-v2/`). Verificado contra código y prod, no contra docs.
> Última actualización: **2026-07-20** (ronda 2 QA CEO: publish bar, drafts locales, fila builder, media/category en read models del alumno).

## Estado en una línea

Nutrición V2 **en vivo para todos** (FLIP `mode=on`, ya no es canary josefit-only — ver
`project_nutrition_v1v2_dark_conversion.md`), con **Porciones F1** operando encima
(migraciones `20260718140000`/`150000` aplicadas, RLS isolation ALL PASSED, conversión de
5 planes `exchanges` V1→V2 delta 0, catálogo 2.586/4.778 alimentos etiquetados por grupo +
95 filas basura borradas) y **ronda 1 de QA del CEO cerrada con 4 fixes** (PR #131:
registro desde scanner, subtotal de franja con porciones, tab Curación contenida, loader
del login). El **gate de acceso de alumnos** (gracia 7d post-vencimiento → solo-lectura)
también está vivo en prod. No falta código grande de dominio — falta **operación de cola**
(merge de duplicados del catálogo, deprecación física de V1, QA device en rondas
siguientes) y la **paridad visual RN** (olas 2R-7) queda como el próximo gran bloque.

## Qué está LISTO (no re-hacer)

- Tandas 6–11 implementadas: registro/corrección canónicos, Hoy/Plan/Historial del alumno,
  hub y ficha del coach, builder de 4 pasos con modal de conflicto, celebraciones, hardening.
- RPCs profesionales scoped (`get_nutrition_*_scoped_v2`), rate limiting, flags coherentes
  web↔móvil (canary por clientId + TTL), guard anti-forja V1→V2, idempotencia de publish por plan.
- Migraciones aplicadas en prod (todas validadas BEGIN/ROLLBACK): hub drafts activos,
  T11 hardening, same-day re-derive + historial legacy.
- Catálogo: 4.898 alimentos (586→532 genéricos tras dedup), 4.312 CL con barcode, **580 íconos
  EVA** en Storage `food-media/eva-icons/` + `food_media`. Atribución ODbL per-item en scanner.
- AURA (rediseño del Hoy del alumno, web + RN), favoritos y "Compartir el día" en V2,
  navbar con 10 siluetas propias tintables.
- Suite E2E Playwright validada: 4/4 specs canary contra prod (`tests/nutrition-v2/`).
- **Edición rápida del plan (2026-07-17)**: modo edición in-place en la ficha (web +
  RN), cantidades/swap/franjas/metas con "N cambios sin publicar" → Publicar; wizard
  queda como "Rehacer con el asistente". Requiere aplicar migración `20260717130000`
  (supersede intra-día + guard optimista del publish) — pendiente GO, junto con la de
  conversión `20260717120000`.
- **Deprecación por etapas construida (2026-07-17)**: con flag V2 activo, `/nutrition`
  y `/nutrition/add` del alumno redirigen a V2 (V1 intacta con flag apagado); sin
  banner ni "Vista previa"; hub coach sin link a V1.
- **FLIP a `mode=on` (2026-07-18)**: nutrición V2 en vivo para todos los coaches/alumnos,
  no solo josefit. 53 planes convertidos; los 4 módulos van incluidos en todo plan pago.
  Rollback disponible via Edge Config (`mode=off`).
- **Porciones F1 — construido y OPERADO en prod (2026-07-18)**: PRs #129/#130 mergeados
  (olas 0-5: dominio+contratos, builder coach web/RN, marcar-porción alumno PWA/RN,
  conversión de planes `exchanges`, pipeline de clasificación del catálogo, matriz Q +
  RLS isolation + auditoría visual). Migraciones `20260718140000` (dominio) y
  `20260718150000` (read-models) **aplicadas en prod** (BEGIN/ROLLBACK previo + advisors
  + `tests/team/portions-isolation.sql` ALL PASSED). Conversión de 5 planes `exchanges`
  V1 ejecutada (Alan/ali de jotap primero) con **delta 0** de fidelidad. Catálogo:
  **2.586/4.778 alimentos (54,1%) etiquetados por grupo** (163 overrides investigados y
  citados SMAE/INTA/ADA en `scripts/nutrition-portions/research/`) + **95 filas basura
  borradas** (duplicados exactos, no-latinos, suplementos compuestos sin FKs; respaldo
  JSON + `--down`). Ver commits `be7a2568`, `0d7ea0bd`, `34a237d5`, `ce732c69`.
- **Ronda 1 de QA del CEO cerrada (PR #131, commit `d86b8783`)**: 4 fixes — registro de
  intake desde el scanner de código de barras, subtotal de franja del alumno incluye
  porciones marcadas, tab "Curación" del catálogo contenido (overflow), loader del login.
  Ya mergeado a `master`.
- **Ronda 2 de QA del CEO (2026-07-20)**: 4 fixes de editor/consistencia — (1) la cápsula
  del nav del coach ya no tapa la barra "Publicar cambios" del quick-edit
  (`body.eva-quickedit-open` + `nav.coach-nav-mobile`, espejo del fix del alumno);
  (2) **respaldo local automático** de quick-edit y builder de 4 pasos
  (`src/lib/nutrition-coach-draft-store.ts`: localStorage versionado `v:1`, TTL 7d,
  banner Restaurar/Descartar; key SIEMPRE con `clientId`); (3) fila de alimento del
  paso 3 del builder con nombre completo y macros debajo (patrón `EditableItemRow`);
  (4) **media/category en los read models del alumno**: migración
  `20260720120000_nutrition_v2_item_media_read_models.sql` (aplicada en prod, validada
  con equivalencia sobre 180 slots/638 items congelados) agrega `media` + `category`
  resueltos por `food_id` en LECTURA a los items prescritos/consumidos de
  `get_nutrition_today_v2` / `get_nutrition_plan_read_v2` / `intake_item_json`; Zod
  (`packages/nutrition-v2/read-models.ts`) los declara `.nullable().optional()` y la
  fila del alumno (`NutritionFoodRow`) pinta la ilustración real con paridad coach.

## Qué FALTA

> `mode=on` ya está en vivo (2026-07-18) — las secciones "T12 rollout" y "antes de
> merge" de versiones previas de este doc quedaron resueltas y se retiran; lo que sigue
> es operación de cola sobre lo YA construido y operado.

### Catálogo de porciones (operación de cola)
- [ ] **Merge de los ~104 duplicados con uso** (foods con FKs activas que `cleanup-foods.mjs`
      dejó reportados como "requiere merge" en vez de borrar). Requiere decidir food
      canónico por grupo y re-apuntar referencias.
      Fuente: reporte de `ce732c69` (verificar conteo exacto contra el reporte en `tmp/` —
      no versionado). *(verificar)*
- [ ] **Tier bajo del clasificador**: alimentos que el pipeline heurístico dejó sin grupo
      asignado (confianza insuficiente) — pendiente revisión manual o segunda pasada de
      overrides. Cantidad exacta: *(verificar en el reporte de `scripts/nutrition-portions/report.mjs`)*.
- [ ] Purga de objetos de Storage de los íconos redundantes tras el dedup (heredado, sigue
      pendiente).

### Deprecación física de nutrición V1
- [x] Deprecación por etapas (redirects `/nutrition` → V2) construida y en vivo con
      `mode=on`.
- [ ] **Deprecación física**: retiro del código/tablas V1 del alumno (notas, compras,
      recetas — ya aprobado por CEO) y de las rutas legacy. Aún no ejecutada; es limpieza
      de cola, no bloquea a nadie porque V1 ya no es la superficie activa.
- [ ] Badge "Historial anterior" sin variante dark; borrar `_bak_foods_global_20260715`
      (~29 jul) y `_bak_foods_dedup_20260717` tras confirmar el dedup, más los respaldos
      de la limpieza del catálogo de porciones en `tmp/`.

### QA en device (rondas siguientes)
- [x] Ronda 1 de QA del CEO en device sobre porciones F1 — cerrada, 4 fixes, PR #131 en
      `master` (ver arriba).
- [ ] Rondas siguientes de QA device (porciones + nutrición V2 general) a medida que el
      CEO las corra. Métricas de uso real (adherencia a intercambios, ratio marcado vs.
      registro libre) aún sin instrumentar/revisar. *(verificar si hay runbook de métricas
      posterior al de `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md`, escrito para la
      fase canary y no actualizado post-flip)*.

### SIGUIENTE GRANDE: paridad visual RN (olas 2R-7)
- Funcional ~95% (auditoría de junio obsoleta como plan, no como estado funcional).
  Falta **fidelidad visual**: olas 2R / 4A / 4B / 5 / 6 / 7 del mega-plan de paridad
  (`specs/rn-mobile-parity-redesign/PLAN.md`, `docs/rn-port/`) sin correr. Insumo:
  `docs/rn-port/specs/seccion-3/` (13/14 cerradas; falta ficha-nutrición-facturación,
  cuya mitad nutrición ya quedó superada por V2).
  Con V1 deprecándose, las olas 4A/4B (nutrición RN) se achican en alcance.
- Es el próximo bloque grande de trabajo tras cerrar la cola de porciones/catálogo.

### Housekeeping general
- [ ] 9 worktrees obsoletos + ramas viejas → limpiar a mano (`git worktree remove`, nunca
      `rm -rf`).

## Datos útiles

- Edge Config `NUTRITION_V2_ROLLOUT`: **`mode=on`** desde 2026-07-18 (ya no canary
  josefit-only; rollback = `mode=off`).
- Preview: `gymappjp-git-rnmobiledenuevo-juancho2706s-projects.vercel.app`.
- Build device: perfil `previewv2` (GitHub Actions → Mobile Build → branch `rnmobiledenuevo`;
  desinstalar la app de Play antes de sideload — firma distinta).
- Cuentas QA: coach josefit `503412d0-…`; alumnas Camila `6a8adf41-…`, Catalina `ba265b0b-…`.
- **Gate de acceso de alumnos** (feature separada, vive en la misma migración de fecha
  2026-07-18): alumno de coach sin pago vigente entra en gracia de 7 días desde el fin
  del pago, luego pasa a solo-lectura (RLS/RPC + capas de app, PR #128, LIVE). Kill-switch:
  `STUDENT_ACCESS_GATE`. Ancla de prueba: joaquin, corte de gracia 2026-07-23. Migración:
  `supabase/migrations/20260718120000_student_access_grace_gate.sql`. Sin doc dedicado en
  `docs/` — spec parcial en `specs/nutrition-portions/SPEC.md`/`TASKS.md` (referencias
  cruzadas). *(verificar si conviene un doc propio)*.
- Porciones F1: migraciones `supabase/migrations/20260718140000_nutrition_portions_v2.sql`
  y `20260718150000_nutrition_portions_read_models.sql`, ambas aplicadas en prod.

## Docs y runbooks vigentes

- Este doc (estado + pendientes) · `README.md` (índice) · `TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md`
  (contrato de producto) · `ASSETS_CEO_2026-07.md` (inventario de assets).
- Porciones F1: `specs/nutrition-portions/SPEC.md` / `PLAN.md` / `TASKS.md` / `QA-VISUAL.md`.
- Conversión V1→V2 (planes normales, no `exchanges`): `specs/nutrition-v2-conversion/`.
- Runbooks operativos: `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md` (escrito en fase
  canary — **verificar** si sigue vigente post-flip a `mode=on`),
  `docs/operations/FOOD_CATALOG_CL_IMPORT.md`.
- Paridad RN (siguiente grande): `specs/rn-mobile-parity-redesign/PLAN.md`,
  `docs/rn-port/README.md`, `docs/porting-status.md`.
- Histórico congelado: `docs/archive/nutrition-v2/` (handoffs, roadmaps, tandas cerradas).
