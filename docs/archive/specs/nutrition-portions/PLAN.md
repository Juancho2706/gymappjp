# PLAN — Porciones (intercambios) en Nutrición V2

## Arquitectura

```
                         COACH (web + RN)
  Builder paso Construcción ──┐            Quick-edit (EditablePortionsCard)
  "Porciones a elección"      │                     │
        ▼                     ▼                     ▼
  packages/nutrition-v2/contracts.ts   NutritionMealSlotSchema.exchangeTargets
  packages/nutrition-v2/quick-edit.ts  (hidratación + countDraftChanges)
  builder/_lib/draft-builder.ts        (emite filas + deriva targets vía engine)
        │ persistAndPublishDraft — inserta targets en la MISMA tx del draft y
        │ CONGELA snapshot_* ahí (resuelve exchange_groups server-side, como items;
        │ composed_of enriquecido con ref_* de grupos base — hallazgos A1/A2)
        ▼
  RPC publish_nutrition_plan_v2 (canónico, SIN CAMBIOS de firma NI cuerpo)
        ▼
  nutrition_slot_exchange_targets_v2 ──FK compuesta──▶ nutrition_meal_slots_v2
        │                                   (hereda inmutabilidad por versión)
        ▼
  private.nutrition_v2_build_prescription_snapshot (+ exchangeTargets[] por franja)
        ▼
  nutrition_day_snapshots_v2.prescription_snapshot (jsonb — cero DDL en snapshots)
        ▼
  packages/nutrition-v2/read-models.ts  schemaVersion=1, campos .optional()
    · slot.exchangeTargets[]  · dict exchangeGroups (equivalencias)
    · coverage por franja/día (marcadas + derivadas)
        ▼
                        ALUMNO (web PWA + RN)
  Chips por franja + fila "Porciones de hoy" + ExchangeEquivalencesSheet (portado V1)
  tap chip ──▶ intake sintético (source='prescription'; group/portions viajan en
               p_snapshot) ──▶ RPC record_nutrition_intake_v2 (cuerpo recreado
               DESDE la versión 20260718 con gate de gracia — hallazgo B1)
  RN offline: cola existente de intake + key ordinal+attempt vía helper canónico
              (ver Integraciones — hallazgos B2/M2)
        ▲
  packages/nutrition-engine/exchange-calc.ts  ← REUSO TOTAL (18 tests intactos):
  expandComposedGroups · macrosForTargets · dayTotals(ByVariant) ·
  portionsSummaryLabel · formatPortions · exchangeGroupColor · hasUnconfirmedMacros

  PIPELINE CATÁLOGO (paralelo, service-role):
  scripts/nutrition-portions/classify-foods.ts (heurísticas puras testeadas)
    → reporte MD+JSON+artifact → GO CEO → --apply (tabla respaldo, --down)
    → foods.exchange_group_id / exchange_portion_grams / exchange_portion_label

  CONVERSIÓN V1 exchanges (reusa infra dark-conversion):
  conversion.ts: skip 'exchanges_manual' → mapeo meal_exchange_targets → slot targets
    → nutrition_v2_convert_publish + nutrition_v2_conversion_links (sin cambios)
```

Decisiones estructurales: publish e intake SIEMPRE por los RPC canónicos (cero
duplicación de idempotencia/supersede/guards); la única lógica nueva con conocimiento
de dominio vive en paquetes puros testeados (`contracts`/`draft-builder`/`read-models`/
`conversion` + heurísticas del pipeline).

## Fases

### F1 — Porciones dignas de nutricionista + marcar-porción + catálogo + conversión (~15-17 dev-días — re-estimado por hallazgo PM1)

Workstreams paralelizables (Opus por informe, juicio Fable por wave):

1. **DDL + RPC intake** (~1,5d): migración aditiva en ORDEN (hallazgo D1):
   (1) `nutrition_slot_exchange_targets_v2` (FK compuesta, CHECK 0,5, índices
   `version_id` + `exchange_group_id`, RLS espejo no-correlacionado con scope
   re-derivado del plan, REVOKE + grants + `_service`, trigger updated_at);
   (2) 2 columnas nullable en `nutrition_intake_entries`; (3) `create or replace`
   de `record_nutrition_intake_v2` PARTIENDO del cuerpo `20260718120000` (gate de
   gracia — assert de que `private.student_write_allowed` sigue llamada; extrae
   `exchangeGroupCode`/`exchangePortions` de `p_snapshot`) + wrapper
   `correct_nutrition_intake_v2` (void escribe `exchange_portions=null`);
   (4) `private.nutrition_v2_build_prescription_snapshot` + `exchangeTargets[]`.
   Guion de rollback documentado. NO se aplica a prod en el build (BEGIN/ROLLBACK
   + advisors + GO).
2. **Freeze en persistencia** (~1d): `plan-persistence.ts`/`draft-builder.ts`
   emiten las filas de targets CON `snapshot_*` resuelto server-side (grupos por
   id incluso soft-borrados; `composed_of` enriquecido con `ref_*` de los grupos
   base — hallazgos A1/A2/B5). `publish_nutrition_plan_v2` NO se toca.
3. **Contratos + engine + read-models** (~1,5d): `exchangeTargets` en
   `NutritionMealSlotSchema` (opcional, default `[]`); `draft-builder.ts` emite
   filas y deriva targets con `dayTotalsByVariant`; read-model con
   `slot.exchangeTargets`, dict `exchangeGroups` RECONSTRUIDO desde snapshots
   (targets + bases embebidas; equivalencias resueltas DENTRO del read-model
   security-definer del Today, nunca desde el cliente — hallazgo F3) y `coverage`
   con `marcadas` y `derivadas` POR SEPARADO (fórmulas exactas SPEC R5, solo
   cadenas activas no anuladas). Test de contrato: builder (grupos vivos) y alumno
   (snapshots) producen `ExchangeGroup[]` con la MISMA forma (hallazgo A4 —
   `findByCode` omite silencioso, no errora). Fixture de cache vieja parsea
   (schemaVersion=1).
4. **Builder web** (~1,5d): sección "Porciones a elección" en la card de franja
   (adapta `ExchangeTargetsEditor` V1 + `StepperField`), picker de grupos, card
   "Usar como objetivos" en Objetivos, chips en Revisar.
5. **Quick-edit web + RN** (~1,5d): hidratación (`readModelToDraft`), conteo
   (`countDraftChanges`), `EditablePortionsCard`; RN espeja en `QuickEditMode`.
6. **Alumno web PWA** (~2d): fila "Porciones de hoy", chips por franja con
   marcar/deshacer (intake sintético optimista por `record_nutrition_intake_v2`),
   sheet de equivalencias portado, segmentos derivados de alimentos reales, aviso
   anti-duplicado, coach ficha day-detail read-only.
7. **Alumno RN** (~2,5d): mismas superficies con `NutritionV2Kit`; marcar-porción
   por la cola offline existente con key ordinal+attempt vía
   `nutritionV2IntakeIdempotencyKey`; estados pending/error; haptics; memoización
   por slot — jamás recomputar todas las franjas por tap (hallazgo M3).
8. **Pipeline catálogo** (~1,5d): heurísticas puras + tests, driver
   `classify-foods.ts` (dry-run default, `--apply`, `--down`, respaldo), reporte
   MD+JSON+artifact para GO del CEO. Corre en paralelo desde el día 1 (no bloquea
   la UI: sin clasificación solo hay menos cobertura derivada, nunca UI rota);
   el `--apply` corre DESPUÉS del apply de la conversión (hallazgo D3).
9. **Conversión 6 planes** (~1d): mapeo `meal_exchange_targets` → slot targets
   (`structured`/`hybrid` según `food_items`), fidelidad porciones-in==out + macros
   engine; dry-run Alan + ali de jotap → GO → apply (dark, flag fail-closed manda).
10. **Tests + QA** (~2d): matriz Q1-Q14 del panel completa — en especial Q4 (media
    porción + void neutraliza contador), Q5 (deshacer→re-marcar mismo ordinal),
    Q6 (LEG congelado: editar `ref_*` de P/C no mueve el plan), Q10 (republish
    same-day re-deriva `exchangeTargets`), Q12 (fixture cache vieja) y Q13 (SQL
    RLS isolation espejo `tests/team/exchanges-isolation.sql`) — + QA manual
    light/dark/white-label/360px.

### F2 — Mixtos + PDF + profundidad (~6-8 dev-días, spec corta propia al cerrar F1)

- **Platillos/recetas mixtos**: descomposición de una receta en equivalencias por
  grupo (patrón SMAE "1 platillo = 1F + 1C + 1POA"), registrable como unidad.
- **PDF pauta brandeada** del coach (patrón dossier jsPDF existente: logo/colores
  del coach, tabla porciones por franja + equivalencias por grupo,
  `portionsSummaryLabel` + `exchangeGroupColor` reusados).
- Presupuesto de porciones a nivel día (tablita por day-variant).
- Racha por grupo + señal de sub-cobertura en coach-hub.
- Congelar `exchange_portion_grams`+`exchange_group_id` por intake — PRIMER
  candidato de F2 (hallazgo A3: la cobertura derivada de días pasados se mueve si
  el catálogo se reclasifica).
- Hardening S2: derivar/validar las ref-macros del marcar-porción server-side
  contra el snapshot del target vigente (hoy: auto-declarado, documentado).
- Grupos custom desde el builder: NO decidido — queda fuera hasta decisión CEO.

## Integraciones (contratos exactos)

- **Publish RPC**: INTACTO (firma y cuerpo). El congelado de `snapshot_*` ocurre
  en la capa de persistencia del draft, exactamente como el snapshot de items
  (hallazgo A1). Idempotency key del publish sin cambios; drafts re-publicados
  supersede normal.
- **Snapshots**: `prescription_snapshot` jsonb gana `exchangeTargets[]` por franja
  (`{groupCode, name, portions, ref{...}, composedOf, macrosConfirmed}`) — cero
  cambio de esquema; `nutrition_v2_rederive_day_snapshot` los arrastra gratis.
- **Read-models**: TODOS los campos nuevos `.optional()` con default; PROHIBIDO
  bump de `NUTRITION_READ_MODEL_SCHEMA_VERSION` (caches RN vigentes). La cobertura
  se computa server-side en el read-model (una sola fuente para web/RN/coach).
- **Marcar-porción**: `record_nutrition_intake_v2` con `source='prescription'`;
  `exchangeGroupCode`/`exchangePortions` viajan DENTRO de `p_snapshot` (firma y
  grants intactos — hallazgo B1) y el cuerpo del RPC (recreado desde
  `20260718120000`, gate de gracia preservado) los extrae a las columnas. El void
  va por el camino existente y la correctora escribe `exchange_portions=null`
  (hallazgo B3). **Idempotency key**: SIEMPRE por el helper canónico
  `nutritionV2IntakeIdempotencyKey` → `{kind}:{clientId}:{deviceId}:{operationId}`
  (sanitiza `[^a-z0-9_-]` y lowercasea — hallazgo M2), con
  `operationId = "{fecha}-{slotCode}-{groupCode}-{ordinal}-a{attempt}"`; `attempt`
  se incrementa por `(fecha, franja, grupo, ordinal)` en cada deshacer local, así
  deshacer→re-marcar produce key NUEVA (hallazgo B2/M1) y el replay de la MISMA
  marca conserva su key (dedup del RPC). Colisión multi-dispositivo en el mismo
  ordinal+attempt colapsa en 1 intake (conservador; se reconcilia al próximo
  fetch). Deshacer de una porción aún en cola = cancelar la entrada local (sin
  void), pero el `attempt` del ordinal igual se incrementa.
- **Gating**: porciones disponibles para todo coach con plan pago — mismo gate de
  acceso a nutrición V2 vigente; CERO gate nuevo. Grandfathering: planes convertidos
  conservan sus porciones aunque el coach baje de plan (patrón conversión dark).
- **Boundaries**: `pnpm check:nutrition-v2-boundaries` debe seguir verde —
  `exchange-calc` se consume desde `@eva/nutrition-engine` (ya compartido web+RN).

## Gates por fase

**F1 (build)**: `pnpm lint && pnpm typecheck && npx vitest run &&
pnpm check:nutrition-v2-boundaries` + `pnpm --filter @eva/mobile exec tsc --noEmit`
+ SQL RLS isolation + criterios 1-9 y 11 del SPEC verificados → PR draft.

**F1 (operación, con GO explícito del CEO, en orden)**:
1. Migraciones BEGIN/ROLLBACK en LIVE + advisors (índices FK — hallazgo D2) →
   aplicar. Verificar post-apply que `record_nutrition_intake_v2` sigue llamando
   `private.student_write_allowed` (hallazgo B1/D1).
2. EXPLAIN del read-model Today con targets + coverage (Disk-IO budget de Micro —
   hallazgo D4) + verificar que `rateLimitNutritionIntake` tolera la ráfaga
   legítima de 8-15 marcas al completar un día (hallazgo D5/S3).
3. Conversión: dry-run Alan + ali → reporte fidelidad → GO → apply dark → resto.
4. Pipeline catálogo (DESPUÉS del apply de conversión — hallazgo D3): dry-run →
   artifact reporte → GO CEO → `--apply` (respaldo listo; UPDATE con
   `where exchange_group_id is null`).
5. QA device CEO (RN + PWA, light/dark/white-label) antes de exponer a coaches.

**F2**: spec corta propia + mismos gates técnicos + validación visual del PDF con
marca de un coach real (josefit).

## Riesgos y mitigaciones

1. **Inmutabilidad vs `exchange_groups` no versionado (CRÍTICO)** — coach edita
   `ref_*` o soft-borra un grupo tras publicar → macros derivados driftean.
   Mitigación: `snapshot_*` congelados AL PERSISTIR EL DRAFT (misma mecánica que
   items — hallazgo A1) en target E intake sintético; toda lectura (chips, sheet,
   derivación, PDF F2) usa snapshot, nunca catálogo vivo. Test de aceptación #2.
2. **`composed_of` / LEG** — `expandComposedGroups` resuelve los grupos BASE por
   código desde el array `groups` vivo: congelar solo el `ref_*` de LEG NO basta
   (hallazgo A2). Mitigación (opción a del panel): `snapshot_composed_of`
   ENRIQUECIDO con los `ref_*` de P y C congelados; el read-model reconstruye el
   diccionario desde snapshots; engine intacto (18 tests). Test Q6: editar `ref_*`
   de P/C tras publicar no mueve el plan.
3. **Doble conteo de adherencia** — porciones=TARGET, intakes=CONSUMIDO; un intake
   alimenta ambas lentes (macros + cobertura) pero existe UNA vez. Doble registro
   humano (marcar + registrar la misma comida): deshacer 1-tap + aviso
   anti-duplicado + cap visual "+n". Definición exacta cerrada en SPEC R5; test #6.
4. **Permisos** — franja por porciones bajo `structured` con
   `canRegisterFreely=false`: el target habilita por sí mismo la elección
   intra-grupo (marcar-porción y equivalencias); `canSubstitute` sigue siendo solo
   para swaps de items fijos. Documentado en SPEC R1; test de gating.
5. **Conversión de los 6 planes exchanges** — grupos custom del coach + fan-out por
   día. Mitigación: RLS 3-vías ya resuelve visibilidad; snapshot libera al alumno
   del catálogo; fidelidad porciones-in==out; reusa links + publish impersonado;
   idempotencia por `updated_at` V1; dry-run con GO antes de apply.
6. **schemaVersion** — bump a 2 rompería caches RN vigentes. Mitigación: campos
   `.optional()` (precedente `read-models.ts:149`), test con fixture viejo (#8).
7. **Calidad de la clasificación masiva** (nuevo) — un `exchange_portion_grams` mal
   derivado produce cobertura falsa (peor que no tener cobertura). Mitigación:
   tiers de confianza, auto-apply SOLO tier alto, revisión CEO del medio, tier bajo
   queda sin clasificar (no aporta cobertura, nunca rompe), respaldo + `--down`,
   foods clasificados a mano en V1 jamás se pisan.
8. **Colisiones de idempotency key** — (a) deshacer→re-marcar el mismo ordinal
   colisionaba con el intake anulado → no-op silencioso (hallazgo B2/M1, P0):
   RESUELTO con el sufijo `attempt` por ordinal (se incrementa en cada void, incluso
   solo-cola); (b) dos devices marcan "la 3ra porción de C" a la vez → misma key →
   colapsa en 1: aceptado (conservador, preferible a duplicar); el contador se
   reconcilia al siguiente fetch del read-model.
9. **Ruido visual / competencia con los anillos de macros** (nuevo) — riesgo de que
   la cobertura convierta el Hoy en un tablero. Mitigación: jerarquía cerrada en
   SPEC UX-b (héroe único = AuraHero; cobertura = fila compacta secundaria; color de
   grupo solo en el circulito; progreso siempre en `primary` white-label); QA
   explícito light/dark/360px como criterio #11.
10. **Alcance F1 (15-17 días) con marcar-porción incluido** — es la F1 más grande
    del módulo. Mitigación: workstreams 1-3 (dominio) primero y en serie corta,
    4-9 en paralelo por informe con juicio por wave; pipeline y conversión no
    bloquean la UI. **Orden de corte si aprieta (hallazgo PM2, de menos a más
    doloroso)**: (1) RN alumno marcar → chips read-only en RN, marcar solo en PWA
    (RN llega con la próxima build nativa, patrón conocido); (2) segmentos
    derivados-de-alimento → degradar a solo-contador de marcadas (corte limpio sin
    tocar dominio); (3) conversión de los 6 planes → follow-up inmediato post-F1
    (bloquea la deprecación total de V1, no la feature). NO cortables: DDL, freeze
    de snapshot, no-doble-conteo, fixture de cache vieja.
11. **Cobertura derivada retroactiva** (hallazgo A3) — reclasificar foods mueve la
    cobertura DERIVADA de días pasados (marcadas y macros son inmutables). Asumido
    en F1, documentado al coach (`coach.derivedNote`); congelar por intake = primer
    candidato F2.
