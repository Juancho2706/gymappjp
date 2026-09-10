---
status: draft
owner: product-engineering
last_verified: "2026-09-08"
canonical: false
---

# SPEC — Porciones a la chilena (Nutrición V2: set INTA/UDD, picker que suma, metas del base, equivalencias con foto)

> **Borrador.** Origen: audios de una nutricionista chilena (cuenta `nutricionista-pame-cid`, free, 1 alumna) reenviados el 08-09-2026 por `jotap.coach`: «la porción de carbohidratos vale la mitad» (la app dice 70 kcal · 15 g CHO; en Chile son 140 · 30), «no pude poner más de una porción», «¿mis pacientes ven un grupo distinto al mío?», «¿puedo poner metas distintas por día?», «¿el alumno registra si solo dejo requerimientos?» y «cada porción debería mostrar los alimentos con medida casera y foto» (para dejar de mandar su PDF). Adjuntó dos manuales: **INTA 1999** (Jury · Urteaga · Taibo) y **UDD 2019** (Ratner et al., «Manual de Porciones de Intercambio para Chile», Tabla N.º 5 = «Jury 1999 modificada»).
> Investigación del 08-09 en `context/investigacion-08-09.html` (artifact `e6e7c128`) y memoria del caso en `context/memoria-caso.md`. **Mockups aprobados** en `context/mockups-v1.html` (M1–M5 + paridad web + tabla «Copys propuestos»): los copys de esa tabla son la fuente de verdad textual de este tren.
> Decisiones del owner **D1-A · D2-A · D3-A · D4-A · D5** (DECISIONS.md) y resoluciones del jefe **R1–R12** (OUTLINE §2). Plan de ejecución en [PLAN](PLAN.md); tareas y gates en [TASKS](TASKS.md); SQL/TS copiable en [DATA](DATA.md). Slug del tren: `nutrition-porciones-chilenas`.

---

## 1. Origen

1. **08-09 ~11:00Z** — Pame crea su cuenta (persona `nutrition`, free), arma un plan `flexible` para su única alumna (ella misma) y, al no encontrar el grupo que necesita, **crea un grupo custom «Carbohidratos» 140 · 30** a mano (STATS). Es el tercer coach que hace lo mismo: `dudu` ya había creado tres grupos con valores INTA literales el 17-08 y `josefit` uno propio («Proteinapro», 422 kcal).
2. **08-09 tarde** — los audios llegan reenviados por `jotap.coach`. Cinco quejas, cinco decisiones (§3).
3. **Investigación 08-09** (artifact `e6e7c128`): los 9 grupos del sistema son **SMAE (México)**, sembrados el 12-06 por `supabase/migrations/_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql:19-47` con `macros_confirmed = false` y el comentario «VALORES PROVISORIOS … validar con la guía de Fran». Nunca se validaron. La spec de origen está archivada (`docs/archive/specs/movida-intercambios/SPEC.md:198` ya anotaba el riesgo «kcal erradas»). El PDF de Fran no está en el repo; **los dos manuales lo reemplazan como fuente de verdad** (R8).
4. **Investigación de mercado** (`research/s1-competencia-sistemas.md` §0): ningún producto de la competencia —chileno, mexicano ni internacional— expone un selector de sistema de porciones. Nutrimind declara basarse en «el sistema mexicano de equivalentes y el USDA»: es el default de facto del software de nutrición en español y explica (sin justificar) el seed SMAE. Hay una **edición UDD 2021** hecha con INTA y nueve universidades que amplía listas y casos clínicos; no hay evidencia de que cambie las cifras de la Tabla N.º 5 (R9, Q5).

---

## 2. Problema, con números (verificado contra `HEAD f93378c3` y LIVE, 08-09; detalle en `STATS.md`)

### Causa 1 · El set del sistema es SMAE y nadie lo dice

- 9 grupos `is_system`, los 9 con `macros_confirmed = false` ⇒ los 9 muestran el chip «Valores referenciales» (`hasUnconfirmedMacros`, `packages/nutrition-engine/exchange-calc.ts:171-180`).
- Cereales SMAE = **70 · 2P · 15C · 0G**; Chile (INTA/UDD) = **140 · 3P · 30C · 1G**: la porción chilena es literalmente el doble. Lo mismo con lácteos (uno solo, 95, contra tres por grasa: 70/85/110) y carnes (uno solo, 55, contra bajas 65 y altas 120).
- **337 porciones prescritas en 44 versiones de 9 coaches** cuelgan de esos `ref_*`; ~179 están en planes activos y publicados. Cambiar `ref_*` in-place cambiaría el significado de todas.
- Las 2.507 equivalencias globales (`exchange_group_foods`, `source = 'catalog'`) están **en escala SMAE**: el research del propio repo lo deja escrito (`scripts/nutrition-portions/research/cereales-leguminosas.md:14-28`: «toda la columna `gramos` usa la escala SMAE … la porción INTA es ~2× la SMAE»).
- 5 grupos custom de 4 coaches, **0 equivalencias** entre todos: un coach que rodea el problema con un grupo propio deja a su alumno sin lista de intercambio.

### Causa 2 · El picker apaga el grupo ya usado y el stepper RN no se puede escribir

- `EditablePortionsSection.tsx:283` pone `disabled={used}` y `:285` `opacity-50`; el subtítulo dice «Ya está en esta comida» (`:301-305`, copy `PORTIONS_COPY.builder.groupUsed`). El `Pressable` está muerto: ni toast, ni cierre, ni pista de dónde se cambia la cantidad. Espejo web en `EditablePortionsCard.tsx:290-294`.
- El stepper RN es **solo botones a propósito** (`EditablePortionsSection.tsx:92-141`, decisión «hallazgo M4» en `docs/archive/specs/nutrition-portions/SPEC.md:510-515`). El web ya tiene tap-to-edit (`StepperField.tsx:47-92`, `inputMode="decimal"`).
- En LIVE la cantidad ≠ 1 es la norma, no la excepción: Verduras 133/135, Cereales 51/68, Proteínas 31/33. Máximos reales: Proteínas 25, Frutas 8,5, Verduras 7,5.

### Causa 3 · «Metas ▾» escribe en el día activo, y el día activo lo elige el calendario

- Un día con `target_calories NULL` **no hereda del base**: `nutrition_v2_ensure_day_snapshot` elige una variante entera y copia sus columnas sin `coalesce` (`supabase/migrations/20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql:43-52, 86-92`); el alumno ve «/ —» y «Vas sumando tu día» (`AuraHero.tsx:199, 311`).
- El editor único despacha `SET_TARGET` con `variantKey: activeVariant.key` (`QuickEditMode.tsx:2398`, verificado; web `TargetsEditorCard.tsx:64`) y el reducer escribe en UNA variante (`packages/nutrition-v2/editor-state.ts:1989-1993`).
- El 08-09 era **martes**: `todayVariantKey` (`QuickEditMode.tsx:970-973`) resolvió al «Martes» recién creado y lo dejó activo. Resultado: 2.040 kcal solo el martes, seis días sin objetivo, y **nada avisó al publicar** (un target vacío hace `continue` en `validateQuickEdit`, `editor-state.ts:2686-2687`).
- Alcance real medido (STATS, query de r3 §8.1): **47 planes activos publicados, 1 solo caso Pame, 0 casos de base-con-meta/días-sin-meta, 7 sin meta en ningún día, 16 con días propios**. No hay backfill que hacer: D3-A previene el próximo caso.

### Causa 4 · El sheet de equivalencias no reemplaza al PDF

- El contrato del alumno no tiene foto: `NutritionExchangeFoodReadSchema` (`packages/nutrition-v2/read-models.ts:292-305`, verificado) trae 7 llaves y ninguna es media. La causa raíz está en el RPC, no en el componente (el propio RN lo documenta, `apps/mobile/components/alumno/nutrition-v2/PortionEquivalencesSheet.tsx:246-251`).
- **Las fotos ya existen**: 1.712 de las 2.507 filas tienen fila en `food_media`; entre los **557 alimentos genéricos (`brand IS NULL`) hay 505 con foto (91 %)**.
- **Solo 27 filas tienen medida casera real** (las del seed manual); las otras 2.480 dicen «20 g», literal del clasificador (`scripts/nutrition-portions/heuristics.ts:338-339` escribe `label = '{grams} g'`).
- 82 % del catálogo de equivalencias es Open Food Facts ⇒ ordenado alfabéticamente, el alumno ve tres «Arroz» de marca antes que «Arroz cocido». Es exactamente la queja.

### Causa 5 · Legumbres dice «0 kcal»

`LEG` es un grupo compuesto: `ref_* = 0` + `composed_of = [{P,1},{C,1}]` (`_POST_DEPLOY_20260611093002:30-31`), y el 0 **es correcto en la DB**. El defecto es que seis etiquetas imprimen `ref.*` crudo sin pedirle al motor que expanda: picker RN (`EditablePortionsSection.tsx:304`, verificado), picker web (`EditablePortionsCard.tsx:309`), los dos wizards retirados, y **los dos sheets del alumno** (web `:154-157`, RN `:165`). El helper correcto existe: `macrosForTargets` + `expandComposedGroups` (`packages/nutrition-engine/exchange-calc.ts:57-100`). **No está en `packages/calc`** (R10: ese paquete no tiene nada de intercambios).

---

## 3. Decisiones del owner y resoluciones del jefe

| # | Decisión | Elegida | Consecuencia |
|---|---|---|---|
| D1-A | Cómo entra el sistema chileno | Set nuevo del sistema «Chile (INTA/UDD)» con nomenclatura UDD; SMAE queda **legado** visible solo para quien lo usa; equivalencias re-derivadas por fórmula; conversión **iniciada por el coach** con preview | §5, §6, §7.2. Nada se reescala en silencio; ningún snapshot publicado se toca |
| D2-A | Picker y stepper | Tocar un grupo ya usado cierra el sheet, resalta la fila y suma 0,5 con toast; stepper RN gana tap-to-edit decimal; web parejo | §7.1, §7.3, §7.4 |
| D3-A | Metas por día | «Metas ▾» escribe en el día base cuando el base no tiene metas, con switch «Solo el {día}»; al publicar avisa (no bloquea) si hay días con y sin meta, con acción | §7.5, §7.6 |
| D4-A | Equivalencias del alumno | Medida casera + gramos de genéricos INTA/UDD; foto de `food_media`; genéricos primero, marcas después. **Sin PDF brandeado** | §9 |
| D5 | Legumbres | Compuesto expandido en las etiquetas del picker (SMAE legado) y del sheet del alumno; en el set chileno «Legumbres secas» es grupo **simple** (170 kcal) | §6.1, §10.4 |
| S1 | Quién ve qué set | Coach sin porciones SMAE ⇒ solo chileno. Los 9 con SMAE ⇒ ambos, con SMAE marcado «Legado»; desaparece solo cuando ya no tiene targets SMAE | §5.3 |
| S2 | Cuentas nuevas | Solo set chileno. **Sin gate por tier ni por persona** | §5.2 |
| S3 | Scoop proteína | Se mantiene en el set chileno como grupo de EVA (120 · 24P · 2C · 1G) | §6.1 fila 13 |
| S4 | Alcance de la conversión | Solo borrador o versión nueva, nunca una versión publicada; reescala por macro clave, redondea a 0,5, muestra diff por franja | §7.2, §12 T-05 |
| S5 | Grupos custom que imitan INTA | No se migran solos; la conversión ofrece «reemplazar por el chileno equivalente» con match único y confirmación | §5.5 |
| S6 | Medidas caseras | Filas globales nuevas o updates acotados; **jamás** pisan filas con `coach_id`/`org_id` ni `source <> 'catalog'` | §6.3, §12 T-07 |
| S7 | Fotos | Solo `food_media` existente. **Ninguna imagen del manual UDD** (derechos registrados) | §9.4 |
| S8 | Fuera | PDF brandeado, platillos chilenos (UDD pp. 78-86) y micronutrientes | §14 |
| S9 | Datos | Aditiva. Nada se borra; SMAE conserva sus UUID; los snapshots publicados no se tocan | §12 T-08 |
| R1 | Macro clave por grupo | Tabla explícita, **nunca derivada**: `PCT/FR/VG/VL/LGS/AZ`→CHO · `CB/CA/SCP`→proteína · `AG`→grasa · `LD/LS/LE`→**kcal** | §10.3. INTA llama «nutriente crítico» a los lípidos en lácteos, pero el descremado tiene 0 g de grasa: por kcal los tres subgrupos quedan consistentes |
| R2 | `ARL` + `G` → `AG` | La conversión **suma y colapsa** en una sola fila destino y el preview la muestra con sus dos orígenes | §7.2, §12 T-06 |
| R3 | `LAC` → lácteo | `LD` preseleccionado con selector segmentado de tres (Descremado/Semi/Entero) que recalcula el factor; siempre marcada «Revisar» | §7.2 |
| R4 | Orden del picker | Set del coach primero, legado después, **en TypeScript** (`ExchangeGroup.portionSystem` + comparador). Nada de `sort_order` negativo; `sort_order` chileno 210-330; nunca renumerar SMAE | §10.5 |
| R5 | `scripts/nutrition-portions/` | Se amplía `GROUP_REFS` con los 13 grupos (tarea chica en W1); el clasificador **no se corre** en este tren | §14 |
| R6 | Conteo del picker web | Pasa a `getExchangeListCounts` en W1: es prerrequisito, si no el set chileno mostraría «0 equivalencias» | §8.1, §12 T-07 |
| R7 | Derivación del set chileno | Desde cero con `suggestPortionGrams` (respeta `macros_basis`); las 2.507 filas SMAE **no se tocan**; el informe reporta cuántas difieren > 20 % como backlog | §6.2, §14 |
| R8 | `macros_confirmed` | `true` en los 13. Fuente: Tabla N.º 5 UDD 2019. La «guía de Fran» queda reemplazada por los dos manuales | §6.1, Q1 |
| R9 | Edición UDD 2021 | El set se fija con el PDF 2019; TASKS lleva un ítem de verificación sin bloquear | Q5 |
| R10 | Dónde vive la matemática | `packages/nutrition-engine/exchange-calc.ts`. `packages/calc` no tiene intercambios | §10 |
| R11 | D5 cubre al alumno | La cabecera del sheet del alumno usa el mismo helper de expansión | §9.3 |
| R12 | Crear grupo propio en web | Fuera de este tren (backlog con pregunta al owner) | §14, Q4 |

---

## 4. Respuestas a las 7 preguntas del BRIEF §5

1. **Convivencia de sets sin romper a los 9 ni duplicar la UI.** Dos columnas y una función pura: `exchange_groups.portion_system` (`'smae'|'cl'`) + `coaches.portion_system` (default `'cl'`), y `visibleExchangeGroupsForCoach` con la regla «**unión, no exclusión**», aplicada **solo en los bordes de presentación** —respuesta de la ruta móvil viva (marcando, no filtrando), loader del picker web (`QuickEditProvider` + `portions-groups.actions.ts`) y sheet/card del picker— y **jamás** dentro de `findExchangeGroupsForScope` **ni de `getExchangeGroupsForCoach`** (R13). El picker es el mismo componente con **secciones** («Sistema chileno» / «Legado (SMAE)» colapsada) **particionadas en el consumidor, sobre la lista ya mergeada** por `mergePortionGroupChoices` (R17). Conversión con mapa fijo 9→13, factor por macro clave, redondeo a 0,5, colapso ARL+G y selector de lácteo. Los custom no se filtran por set. → §5, §6, §7.1, §7.2.
2. **Re-derivación de equivalencias y carga de medidas caseras.** Script con `--dry-run` + informe aprobado por el owner antes de escribir; `suggestPortionGrams` con macro clave **forzado** (R1; respeta `macros_basis` vía `intakeEntryFactor`, que resuelve `per_100` vs `per_serving`); inserts globales `on conflict … do nothing`; update de `portion_label` solo donde `portion_label is null and source='catalog' and coach_id is null and org_id is null`. Los 2.253 sin clasificar quedan fuera. → §6.2, §6.3, §14.
3. **Picker, stepper y toast.** Acción nueva `BUMP_PORTION_TARGET` (por `exchangeGroupId`, no por `targetKey`) + helpers `findPortionTargetByGroup` / `portionsAfterBump` / `formatPortionsEsCl` exportado; fila usada viva con subtítulo; resalte de 1,2 s; toast con `action` Deshacer e `id` estable; `TextInput` **siempre montado** en el stepper RN. Solo el editor único: los wizards están retirados. → §7.1, §7.3, §7.4, §10.6.
4. **«Metas escribe en base salvo solo este día» + aviso al publicar.** `SET_TARGET`/`STEP_TARGET` ganan `scope?: 'day' | 'all'` (**opcional**: sin él, byte-idéntico a hoy); `scope:'all'` escribe en el base **y** en los días que heredaban (`qeTargetsEqual` antes del cambio). Switch «Solo el {día}» en `TargetsEditorCard` (RN y web). El aviso va **fuera de `errors`**, por la vía de `qeDaysMissingBasePortions` + `PortionsDayGapNotice`: `PublishBar` RN gana `dayNotice`, web `noticeMessage`/`noticeAction`. Cero DDL; `variant_key`/`is_default` no se tocan. → §7.5, §7.6.
5. **Foto y medida casera en el sheet.** `imagePath` (el `object_path` de `food_media`, precedencia `product_photo` > `eva_illustration`), **`imageVersion`** (entero chico, exigido por `foodMediaThumbnailUrl` para el cache-busting — R-02), `isGeneric` (`foods.brand is null`) e `imageLicense` (§9.4, para el pie de atribución condicional) se agregan al bloque `exchangeFoods` del RPC **por parche de texto sobre `pg_get_functiondef`** con anclas y asserts; el read model los declara opcionales; los sheets se parten en «Genéricos · INTA · UDD» y «Marcas y productos». El criterio de orden entra **en la ventana que decide el tope de 60**, no solo en el `order by` de salida. → §9.
6. **Avisos y medición.** Banner in-app de conversión a **los coaches con porciones SMAE vivas** (9 por V2 al 08-09; hay que sumar los de V1 con la query de W0.6, que recorre las dos generaciones) + mensaje del owner a Pame (vía `jotap.coach`), `dudu` y `josefit` (textos en TASKS). Nada de push masivo. PostHog con cinco eventos **sin cifras ni nombres de alimentos** (Ley 21.719). → §11.
7. **Waves y gates.** W0 datos (**partida en W0a** DDL + seed + backfill + tests SQL y **W0b** script + curaduría + dry-run + OK del owner + apply, R-17) → W1 motor y visibilidad → (W2 picker ∥ W3 conversión ∥ W4 metas) → W5 alumno → W6 cierre; **~12 días-agente**. Gates proporcionales por wave (vitest focalizado, tsc web + mobile, eslint por archivo, boundaries), suite completa una vez antes del push, `pnpm qa:prod:suave` al cierre y **QA del owner en device** (10 puntos). **`pnpm docs:check` corre recién cuando el SDD esté en `docs/specs/` (W6 o al aprobarlo); W0–W5 usan los gates de código** (R-19). Detalle en [PLAN](PLAN.md) y [TASKS](TASKS.md).

---

## 5. Modelo de dominio

### 5.1 Set de porciones (`portion_system`)

`public.exchange_groups.portion_system text not null default 'smae'` con CHECK `in ('smae','cl')`. Aditiva pura: no toca ninguno de los tres índices únicos (todos por `slug`), ningún CHECK ni ninguna policy (`supabase/migrations/20260611093001_nutrition_exchanges.sql:38-77`). Precedentes del patrón en el repo: `coaches.persona` y `foods.macros_basis`.

- `'cl'`: los 13 grupos del sistema del set chileno, `macros_confirmed = true`, `composed_of = null`.
- `'smae'`: los 9 vigentes, **sin cambios** (`composed_of` de `LEG` intacto).
- **Los grupos custom quedan en `'smae'` por default y NO se filtran por set**: su visibilidad la sigue decidiendo el dueño vía `xg_select`. Un coach nunca pierde de vista un grupo propio por cambiar de set.

### 5.2 Preferencia del coach

`public.coaches.portion_system text not null default 'cl'` con CHECK y `grant update (portion_system) on public.coaches to authenticated` (patrón `persona`). Default `'cl'` ⇒ **todos los coaches quedan en el set chileno**, incluidos **los que hoy tienen porciones SMAE vivas** (9 por V2 al 08-09; sumar los de V1 con la query de W0.6) (S2).

**No hay backfill a `'smae'`.** El bloque B del `_POST_DEPLOY_` que el OUTLINE §3/§4 proponía (`update coaches set portion_system = 'smae' where …`) **se elimina**: sin selector de sistema en ajustes, un coach marcado `'smae'` **nunca vería los 13 grupos chilenos**, no podría adoptarlos y la conversión le devolvería `destino_ausente_en_catalogo` en todas las filas. Con `'cl'` para todos, **los coaches con porciones SMAE vivas** (9 por V2 al 08-09; sumar los de V1 con la query de W0.6) ven **primero** el set chileno y el SMAE aparece como sección «Legado» mientras tengan targets vivos en él (tercera rama de §5.3), apagándose sola al convertir — que es S1 literal. **No hay selector de sistema en ajustes**: el mockup lo declara explícitamente fuera («Qué no está dibujado a propósito»).

### 5.3 Visibilidad — «unión, no exclusión» (función pura)

```text
packages/nutrition-v2/exchange-visibility.ts

visibleExchangeGroupsForCoach({ groups, coachSystem, usedSystems })
  → Array<ExchangeGroup & { legacy: boolean }>

  visibles = custom del coach/team
           ∪ system con portionSystem === coachSystem                 (legacy: false)
           ∪ system del OTRO set  SI usedSystems tiene ese set        (legacy: true)
```

**De dónde salen los dos insumos, con productor propio en W1** (R14; sin esto la función no es implementable: la ruta móvil devuelve hoy solo `{ groups, foodCounts }`, `route.ts:117` **verificado**, y `toGroup` de RN descarta cualquier llave desconocida, `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:27-47`, así que la marca de legado nunca llegaría al picker):

- `coachSystem` = **lectura de `coaches.portion_system` por `coachId`** (una columna, columna nueva de §5.2), hecha **en los mismos bordes de presentación** (ruta móvil viva y loader del picker web), **nunca** dentro de `getExchangeGroupsForCoach` (`apps/web/src/services/nutrition-exchanges/nutrition-exchanges.service.ts:92-98`, verificado: hoy solo delega en `findExchangeGroupsForScope`, y **así queda**).
- `usedSystems` = **`findUsedPortionSystemsForCoach(db, coachId): Promise<PortionSystem[]>`** (**único nombre del productor en todo el SDD**, R14 + OUTLINE §13 + D-6: no hay alias ni variantes), nueva en `apps/web/src/infrastructure/db/exchanges.repository.ts`: targets de la **versión publicada vigente** + **borradores abiertos** de planes no archivados en `nutrition_slot_exchange_targets_v2`, **más la rama V1** `meal_exchange_targets` (sigue viva: `PlanBuilder.tsx`, `exchange.actions.ts`, `api/mobile/nutrition/exchanges/targets`), con `select distinct g.portion_system` y **`limit 2`** (predicado exacto en [DATA](DATA.md) §7.1). Corre **por request** al abrir el picker en las dos superficies, así que lleva **EXPLAIN propio en la ventana de W0** (tx-rollback, como los otros cinco). **Índice: ninguno por defecto (D-3)**; solo si el EXPLAIN de W0.6 muestra un **seq scan relevante** sobre `nutrition_slot_exchange_targets_v2` se agrega un índice `(version_id, exchange_group_id)` **en una migración aparte**, con su propia tarea. Nada de índices preventivos.
- **Payload de la ruta móvil**: `GET /api/mobile/nutrition-v2/exchange-groups` pasa de `{ groups, foodCounts }` a **`{ groups, foodCounts, portionSystem, legacySystems }`** (nombres canónicos, R14 punto 3 + OUTLINE §13), con **`portionSystem?: 'smae' | 'cl'` por grupo**. **`legacy` NO viaja por fila**: se **deriva en el cliente** con `systemOf(group, portionSystem)`, que es la única forma de que un grupo del plan sin la columna no se marque legado (R18). `legacySystems` = lo que devuelve `findUsedPortionSystemsForCoach` menos el set propio; `[]` si no usa nada. El mapeador `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:31-48` (`toGroup`) propaga `portionSystem` y `NutritionV2ExchangeGroupsResult` (`:53-56`) suma `portionSystem?` y `legacySystems?` **tolerando la ausencia de las tres llaves** (mismo patrón que `foodCounts?`, que ya distingue «no vino» de «vino 0»): binario nuevo contra deploy viejo cae en el caso fail-open.

**Fail-open, obligatorio**: si **cualquiera de las dos lecturas** falla —o `usedSystems` viene vacío o ausente— se muestra **todo el catálogo sin marcar legado**, nunca solo un set y **nunca escondiendo** nada. El catálogo ya es best-effort río abajo (`QuickEditMode.tsx:641-647` traga el error), y esconder el SMAE por un insumo que no llegó le borraría del picker los grupos de los 337 targets vivos. Se prueba explícitamente: «insumo ausente ⇒ se muestran los 13 chilenos y los 9 SMAE, ninguno marcado legado» y «la consulta lanza ⇒ idem».

**Dónde se aplica (R13, manda sobre el OUTLINE y sobre cualquier versión previa de esta sección):** **solo en los bordes de presentación**, nunca en el servicio.

| Borde | Archivo | Qué hace |
|---|---|---|
| Respuesta de la ruta móvil V2 | `apps/web/src/app/api/mobile/nutrition-v2/exchange-groups/route.ts:111-117` | **marca, no filtra**: agrega `portionSystem` + `legacySystems` al payload y `portionSystem` a cada grupo; el cliente particiona |
| Loader del picker web | `coach/nutrition-v2/[clientId]/_quick-edit/QuickEditProvider.tsx` + `coach/nutrition-v2/_actions/portions-groups.actions.ts` | llama `visibleExchangeGroupsForCoach` sobre lo que devuelve el servicio |
| Sheet RN / card web del picker | `EditablePortionsSection.tsx:272` · `_quick-edit/EditablePortionsCard.tsx:286` | particionan por sección sobre la lista **ya mergeada** (§7.1, R17) |

**Jamás dentro de `getExchangeGroupsForCoach`** (`nutrition-exchanges.service.ts:92-98`): es el gate de **cinco caminos**, y uno de ellos es `api/mobile/nutrition/exchanges/group-foods/route.ts:74-82` (verificado), que busca el grupo pedido dentro de esa lista y devuelve **404 `GROUP_NOT_FOUND`** si no está — con el catálogo filtrado, un coach no podría abrir las equivalencias de un grupo del otro set. **Y jamás dentro de `findExchangeGroupsForScope`** (`exchanges.repository.ts:89-104`): esa función es el catálogo de **autorización/escritura** y sus dos únicos callers le pasan el resultado **literal** a `findExchangeGroupConflict` (`nutrition-exchanges.service.ts:188-193` en `createCoachExchangeGroup` y `:215-221` en `updateCoachExchangeGroup`, verificados). Filtrar ahí dejaría a un coach `'cl'` sin ver los 9 legados **en el chequeo de conflicto** y podría crear un custom con `code` `C`, `LAC`, `LEG`, `FR` o `PCT` —justo lo que T-02 dice mitigar—, porque `exchange_groups_system_code_uq` es parcial (`where is_system`) y no lo atrapa. `findExchangeGroupConflict` (`:137-152`) es **pura**: «ver ambos sets» es una propiedad del caller, no suya. El test de W1.9 ataca `createCoachExchangeGroup`/`updateCoachExchangeGroup`, **no** la función pura.

**`apps/mobile/lib/nutrition-exchanges.coach.ts:92-101` (`fetchCoachExchangeGroups`) queda FUERA** (R-05): grep en `apps/mobile` da **cero consumidores** (la única aparición fuera de su definición es un comentario en el wizard retirado, `builder/[clientId].tsx:354`). Baja a backlog «retirar junto con el wizard RN»; su `GROUP_COLUMNS` (`:85-86`) sí suma `portion_system` por el tipo (§10.5), pero no se le aplica visibilidad ni entra a QA.

**Regla dura**: el filtro de set aplica al **catálogo ofrecido**, **jamás** a la **resolución de un id ya prescrito** — nunca en `findExchangeGroupsByIdsForTenant` (`exchanges.repository.ts:112-128`) ni en `resolveExchangeGroupsForDraft` (`plan-persistence.ts:359-412`). Filtrar ahí rompería planes publicados con SMAE. Cuando un coach convierte todos sus planes, la tercera rama se apaga sola y el legado desaparece de su picker **sin un solo `UPDATE`**: eso es exactamente lo que pide S1.

### 5.4 Conversión

```text
packages/nutrition-v2/exchange-conversion.ts

CL_CONVERSION_MAP: Record<SmaeCode, { to: ClCode; keyMacro: 'carbs'|'protein'|'fats'|'calories' }>
round05(x: number): number                       // Math.round(x * 2) / 2
convertPortionsToCl(draft, { dairyChoiceBySlot }) → { draft, diff }
```

- Filtra el catálogo destino con **`isClGroup(g, coachSystem)`** = `systemOf(g, coachSystem) === 'cl'` (§10.10; **importada** de `exchange-visibility.ts`, donde nace en W1.4; cuerpo en [DATA](DATA.md) §6/§7), porque `QePortionGroup` **no** declara `isSystem` y su `portionSystem` es opcional.
- Reescala `dest = max(0.5, round05(orig × ref_orig[clave] / ref_dest[clave]))` con la **macro clave** de R1.
- **Colapsa** destinos repetidos en la misma franja sumando las porciones (R2): nunca dos targets al mismo grupo.
- Marca **«Revisar»** si `|kcal_dest − kcal_orig| / kcal_orig > 0,10` **o** si el destino es un lácteo (R3).
- Devuelve el diff por franja y el **delta de macros del día** (`dayTotalsByVariant` antes/después).
- Opera **solo sobre el borrador en memoria** y publica por el RPC normal con `p_expected_current_version_id` (S4, T-05). Nunca un `UPDATE nutrition_slot_exchange_targets_v2 SET portions = …`.
- El resultado se aplica al estado con `REPLACE_PORTION_GROUPS` (acción nueva: cambiar de grupo hoy solo se puede con remove+add, y eso pierde **la posición dentro de la franja** y la nota). **`QePortionTarget` no tiene `orderIndex`** (R-08, verificado: `key, id, exchangeGroupId, groupCode, groupName, color, macrosConfirmed, portions, notes`): el orden **es la posición en el array**, así que el criterio se escribe «conserva la **posición relativa** y la nota». Los buckets colapsados (R2) se materializan **en el lugar del primer origen** de cada destino, nunca anteponiendo lo convertido: si no, una franja mixta le cambia el orden al alumno sin decirlo en el preview.

### 5.5 Grupos custom que calzan (S5)

Los 5 grupos custom tienen `is_system = false` y 0 equivalencias. La conversión **no los toca**. Detección de match: comparar `ref_calories/ref_protein_g/ref_carbs_g/ref_fats_g` con tolerancia **±5 kcal / ±1 g** contra los 13; con **match único** se ofrece «reemplazar por «Panes, cereales y tubérculos»» con confirmación explícita. El de Pame (Carbohidratos 140/30) matchea `PCT` exacto; los tres de `dudu` (INTA literal) probablemente también; el «Proteinapro» de `josefit` (422 kcal) **no matchea nada** y queda intacto. **El grupo custom nunca se borra**: soft-borrarlo rompería borradores ajenos.

---

## 6. Datos del set chileno

### 6.1 Los 13 grupos

UUID `0000e8c1-0000-0000-0000-0000000000NN` (siguiente nibble al `0000e8c0` del seed V1; los 4 bordes de validación usan `z.guid()` y aceptan los no-RFC). Valores = Tabla N.º 5 UDD 2019 + scoop de EVA (S3).

| NN | slug | code | name | kcal | P | C | G | sort_order | color | macro clave |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | `cl-lacteos-descremados` | `LD` | Lácteos descremados | 70 | 7 | 10 | 0 | 210 | `#3B82F6` | kcal |
| 02 | `cl-lacteos-semidescremados` | `LS` | Lácteos semidescremados | 85 | 5 | 9 | 3 | 220 | `#3B82F6` | kcal |
| 03 | `cl-lacteos-enteros` | `LE` | Lácteos enteros | 110 | 5 | 9 | 6 | 230 | `#3B82F6` | kcal |
| 04 | `cl-carnes-bajas-grasa` | `CB` | Carnes bajas en grasa | 65 | 11 | 1 | 2 | 240 | `#EF4444` | proteína |
| 05 | `cl-carnes-altas-grasa` | `CA` | Carnes altas en grasa | 120 | 11 | 1 | 8 | 250 | `#EF4444` | proteína |
| 06 | `cl-legumbres-secas` | `LGS` | Legumbres secas | 170 | 11 | 30 | 1 | 260 | `#8B5CF6` | carbohidratos |
| 07 | `cl-verduras-generales` | `VG` | Verduras generales | 25 | 2 | 5 | 0 | 270 | `#22C55E` | carbohidratos |
| 08 | `cl-verduras-libre-consumo` | `VL` | Verduras de libre consumo | 10 | 0 | 2,5 | 0 | 280 | `#22C55E` | carbohidratos (solo genéricos curados) |
| 09 | `cl-frutas` | `FR` | Frutas | 60 | 0 | 15 | 0 | 290 | `#EC4899` | carbohidratos |
| 10 | `cl-panes-cereales-tuberculos` | `PCT` | Panes, cereales y tubérculos | 140 | 3 | 30 | 1 | 300 | `#F59E0B` | carbohidratos |
| 11 | `cl-aceites-y-grasas` | `AG` | Aceites y grasas | 45 | 0 | 0 | 5 | 310 | `#F97316` | grasa |
| 12 | `cl-azucares` | `AZ` | Azúcares | 20 | 0 | 5 | 0 | 320 | `#6366F1` | carbohidratos |
| 13 | `cl-scoop-proteina` | `SCP` | Scoop proteína | 120 | 24 | 2 | 1 | 330 | `#14B8A6` | proteína |

Los 13: `is_system = true`, `portion_system = 'cl'`, `macros_confirmed = true` (R8), `composed_of = null` (D5: Legumbres secas es **simple**), `coach_id/team_id = null`, `color` explícito de `EXCHANGE_GROUP_PALETTE` (el fallback `sortOrder % 9` daría colores casi repetidos con estos `sort_order`). Nombre visible en el picker = el `name`; la sección lleva el subtítulo «INTA 1999 · UDD 2019». Se descartó la forma UDD literal «Panes, cereales, legumbres frescas y tubérculos» (47 chars) por el tope de 40 del schema de escritura.

**Los 13 códigos son nuevos y ninguno colisiona** con `C/P/F/V/LAC/ARL/SP/G/LEG`. No es cosmético: el `code` es la llave semántica de facto en cinco caminos que rompen o mienten con códigos duplicados (`plan-persistence.ts:399-411` con `.maybeSingle()` ⇒ error duro al publicar; `exchange-calc.ts:38-41`; `editor-state.ts:589-598`; `demo-writers.ts:586-592`; los mapas por code de `20260718150000:206-232`).

> **Decisión del writer (W1):** el mockup M1 dibuja los puntos de color con códigos provisorios (`C`, `V`, `F`, `G`, `LEG`, `SP`). Mandan los **códigos canónicos del OUTLINE §13** (`PCT`, `VG`, `FR`, `AG`, `LGS`, `SCP`): son los que garantizan la no colisión. El resto del mockup (layout, copys, orden) se respeta tal cual.

### 6.2 Derivación masiva de equivalencias (script, R7)

Universo: las `foods` que hoy tienen `exchange_group_id` SMAE (las 2.507) → grupo chileno destino por el mapa de §7.2, **menos todos los `food_id` que aparecen en `generic-foods-cl.json`** (§6.3): los curados se cargan **antes** y el `on conflict do nothing` no protege cuando el destino derivado es **otro grupo** del mismo eje (R-13). Excluirlos del universo derivado es lo único que evita que el mismo alimento salga en dos grupos que compiten con gramajes distintos — el caso «Yogurt natural»: manda el curado (UDD, `LS`) y la derivada por dato (`LE`) **no se escribe**. Sin allowlist por nombre. Gramos con `suggestPortionGrams` (`packages/nutrition-v2/exchange-lists.ts:114-129`, la única fórmula que respeta `macros_basis` vía `intakeEntryFactor`) con la **macro clave forzada** por tabla (R1: derivarla con `dominantExchangeMacro` daría `carbs` para descremados y `fats` para enteros ⇒ gramos inconsistentes entre los tres subgrupos). Redondeo con `roundPortionGrams`. Se descarta `null` o > 5.000 g.

**Lácteos**: el alimento se reparte en los tres subgrupos por el **porcentaje de kcal que aporta la grasa**, nunca por gramos de grasa por 100 g:

```js
/** % de kcal que aporta la grasa. Escala-invariante: sirve para leche y para queso. */
fatEnergyShare(food) = (perGramMacros(food).fats * 9) / perGramMacros(food).calories   // respeta macros_basis
const DAIRY_SPLIT = { LD_MAX: 0.15, LS_MAX: 0.40 }   // < 15 % → LD · 15–40 % → LS · > 40 % → LE
```

`LS_MAX` es **inclusivo** (`share <= 0.40`: «Leche semidescremada - Los peumo» da 40,0 % exacto y el manual la pone en `LS`). Si el alimento no tiene kcal útiles (`calories <= 0`) **no se clasifica** y va al informe. Tabla, validación 5/5 contra el manual y casos borde en [DATA](DATA.md) §4.3/§4.3.1.

**Carnes: el eje se parte por grasa igual que el lácteo (R16, corrige «`CA` no recibe alimentos por este camino»).** Los 603 alimentos de `P` **no** van todos a `CB`: derivar por proteína le da los mismos gramos a un filete y a una longaniza (11 g de proteína), y esos ~80 g de longaniza quedarían listados en el sheet del alumno como «1 porción de Carnes bajas en grasa» = 65 kcal y 2 g de grasa, cuando son ~250 kcal y ~22 g. El corte usa el **mismo `fatEnergyShare`**:

```js
// CB = 2 g × 9 / 65 kcal ≈ 28 % · CA = 8 × 9 / 120 = 60 % ⇒ el corte va en el medio
share <= 0.40  → CB   ·   share > 0.40 → CA   ·   share == null → descartar (va al informe)
```

**Verificación obligatoria del dry-run**: los ~15 genéricos de carnes del JSON curado (§6.3: chuleta de cerdo, salmón, longaniza, vienesa, mortadela, jamón, sardina/jurel/atún en aceite, carne molida corriente…) deben caer **15/15** en el grupo que dice el manual **antes** del `--apply`, y las verificaciones de W0 suman el control «**0 filas en `CB` cuyo alimento tenga `share > 0,40`**». La redacción vigente es esta y la de [DATA](DATA.md) §4.2/§4.3 (una sola, ya alineada por el fix `db-datos:B2`).

> **Trazabilidad (cambio respecto del OUTLINE §5.2):** el OUTLINE proponía umbrales en **g de grasa por 100 g** (< 1,5 → `LD` · 1,5–2,5 → `LS` · > 2,5 → `LE`) y dejaba al writer fijarlos; se reemplazan por el % de kcal desde la grasa porque el umbral en gramos manda el queso cottage (5 g/100 g) a `LE` cuando UDD p. 54 lo pone en `LS`, y porque los gramos no son comparables entre `per_100` y `per_serving`. La regla vigente para W0 es la de este bloque; [DATA](DATA.md) §4.3 es la fuente.

**`VL` no se deriva masivamente**: con 10 kcal y 2,5 g de CHO los gramos salen absurdos; solo lleva los genéricos curados de §6.3.

El **dry-run emite un informe Markdown** (`scripts/output/cl-equivalences-<fecha>.md`) con conteo por grupo, distribución de gramos, top 20 sospechosos (> 600 g o < 5 g) y la **auditoría de R7**: cuántas de las 2.507 filas SMAE difieren > 20 % de la fórmula correcta. Ese número se registra como backlog «auditoría gramos SMAE», no se arregla acá. **El owner aprueba el informe antes del `--apply`.**

Las 2.507 filas SMAE **no se tocan** y `foods.exchange_*` (legado) **tampoco**: un alimento tiene una sola fila legacy y ya apunta al grupo SMAE; reescribirla mataría el set legado. El set chileno vive **solo** en `exchange_group_foods`.

### 6.3 Genéricos curados con medida casera (tabla completa en [DATA](DATA.md))

30-50 alimentos por grupo con `portion_label` transcrito de INTA/UDD, como **filas globales** (`coach_id` y `org_id` NULL, `source = 'catalog'`). Mínimo obligatorio verificado en los manuales:

- **PCT**: marraqueta ½ unidad 50 g · hallulla ½ unidad 50 g · pan molde blanco 2½ rebanadas 60 g (UDD; INTA dice 3) · arroz cocido ¾ taza 130 g (UDD; INTA 100 g) · papa cocida 1 unidad regular 150 g.
- **LD**: leche descremada 1 taza 200 cc · yogur descremado 1 unidad. **LGS**: porotos/lentejas/garbanzos cocidos **¾ taza = 130 g los tres** (R-14: un solo gramaje por medida casera dentro del grupo; si alguna legumbre necesita otro gramo, cambia la **medida**, no el número — «½ taza colmada»). **AG**: aceite 1 cucharadita 5 cc.
- **FR/VG/VL/CB/CA/LS/LE/AZ**: ejemplos del manual (UDD pp. 52-73, INTA pp. 14-37).
- **Procedencia declarada de `CA` y `LGS` (R-15, aceptado por el jefe)**: el escaneo UDD salta de p. 57 a p. 61 y de p. 73 a p. 77, así que esas 23 filas curadas salen de **INTA pp. 28 y 30** aunque el set se declare UDD (R8). Se acepta para W0 porque los encabezados de ambos manuales imprimen los mismos macros por porción; el informe del dry-run **marca qué filas vienen de INTA** y TASKS lleva el ítem «verificar contra las láminas UDD si aparece el escaneo completo» (sin bloquear).

Convenciones de medida (INTA p. 8): cucharada 10 cc · cucharadita 5 cc · taza 200 cc · vaso 180 cc. **Cuando UDD e INTA difieren manda UDD** (más nuevo) y se anota INTA en el informe. `portion_label` ≤ 40 chars (`egf_portion_label_len`). **Las 27 medidas caseras del seed SMAE no se reusan literal**: están calculadas con el ref SMAE (arroz cocido 80 g para 15 g de CHO); con el grupo chileno de 30 g pasan a ~160 g. Se re-derivan.

Si el genérico no existe en `foods` se crea como alimento del sistema **con macros por 100 g** (regla «alimentos siempre con macros»), `coach_id/org_id NULL`, `catalog_source = 'eva'`, `country_code = 'CL'`, y —si el manual da la unidad— `household_label`/`household_grams`. La comprobación en LIVE dice que **ningún genérico del manual falta del catálogo**: hay ≥ 1 coincidencia global para los 27 términos revisados (marraqueta, hallulla, pan de molde, arroz, papa, poroto, lenteja, garbanzo, quinoa, avena, leche, yogur, queso, palta, merluza, huevo…). El trabajo es **elegir bien**, no crear.

---

## 7. Superficies del coach — RN (editor único)

Solo se toca el **editor único**: `apps/mobile/app/coach/nutrition-v2/editor/[clientId].tsx` → `QuickEditMode.tsx` → `EditableSlotCard.tsx` → `EditablePortionsSection.tsx`. Los wizards (`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx`, `apps/web/.../builder/**`) están **retirados por ruta** (`builder/[clientId].tsx:560-573` redirige; web `builder/page.tsx:122-133` con `WIZARD_RETIRED = true`) y TASKS declara explícito «no se tocan», para no perder medio día de QA sobre pantallas inalcanzables.

### 7.1 Picker «Agregar grupo» con secciones y fila usada viva (M1 + M3)

**Contenedor** (sin cambios): `Sheet` `nativeModal snapPoints={['70%']}`, `rounded-t-sheet` 28 px, `border-t border-subtle bg-surface-card`, handle `h-1 w-10 rounded-pill bg-ink-300`, título `titleStyleFor('lg')` (uppercase, Archivo ExtraBold 21 px) con `PORTIONS_COPY.builder.addGroup` = «Agregar grupo» y una `✕` a la derecha. **Nuevo: encabezados de sección** dentro del `map` (molde: la partición `system`/`custom` del wizard web, `PortionsGroupPicker.tsx:266-268`), con `stickyHeaderIndices` del `Sheet` para que no se pierdan al hacer scroll (la lista de 13 + 9 + propios supera el viewport de un 70 %):

```text
┌ Agregar grupo                                                     ✕ ┐
│ SISTEMA CHILENO · INTA 1999 · UDD 2019        ← eyebrow mono 10 px  │
│ ● PCT  Panes, cereales y tubérculos                                 │
│        1 porción = 140 kcal · 30 C · 3 P · 1 G                      │
│ ● CB   Carnes bajas en grasa                                        │
│        1 porción = 65 kcal · 1 C · 11 P · 2 G                       │
│ …                                                                   │
│ LEGADO (SMAE) · Lo usas en 2 planes · Toca para ver            ▾    │
│ ⌐ (colapsado; al abrir, 9 filas con chip «Legado (SMAE)»)           │
│ + Crear grupo nuevo                          (solo si groupAdmin)   │
└─────────────────────────────────────────────────────────────────────┘
```

- **Quién parte la lista (R17, corrige R4).** `mergePortionGroupChoices` (`packages/nutrition-v2/editor-state.ts:641-650`) **no se toca**: sigue devolviendo «plan primero, catálogo después», que es lo que fija por test `quick-edit-state.test.ts:578` (verificado). La partición por sección se hace **en el consumidor, sobre la lista ya mergeada**: el `groups.map` de `EditablePortionsSection.tsx:272` (RN) y el de `EditablePortionsCard.tsx:286` (web) reparten con `visibleExchangeGroupsForCoach` + `comparePickerGroups` (§10.5) en «Sistema chileno» / «Propios» / «Legado (SMAE)» **antes** de renderizar, en vez de confiar en el orden de entrada. **Remate W2 (R18-bis):** como `collectPortionGroups` deja `portionSystem` en `undefined` y el merge prioriza la entrada del plan, el consumidor superpone **antes de partir** los metadatos del catálogo vivo (`portionSystem`, `sortOrder`, `isSystem`) por id con `applyCatalogMetaToPickerGroups(merged, catálogo)`: así un grupo SMAE ya prescrito cae en «Legado (SMAE)», el orden sale por `sortOrder` (PCT, CB…) y web usa el `isSystem` real; sin catálogo nada cambia (R18) y los snapshots del plan siguen ganando. Sin esto, para el coach al que apunta el tren —el que ya tiene un plan SMAE— los grupos legados **usados por el plan** se anteponen a los 13 chilenos por más que se parchee el comparador del catálogo.
- **Fila** (`:277-333`, sin cambios estructurales): `Pressable min-h-12 flex-row items-center gap-3 rounded-control px-2 py-2 active:bg-surface-sunken`; `GroupDot` 20 px `rounded-full` con el color del catálogo y el código en `font-bold text-white`; nombre `text-sm font-semibold text-strong`; subtítulo `text-xs text-muted`.
- **El chip «Valores referenciales» desaparece del set chileno** (`macros_confirmed = true`) y el conector pasa de «≈» a «**=**»: los valores están confirmados contra los manuales. La etiqueta suma **G**, porque en Chile la grasa es el criterio que separa lácteos y carnes.
- **Chip «Legado (SMAE)»** (`PORTIONS_COPY.builder.legacyBadge`) reemplaza a «Valores referenciales» en las filas del set viejo: mismo `rounded-pill border border-warning-500/30 bg-warning-500/10 px-1.5 py-px text-[10px] font-semibold text-warning-700`.
- **Sección legado**: `Pressable` de encabezado con `LayoutAnimation.configureNext`, `accessibilityState={{ expanded }}` y `ChevronDown`; **solo existe si `legacy` tiene grupos**.
- **Fila ya usada (D2-A)**: se le quita `disabled` y `opacity-50`; fondo `bg-primary/10`; subtítulo en color de marca `PORTIONS_COPY.builder.groupUsedBump` = **«Ya está en {franja} con {n} · Toca para sumar ½»**. Mismo alto de 48 px. El `accessibilityLabel` dice qué va a pasar, no solo el estado.
- **Único caso que sigue `disabled`**: el target ya está en el tope 99 ⇒ subtítulo `groupAtMax` y sin toast.

**Al tocar una fila usada**: `onPick` cierra el sheet (ese orden ya es el correcto, `:445-448`) → `BUMP_PORTION_TARGET` → resalte de la fila → toast. Un `useRef` de «ya elegí en esta apertura», reseteado en `onClose`, evita el doble tap en el mismo frame (Android).

### 7.2 Banner y sheet de conversión (M2)

**Banner** (`PortionConversionSheet` lo abre; vive al inicio del lienzo, encima de `AddActionButton` en `EditablePortionsSection.tsx:422`). Card `rounded-card border border-border-subtle bg-surface-card` con dos botones del sistema:

```text
┌─────────────────────────────────────────────────────────────┐
│ Este plan usa las porciones anteriores (SMAE)               │
│ Ahora EVA trae el sistema chileno (INTA/UDD): cereales a    │
│ 140 kcal y 30 g, lácteos por grasa, carnes bajas y altas.   │
│ Puedes convertir el borrador y revisar antes de publicar.   │
│  [ Ver conversión ]  [ Ahora no ]                           │
└─────────────────────────────────────────────────────────────┘
```

«Ahora no» esconde el banner **30 días para ese plan** (storage local por `planId`, **`AsyncStorage` en RN / `localStorage` en web**, sin columna nueva: no sobrevive al cambio de dispositivo y eso es aceptable — §C.3 de RESOLUCIONES-2). **Decisión del jefe (W3.10, af):** el banner cuenta como SMAE **solo grupos del sistema** (`draftUsesLegacySmae(variants, groups, coachSystem)` del paquete: `isSystem !== false` y `systemOf === 'smae'`); los grupos **propios** nunca disparan el aviso aunque su fila traiga `portion_system = 'smae'` (default de W0.1), y lo mismo aplica a `legacySystems` del borde (`findUsedPortionSystemsForCoach` filtra `is_system = true`). Se monta **una vez por plan** (`QuickEditMode` / `QuickEditPlanView`), nunca dentro de la card de la franja, y solo si hay algún destino `cl` vivo (`hasClDestinations`). Las filas de porciones del plan legado cambian su chip de «Valores referenciales» a «Legado (SMAE)».

**Sheet de conversión** — `apps/mobile/components/nutrition-v2/quick-edit/PortionConversionSheet.tsx` (nuevo, misma carpeta), `Sheet nativeModal snapPoints={['85%']}`:

```text
┌ Convertir a porciones chilenas                                   ✕ ┐
│ Reescalamos cada porción por su nutriente crítico (carbohidrato,   │
│ proteína o kcal) y redondeamos a 0,5. Revisa las filas marcadas.   │
│                                                                    │
│ DESAYUNO                                                           │
│  Carbohidratos/Cereales  2  →  Panes, cereales y tubérculos  1     │
│                                             140 → 140 kcal         │
│  Lácteo                  1  →  Lácteos descremados        1,5      │
│      [ Descremado | Semi | Entero ]      «Revisar»  95 → 105 kcal  │
│ ALMUERZO                                                           │
│  Proteínas (bajo grasa)  3  →  Carnes bajas en grasa        2      │
│                                             «Revisar» 165 → 130    │
│  Alimento rico en lípidos 1 + Grasa de cocina 1 → Aceites y grasas 2│
│ ONCE                                                               │
│  Legumbres               1  →  Legumbres secas            0,5      │
│                                             «Revisar» 125 →  85    │
│ ───────────────────────────────────────────────────────────────    │
│ Día base                                        620 → 555 kcal     │
│ Cambia el borrador. No se publica nada hasta que toques Publicar.  │
│  [ Cancelar ]                    [ Convertir borrador ]            │
└────────────────────────────────────────────────────────────────────┘
```

Cada fila muestra grupo y cantidad **antes** y **después**, con kcal antes → después. La **fila colapsada** (R2) se pinta con sus dos orígenes en una sola línea; nunca dos filas al mismo destino. El **selector de lácteo** (R3) es un control segmentado de tres, default Descremado, que recalcula el factor por kcal al cambiar y mantiene la marca «Revisar». El **delta del día** al pie es lo único que le dice a la nutricionista si el redondeo la movió del objetivo (`dayTotalsByVariant` antes/después). El botón primario aplica al borrador con `REPLACE_PORTION_GROUPS`; publicar sigue siendo un paso aparte.

### 7.3 Stepper con tap-to-edit (M3)

`PortionsStepper` (`EditablePortionsSection.tsx:96-141`) pasa de `<Text>` a **`<TextInput>` siempre montado**, calcado de `QuantityStepper.tsx:91-109` (el árbol tiene que quedar 100 % estable en Fabric: nada de swap botón↔input como en web):

- `keyboardType="decimal-pad"`, `selectTextOnFocus`, `returnKeyType="done"`, `inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}`. Acá **no hace falta montar nada**: el stepper de porciones vive en el lienzo (`EditableSlotCard.tsx:446` → `EditablePortionsSection`), no dentro de un `Sheet`, y le sirve el `KeyboardDoneBar` que ya monta la pantalla (`QuickEditMode.tsx:1726`). El que sí necesita barra propia es el sheet de **«Metas ▾»** (§7.5) y, si lleva inputs, el `PortionConversionSheet`: `inputAccessoryViewID` resuelve por `nativeID` dentro del árbol del `Modal`, así que una barra montada fuera no existe para él (y es iOS-only; Android cierra con su tecla ✓).
- Valor **crudo** del reducer mientras se tipea (nada de `formatPortionsEsCl`, que redondea a medios); formateo en `onBlur`. Botones `h-11 w-11 rounded-control border border-default bg-surface-card`, `opacity-40` en los topes; número `w-12 text-center text-base font-semibold text-strong` con `fontVariant: ['tabular-nums']`.
- Prop nuevo `onSetValue(targetKey, value)` que baja hasta `QuickEditMode` → `SET_PORTION_TARGET` (ya existe). **Subtítulo mientras edita**: `PORTIONS_COPY.builder.stepperEditHint` = «Escribe la cantidad · de 0,5 a 99».
- **Error bajo la fila**: `errors['portion.<key>.portions']` con `accessibilityLiveRegion="polite"` (espejo de `EditablePortionsCard.tsx:241`). Esa clave ya viaja al chip del día y a `PublishBar` sin tocar la capa de validación: `qeDayErrorSummaries` la suma al contador **`other`** (`editor-state.ts:2792`, verificado — **no** a un contador `fields`, que no existe; R-12). El chip se marca igual; lo que depende del `kind` es el copy del resumen por día.
- `style` como **objeto estático**, jamás función junto a `className` (css-interop descarta el prop y la fila pierde todo el estilo).

### 7.4 Resalte y toast (M3)

- **Resalte**: `Animated.View` del core (el quick-edit no usa reanimated) con `backgroundColor` interpolado desde `theme.primary` al 12 % hasta transparente en **1,2 s**, `useNativeDriver: false`, apagado con `useReducedMotion()` (patrón `EditableSlotCard.tsx:207-213`). Si la fila queda fuera de vista, el mismo gesto de scroll de `jumpToDay` (`QuickEditMode.tsx:1093-1097`).
- **Toast**: `toast.info(...)` con `action` (existe desde el 02-09, `Toast.tsx:64-67, 315-337`) y **`id` estable** `portion-bump:{slotKey}:{groupId}`: reusar el id **actualiza el toast en el sitio** en vez de apilar, que es justo lo que necesita el doble tap. Copy `PORTIONS_COPY.builder.groupBumped(grupo, n, franja)` = **«{grupo}: ahora {n} porción en {franja}»** / **«… {n} porciones …»** según `n === 1 ? 'porción' : 'porciones'`, con `{n}` formateado por **`formatPortionsEsCl`** (§10.6). Las dos cosas son obligatorias: con `PORTION_MIN = 0.5` (§10.1) un bump de +0,5 llega a `n = 1` en el **primer** tap, y sin plural el toast diría «Frutas: ahora 1 porciones en Desayuno» — justo la frase que Pame pidió arreglar; sin el formateador el toast imprimiría «1.5» mientras la fila dice «1,5». Casos de test con `n = 1` y `n = 1,5`. Acción `groupBumpedUndo` = «Deshacer». Sin haptics extra.
- **Deshacer restaura el valor previo capturado al CREAR el toast**, no `−0,5` y **no** «el valor al abrir el picker»: tocar la fila **cierra el sheet** (§7.1, orden ya vigente en `EditablePortionsSection.tsx:445-448`), así que dos bumps son dos aperturas y capturar en la apertura devolvería el valor intermedio. La captura se guarda junto al toast de `id` `portion-bump:{slotKey}:{groupId}`: **mientras ese toast siga vivo los bumps siguientes no vuelven a capturar** (`Toast.tsx:126-141` ya actualiza el toast en el sitio al reusar el `id`); cuando expira por su `duration`, el próximo bump abre una interacción nueva y captura de nuevo. Dos taps con el toast visible + un Deshacer ⇒ valor inicial de esa interacción.

> **Decisión del writer (W6):** el toast va por `toast()` y no por el `UndoSnackbar` inline de `PublishBar.tsx:202-224`, porque ese canal no soporta un label de acción distinto de «Deshacer» ni ids estables. El «quitar grupo» sigue usando `UndoSnackbar`: conviven.

### 7.5 Metas con switch «Solo el {día}» (M4)

Hoja del header (`QuickEditMode.tsx:2383-2402`, verificado) con `TargetsEditorCard`: título `font-display text-base font-semibold`, cuatro filas (Energía kcal · Proteína g · Carbos g · Grasas g) con `QuantityStepper` `h-11`. **Se agrega una fila de switch bajo los cuatro steppers**:

```text
┌ Metas del día                                                 ┐
│ Energía   kcal   [ − ]  2040  [ + ]                           │
│ Proteína  g      [ − ]   144  [ + ]                           │
│ Carbos    g      [ − ]   247  [ + ]                           │
│ Grasas    g      [ − ]    52  [ + ]                           │
│ ──────────────────────────────────────────────────────────── │
│ Solo el martes                                    ( ○——)      │
│ Apagado: se guarda en «Todos los días» y vale para toda la    │
│ semana.                                                       │
│                                          [ Listo ]            │
└───────────────────────────────────────────────────────────────┘
```

**Barra «Listo» dentro del sheet (obligatorio con el switch nuevo)**: los cuatro `QuantityStepper` cuelgan `inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}` (`QuantityStepper.tsx:101`) pero hoy **no hay `KeyboardDoneBar` montado dentro del `Modal` del sheet** (`QuickEditMode.tsx:2383-2402`): el accessory resuelve por `nativeID` dentro del árbol del modal, así que en iOS el `decimal-pad` queda sin forma de cerrarse. Con el switch debajo de los steppers eso pasa de molestia a bloqueo: el teclado lo tapa. Se monta un `<KeyboardDoneBar />` **dentro** del `Sheet` de metas (y del `PortionConversionSheet` si termina llevando inputs). Va al QA en device (punto 6): «el teclado se cierra con “Listo” y el switch queda visible».

**Default del switch, decidido por el estado** (no por preferencia): el día activo es la base ⇒ **oculto** (escribir la base es escribir todos) · día específico con `qeTargetsEqual(dia, base)` (incluidos ambos vacíos) ⇒ **OFF** ⇒ `scope: 'all'` · día específico con metas propias distintas ⇒ **ON** ⇒ `scope: 'day'` · plan de un solo día ⇒ oculto. Ayuda OFF: «Apagado: se guarda en «Todos los días» y vale para toda la semana.» Ayuda ON: «Encendido: el {día} usa esta meta; los demás días siguen con {kcal} kcal.» Apagar el switch estando ON = volver a las metas de todos los días (copia las del base sobre el día), con Deshacer. **Decisión del jefe (W4.9, y):** eso vale cuando el base TIENE kcal; con el base SIN kcal (el plan de Pame) apagar el switch **propaga** la meta del día al base y a los días que heredaban («Ahora vale para toda la semana») y nunca la vacía. Los dos caminos deshacen por snapshot de las variantes tocadas, y la decisión pura vive en `qeSwitchOffPlan(state, dayKey)` del paquete (las superficies solo despachan `scope: 'day'` por llave: el reducer recalcula «quién hereda» en cada dispatch con `'all'`, así que propagar campo a campo con `'all'` era el bug). En RN el aviso con «Deshacer» es **inline** dentro del sheet: el `Toaster` raíz queda detrás del `nativeModal`. `scope: 'all'` escribe en el base **y** en los días que heredaban (`qeTargetsEqual` **antes** del cambio): un día con meta propia distinta no se pisa. No toca `passthroughTargets` (fibra/sodio/agua).

**El segundo host de `TargetsEditorCard` en RN no lleva switch (R-07).** Además de la hoja del header hay una card en el lienzo, `QuickEditMode.tsx:2011-2020` (verificado), que despacha `SET_TARGET` con `variant.key` (`:2016`) **por variante**: pero se renderiza **solo con `editorMode === false`** (el quick-edit clásico; en el editor único la card «se mudó a la hoja Metas ▾» y el lienzo ya no la pinta). Como este tren toca **solo el editor único** (§7), ese host queda **byte-idéntico**: despacha `SET_TARGET` **sin `scope`** —que es opcional y sin él el reducer se comporta como hoy— y no muestra el switch. Se agrega como criterio explícito de W4.3 para que nadie lo «empareje» de paso. En web es distinto y sí hay dos hosts vivos: §8.4.

> **Decisión del writer (W2):** r3 §7.3 proponía renombrar la hoja de «Metas del día» a «Metas» y otros copys de ayuda. **Mandan los copys del artifact de mockups** (aprobados por el owner): la hoja sigue diciendo «Metas del día» y el botón del header «Metas ▾». Lo mismo aplica al toast de bump (formato del mockup, no el de r2) y al subtítulo de la fila usada.

### 7.6 PublishBar con aviso ámbar y chips con punto (M4)

`PublishBar.tsx` RN gana `dayNotice?: { message, action } | null` como bloque hermano entre `errorMessage` (`:111-140`) y `dayWarning` (`:144-148`). Caja `rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs font-medium` (**ámbar, nunca la roja de validación**: el color es lo que dice «no bloquea») + botón con `ArrowRight`:

```text
┌──────────────────────────────────────────────────────────────┐
│ ⚠ Solo Martes tiene meta. Lunes, miércoles, jueves, viernes, │
│   sábado y domingo quedan sin objetivo.        [ Ir a Base → ]│
│ Martes · 0 kcal · P 0 g · C 0 g · G 0 g                       │
│ [ Descartar ]                        [ Publicar igual ]       │
└──────────────────────────────────────────────────────────────┘
```

- El botón primario dice **«Publicar igual»** mientras el aviso está visible; publicar sigue permitido. «Ir a Base» = `APPLY_BASE_TARGETS` desde el primer día con meta + `jumpToDay('default')`, en un solo toque.
- **El aviso vive en la `PublishBar`, que está siempre visible, y aparece desde que se abre el editor** — no es un modal ni salta solo al pulsar Publicar (§C.1 de RESOLUCIONES-2; igual que `PortionsDayGapNotice`, coherente con el mockup M4 y con r3, que dibujan el estado con el aviso ya puesto).
- **Chips**: las keys de `qeDaysMissingTargets` se suman a `attentionKeys` de `DayAnchorRow` (`:3150`) como `noticeKeys`, con **el mismo punto ámbar** que ya existe (`h-[7px] w-[7px] bg-warning-500`, borde `warning-500/60`) — sin pasar por `showErrors`. La cinta (`EditorRibbon.tsx:49-52`) con el día activo sin meta puede imprimir «{kcal} · sin meta» en vez de «{kcal} kcal».

**El aviso nunca es un error.** No se crea severidad `warning` en `validateQuickEdit`: bloquear volvería irrepublicables los planes con metas parciales (el daño que reparó `ee6766ae` el 02-09, documentado en `editor-state.ts:2602-2605`), y el guard SQL de publicación nunca exigió metas (`20260716210000_nutrition_v2_t11_hardening.sql:127-141`).

---

## 8. Superficies del coach — WEB (paridad)

Regla del owner: **RN y web parejos en el mismo tren**. Todo lo puro vive en `packages/nutrition-v2`, así que ambas plataformas dan la misma respuesta por construcción; solo divergen los hosts.

### 8.1 `EditablePortionsCard.tsx` (`_quick-edit`)

- Picker en `QeBottomSheet` (bottom sheet en móvil, **diálogo centrado en desktop**): mismas dos secciones, mismo chip «Legado (SMAE)», misma sección legado colapsable (`<details>` o botón con `aria-expanded`). La partición se hace **acá**, en el `groups.map` de `:286` (verificado), sobre la lista que ya devolvió `mergePortionGroupChoices` — que **no se toca** (R17, §7.1).
- Fila usada: se quita `disabled={used}` y las clases `disabled:*` (`:290-294`); subtítulo con la variante web del copy: **«Ya está en {franja} con {n} · Clic para sumar ½»**.
- `handlePick` (`:271-274`): si el grupo ya está ⇒ `BUMP_PORTION_TARGET` + resalte + `toast(..., { action })` por `sonner` (mismo canal que el «quitar grupo», `:172-179`); si no ⇒ `ADD_PORTION_TARGET` como hoy. En ambos casos cierra el sheet. Resalte: `ring-2 ring-primary/60 rounded-control transition-[box-shadow] duration-700` + `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
- **Conteo de equivalencias**: pasa de `countExchangeFoodsByGroup` (cuenta `foods.exchange_group_id`, rama legacy ⇒ **0 para los grupos chilenos**) a `getExchangeListCounts` (lee `exchange_group_foods`, ya lo usa la ruta móvil). Es prerrequisito de W1, no un extra (R6, T-07).
- `QE_COPY.portionsPickerHint` (`microcopy.ts:125`) hoy afirma que los usados «aparecen desactivados»: queda **falso** con D2-A y se reescribe. Ningún gate lo atraparía: es texto de producto.

### 8.2 `StepperField.tsx` — **sin cambios**

Ya cumple D2-A: tocar el valor lo convierte en `<input inputMode="decimal">` con auto-select, Enter/blur confirman, borde `border-primary` (o `border-rose-400` si `invalid`), botones `h-11 w-11`. Se cita para que nadie lo «mejore» de paso.

### 8.3 `PortionConversionDialog.tsx` (nuevo en `_quick-edit`)

Mismo contenido que el sheet RN en un `QeBottomSheet size="lg"`. Los cálculos son los mismos (`convertPortionsToCl`), así que el diff no puede divergir.

**Dónde vive el banner — corregido en W3.6 (ratificado por el jefe, 09-09).** Este párrafo decía «banner en `EditablePortionsCard.tsx:100`, bajo `sectionHint`», y esa ubicación contradecía a §7.2 y al mockup M2: `EditablePortionsCard` se monta **una vez por FRANJA**, así que el aviso se repetía en cada comida y «Ahora no» —que es por `planId`— apagaba solo una. El banner vive en `PortionConversionDialog.tsx` (`PortionConversionBanner`) y lo monta **`QuickEditPlanView` una sola vez, al inicio del lienzo**; la card no recibe ni `planId` ni prop `onConvertClick`, y el diff de W3 sobre `EditablePortionsCard.tsx` es **cero** (la carcasa y la prop que montó W2.7 se retiran). RN hace exactamente lo mismo con `EditablePortionsSection` / `QuickEditMode`.

**Guard de destinos (W3.6).** El banner tampoco se pinta si la lista de grupos no trae **ni un destino chileno vivo** (`hasClDestinations`, `isClGroup` con el fallback conservador `'smae'` del motor). Entre el deploy y W6.8 los 13 grupos `cl` viven con `deleted_at`: sin el guard el aviso prometía «Puedes convertir el borrador» y abría un diálogo que solo sabe decir «su equivalente chileno todavía no está disponible» con el botón primario apagado.

### 8.4 `TargetsEditorCard` web + `PublishBar` web

- El switch «Solo el {día}» vive en el componente (que ya toma `dispatch` del contexto, `:43`) con `role="switch"` + `aria-checked`, y se pinta igual con `chrome="bare"`. **Hay dos hosts en web**: el `Popover` «Metas del día ▾» de la cinta (≥768) y la card `md:hidden` del lienzo — el switch tiene que aparecer en los dos.
- `PublishBar` web gana `noticeMessage` + `noticeAction`, hermanos de `validationMessage`/`validationAction` (`:62-84`), renderizados en **ámbar con `role="status"`** (no `alert`) entre la caja de validación y `dayWarning`. Botón «Publicar igual» habilitado. Copy del mockup web: «Solo Martes tiene meta. Los otros seis días quedan sin objetivo.» + «Abrir metas del base →».
- El punto ámbar va a las **dos** superficies de días: `EditorDayCapsule` (<1024) y `EditorDayRail` (≥1024).

---

## 9. Superficie del alumno — sheet de equivalencias (M5)

Un solo par de componentes: web `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/PortionEquivalencesSheet.tsx` (montado en `TodayExperience.tsx:1146`) y RN `apps/mobile/components/alumno/nutrition-v2/PortionEquivalencesSheet.tsx` (montado en `index.tsx:2241`). El sheet V1 RN, `useStudentExchanges` y la ruta `student-bundle` **no tienen consumidor V2 y no se tocan** (candidatos a retiro en backlog).

### 9.1 De dónde sale la foto

La causa raíz está en el RPC. `get_nutrition_today_v2` se parchea **por texto sobre la definición viva** (`pg_get_functiondef`, 21.119 chars), con las anclas verificadas 1 hit cada una, y **jamás** copiando el cuerpo de la última definición completa del repo: un copy-body revertiría la fuga cross-tenant B1 (`20260906210308:45-56`). Migración canónica: `20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql`. Qué se emite, y por qué solo eso:

| Forma | Payload (60 filas × 9 grupos = 532) | Decisión |
|---|---|---|
| Hoy, 7 llaves | 116 kB | — |
| + objeto `media` completo (13 llaves) | 274 kB (**+136 %**) | **descartado** |
| + `imagePath` + `imageVersion` + `isGeneric` + `imageLicense` | ~149 kB (+29 %) | **elegido** |

> **Medido en LIVE el 10-09 (W5.10, RPC `20260910015432`)**: Today del alumno `f28ed987…` 93.907 B antes → **132.878 B**
> después (+41 %; 360 filas, 313 con foto, 91 `cc_by*`). El `object_path` pesa más que la estimación, pero sigue 5,6× por
> debajo del tope de 750 kB del cache offline.

El cache offline de RN **descarta en silencio** cualquier payload > `MAX_ENTRY_BYTES = 750_000` (`apps/mobile/lib/nutrition-v2-cache.ts:6`, `return false` sin log): el alumno perdería el modo offline sin ningún aviso. Es el argumento técnico decisivo. `bucket` es constante por CHECK y **no viaja**; tampoco el objeto `media`. La URL se arma en cliente y apunta a `/storage/v1/object/public/...`, sin consumir Image Transformations (queda prohibido usar `render/image` para redimensionar a 36 px).

> **Corrección del fixer (R-02, manda RESOLUCIONES-2 §B):** el RPC emite **`imagePath` E `imageVersion`** (entero chico), además de `isGeneric` e `imageLicense`. La decisión anterior («no viaja `imageVersion`») queda **revertida**: el helper que se reutiliza, `foodMediaThumbnailUrl` (`apps/mobile/lib/nutrition-v2-food-media.ts:43-58`), arma `${base}/storage/v1/object/public/${bucket}/${path}?v=${media.version}` y **exige la versión** para el cache-busting. El campo se llama `imagePath` (OUTLINE §9), nunca `imageUrl`. Como `bucket` no viaja, hace falta un **helper nuevo** —`foodMediaThumbnailUrlFromPath({ imagePath, imageVersion })` en RN y su gemelo en `apps/web/src/lib/food-image.ts`—, con **tarea propia en W5** y test de la URL construida: sin él, «se reutiliza el helper existente» es falso. El SQL de [DATA](DATA.md) §8.2, PLAN §W5 y TASKS W5.1/W5.4 quedan alineados con esto.

### 9.2 Genéricos y marcas

`isGeneric` se emite como `foods.brand is null`. **El criterio de orden va DENTRO de la ventana que corta a 60**, no solo en el `order by` del `jsonb_agg`. Hoy el cap corre sobre `row_number() over (partition by cand.exchange_group_id order by cand.owner_rank, cand.name, cand.id)` (`supabase/migrations/20260804091000_nutrition_v2_exchange_foods_from_lists.sql:52-56`, el `v_new` vigente que el parche de §9.1 copia): reordenar solo la salida **reordena las 60 que ya se eligieron alfabéticamente**, así que con `PCT` (~706 candidatos) «Pan marraqueta», «Papa cocida» y «Quínoa cocida» ni siquiera entran al payload — y el buscador del sheet filtra en cliente sobre esas 60. Con eso D4-A no reemplaza al PDF. La ventana pasa a:

```sql
row_number() over (
  partition by cand.exchange_group_id
  order by cand.owner_rank,
           cand.is_generic desc,           -- brand is null primero
           cand.portion_label_present desc, -- medida casera antes que gramos pelados
           cand.name, cand.id
) as rn
```

`is_generic` (`src.brand is null`) y `portion_label_present` (`src.exchange_portion_label is not null`) se calculan en la subconsulta `cand` y el `order by` del `jsonb_agg` de salida se **alinea con los mismos cuatro criterios**, para que el orden del payload sea el orden del cap. En PG `true` ordena después de `false` en ASC: el `desc` es el que pone los genéricos primero — queda escrito en el comentario de la migración para que nadie lo «arregle». Los helpers de filtrado del cliente **no reordenan** (`filter` es estable); la partición se hace con un helper puro compartido `splitExchangeFoodsByOrigin`.

> **Decisión del writer (W4):** **no se agrega la columna `exchange_group_foods.is_generic`** que proponía r4 §3.4. El OUTLINE §9 fija `isGeneric = brand is null` y con eso se cubre el 100 % del efecto visible (557 genéricos, 505 con foto). La curaduría INTA/UDD se distingue igual, porque es la única que tiene `portion_label` no numérico y el orden ya la sube por el segundo criterio. Menos DDL, mismo resultado.

### 9.3 Anatomía del sheet

```text
┌ ● PCT  Panes, cereales y tubérculos                            ┐
│        1 porción = 140 kcal · P 3 g · C 30 g · G 1 g           │
│ 🔍 Buscar alimento                                             │
│ ─ GENÉRICOS · INTA · UDD ────────────────────────────────────  │
│ [foto] Pan marraqueta                        ½ unidad          │
│        o hallulla                                50 g          │
│ [foto] Pan molde blanco                    2½ rebanadas        │
│                                                  60 g          │
│ [foto] Arroz cocido                            ¾ taza          │
│                                                 130 g          │
│ ─ MARCAS Y PRODUCTOS ───────────────────────────────────────   │
│ [foto] Arroz Grado 1                             40 g          │
│        Tucapel · crudo                        ≈ 3 cdas         │
│ ───────────────────────────────────────────────────────────    │
│ Fotos: Open Food Facts (CC BY-SA)                              │
│ [ Marcar 1 porción ]                        [ Registrar ]      │
└────────────────────────────────────────────────────────────────┘
```

- **Cabecera**: `GroupDot` 36 px + nombre + subtítulo con kcal/P/C/G. Con el set chileno **sin** chip referencial. **Legumbres del set legado deja de decir 0** (R11): la cabecera usa el mismo helper de expansión `qeGroupRefPerPortion` / equivalente del engine.
- **Miniatura**: `FoodThumbnail size="sm"` = **36 px** en RN **y en web** (el kit ofrece 36/48/64; **no existe 40** y no se agrega uno — TASKS W5.6 dice 40 y se corrige a 36, R-11). El kit ya fija internamente `cachePolicy="memory-disk"`, `contentFit="cover"` y `transition={120}` (`NutritionV2Kit.tsx:457-463`), y sus props son `src, alt, size, fallbackEmoji, fallbackCategory`: **se saca `recyclingKey` del SPEC** (R-18), porque no es un prop del kit y sin virtualización (§9.4) no aporta nada — agregarlo sería tocar un componente compartido por `FoodRow`, `add-food-v2`, `FoodDetailSheet` y `foods.tsx`.
- **Fallback sin foto (R-10, decisión del fixer):** el read model **no trae `category`** y el RPC **no la emite** (no se agrega una tercera llave de texto al payload), así que «ícono de categoría derivado del nombre» —que no existe— se reemplaza por **el `GroupDot` del grupo**, que es exactamente lo que el sheet pinta hoy (`PortionEquivalencesSheet.tsx:238-278`, `GroupDot size={28}`). **Ninguna fila queda vacía** (52 de los 557 genéricos no tienen imagen). En web, `next/image` con `unoptimized` y el mismo fallback.
- **Medida casera en negrita** (`portion_label`) con los **gramos en mono debajo**; si `portion_label` es `null` se muestran los gramos como hoy — tras D4-A eso pasa a ser el estado normal de las marcas, no un error.
- **Encabezados de sección**: `PORTIONS_COPY.student.sheetGenericsTitle` = «Genéricos · INTA · UDD» y `student.sheetBrandsTitle` = «Marcas y productos», sticky (claves de TASKS W5.9; el borrador decía `STUDENT_COPY.equivalences.*` y quedó alineado en W5). Con el buscador activo, la sección que queda vacía no dibuja su encabezado.
- **Pie de licencias condicional**: la línea «Fotos: Open Food Facts (CC BY-SA)» del diagrama aparece **solo si alguna fila visible tiene `imageLicense` `cc_by_sa`/`cc_by`** (§9.4). Con el buscador activo se recalcula sobre lo visible.
- **Botones al pie** sin cambios: «Marcar 1 porción» (`tone="nutrition"`) y «Registrar» (`neutral`, `null` si `canRegisterFreely = false`).

### 9.4 Atribución y perf

De las fotos del catálogo de equivalencias, **1.316 son `product_photo` con `license = 'cc_by_sa'` y las 1.316 traen `attribution`**; las otras 460 son `eva_illustration`/`eva_owned`. `food_media.license` es un enum acotado por CHECK (`eva_owned`, `supplier_authorized`, `public_domain`, `cc_by`, `cc_by_sa`, `unknown` — `20260714220000_food_media.sql:18-27`).

**Se emite `imageLicense`** (`fm.license`) en el **mismo `left join lateral`** que ya trae `imagePath`: es un texto corto de un enum de seis valores, el payload sube ~2 kB sobre las 145 (§9.1), y sin él las dos promesas de D4-A son imposibles de cumplir honestamente:

- **El pie es condicional, no incondicional**: «Fotos: Open Food Facts (CC BY-SA)» se pinta **solo si alguna fila visible trae `cc_by_sa` o `cc_by`**. Un grupo servido con las 460 `eva_illustration`/`eva_owned` o con fotos `supplier_authorized` no atribuye a OFF una foto que no es suya.
- **La fila con foto nombra su fuente en el `accessibilityLabel`/tooltip** derivándola de `imageLicense` («Foto: Open Food Facts (CC BY-SA)» para `cc_by*`, sin línea para las propias). El texto libre `attribution` **no viaja** (es el campo largo y variable; el crédito por licencia cubre la obligación sin inflar el payload). Sin `imageLicense`, la promesa «expone su atribución» era irrealizable: el RPC solo emitía `imagePath`, `imageVersion` e `isGeneric`.

**Ninguna imagen del manual UDD** (S7): solo valores y medidas.

60 filas con imagen dentro del `ScrollView` del `Sheet` (hoy sin virtualizar). Si el QA en device muestra jank, la salida barata es cortar a 30 filas visibles + «Ver más», **no** virtualizar el sheet. El `left join lateral` de la foto corre **después** del cap (máximo 60 lookups por grupo, servidos por `food_media_food_kind_idx`).

---

## 10. Reglas del motor

1. **Paso y rango**: `PORTION_STEP = 0.5`, `PORTION_MIN = 0.5`, `PORTION_MAX = 99` (`editor-state.ts:1140-1142`), espejados por el CHECK de DB (`portions > 0 and <= 99 and (portions*2) = floor(portions*2)`) y por Zod (`contracts.ts:174-189`). `stepPortionsText` **satura**, no falla: en el tope 99 la fila del picker queda `disabled` y no se emite toast.
2. **Redondeo de la conversión**: `round05(x) = Math.round(x * 2) / 2` con **piso 0,5**. Nunca 0: el CHECK exige `> 0`.
3. **Macro clave por grupo, tabla explícita, nunca derivada** (R1): `PCT/FR/VG/VL/LGS/AZ` → carbohidratos · `CB/CA/SCP` → proteína · `AG` → grasa · `LD/LS/LE` → **kcal**. INTA llama «nutriente crítico» a los lípidos en lácteos, pero el descremado tiene 0 g de grasa y dividir por cero es imposible; por kcal los tres subgrupos quedan consistentes entre sí. La misma tabla sirve para derivar equivalencias y para convertir.
4. **Expansión de compuestos**: vive en `packages/nutrition-engine/exchange-calc.ts` (`expandComposedGroups` :57-82, `macrosForTargets` :85-100, `dayTotalsByVariant` :126-142, `hasUnconfirmedMacros` :171-180). Helper nuevo `qeGroupRefPerPortion(group, groups)` = `macrosForTargets([{ exchangeGroupId, portions: 1 }], groups)`, con **fallback honesto** al `ref` crudo si el dict está vacío o la base no resuelve. Se usa en las seis etiquetas «1 porción ≈» y en la cabecera del sheet del alumno. El dict debe ser el **congelado del plan**, nunca el catálogo vivo (guardián: `packages/nutrition-v2/portions-qa.test.ts:141`).
5. **Orden del picker** (R4, releído por R17/R18): **hay dos comparadores, y son distintos.**
   - `compareCatalogGroups` (`editor-state.ts:570-575`, sobre `ExchangeGroup`, usado **solo dentro de** `catalogToPortionGroups` `:588-600`) **no cambia**: ordena el catálogo vivo por `isSystem`, `sortOrder`, `code`.
   - **`comparePickerGroups` (nuevo, en `editor-state.ts`)** opera sobre la forma real que recibe el picker —`QePortionGroup` + `legacy`, con el `sortOrder?` que RN ya parcha aparte (`PortionPickerGroup`, `EditablePortionsSection.tsx:29`)— y aplica «**set del coach primero, propios, legado al final**» dentro de cada sección. Se usa en el **consumidor** (§7.1), sobre la lista mergeada; `mergePortionGroupChoices` no se toca.
   - **Las dos copias de los wizards** (`builder/_components/portions-state.ts:234-240`, `apps/mobile/lib/nutrition-v2-builder-portions.ts:253-259`) **no se tocan**: esas rutas están retiradas (§7).
   - **Nada de `sort_order` negativo** y **nunca renumerar SMAE**: el `ON CONFLICT DO UPDATE … WHERE macros_confirmed = false` del seed V1 lo revertiría si alguien lo re-corre.
6. **Un solo formateador**: `formatPortionsEsCl` se exporta desde el paquete y reemplaza las tres copias privadas (`EditablePortionsSection.tsx:33-36`, `nutrition-v2-builder-portions.ts:173-175`, `plan-dow-strip.ts:97`). Sin esto, «1,5» y «1.5» conviven en la misma pantalla.
7. **Filtro solo al catálogo ofrecido, jamás a la resolución por id.** Es la regla que impide romper los 337 targets vivos (§5.3, T-01).
8. **`SYSTEM_EXCHANGE_CODES`** (`read-models.ts:638-649`) suma los 13 códigos chilenos, o `reconstructExchangeGroups` marcaría `isSystem: false` a los grupos chilenos del snapshot.
9. **Tipos: `portionSystem` es OPCIONAL, y hay dos interfaces `ExchangeGroup`** (R15). Se declara `portionSystem?: 'smae' | 'cl'` en **`packages/nutrition-engine/exchange-types.ts`** *y* en **`apps/web/src/domain/nutrition/exchange.types.ts:8-29`** (idéntica campo por campo, es la que importa `exchanges.repository.ts:3-10` y usan ~20 archivos web): con el campo obligatorio dejarían de ser estructuralmente compatibles y ~42 archivos que construyen grupos —casi todos fixtures de test— romperían. **`NutritionExchangeGroupReadSchema` (`read-models.ts:238-254`) NO se toca**, para que el contrato A4 y su test (`read-models.test.ts:333-336`, `const engineDict: ExchangeGroup[] = dict`) queden intactos: `reconstructExchangeGroups` no podría completar el campo porque el snapshot congelado no guarda el set. `GROUP_COLUMNS` suma `portion_system` en **los dos** repos: web (`exchanges.repository.ts:32`) y RN (`apps/mobile/lib/nutrition-exchanges.coach.ts:85-86`). La promesa del plan se reescribe así: «**no se editan los tests existentes** de `editor-state`/`_quick-edit`; los fixtures que construyen `ExchangeGroup` no cambian **porque el campo es opcional**».
10. **`QePortionGroup` gana `portionSystem?` y el ausente cae al set del coach** (R18). Se suma `portionSystem?: 'smae' | 'cl'` a `QePortionGroup` (`editor-state.ts:247-258`, verificado: hoy no tiene `isSystem` ni `sortOrder` ni `portionSystem`) y se propaga en `catalogToPortionGroups` (`:588-600`); **`collectPortionGroups` (`:549-568`) lo deja `undefined`** porque el snapshot no lo guarda. Los dos helpers viven en **`packages/nutrition-v2/exchange-visibility.ts`** —junto a `CL_CODES`, no en `editor-state.ts`— y **nacen en W1.4**, para que `exchange-conversion.ts` (W3) los **importe** en vez de redefinirlos; cuerpo exacto en [DATA](DATA.md) §6/§7:
   ```ts
   systemOf(group, coachSystem)  = group.portionSystem ?? (CL_CODES.has(group.groupCode) ? 'cl' : coachSystem)
   isClGroup(group, coachSystem) = systemOf(group, coachSystem) === 'cl'
   ```
   El fallback es **al set del coach**, nunca a `'smae'`: así un grupo del plan sin dato **jamás** se marca legado ni se esconde en la sección colapsada, que es literal lo que pide el criterio de W1.1.

---

## 11. Analytics (PostHog)

Cinco eventos, definidos en `apps/web/src/lib/posthog/events.ts` y `apps/mobile/lib/analytics.ts` con los tipos de enum compartidos desde `@eva/nutrition-v2` (para que el evento matchee entre plataformas):

`nutrition_portion_group_bumped` · `nutrition_portion_conversion_previewed` · `nutrition_portion_conversion_applied` · `nutrition_targets_scope` · `nutrition_equivalences_opened`.

> **La forma exacta de los cinco (props, tipos y tramos) vive en un solo lugar: [DATA](DATA.md) §11.** Este SPEC **no la reescribe** (fix `seguridad:S-07`: dos tablas distintas hacen que el worker de W2.10 / W5.8 elija al azar cuál implementar). De ahí salen, entre otras: la prop de plataforma es **`surface: 'rn' | 'web'`**; `rows_bucket` viaja en **tramos**, nunca el número; **`group_code` solo en los eventos del coach** (1, 2 y 3) y **jamás** en el del alumno; y `nutrition_targets_scope.scope` es **`'day' | 'all'`** —los mismos valores que `SET_TARGET.scope` / `STEP_TARGET.scope` (§10, OUTLINE §13): el reducer no puede emitir `'base'`—.

**Nunca**: kcal, gramos, nombres de alimentos, ids, ni el nombre del día concreto. Ley 21.719 y regla literal de `apps/mobile/lib/analytics.ts:151-152` («viajan METADATOS de la interacción … las kcal de un plan son dato de salud»). Donde haga falta una magnitud, va en **tramos** (patrón `kcal_bucket`).

---

## 12. Seguridad (threat model; detalle en `maps/r1-db-grupos-calc.md` §6)

| # | Amenaza | Mitigación |
|---|---|---|
| T-01 | Fuga cross-tenant al listar sets: tocar el `.or()` de `findExchangeGroupsForScope` para filtrar por set devolvería grupos custom ajenos | **La query no se toca**: `findExchangeGroupsForScope` **y** `getExchangeGroupsForCoach` quedan intactas (son el catálogo de autorización/escritura y el gate de 5 caminos, R13) y el filtro de set es **TypeScript puro sobre las ~22 filas ya traídas**, en los **bordes de presentación** (ruta móvil, loader del picker web, sheet/card). Nunca dentro del `.or()`, nunca en la resolución por id. Test: `exchange-visibility.test.ts` + el de la ruta móvil |
| T-01b | Un coach `'cl'` crea un grupo propio con `code` `C`/`LAC`/`LEG`/`FR`/`PCT` que choca el día que convierte | El chequeo de conflicto conserva **ambos sets** porque su caller (`createCoachExchangeGroup` `:188-193`, `updateCoachExchangeGroup` `:215-221`) sigue alimentándolo con el catálogo **sin filtrar**. El índice `exchange_groups_system_code_uq` no cubre este caso (es parcial `where is_system`). Test de W1.9 **sobre los dos servicios**, no sobre la función pura |
| T-02 | Dos grupos `is_system` con el mismo `code` rompen 5 caminos (publicar revienta con `.maybeSingle()`) | Los 13 códigos son nuevos + índice único `exchange_groups_system_code_uq` (parcial `where is_system and deleted_at is null`) + assert en el seed que aborta con `raise exception` |
| T-03 | Coach editando grupos del sistema | Ya bloqueado en tres capas (RLS `xg_insert/update/delete` con `NOT is_system`, servicio y schema con `z.never()`). El seed corre con **service role** por MCP, no con la sesión del owner |
| T-04 | Seed re-ejecutado pisando valores | Los 13 nacen `macros_confirmed = true` y el `DO UPDATE … WHERE macros_confirmed = false` **nunca dispara**. `portion_system` no entra en un `DO UPDATE` que pudiera mover un grupo de set |
| T-05 | Conversión reescalando una versión publicada | Prohibida por S4: opera en memoria y publica por `persist_and_publish_nutrition_plan_v2` con `p_expected_current_version_id` (una publicación concurrente da `STALE_BASE` en vez de pisar) |
| T-06 | Doble target al mismo grupo tras convertir (`ARL` + `G` → `AG`) viola `unique (meal_slot_id, exchange_group_id)` y aborta el RPC entero con un 23505 que no nombra la franja | Colapso y suma **antes** de armar el payload + test unitario de tabla |
| T-07 | Grupo chileno huérfano de equivalencias (el alumno abre «1 porción equivale a» y ve vacío) | Grupos y equivalencias se aplican en la **misma ventana**, y el conteo del picker web pasa a `getExchangeListCounts` para que el aviso ámbar sea verdadero |
| T-08 | Rollback bloqueado: `nutrition_slot_exchange_targets_v2.exchange_group_id` es `on delete restrict` y `foods.exchange_group_id` es NO ACTION | El rollback real es **ocultar el set**, nunca `delete`. Se escribe el `*_rollback.sql` con **dos ramas** (R-01) |
| T-08b | Rollback que manda coaches al set legado (`update coaches set portion_system = 'smae' …`) y que el propio seed no puede deshacer | **Prohibido: el rollback NO toca `coaches.portion_system` en ninguna rama** (R14-bis + R-01: nadie fue backfilleado, todos están en `'cl'` por default, así que no hay estado que revertir). El `*_rollback.sql` lleva exactamente dos ramas, ambas sobre `exchange_groups`: **(a)** si ningún target vivo ni borrador referencia un grupo `'cl'` ⇒ `update public.exchange_groups set deleted_at = now() where portion_system = 'cl'` (volver al estado «apagado» de W0); **(b)** si alguno los referencia ⇒ `raise exception` y el rollback es **solo de código** (revertir deploy/OTA: sin filtro se ven los 22 grupos, pero nada se rompe). `exchange_group_foods` no se borra en ningún caso |

Además: `database.types.ts` se edita **a mano** (`portion_system` en `exchange_groups` y `coaches`); regenerar deja 13 errores en archivos V1 y está prohibido proponerlo como paso trivial.

---

## 13. Casos borde

| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | `ARL` **y** `G` en la misma franja al convertir | Una sola fila destino `AG` con la suma; el preview la pinta como «Alimento rico en lípidos 1 + Grasa de cocina 1 → Aceites y grasas 2». Nunca dos targets al mismo grupo (T-06) |
| 2 | `LAC` con leche entera real | El default `LD` (factor 1,357) sobre-estima; el selector segmentado deja elegir `LE` (factor 0,864) y recalcula la fila. Siempre marcada «Revisar» (R3) |
| 3 | Grupo custom que **calza** con un chileno (Pame: Carbohidratos 140/30 ⇒ `PCT`) | Match único dentro de ±5 kcal / ±1 g ⇒ se ofrece «reemplazar por «Panes, cereales y tubérculos»» con confirmación. El custom no se borra |
| 4 | Grupo custom que **no calza** («Proteinapro» 422 kcal de `josefit`) | Se deja intacto y sigue apareciendo en el picker: los custom no se filtran por set |
| 5 | Un coach convierte un plan y deja otro en SMAE | El legado sigue visible (tiene targets SMAE vivos en el otro plan) y el banner sigue apareciendo en ese otro plan. La visibilidad es por coach, no por plan |
| 6 | Un coach convierte **todos** sus planes | La rama «tiene targets en el otro set» se apaga sola: SMAE desaparece de su picker sin un solo `UPDATE` (S1) |
| 7 | Coach que quiere **volver** a SMAE | Cambia `coaches.portion_system` a `'smae'`; el chileno queda visible como «Legado» mientras tenga targets `cl`. La regla de unión es simétrica |
| 8 | Coach de un **team** | Los grupos de team siguen en la primera rama de la unión (custom del coach/team) y no se filtran por set. `findExchangeGroupConflict` sigue viendo ambos sets para no dejar crear un code que choque |
| 9 | Coach nuevo que nunca usó porciones | `portion_system = 'cl'` por default: ve solo el set chileno, **sin sección legado y sin banner** |
| 10 | Bump con el target ya en **99** | La fila del picker queda `disabled` con `groupAtMax` y **no** se emite toast: `stepPortionsText` satura y el toast diría «ahora 99» sin haber cambiado nada. Caso real: el grupo «Proteinapro» de `josefit` está en 99 |
| 11 | Dos bumps seguidos (**con el toast todavía visible**) y un solo Deshacer | El toast se **actualiza en el sitio** (mismo `id`), la captura se hace al **crear** el toast y no se repite mientras viva, y el Deshacer restaura ese valor previo, no `−0,5`. Si el toast ya expiró, el segundo bump abre una interacción nueva y el Deshacer vuelve al valor de esa |
| 12 | Tap-to-edit dejado **vacío** | El texto crudo queda `''`; `validateQuickEdit` emite `portion.<key>.portions` («Las porciones van de 0,5 en 0,5 (mínimo 0,5).»), la fila lo pinta y el chip del día se marca. Publicar queda bloqueado, como hoy |
| 13 | Tap-to-edit con **coma** («1,5») | `parsePortionsValue` normaliza `,`→`.`: válido. «1,50» también (1,5). **«1,3» es inválido** y muestra el error. En Android el `decimal-pad` usa el separador de la locale del dispositivo: ambos caminos funcionan |
| 14 | Tap-to-edit con **0** o con **150** | Ambos inválidos (mín 0,5, máx 99): error bajo la fila, sin cambiar el valor guardado hasta que se corrija |
| 15 | Día con metas propias + switch | El switch nace **ON** (`qeTargetsEqual(dia, base)` es falso) y `scope: 'day'` escribe solo en ese día. Apagarlo copia las del base sobre el día, con Deshacer |
| 16 | Base vacío + tres días creados (caso Pame ampliado) | El switch nace **OFF** en cualquiera de los tres; `scope: 'all'` escribe en el base y en los tres (todos «heredaban» la nada). El aviso al publicar desaparece solo |
| 17 | Plan `flexible` sin franjas | **El aviso de metas aparece igual, y sobre todo acá**: en `flexible` las metas son el plan entero, así que un día sin meta es una pantalla sin ninguna cifra para el alumno. Asimetría deliberada frente al aviso de «día vacío», que sí excluye `flexible` |
| 18 | `VL` (verduras de libre consumo) sin equivalencias derivadas | Solo lleva genéricos curados; el picker muestra el conteo real y el sheet del alumno muestra esos pocos. No se deriva masivamente porque los gramos salen absurdos |
| 19 | Alimento sin foto en `food_media` | `imagePath = null` (y `imageVersion = null`) ⇒ **`GroupDot` del grupo** como fallback, igual que hoy (§9.3). Ninguna fila queda vacía |
| 20 | Payload del Today > 750 kB | El cache offline RN lo descarta **sin log**. Por eso se emiten solo las cuatro llaves escalares (~149 kB, **+29 %**) y no el objeto `media` (+136 %). Se mide el Today real de un alumno con 7 grupos antes y después |
| 21 | Grupo chileno huérfano de equivalencias | El coach ve el aviso ámbar de «0 equivalencias» **verdadero** (conteo por `getExchangeListCounts`) y el alumno ve el estado vacío del sheet. Mitigación: grupos y equivalencias en la misma ventana (T-07) |
| 22 | Seed re-ejecutado | No-op sobre los 13 (`macros_confirmed = true`), y el assert de códigos duplicados aborta si alguien sembró algo raro en el medio |
| 23 | Alumno con snapshot SMAE viejo | Ve exactamente lo mismo que antes: los snapshots congelan `snapshot_group_code/name/ref_*` y `reconstructExchangeGroups` los lee del snapshot, nunca del catálogo vivo. Un plan publicado **no cambia de significado** porque cambie el catálogo |
| 24 | Alumno de un coach que convirtió, con el plan aún sin publicar | Sigue viendo la versión vigente (SMAE) hasta que el coach publique. La conversión toca el borrador y nada más |
| 25 | Alimento de `P` **alto en grasa** (longaniza, vienesa, chuleta, salmón, atún en aceite) | `fatEnergyShare > 0,40` ⇒ va a **`CA`** (120 kcal · 8 G), nunca a `CB` (§6.2, R16). Sin `share` calculable (`calories <= 0`) ⇒ **se descarta** y va al informe. Control de W0: «0 filas en `CB` con `share > 0,40`» |
| 26 | Alimento que está **curado** en `generic-foods-cl.json` y además calificaría por derivación en otro grupo del mismo eje (yogurt natural: `LS` curado vs `LE` por dato) | Manda el curado: su `food_id` queda **excluido del universo derivado** y la fila derivada no se escribe. Nunca dos gramajes del mismo alimento en dos grupos que compiten (R-13) |
| 27 | Falla la lectura de `coaches.portion_system` o de `findUsedPortionSystemsForCoach` | **Fail-open**: catálogo completo, **sin** marcar legado y sin esconder nada (§5.3). El picker nunca queda sin los grupos de los 337 targets vivos |
| 28 | Coach con un plan SMAE abre el picker | Los grupos legados que el plan ya usa vienen **primero** desde `mergePortionGroupChoices` (contrato fijado por test), y aun así el sheet los pinta bajo «Legado (SMAE)»: la partición la hace el **consumidor**, no el orden de entrada (R17) |

---

## 14. Fuera de alcance

- **PDF brandeado de porciones** y **platillos chilenos** (UDD pp. 78-86): siguen siendo F2 (S8). El sheet con foto y medida casera es lo que reemplaza al PDF de Pame **hoy**. Tampoco entran los **micronutrientes** por grupo.
- **Crear/editar un grupo propio desde la web**: el picker web no tiene esa puerta desde que se retiró el wizard (el `PortionsGroupForm` vive solo ahí). Backlog con pregunta al owner (R12, Q4); con el set chileno la necesidad baja mucho.
- **Los 2.253 `foods` sin clasificar**: no se reclasifican en este tren. **Auditoría de gramos del set SMAE**: el dry-run reporta cuántas filas difieren > 20 % de la fórmula correcta (el clasificador de julio ignora `macros_basis`), pero **no se corrigen acá** (R7).
- **Un grupo 14 «alimentos ricos en lípidos» (INTA, 175 kcal · 15 g de grasa) para la palta**: **no se crea** (R-16, decisión del jefe). La palta va a **`AG`** con la fila curada «2 cucharadas · 30 g», que es la lectura UDD del set de 13 (ARL y G colapsados en `AG`). Queda anotado también en `generic-foods-cl.json`.
- **Correr `scripts/nutrition-portions/classify-foods.mjs`**: solo se amplía su `GROUP_REFS` para que `verifyGroupRefs` no aborte con `missing_in_fixture` al ver 13 grupos nuevos (R5). **Ampliar `GROUP_REFS` obliga a ampliar también la unión cerrada `ExchangeGroupCode`** (`scripts/nutrition-portions/heuristics.ts:52`, usada en `:72,78,79,80`): sin eso el archivo no compila (R-09, criterio de W1.7).
- **Wizards retirados** (RN `builder/[clientId].tsx`, web `builder/**`): no se tocan y no entran a QA. **Sheet V1 del alumno, `useStudentExchanges` y `student-bundle`**: desconectados del alumno V2, quedan sin foto y sin genéricos-primero.
- **Selector de sistema de porciones en ajustes del coach**: innecesario con el default chileno y el legado automático (declarado en el mockup). **Editar los `ref_*` de un grupo del sistema por coach** (opción C de D1): descartada por el owner.

---

## 15. Preguntas abiertas para el owner — DECIDIDAS el 2026-09-09: el owner eligió la opción **a)** en las cinco (Q1 `macros_confirmed = true` · Q2 avisa y deja publicar · Q3 descremado con selector · Q4 crear grupo web = backlog · Q5 fijar con UDD 2019 y verificar 2021 después). Se conservan las alternativas como registro; el plan ya las asumía.

**Q1 · ¿Los 13 grupos chilenos nacen con `macros_confirmed = true`?**
&nbsp;&nbsp;**a) Sí, con los manuales como fuente** (Tabla N.º 5 UDD 2019 = Jury 1999 modificada). Desaparece el chip «Valores referenciales» del set chileno y el seed V1 nunca puede pisarlos. ← recomendada
&nbsp;&nbsp;b) No: nacen `false` hasta que aparezca «la guía de Fran». El set chileno mostraría el mismo chip amarillo que el SMAE y el mockup M1 dejaría de ser fiel.

**Q2 · Aviso de metas parciales al publicar.**
&nbsp;&nbsp;**a) Avisa y deja publicar** («Publicar igual»), tono ámbar. ← recomendada
&nbsp;&nbsp;b) Bloquea hasta que todos los días tengan meta: más seguro, más rígido, y volvería irrepublicables los planes con metas parciales que ya existen.

**Q3 · Lácteo por default al convertir.**
&nbsp;&nbsp;**a) Descremado preseleccionado, con selector de tres y marca «Revisar»**. ← recomendada
&nbsp;&nbsp;b) Preguntar por franja qué lácteo es **antes** de convertir: más preciso, un paso más y un preview que ya no se puede mostrar de una.

**Q4 · Crear grupo propio desde la web.**
&nbsp;&nbsp;**a) Backlog**: no entra en este tren; RN sigue siendo la única puerta. ← recomendada
&nbsp;&nbsp;b) Reponerlo ahora: mover `PortionsGroupForm.tsx` a `_quick-edit/` y montarlo en el picker (media wave más).

**Q5 · Edición del manual UDD.**
&nbsp;&nbsp;**a) Fijar el set con el PDF 2019 que tenemos y verificar después** contra la edición 2021 (ítem sin bloqueo en TASKS). ← recomendada
&nbsp;&nbsp;b) Conseguir el PDF 2021 antes de sembrar: el tren queda esperando un documento que no controlamos.

---

## 16. Glosario de nombres canónicos (OUTLINE §13 — nadie inventa variantes)

**Columnas** · `public.exchange_groups.portion_system` (`'smae'|'cl'`) · `public.coaches.portion_system` (`'cl'|'smae'`). **Índice** · `exchange_groups_system_code_uq`.
**Migraciones** · `20260909120000_exchange_groups_portion_system.sql` · `20260909120500_exchange_groups_no_duplicate_system_code.sql` · `_POST_DEPLOY_20260909121000_exchange_groups_cl_seed.sql` · `_POST_DEPLOY_20260909121000_exchange_groups_cl_seed_rollback.sql` · `20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql`.
**Script** · `scripts/nutrition-portions-cl/derive-cl-equivalences.mjs` (`--dry-run` | `--apply`); informe `scripts/output/cl-equivalences-<fecha>.md`; genéricos en `scripts/nutrition-portions-cl/generic-foods-cl.json`.
**Identidad del set** · UUID `0000e8c1-0000-0000-0000-0000000000{01..13}` · slugs `cl-*` · códigos `LD LS LE CB CA LGS VG VL FR PCT AG AZ SCP`.
**Motor y paquete** · `ExchangeGroup.portionSystem?: 'smae' | 'cl'` (**opcional, en las DOS interfaces**: `packages/nutrition-engine/exchange-types.ts` y `apps/web/src/domain/nutrition/exchange.types.ts`) · `QePortionGroup.portionSystem?` · `packages/nutrition-v2/exchange-visibility.ts` → `CL_CODES`, `systemOf(group, coachSystem)`, **`isClGroup(group, coachSystem)`**, `visibleExchangeGroupsForCoach`, `compareVisibleGroups` (los cinco **nacen en W1.4**, ninguno en `editor-state.ts`) · `comparePickerGroups` (**nuevo**, en `editor-state.ts`) junto a `compareCatalogGroups` (**sin cambios**) · `apps/web/src/infrastructure/db/exchanges.repository.ts` → **`findUsedPortionSystemsForCoach(db, coachId): Promise<PortionSystem[]>`** · `packages/nutrition-v2/exchange-conversion.ts` → `CL_CONVERSION_MAP`, `CL_DAIRY_FACTORS`, `convertPortionsToCl`, `round05`, `makeIsClDestination`, `hasClDestinations`, **`draftUsesLegacySmae`** (W3: única verdad del banner) · `packages/nutrition-v2/editor-state.ts` → `BUMP_PORTION_TARGET`, `REPLACE_PORTION_GROUPS`, `findPortionTargetByGroup`, `portionsAfterBump`, `formatPortionsEsCl`, `formatMacroEsCl`, `qeGroupRefPerPortion`, `qeGroupRefPerPortionFromDict`, `qeGroupRefLabel(ref, { confirmed })`, **`applyCatalogMetaToPickerGroups`** / `QePickerGroup` / `QePickerGroupMeta` (remate W2: overlay por id de `portionSystem`/`sortOrder`/`isSystem` del catálogo vivo sobre la lista mergeada; sin catálogo nada cambia, R18), `SET_TARGET.scope` / `STEP_TARGET.scope` (`'day' | 'all'`), `qeTargetsEqual`, `qeDaysMissingTargets`, `qeTargetsGapBar`, `APPLY_BASE_TARGETS`, **`qeSwitchOffPlan`** (remate 2 de W4: única verdad del «apagar el switch», `{ mode, keys, writes, snapshot }`) · **`mergePortionGroupChoices` NO se toca** · `PublishBar` RN `dayNotice`, web `noticeMessage`/`noticeAction` · `DayAnchorRow.noticeKeys`.
**Ruta móvil** · `GET /api/mobile/nutrition-v2/exchange-groups` → `{ groups, foodCounts, portionSystem, legacySystems }` (las tres llaves nuevas **opcionales** en el cliente), con `portionSystem?` **por grupo** y `legacy` **derivado en cliente** con `systemOf`; mapeador `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts` (`toGroup`, `NutritionV2ExchangeGroupsResult`).
**UI RN** · `EditablePortionsSection.tsx` · `QuickEditMode.tsx` · `PortionConversionSheet.tsx` (nuevo) · `TargetsEditorCard.tsx`. **UI web** · `EditablePortionsCard.tsx` · `PortionConversionDialog.tsx` (nuevo en `_quick-edit`) · `TargetsEditorCard` web · `PublishBar` web · `StepperField.tsx` (**sin cambios**).
**Alumno** · `PortionEquivalencesSheet.tsx` (RN y web) · `NutritionExchangeFoodReadSchema.imagePath` / `.imageVersion` / `.isGeneric` / `.imageLicense` (las cuatro **opcionales**) · `splitExchangeFoodsByOrigin` · helper nuevo `foodMediaThumbnailUrlFromPath` (RN) y su gemelo en `apps/web/src/lib/food-image.ts`.
**Copys** · `EDITOR_TARGETS_COPY` (`packages/nutrition-v2/editor-copy-targets.ts`: `targets.{onlyThisDay,onlyThisDayOff,onlyThisDayOn,backToBase,appliedToAll,undo,dayNoTarget}`, `publish.{partialTargets,anyway,goToBase}`; RN y web reexportan) · `PORTIONS_COPY.builder.{setChile,setLegacy,setOwn,legacyBadge,groupUsedBump,groupBumped,groupBumpedUndo,groupAtMax,stepperEditHint,portionsInputAria}` · `PORTIONS_COPY.convert.{title,intro,footer,cta,review,dairyChoice,dairyLabel,keptTitle,keptCustom,keptUnknown,keptMissingTarget,replace,replaceHint,empty,emptyNoAmount,applied,bannerTitle,bannerBody,bannerCta,bannerDismiss}` · `EDITOR_COPY.targets.{onlyThisDay,onlyThisDayOff,onlyThisDayOn}` · `EDITOR_COPY.publish.{partialTargets,anyway,goToBase}` · `PORTIONS_COPY.student.{sheetGenericsTitle,sheetBrandsTitle,photoCredit,sheetPhotoSource}`.
**PostHog** · constructores en `packages/nutrition-v2/portions-analytics.ts` (shape = DATA §11) · `nutrition_portion_group_bumped` · `nutrition_portion_conversion_previewed` · `nutrition_portion_conversion_applied` · `nutrition_targets_scope` · `nutrition_equivalences_opened`.
**SDD** · `docs/specs/nutrition-porciones-chilenas/{SPEC,PLAN,TASKS,DATA}.md` (`status: draft`, `canonical: false`).

### 16.1 Tabla de copys aprobados (artifact de mockups, **pasados a tuteo**)

> **Corrección del fixer (R-04):** los copys del artifact venían en voseo rioplatense («Tocá», «Podés», «Escribí», «usás», «Revisá») dentro de un editor que es **100 % tuteo**: el conteo real en `apps/mobile` y `packages` da Revisa 54 · Elige 40 · Toca 38 · Escribe 24 · Puedes 22, contra Tocá 2 y Elegí 1 — y el mensaje a Pame de [PLAN](PLAN.md) también está en tuteo. Se pasan a tuteo chileno neutro (cambio de **copy**, no de layout: el mockup se regenera con estos textos y todas las cajas conservan su ancho).

| Clave | Texto |
|---|---|
| `builder.setChile` | Sistema chileno · INTA 1999 · UDD 2019 |
| `builder.setLegacy(n?, surface)` | Legado (SMAE) · Lo usas en {n} plan/planes · Toca para ver *(sin `n` —hoy, porque el loader no devuelve el conteo—: «Legado (SMAE) · Toca para ver»; web: «Clic para ver»)* |
| `builder.setOwn` | Propios *(encabezado, solo si el coach tiene grupos propios)* |
| `builder.groupAtMax(franja)` | Ya está en {franja} con 99 · es el máximo *(99 = `PORTION_MAX` formateado; texto provisional del jefe, OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen))* |
| `builder.portionsInputAria(grupo)` | Porciones de {grupo} *(solo accesibilidad del `TextInput`)* |
| `builder.legacyBadge` | Legado (SMAE) |
| `builder.groupUsedBump` | Ya está en {franja} con {n} · Toca para sumar ½ *(web: «Clic para sumar ½»)* |
| `builder.groupBumped(grupo, n, franja)` / `groupBumpedUndo` | {grupo}: ahora {n} **porción/porciones** en {franja} (`n === 1 ? 'porción' : 'porciones'`; `{n}` formateado con `formatPortionsEsCl`) / Deshacer |
| `builder.stepperEditHint` | Escribe la cantidad · de 0,5 a 99 |
| `convert.bannerTitle` | Este plan usa las porciones anteriores (SMAE) |
| `convert.bannerBody` | Ahora EVA trae el sistema chileno (INTA/UDD): cereales a 140 kcal y 30 g, lácteos por grasa, carnes bajas y altas. Puedes convertir el borrador y revisar antes de publicar. |
| `convert.bannerCta` / `convert.bannerDismiss` | Ver conversión / Ahora no |
| `convert.title` | Convertir a porciones chilenas |
| `convert.intro` | Reescalamos cada porción por su nutriente crítico (carbohidrato, proteína o kcal) y redondeamos a 0,5. Revisa las filas marcadas. |
| `convert.footer` | Cambia el borrador. No se publica nada hasta que toques Publicar. |
| `convert.cta` / `convert.review` | Convertir borrador / Revisar |
| `convert.dairyChoice.{LD,LS,LE}` | Descremado / Semi / Entero |
| `convert.dairyLabel` | Tipo de lácteo *(solo accesibilidad: rótulo del `radiogroup` de tres, sin texto visible)* |
| `convert.keptTitle` | Se conservan tal cual *(cabecera del bloque de grupos que la conversión no toca, dentro de la franja)* |
| `convert.keptCustom(grupo)` | {grupo}: es tuyo y no tiene equivalente chileno. *(`custom_sin_match`)* |
| `convert.keptMissingTarget(grupo)` | {grupo}: su equivalente chileno todavía no está disponible. *(`destino_ausente_en_catalogo` — el estado real hasta W6.8)* |
| `convert.keptUnknown(grupo)` | {grupo}: ya no está en tu catálogo, así que se conserva. *(`sin_regla`: grupo congelado en el snapshot del plan)* |
| `convert.replace(grupo, destino)` / `convert.replaceHint` | Reemplazar «{grupo}» por «{destino}» / El grupo no se borra: solo deja de usarse en este borrador. *(S5: el custom nunca se borra)* |
| `convert.empty` | Este borrador ya usa el sistema chileno: no hay nada que convertir. |
| `convert.emptyNoAmount` | Este borrador usa las porciones anteriores, pero ninguna tiene una cantidad válida: revísalas y vuelve a intentarlo. *(el OTRO vacío: un target SMAE con `portions` vacío o ilegible sale intacto del motor y no entra ni a `diff` ni a `unresolved`, así que un borrador 100 % SMAE puede llegar sin secciones; `convert.empty` ahí mentiría)* |
| `convert.applied` | Borrador convertido *(toast con «Deshacer», que restaura el árbol con `RESTORE_DRAFT`)* |
| `targets.onlyThisDay` | Solo el {día} |
| `targets.backToBase(día)` | {Día} vuelve a la meta de todos los días *(al apagar el switch con base con kcal; provisional del jefe, OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen))* |
| `targets.appliedToAll` | Ahora vale para toda la semana *(al apagar el switch con base sin kcal: propaga la meta del día; provisional, OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen))* |
| `targets.undo` | Deshacer |
| `targets.dayNoTarget` | sin meta *(cinta del editor)* |
| `targets.onlyThisDayOff` | Apagado: se guarda en «Todos los días» y vale para toda la semana. |
| `targets.onlyThisDayOn` | Encendido: el {día} usa esta meta; los demás días siguen con {kcal} kcal. |
| `publish.partialTargets` | Solo {días con meta} tiene meta. {días sin meta} quedan sin objetivo. |
| `publish.anyway` / `publish.goToBase` | Publicar igual / Ir a Base *(web: «Abrir metas del base»)* |
| `student.sheetGenericsTitle` / `student.sheetBrandsTitle` | Genéricos · INTA · UDD / Marcas y productos *(claves de TASKS W5.9; las `equivalences.*` del borrador no existen)* |
| `student.photoCredit` | Fotos: Open Food Facts (CC BY-SA) *(pie del sheet, CONDICIONAL: solo si alguna fila visible trae `imageLicense` `cc_by_sa`/`cc_by`, §9.4)* |
| `student.sheetPhotoSource` | Foto: Open Food Facts (CC BY-SA) *(por fila, solo en `accessibilityLabel`/tooltip de la fila con foto `cc_by*`; lo devuelve `photoSourceLabel`, `null` para las demás licencias)* |

> El botón secundario del preview reusa `groupEditor.cancel` («Cancelar»): no hay `convert.cancel` y no se agrega uno: sería el mismo string duplicado por prefijo. Los `convert.*` de arriba son la lista COMPLETA (las seis primeras filas las fijó el megaplan; las once que siguen las escribió W3.5/W3.6 y quedan canónicas acá para que la próxima superficie no las reinvente).

---

## 17. No negociables

1. **Ningún snapshot publicado cambia de significado.** El freeze de `snapshot_group_*` / `snapshot_ref_*` al publicar se mantiene; los planes vivos de los 9 coaches leen su snapshot, no el catálogo.
2. **El filtro de set vive en los bordes de presentación** (respuesta de la ruta móvil viva, loader del picker web, sheet/card del picker), **nunca dentro de `getExchangeGroupsForCoach`** (gate de 5 caminos, incluida `group-foods`, que devolvería 404), **nunca dentro de `findExchangeGroupsForScope`** (que alimenta `findExchangeGroupConflict`) y **nunca en la resolución de un id ya prescrito**.
3. **La conversión la inicia el coach, opera sobre el borrador y muestra el antes/después.** Cero reescalados automáticos, cero `UPDATE` de `portions` en versiones publicadas.
4. **DB aditiva y forward-only**: nada se borra, no se editan migraciones aplicadas, no hay DDL destructiva, no hay `db push` ciego. El rollback es ocultar el set, no borrarlo.
5. **`get_nutrition_today_v2` se parchea por texto sobre la definición VIVA**, con anclas verificadas y asserts (incluidos los canarios existentes). Un copy-body reabriría la fuga cross-tenant B1.
6. **El seed y las cargas masivas jamás pisan trabajo del coach**: `on conflict do nothing` para filas nuevas y updates acotados a `coach_id is null and org_id is null and source = 'catalog' and portion_label is null`.
7. **Sin gate por tier ni por persona.** Nutrición V2 es estándar y el set chileno también.
8. **RN y web parejos en el mismo tren**, con la lógica compartida en `packages/nutrition-v2`.
9. **Cero cifras de salud en PostHog**: ni kcal, ni gramos, ni nombres de alimentos, ni ids (Ley 21.719).
10. **Ninguna imagen del manual UDD**: se usan sus valores y medidas, no sus fotos.
11. **No se declara verde ningún gate sin ejecución real**, con la salida pegada en [TASKS](TASKS.md).

---

## Decisiones del jefe post-críticos

Las «Preguntas del fixer» quedaron cerradas por el jefe el 09-09 (RESOLUCIONES-2 §D). Cada una con su respuesta, en una línea:

1. **Eje lácteo (B6, §6.2) — el % de kcal desde la grasa MANDA.** `fatEnergyShare` con `< 0,15 → LD · 0,15–0,40 → LS · > 0,40 → LE` (`LS_MAX` inclusivo) reemplaza los umbrales en g/100 g del OUTLINE §5.2; [PLAN](PLAN.md) §W0, [TASKS](TASKS.md) W0.7 y [DATA](DATA.md) §4.3 ya están escritos así y el OUTLINE §5.2 queda superado.
2. **Sin backfill a `'smae'` (R14-bis)** — cerrado: todos los coaches quedan en `'cl'`, el bloque B del `_POST_DEPLOY_` se elimina y el SMAE aparece como «Legado» mientras `findUsedPortionSystemsForCoach` lo devuelva.
3. **Nombre del productor y forma del payload móvil (D-6)** — cerrado: **`findUsedPortionSystemsForCoach`** con parámetro **`usedSystems`** es el **único** nombre (los dos viejos no se mencionan ni como alias), y la ruta móvil devuelve `{ groups, foodCounts, portionSystem, legacySystems }` con `portionSystem?` por grupo y `legacy` derivado en cliente con `systemOf`.
4. **Dónde se aplica la visibilidad (R13)** — cerrado: **solo en los bordes de presentación**; jamás en `getExchangeGroupsForCoach` (5 caminos, `group-foods` devolvería 404) ni en `findExchangeGroupsForScope` (alimenta `findExchangeGroupConflict`).
5. **`imageLicense` (D-9) — confirmado.** El RPC emite **cuatro llaves** (`imagePath`, `imageVersion`, `imageLicense`, `isGeneric`) y el payload queda en **~149 kB (+29 %)**; el pie de atribución es condicional y la fila nombra su fuente en el `accessibilityLabel`.
6. **Fallback sin foto (D-2) — `GroupDot` del grupo**, que es lo que el sheet ya hace hoy. **El RPC NO emite `category`**: nada de una quinta llave ni de «ícono derivado del nombre».
7. **Host clásico de `TargetsEditorCard` en RN (D-1) — sí, sin switch.** El host del lienzo (`QuickEditMode.tsx:2011-2020`, solo con `editorMode === false`) queda byte-idéntico y **sigue despachando `SET_TARGET` sin `scope`**; declararlo así satisface R-07. Sin paridad en el quick-edit clásico.
8. **Copys en tuteo y mockup (D-8) — se regenera.** `context/mockups-v1.html` se rehace con la tabla de §16.1 en tuteo y con la fila «**Legumbres 1 → Legumbres secas 0,5 · 125 → 85 kcal**» (pie «620 → 555 kcal»), **en la misma URL**: el SPEC sigue referenciando ese artifact.

Y las cuatro decisiones que este documento hereda de los otros archivos: **D-3** ningún índice para `findUsedPortionSystemsForCoach` salvo que el EXPLAIN de W0.6 muestre seq scan relevante ⇒ migración aparte con `(version_id, exchange_group_id)` (§5.3) · **D-4** miniatura **36 px en RN y web** (§9.3) · **D-5** la carcasa del banner de conversión va en W2, W3 solo la enchufa, y el merge es W2 → W4 → W3 · **D-7** un solo corte de carnes: `fatEnergyShare ≤ 0,40 → CB · > 0,40 → CA · null → descartar` (§6.2), sin ningún otro umbral.

**Lo que NO se decide acá**: las preguntas al owner (macros_confirmed, aviso que no bloquea, lácteo por default, crear grupo propio en web, UDD 2019 vs 2021) viven en **§15 Q1–Q5** y siguen abiertas.


> **Conteos de tests (R-03).** El SPEC no fija ninguno (los invariantes viven en [PLAN](PLAN.md) §W4 / §Contratos 5). Los reales, contados en `f93378c3` con `grep -cE "^\s*(it|test)\("` y sin `.each`: `editor-state.day-errors.test.ts` **16** · `quick-edit-state.test.ts` **58** · `quick-edit-state.meta.test.ts` **22** · `quick-edit-publish-guards.test.ts` **7** ⇒ **16 + 87 = 103**, no 122. PLAN y TASKS ya están escritos con esos números.
