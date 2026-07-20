# SPEC — Porciones (intercambios) en Nutrición V2

> Decisiones del CEO (2026-07-18, definitivas): (1) los **9 grupos system de V1**
> (`exchange_groups`: C, P, F, V, LAC, ARL, SP, G, LEG) se usan **tal cual**;
> (2) el alumno tiene **marcar-porción desde F1** (tilda porciones cumplidas por grupo,
> anillos/cobertura por grupo, además de equivalencias y registro normal de alimentos);
> (3) **pasada masiva asistida** de clasificación de ~4.900 `foods` por grupo (pipeline
> heurísticas + revisión + reporte al CEO, patrón del dedup 2026-07-17); (4) la **pauta
> PDF brandeada** del coach entra en **F2** (patrón del dossier jsPDF existente).
> Ratificado del diseño de dominio previo (`porciones-diseno-v2.md`): porciones =
> **capa opcional sobre `structured`/`hybrid`**, NO 4ta estrategia. Disponible para
> todo coach con plan pago (los módulos ya están incluidos; cero gate nuevo).
> La conversión real de los 6 planes `exchanges` V1 (Alan y ali de jotap primero)
> entra en F1.

## Por qué

El método de porciones/intercambios es **el estándar de formación y práctica clínica
del nutricionista LATAM**: en México tiene norma oficial (SMAE, NOM-043-SSA2-2012);
en Chile es el sistema INTA/UDD (manual UDD 2021 como referencia de facto); en el
mundo anglosajón son las Exchange Lists con 50+ años de uso. Un nutricionista formado
en cualquiera de estas tradiciones espera prescribir "2 porciones de cereal + 1 de
verdura en el almuerzo" — no gramos por alimento ni solo macros. Hoy V2 no lo permite:
la investigación de mercado (porciones-metodo.md §4) confirma que las plataformas que
SÍ lo modelan (Avena, Nutrimind) dominan el segmento profesional mexicano, y que
**nadie documenta públicamente adherencia por cumplimiento-de-porciones** — es un gap
real donde EVA puede diferenciarse, no una casilla a marcar.

Además hay deuda interna concreta: la conversión V1→V2 saltea los 6 planes
`plan_mode='exchanges'` con `reason:'exchanges_manual'` (`conversion.ts:273-275`).
Sin esta capa, esos planes (cuentas de socios: Alan, ali de jotap) no pueden migrar y
bloquean la deprecación total del alumno V1.

V1 ya trae la mitad del trabajo hecho y en prod: catálogo `exchange_groups` con los 9
grupos system y macros de referencia por porción, columnas de equivalencia en `foods`,
matemática pura compartida (`packages/nutrition-engine/exchange-calc.ts`, 18 tests) y
componentes de alumno (chips + sheet de equivalencias). Esta spec reutiliza todo eso
sobre el árbol versionado V2.

## User stories

- Como **nutricionista/coach**, quiero prescribir en cada franja "N porciones del
  grupo X" (con medias porciones), combinables con alimentos fijos en la misma franja,
  y que los objetivos de macros del plan se puedan derivar automáticamente de esas
  porciones — así prescribo como aprendí en la universidad, sin calculadora aparte.
- Como **alumno**, quiero ver en mi día qué porciones me tocan por comida, tocar un
  chip para ver qué alimentos equivalen a una porción de ese grupo, y **marcar cada
  porción que cumplí con un tap** (con deshacer) — sin verme obligado a buscar y pesar
  cada alimento.
- Como **alumno**, si prefiero registrar el alimento real (buscador/scanner), quiero
  que ese registro **también cuente** hacia mis porciones del grupo correspondiente,
  sin registrar dos veces.
- Como **coach**, quiero ver la adherencia del alumno **por grupo** ("C 2/2 · P 1/1 ·
  V 0/1"), no solo kcal/macros, para saber si come verduras o solo rellena calorías.
- Como **operador (CEO/CLI)**, quiero que los ~4.900 alimentos del catálogo queden
  clasificados por grupo con porción equivalente mediante un pipeline asistido con
  reporte revisable ANTES de aplicar, y que los 6 planes exchanges V1 se conviertan a
  V2 con fidelidad verificable.

## Criterios de aceptación (medibles)

1. **Prescripción por franja**: en el builder (paso Construcción) y en quick-edit, el
   coach agrega targets de porciones por grupo a cualquier franja de un plan
   `structured` o `hybrid`; pasos de 0,5; una franja admite items fijos Y porciones a
   la vez. Publicar pasa por `publish_nutrition_plan_v2` (RPC canónico) sin RPC nuevo
   de publish.
2. **Snapshot congelado**: al persistir el draft (misma mecánica que el snapshot de
   items en `plan-persistence.ts`/`draft-builder.ts:578-584` — hallazgo A1), cada
   target congela `code/name/ref_*/composed_of/macros_confirmed` del grupo, y
   `composed_of` va ENRIQUECIDO con los `ref_*` de los grupos base que referencia
   (LEG→P+C — hallazgo A2). Test: editar `ref_*` del grupo, editar `ref_*` de un
   grupo BASE referenciado por `composed_of`, o soft-borrar cualquiera de ellos
   después de publicar NO cambia el read-model ni los macros derivados de la
   versión publicada.
3. **Derivar objetivos**: con porciones presentes, el paso Objetivos ofrece precargar
   `target_*` con `dayTotalsByVariant` del engine; paridad numérica exacta con los
   tests existentes de `exchange-calc.ts` (misma expansión de LEG vía `composed_of`).
4. **Marcar porción**: un tap del alumno registra un intake sintético con las
   ref-macros congeladas del snapshot (× porciones marcadas). Los anillos de macros
   suben exactamente ese aporte; la cobertura del grupo en la franja sube exactamente
   la cantidad marcada (1,0 ó 0,5). Deshacer anula vía el camino void existente
   (nunca delete); contador Y macros revierten — la entry correctora del void
   neutraliza también `exchange_portions`, con test explícito del contador, no solo
   de macros (hallazgo B3). Re-marcar tras deshacer genera un intake NUEVO: la
   idempotency key incluye un contador de intento por ordinal y nunca colisiona con
   el intake anulado (test deshacer→re-marcar — hallazgo B2).
5. **Cobertura derivada**: registrar un alimento real con `exchange_group_id` del
   grupo, asignado a la franja, aporta `cantidad_g / exchange_portion_grams` porciones
   a la cobertura de ese grupo. Test numérico con foods del catálogo clasificado.
6. **Sin doble conteo estructural**: Σ macros consumidos == Σ macros de intakes no
   anulados (reales + sintéticos). Los targets de porciones NUNCA suman al consumido.
   Test que lo verifica sobre el read-model Today.
7. **Idempotencia offline (RN)**: replay de la cola offline del marcar-porción no
   duplica entradas (misma idempotency key ⇒ mismo intake). Test del generador de
   claves + test de replay.
8. **Compatibilidad de caches**: `NUTRITION_READ_MODEL_SCHEMA_VERSION` se mantiene en
   `1`; todos los campos nuevos son `.optional()`. Test: un fixture de read-model
   ANTERIOR (sin campos de porciones) parsea sin error.
9. **Conversión de los 6 planes exchanges**: dry-run + apply con fidelidad
   `porciones-in == porciones-out` por comida/grupo y macros derivados con paridad
   engine; Alan y ali de jotap primero. Cero invención de datos; lo no mapeable queda
   en el reporte.
10. **Catálogo clasificado**: el pipeline produce reporte (MD + JSON) con % clasificado,
    distribución por grupo, tiers de confianza y muestra por grupo para revisión CEO;
    `--apply` solo tras GO; reversible (`--down` restaura el estado previo desde tabla
    de respaldo). Meta F1: ≥80% de los ~4.900 foods clasificados en tier alto+medio.
11. **UX validada**: cada superficie nueva funciona en light Y dark, con white-label
    (`primary` del coach para acciones; colores de grupo del catálogo solo como
    identidad), y en móvil 360 px sin scroll horizontal; targets táctiles ≥44 px
    (patrón `min-h-9`/`min-h-12` existente).
12. **Gates verdes**: `pnpm lint && pnpm typecheck && npx vitest run &&
    pnpm check:nutrition-v2-boundaries` + `pnpm --filter @eva/mobile exec tsc --noEmit`.

## Reglas de dominio (cerradas)

### R1 — Capa opcional, no estrategia

Porciones son una **capa aditiva** sobre `structured`/`hybrid`. La enum
`strategy` NO cambia (ni CHECKs de DB, ni `NutritionStrategySchema`, ni switches).
La *presencia* de targets de porciones en una franja la vuelve "franja por porciones":
la libertad de elegir DENTRO del grupo la otorga el propio target, independiente de
`canRegisterFreely`/`canSubstitute` (que siguen gobernando registro libre y swaps de
items fijos, respectivamente). `flexible` no lleva porciones en F1 (no tiene franjas
prescritas donde colgarlas con sentido).

### R2 — Tabla nueva `nutrition_slot_exchange_targets_v2` (única DDL de dominio)

Espeja el patrón de `nutrition_prescription_items_v2`: **FK compuesta**
`(meal_slot_id, version_id) → nutrition_meal_slots_v2(id, version_id)` con
`on delete cascade` (hereda inmutabilidad-por-versión), más columnas `snapshot_*`
congeladas al publicar:

```sql
create table public.nutrition_slot_exchange_targets_v2 (
  id                uuid primary key default gen_random_uuid(),
  version_id        uuid not null,
  meal_slot_id      uuid not null,
  exchange_group_id uuid not null references public.exchange_groups(id) on delete restrict,
  portions          numeric not null
                    check (portions > 0 and portions <= 99 and (portions * 2) = floor(portions * 2)),
  notes             text,
  order_index       integer not null default 0 check (order_index >= 0),
  -- Snapshot congelado al persistir el draft (exchange_groups NO está versionado — riesgo #1):
  snapshot_group_code       text,
  snapshot_group_name       text,
  snapshot_ref_calories     numeric,
  snapshot_ref_protein_g    numeric,
  snapshot_ref_carbs_g      numeric,
  snapshot_ref_fats_g       numeric,
  snapshot_composed_of      jsonb,
  snapshot_macros_confirmed boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint nstet_slot_version_fkey
    foreign key (meal_slot_id, version_id)
    references public.nutrition_meal_slots_v2(id, version_id) on delete cascade,
  unique (meal_slot_id, exchange_group_id)
);
-- Índices obligatorios (advisors marcan FK sin índice — hallazgo D2):
create index nstet_version_id_idx
  on public.nutrition_slot_exchange_targets_v2 (version_id);
create index nstet_exchange_group_id_idx
  on public.nutrition_slot_exchange_targets_v2 (exchange_group_id);
```

- **Media porción**: `portions` en múltiplos de 0,5 (CHECK de arriba). Mínimo 0,5.
- RLS: espejo EXACTO de `nutrition_prescription_items_v2` (coach dueño / alumno del
  plan / pool team), forma no-correlacionada (`meal_slot_id IN (SELECT ...)`, jamás
  el EXISTS correlacionado prohibido), re-derivando el scope desde el PLAN — no
  confiar solo en el slot (hallazgo S1) — + REVOKE anon/authenticated con grants
  explícitos + policy `_service` (patrón obligatorio del repo). Trigger
  `updated_at` = `private.nutrition_v2_set_updated_at`.
- **Freeze en la persistencia del draft, NO en el publish RPC** (hallazgo A1): los
  `snapshot_*` se congelan al EMITIR/INSERTAR las filas del draft en la capa server
  (`plan-persistence.ts`/`draft-builder`), resolviendo `exchange_groups`
  server-side en ese momento — mecánica idéntica al `snapshot_*` de items
  (`draft-builder.ts:578-584`). `publish_nutrition_plan_v2` queda INTACTO (firma y
  cuerpo). Toda fila persistida lleva snapshot completo; no existen filas con
  `snapshot_*` NULL en ningún estado.
- **`snapshot_composed_of` ENRIQUECIDO** (hallazgo A2, opción a): no guarda solo
  `[{code, portions}]` sino `[{code, portions, ref: {calories, proteinG, carbsG,
  fatsG}}]` con los `ref_*` de cada grupo base congelados en el mismo momento. El
  read-model reconstruye el diccionario `ExchangeGroup[]` desde los snapshots
  (targets + bases embebidas), de modo que `expandComposedGroups`/`findByCode`
  resuelven contra valores congelados SIN modificar el engine (18 tests intactos).
- El freeze resuelve el grupo por `id` INCLUSO si tiene `deleted_at` (un draft
  viejo puede referenciar un grupo que el builder ya no ofrece — hallazgo B5); si
  el grupo no existe, la persistencia falla con error explícito, jamás snapshot
  NULL.
- **No** hay tabla a nivel day-variant en F1: los totales de día se DERIVAN con el
  engine (`dayTotals`/`dayTotalsByVariant`). Presupuesto de porciones por día = F2.

### R3 — Grupos

Los 9 grupos system de V1 tal cual: **C** (cereales), **P** (proteínas), **F**
(frutas), **V** (verduras), **LAC** (lácteos), **ARL** (grasas/aceites y frutos
secos), **SP** (sin porción/libres), **G** (grasas), **LEG** (leguminosas,
`composed_of` = 1P+1C). La expansión de grupos compuestos usa SIEMPRE el
`snapshot_composed_of` ENRIQUECIDO (incluye los `ref_*` congelados de los grupos
base — ver R2), nunca el catálogo vivo: editar el `ref_*` de P o C después de
publicar NO mueve los macros de un plan con LEG. Los grupos custom de coach
existentes siguen siendo elegibles como target (la RLS 3-vías ya los resuelve), pero
la clasificación masiva del catálogo aplica SOLO a los 9 system. Crear/editar grupos
custom desde el builder: fuera de alcance (no decidido).

### R4 — Intake del marcar-porción (columnas aditivas)

`nutrition_intake_entries` gana 2 columnas nullable aditivas:
`exchange_group_code text null` (código congelado, sin FK) y
`exchange_portions numeric null check (exchange_portions > 0 and exchange_portions <= 99 and (exchange_portions*2)=floor(exchange_portions*2))`.
Un intake sintético de porción lleva: `source='prescription'`, `custom_name` =
nombre del grupo, macros snapshot = ref del grupo × porciones (congeladas del
snapshot de la versión vigente al momento de marcar), `meal_slot_code` de la franja,
y ambas columnas nuevas pobladas. Se registra por el MISMO RPC canónico
(`record_nutrition_intake_v2`); se anula por el MISMO camino void. Cero RPC nuevo
de escritura y cero cambio de firma, con TRES precisiones obligatorias (hallazgos
B1/B2/B3):

- **Transporte vía `p_snapshot`** (B1): los 2 valores viajan DENTRO del jsonb
  `p_snapshot` (`exchangeGroupCode`, `exchangePortions`); el cuerpo del RPC los
  extrae a las columnas. Firma y grants intactos (no hay re-otorgamiento). La
  migración hace `create or replace` del cuerpo PARTIENDO de la versión
  `20260718120000_student_access_grace_gate.sql` — la que llama
  `private.student_write_allowed`; recrear el cuerpo viejo REGRESARÍA el gate de
  pausa del coach (money-safety) — y recrea también el wrapper
  `correct_nutrition_intake_v2`. La migración incluye un assert que verifica que
  `student_write_allowed` sigue presente en el cuerpo resultante.
- **El void neutraliza porciones** (B3): la entry correctora escribe
  `exchange_portions = null` (contribución cero), igual que pone macros en 0; Y el
  read-model suma cobertura SOLO de entries activas cuya cadena no fue anulada.
  Doble cinturón: cualquiera de los dos basta; se implementan ambos.
- **Idempotency key con intento** (B2/M1/M2): la key se emite SIEMPRE por el
  helper canónico (`nutritionV2IntakeIdempotencyKey` →
  `buildNutritionIdempotencyKey`), forma `{kind}:{clientId}:{deviceId}:{operationId}`
  (sanitiza `[^a-z0-9_-]` y lowercasea), con
  `operationId = "{fecha}-{slotCode}-{groupCode}-{ordinal}-a{attempt}"`. `attempt`
  es un contador local por `(fecha, franja, grupo, ordinal)` que se incrementa en
  cada deshacer de ese ordinal (incluso si el deshacer solo canceló una entrada de
  la cola offline). Así re-marcar tras deshacer produce una key NUEVA (nunca
  colisiona con el intake corregido) y el replay offline de la MISMA marca conserva
  su key (dedup correcto).

**Modelo de confianza (honesto — hallazgo S2)**: como todo self-report de intake,
el RPC confía en el `p_snapshot` del cliente. La cobertura de porciones es
AUTO-DECLARADA por el alumno (self-scope: solo infla sus propios anillos; los CHECK
de columna validan la forma). NO se vende como "anti-forja". Derivar/validar las
ref-macros server-side contra el snapshot del target vigente queda anotado como
hardening F2.

### R5 — Adherencia: marcar-porción por grupo + macro-derivada SIN doble conteo (definición exacta)

**Invariante estructural**: los targets de porciones viven SOLO del lado TARGET
(snapshot de la versión); al CONSUMIDO solo suman intakes. Cada unidad de comida que
el alumno declara genera EXACTAMENTE UN intake — real (alimento) o sintético
(porción marcada) — y ese único intake alimenta AMBAS métricas a la vez:

Para el día `d`, franja `s`, grupo `g` (sobre intakes no anulados):

- `consumido_macros(d)` = Σ macros snapshot de TODOS los intakes de `d`
  (reales + sintéticos). Es el único agregado que alimenta los anillos de macros
  (`computeNutritionAdherence` intacto).
- `marcadas(s,g)` = Σ `exchange_portions` de intakes sintéticos con
  `meal_slot_code = s` y `exchange_group_code = g`.
- `derivadas(s,g)` = Σ `cantidad_en_gramos(i) / foods.exchange_portion_grams` de
  intakes reales `i` con `meal_slot_code = s` cuyo food tiene
  `exchange_group_id = g` (valor vigente del catálogo al momento de LECTURA, F1).
  Intakes en unidades no convertibles a gramos no aportan cobertura.
  **Consecuencia asumida (hallazgo A3)**: reclasificar un food en el pipeline puede
  mover retroactivamente la cobertura DERIVADA de días pasados (las `marcadas` y
  los macros son inmutables — solo se mueve la lente derivada). Se documenta al
  coach ("la cobertura derivada usa el catálogo vigente"); congelar
  `exchange_portion_grams`+`exchange_group_id` por intake es el PRIMER candidato
  de F2 si el histórico del coach lo amerita.
- `cobertura(s,g)` = `marcadas(s,g) + derivadas(s,g)`. El read-model emite los DOS
  sumandos POR SEPARADO (`marcadas` y `derivadas`, ambos `.optional()`) además de
  la suma: la UI necesita el desglose para pintar segmentos marcados-a-mano vs
  derivados-de-alimento (hallazgo F2-frontend).
  Display: 1 decimal máx; los segmentos del chip se llenan por `floor(x·2)/2`;
  el exceso sobre lo prescrito se muestra como "+n" y NUNCA descuenta otros grupos.
- `cobertura_dia(g)` = ídem sumando todas las franjas MÁS los intakes sin franja
  asignada (estos solo aportan al resumen del día, nunca a un chip de franja).

**No hay doble conteo estructural posible**: sumar un intake a `consumido_macros` y a
`cobertura` no es contar dos veces — son dos lentes de la misma comida (cuánta energía
aportó / qué grupo cubrió). El ÚNICO doble conteo posible es de usuario: declarar la
misma comida dos veces (marcar el chip Y además registrar el alimento que comió).
Mitigación cerrada, en este orden: (a) el marcar-porción es reversible con un tap
(void); (b) al abrir "Registrar alimento" en una franja donde ya hay porciones
marcadas del mismo grupo, aviso inline no bloqueante (ver microcopy §UX-d);
(c) la cobertura se capea VISUALMENTE al prescrito (el exceso se ve como "+n", señal
de posible duplicado para alumno y coach). No se auto-fusiona ni se descarta ningún
intake: mismo tratamiento que hoy tiene registrar el mismo alimento dos veces.

### R6 — Targets derivados

Si el coach usa "Derivar objetivos desde porciones", los `target_*` se precargan con
`dayTotalsByVariant` (Σ porciones × ref del grupo, expansión `composed_of` incluida)
y quedan editables. Si el coach NO deriva, sus targets manuales mandan. En ambos
casos los anillos de macros comparan consumido vs `target_*` de la versión — las
porciones no crean un segundo target paralelo de macros.

### R7 — Conversión de los 6 planes exchanges V1

El skip `'exchanges_manual'` (`conversion.ts:273-275`) se convierte en mapeo real:
`meal_exchange_targets` (por comida V1) → filas de `nutrition_slot_exchange_targets_v2`
por slot; `strategy = 'structured'`, o `'hybrid'` si la comida además tiene
`food_items`. Fan-out de comidas por día idéntico al de grams (dow 7→0 incluido).
Fidelidad: `porciones-in == porciones-out` por comida/grupo + macros derivados con
paridad engine. Reusa `nutrition_v2_conversion_links` + `nutrition_v2_convert_publish`
(impersonación) sin cambios; idempotencia por `updated_at` V1. Orden: Alan y ali de
jotap primero, resto después. Precisiones (hallazgo B6): `conversion.ts` es puro y
hoy NO conoce `exchange_groups` — el mapper RECIBE los grupos (system + custom del
coach) como input desde el loader de impersonación, igual que hoy recibe `food` por
item, y congela los `snapshot_*` (enriquecidos) al emitir las filas.
`meal_exchange_targets` es por `meal_id`: el fan-out dow 7→0 replica los targets en
CADA variante donde aparece la comida (igual que items), y el dedup por-fuente
(`seenMeals`) NO debe contar doble los targets de comidas dow-NULL replicadas
(test de conteo explícito).

### R8 — Clasificación masiva del catálogo (~4.900 foods)

Pipeline asistido, patrón del dedup 2026-07-17:

1. **Heurísticas** (puras, testeadas): categoría existente (`food-category.ts`),
   keywords de nombre, y perfil de macros dominante vs `ref_*` de cada grupo system.
   Cada food recibe `(grupo_candidato, confianza alto|medio|bajo)`.
2. **Porción equivalente derivada**: `exchange_portion_grams` = gramos tales que el
   macro clave del grupo ≈ su ref (ej. grupo C: `15 g carbs / carbs_por_gramo`),
   redondeado a entero; `exchange_portion_label` desde la medida casera/serving si
   existe, si no `"{n} g"`.
3. **Reporte al CEO** (MD + JSON + artifact): % clasificado, distribución por grupo,
   N ejemplos por grupo y tier, lista completa de tier bajo (quedan SIN clasificar).
4. **Apply con GO**: solo tiers alto (auto) y medio (tras revisión); tabla de respaldo
   con los valores previos → `--down` reversible. Foods ya clasificados a mano en V1
   NUNCA se pisan: el UPDATE lleva `where exchange_group_id is null` (hallazgo D3).
5. **Coordinación y acceso** (hallazgos D3/PM4): `foods` es tabla compartida con V1
   vivo — el `--apply` corre DESPUÉS del apply de la conversión de los 6 planes
   (no mover el suelo bajo ellos); el pipeline usa `createServiceRoleClient` (nunca
   raw admin); y se presupuesta revisión humana real del tier medio — el GO del CEO
   sobre el reporte es el control de calidad, no una formalidad: el ≥80% no se
   asume automático del pipeline.

## Fuera de alcance (F1)

- **Platillos/recetas mixtos** descompuestos en equivalencias por grupo → F2.
- **PDF pauta brandeada** → F2 (patrón dossier jsPDF).
- Presupuesto de porciones a nivel día (tabla por variant) → F2.
- Racha/streak por grupo y señal de sub-cobertura en el coach-hub → F2.
- Crear/editar grupos custom desde el builder → no decidido, fuera.
- Porciones en estrategia `flexible` → fuera.
- Escalado automático de plantillas por kcal objetivo, R24, CFCA → fuera (roadmap).
- Bump de `NUTRITION_READ_MODEL_SCHEMA_VERSION` → prohibido en este build.
- Aplicar migraciones a PROD dentro del build → fuera; BEGIN/ROLLBACK + GO del CEO
  (protocolo aditivo-en-LIVE).

## Métricas de éxito (producto — hallazgo PM3)

- **Adopción coach**: nº de coaches que prescriben ≥1 target de porción en los
  primeros 30 días post-release.
- **Adopción alumno**: nº de alumnos que marcan ≥1 porción/semana.
- **Correctitud en prod**: muestreo periódico del invariante Σ macros (criterio 6)
  sin drift sobre planes publicados con porciones.
- **Dataset**: ≥80% del catálogo en tier alto+medio (criterio 10) — métrica de
  insumo, no de valor: las dos primeras son las que dicen si el método "digno de
  nutricionista" mueve la aguja o es una casilla.

---

## Capítulo UX

Principios transversales (cada decisión de abajo los cumple): móvil-first PWA
(360 px sin scroll horizontal, targets ≥44 px vía `min-h-9`+padding o `min-h-12`);
light/dark con tokens semánticos (`surface-card`, `border-border-subtle`,
`text-strong`, `text-muted`, `rounded-control`, `focus-visible:ring-2 ring-ring`);
white-label: **acciones y estados activos usan `primary` del coach**
(`NUTRITION_WEB_TONE_CLASSES.nutrition`), los colores de grupo del catálogo
(`exchangeGroupColor`) se usan SOLO como identidad en el circulito del código con
letra blanca (patrón V1 probado en ambos temas — el hex del grupo nunca colorea
texto sobre superficie); motion con `NUTRITION_MOTION.press/selection/feedback`.
RN espeja con `NutritionV2Kit` y las mismas clases NativeWind.

### (a) Builder del coach — paso Construcción y quick-edit

**Dónde vive**: dentro de cada card de franja del paso 2 (Construcción), como
sección hermana de la lista de alimentos, debajo de "+ Alimento". No es un paso
nuevo ni una card suelta: la porción se prescribe POR FRANJA, y el coach piensa
franja por franja.

```
┌─ Card franja "Almuerzo" ──────────────────────────── surface-card ─┐
│ Almuerzo                              13:00        [⋮]  text-strong │
│ ── items fijos (como hoy) ─────────────────────────────────────────│
│  🍗 Pechuga de pollo          150 g       420 kcal                 │
│  [+ Alimento]                                       botón existente │
│ ── NUEVO: sección porciones ───────────── border-t subtle ─────────│
│  Porciones a elección                     text-sm font-medium      │
│  El alumno elige qué comer dentro de cada grupo.  text-xs muted    │
│   (C) Cereales        [−] 2   [+]        [🗑]                      │
│   (V) Verduras        [−] 1,5 [+]        [🗑]                      │
│  [+ Agregar grupo]        ghost, text-primary, min-h-9             │
└────────────────────────────────────────────────────────────────────┘
```

- Fila de grupo: circulito 20 px con código y `backgroundColor:
  exchangeGroupColor(grupo)` + nombre en `text-strong` + stepper (adaptación de
  `StepperField` del quick-edit, paso 0,5, mínimo 0,5) `tabular-nums` + eliminar.
- "+ Agregar grupo" abre un popover/sheet (móvil: bottom sheet) con los 9 system
  primero y los custom del coach después (`getExchangeGroupsForCoach`), cada uno con
  circulito + nombre + "1 porción ≈ 70 kcal · 15 C · 2 P" en `text-xs text-muted`.
  Grupos ya usados en la franja aparecen deshabilitados. Grupo con
  `macros_confirmed=false` lleva badge "referencial" (tono `warning`).
- **Paso 1 (Objetivos)**: si el draft tiene porciones, aparece una card informativa
  tono `nutrition` (= `primary/10`): "Tus porciones suman ~1.850 kcal · 120 P ·
  180 C · 60 G" + botón `[Usar como objetivos]` que precarga los `target_*`
  (editables). Nunca sobrescribe sin tap.
- **Paso 3 (Revisar)**: cada franja muestra su resumen `portionsSummaryLabel`
  ("2C · 1,5V") como chips read-only junto a los items; el `MacroBudget` existente
  ya refleja los totales derivados. Si `hasUnconfirmedMacros` → banner `warning`
  "Algunos grupos tienen macros referenciales".
- **Quick-edit**: `EditablePortionsCard` como hermana de `EditableSlotCard` dentro de
  la card de franja — misma fila grupo+stepper de arriba, altas/bajas/cambios cuentan
  en la barra "N cambios sin publicar" (`countDraftChanges` extendido, un cambio de
  porciones = 1). Publica por el MISMO pipeline; cero RPC nuevo.
- Responsive: la fila de grupo es `flex` con el stepper a la derecha; en <380 px el
  nombre del grupo trunca con ellipsis, el stepper nunca se comprime (ancho fijo).

### (b) Alumno "Hoy" — chips, sheet de equivalencias, marcar porción, cobertura

**Jerarquía visual (decisión clave)**: los anillos de macros (AuraHero) SIGUEN siendo
el héroe único de la parte alta. La cobertura por grupo es una **fila secundaria
compacta** debajo del héroe — chips pequeños, sin anillos grandes, color del grupo solo
en el circulito — para no competir con los anillos de macros:

```
┌─ AuraHero (sin cambios) ── anillos P / C / G ──────────────────────┐
└────────────────────────────────────────────────────────────────────┘
┌─ NUEVO: Porciones de hoy ──────────────── solo si hay targets ─────┐
│ Porciones de hoy                          text-sm font-medium      │
│  (C) 2/4   (P) 1/2   (V) 0/2   (F) 1/1 ✓   scroll-x si no caben   │
│  chip: circulito código + "n/N" tabular-nums + mini barra 2px      │
│  completo → check + tono success; exceso → "+1" tono warning       │
└────────────────────────────────────────────────────────────────────┘
┌─ Franja "Almuerzo" (card existente de PrescribedSection) ──────────┐
│ Almuerzo                                    13:00                  │
│  🍗 Pechuga de pollo 150 g            [registrar como hoy]         │
│ ── NUEVO: porciones de la franja ──────────────────────────────────│
│  Marca cada porción cuando la comas       text-xs text-muted       │
│  (C) Cereales   ⬤⬤◯◯   2/4        ← chip interactivo, min-h-11   │
│  (V) Verduras   ◐◯      0,5/1,5                                    │
│  [Equivalencias]                    ghost text-primary min-h-9     │
└────────────────────────────────────────────────────────────────────┘
```

- **Chip de porciones por grupo (en la franja)**: circulito con código (color del
  grupo, letra blanca) + nombre + segmentos (uno por porción; media porción =
  semicírculo) + contador `n/N`. Segmento lleno = `primary` (white-label), NO el
  color del grupo — el color del grupo identifica, el `primary` marca progreso, y
  así el chip funciona en light/dark/white-label sin recalcular contrastes.
- **Gesto marcar**: tap en el chip → se llena el siguiente segmento pendiente (1,0;
  o 0,5 si es lo que queda), animación `NUTRITION_MOTION.selection` + haptic (RN),
  intake sintético optimista, y snackbar 5 s "Porción marcada · **Deshacer**".
  Deshacer = void del último intake sintético de ese grupo/franja. Con lo prescrito
  completo, el siguiente tap pide confirmación inline ("¿Marcar una porción extra?")
  y de aceptar muestra "+1" en tono `warning`. Tap NUNCA abre el sheet (acción
  frecuente = acción del tap).
- **Sheet de equivalencias**: se abre desde el botón `[Equivalencias]` de la franja
  (siempre visible, accesible) y también con long-press sobre un chip (atajo, nunca
  único camino). Es el `ExchangeEquivalencesSheet` V1 portado al read-model V2:
  header con circulito + "Equivalencias de {grupo}" + "1 porción equivale a:" +
  lista `alimento — medida casera — {n} g`; tabs/segmentos si la franja tiene varios
  grupos; badge "Valores referenciales" si `snapshot_macros_confirmed=false`. CTA al
  pie: "[Marcar 1 porción]" (mismo camino que el tap) y "[Registrar alimento]"
  (flujo existente, preseleccionando franja).
- **Registro normal convive**: el buscador/scanner sigue igual; si el alimento
  registrado pertenece a un grupo prescrito de la franja, los segmentos derivados se
  llenan con un estilo distinto (relleno `primary` con anillo fino, tooltip/aria
  "cubierta por Arroz integral 100 g") para que el alumno distinga marcado-a-mano de
  derivado-de-alimento. Aviso anti-duplicado: ver §(d).
- **Accesibilidad**: chip con `role="button"`,
  `aria-label="Marcar 1 porción de Cereales. Llevas 2 de 4."`; los segmentos son
  decorativos (`aria-hidden`); el contador `n/N` es texto real.
- **Coach (ficha alumno V2)**: el detalle del día muestra la misma fila "Porciones"
  read-only (chips `n/N` compactos) bajo los macros del día — misma fuente
  (read-model), cero cálculo nuevo en el coach.

### (c) Estados vacíos, error y offline

- **Plan sin porciones**: CERO UI nueva (ni fila de cobertura, ni sección en franjas,
  ni botón Equivalencias). La capa es invisible si el coach no la usa.
- **Franja sin porciones** (pero el plan tiene en otras): la franja no muestra la
  sección; la fila "Porciones de hoy" solo lista grupos con target ese día.
- **Builder, catálogo de grupos vacío/no cargable**: el popover muestra estado de
  error con reintento ("No pudimos cargar los grupos. Reintentar"); la franja se
  puede seguir editando (items fijos no se bloquean).
- **Marcar porción sin conexión (RN/PWA)**: optimista — el segmento se llena con
  estado `pending` (patrón `NutritionSyncState`: opacidad + puntito ámbar), entra a
  la cola offline con idempotency key estable; al sincronizar pasa a lleno pleno.
  Falla determinista (4xx) → revertir el segmento + toast. Deshacer offline de una
  porción aún no sincronizada = cancelar la entrada de la cola (no genera void),
  PERO el contador `attempt` del ordinal igual se incrementa — si la marca ya había
  sincronizado sin que el device lo supiera, el próximo marcar no colisiona
  (hallazgo M1).
- **Reconciliación optimista vs cobertura server-side (hallazgo F1-frontend)**: la
  cobertura canónica se computa server-side en el read-model (una sola fuente). El
  cliente mantiene SOLO un delta optimista de `marcadas` pendientes, que SUMA sobre
  la cobertura del último read-model recibido; al llegar un fetch nuevo, las
  pendientes confirmadas salen del delta (reconciliación por idempotency key). Las
  `derivadas` JAMÁS se estiman en el cliente. Así el segmento nunca "salta" hacia
  atrás por un recálculo concurrente.
- **Performance RN (hallazgo M3)**: marcar una porción re-renderiza SOLO el chip y
  su franja (memoización por slot); PROHIBIDO recomputar la cobertura de todas las
  franjas en cada tap. Sheets con `nativeModal` (gotcha gorhom 5.2.14 + reanimated
  4). En el builder RN: el campo `notes` del target dentro del sheet es
  keyboard-avoiding, y el stepper 0,5 usa botones, nunca teclado numérico
  (hallazgo M4 — entra al QA de RN).
- **Grupo soft-borrado/edición post-publish**: el alumno sigue viendo chip y sheet
  desde el `snapshot_*` congelado — nunca un chip roto ni macros drifteados.
- **Food sin `exchange_portion_grams`** (no clasificado): su registro suma macros
  como siempre y simplemente no aporta cobertura; jamás bloquea el registro.
- **Error al publicar (builder/quick-edit)**: sin cambios — el draft con porciones
  se conserva y reintenta con la misma idempotency key (comportamiento actual).

### (d) Microcopy canónico (es-CL neutro, con tildes; espeja el patrón `QE_COPY`)

Se agrega `PORTIONS_COPY` (web) espejado en RN. El alumno nunca ve jerga interna
("target", "snapshot", "intake"):

| Clave | Texto |
|---|---|
| `builder.sectionTitle` | Porciones a elección |
| `builder.sectionHint` | El alumno elige qué comer dentro de cada grupo. |
| `builder.addGroup` | Agregar grupo |
| `builder.groupUsed` | Ya está en esta comida |
| `builder.referentialBadge` | Valores referenciales |
| `builder.deriveCard` | Tus porciones suman ~{kcal} kcal · {p} P · {c} C · {g} G |
| `builder.deriveCta` | Usar como objetivos |
| `builder.unconfirmedBanner` | Algunos grupos tienen macros referenciales. Los totales son aproximados. |
| `student.coverageTitle` | Porciones de hoy |
| `student.slotHint` | Marca cada porción cuando la comas |
| `student.chipAria` | Marcar 1 porción de {grupo}. Llevas {n} de {N}. |
| `student.halfChipAria` | Marcar media porción de {grupo}. Llevas {n} de {N}. |
| `student.marked` | Porción marcada |
| `student.markedHalf` | Media porción marcada |
| `student.undo` | Deshacer |
| `student.extraConfirm` | Ya completaste {grupo}. ¿Marcar una porción extra? |
| `student.extraBadge` | +{n} |
| `student.equivalences` | Equivalencias |
| `student.sheetTitle` | Equivalencias de {grupo} |
| `student.sheetSubtitle` | 1 porción equivale a: |
| `student.sheetMark` | Marcar 1 porción |
| `student.sheetRegister` | Registrar alimento |
| `student.coveredBy` | Cubierta por {alimento} |
| `student.dupWarning` | Ya marcaste {n} de {grupo} en esta comida. Si ahora registras ese alimento, deshaz la porción marcada para no contarla dos veces. |
| `student.offline` | Sin conexión. Tus porciones se guardarán cuando vuelva la señal. |
| `student.markFailed` | No se pudo marcar la porción. Reintentar |
| `coach.dayCoverage` | Porciones |
| `coach.derivedNote` | La cobertura derivada de alimentos usa el catálogo vigente y puede ajustarse si un alimento se reclasifica. |
| `portions.format` | {n} porción / {n} porciones (formatPortions existente; coma decimal es-CL: "1,5") |

---

## Hallazgos del panel — resolución (2026-07-18)

Panel multi-rol del 2026-07-17 (8 roles, veredicto aprobado-con-ajustes). Todos los
P0 y P1 fueron incorporados; los P2 se aplicaron cuando mejoraban sin engordar el
alcance. Detalle:

| Hallazgo | Resolución |
|---|---|
| A1 (P0) freeze en publish RPC no existe en el código | **Aplicado**: freeze movido a la persistencia del draft, como items (R2, criterio 2; PLAN arquitectura/wf2/riesgo 1). Publish RPC intacto. |
| A2 (P0) expansión LEG usa `ref_*` vivos de P/C | **Aplicado, opción (a)**: `snapshot_composed_of` enriquecido con `ref_*` de los grupos base; el read-model reconstruye el dict desde snapshots; engine y 18 tests intactos (R2/R3; test Q6). |
| A3 (P1) cobertura derivada no congelada en el día | **Aplicado como riesgo asumido y documentado**: nota explícita en R5 + microcopy `coach.derivedNote` + riesgo 11 del PLAN; congelar por intake = PRIMER candidato F2. No se congela en F1: evita DDL/joins extra justo cuando el catálogo recién se clasifica (el drift esperado es una migración de dato única y coordinada). |
| A4 (P2) dos fuentes de grupos para el engine | **Aplicado**: test de contrato de forma en ambos bordes (PLAN wf3; TASKS T0.2). |
| B1 (P0) doble definición del RPC de intake / gate de gracia | **Aplicado**: transporte vía `p_snapshot`, `create or replace` desde el cuerpo 20260718 + wrapper + assert de `student_write_allowed` (R4; PLAN wf1/Integraciones). |
| B2/M1 (P0) key ordinal colisiona tras deshacer→re-marcar | **Aplicado**: sufijo `attempt` por ordinal; deshacer (incluso solo-cola) incrementa `attempt` (R4, UX-c, criterio 4; tests Q5/Q9). |
| B3 (P1) void no neutraliza `exchange_portions` | **Aplicado, doble cinturón**: la correctora escribe `null` Y el read-model solo suma cadenas activas (R4, criterio 4; test Q4). |
| B4/S2 (P1) RPC no valida server-side; "anti-forja" sobrevendido | **Aplicado parcialmente (trust documentado)**: cobertura declarada como AUTO-REPORTADA (mismo modelo de confianza del self-report actual, alcance self-only) + CHECKs de forma; derivación server-side = hardening F2. Razón del corte: re-derivar en el RPC obliga a leer el snapshot vigente en el hot path y NO cambia el techo de riesgo real — el alumno ya puede forjar macros de cualquier intake hoy; el coach ve la misma clase de señal auto-declarada. |
| B5 (P2) grupo soft-borrado en draft viejo | **Aplicado**: el freeze resuelve por id incluso con `deleted_at`; si no existe, error explícito (R2). |
| B6 (P2) `conversion.ts` no conoce grupos; fan-out/dedup | **Aplicado** (R7). |
| F1-front (P1) modelo de reconciliación optimista | **Aplicado**: delta optimista solo-`marcadas` sobre el último read-model (UX-c). |
| F2-front (P2) read-model desglosa `marcadas`/`derivadas` | **Aplicado** (R5; PLAN wf3). |
| F3 (P2) dict de grupos vía RPC security-definer | **Aplicado**: equivalencias resueltas dentro del read-model del Today, el sheet nunca pega a `exchange_groups` (PLAN wf3). |
| F4 (P2) boundary service V1 en bundle cliente | **Aplicado**: `check:nutrition-v2-boundaries` es gate de CADA ola (TASKS). |
| D1 (P1) orden de migración + assert del gate | **Aplicado** (PLAN wf1 y gates de operación). |
| D2 (P1) índices FK/version_id + rollback | **Aplicado**: índices en el DDL (R2); guion de rollback exigido en TASKS T0.1. |
| D3 (P1) pipeline muta `foods` compartida con V1 | **Aplicado**: `where exchange_group_id is null` + apply POST-conversión + `createServiceRoleClient` (R8; gates de operación). |
| D4 (P2) costo hot path en Micro | **Aplicado**: EXPLAIN del RPC Today como gate de operación antes de exponer. |
| D5/S3 (P2) rate limit en ráfaga legítima | **Aplicado**: verificación del presupuesto del limiter como gate de operación; endpoint batch queda fuera de F1 (alcance). |
| Q1-Q14 matriz QA | **Aplicada completa**: mapeada a los criterios y a TASKS (olas 2 y 5); Q4/Q5 tratados como P0. |
| S1 (P1) RLS no-correlacionada + scope del plan | **Aplicado**: reforzado en R2 (scope re-derivado del PLAN, REVOKE + `_service`); test Q13. |
| S4 (P2) key expone estructura del plan | **Sin acción** (el propio panel lo cierra como riesgo nulo, self-scope). |
| M2 (P1) formato de key ≠ helper canónico | **Aplicado**: key SIEMPRE por `nutritionV2IntakeIdempotencyKey`; formato corregido en R4/PLAN. |
| M3/M4 (P2) perf RN + teclado/stepper | **Aplicado** (UX-c; QA RN). |
| M5/PM1 (P1) estimación optimista | **Aplicado**: F1 re-estimada a 15-17 dev-días (PLAN; TASKS con estimación por tarea/ola). |
| PM2 (P1) orden de corte | **Aplicado** (PLAN riesgo 10). |
| PM3 (P1) métricas de producto | **Aplicado**: sección "Métricas de éxito". |
| PM4 (P2) dependencia del dataset | **Aplicado**: revisión humana del tier medio presupuestada (R8; TASKS ola 4). |
