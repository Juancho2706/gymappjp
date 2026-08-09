# PLAN — T2.4 Sustituciones FULL

Orden elegido: **primero lo puro, despues el servidor, al final la UI**. La razon es que el guard SQL es la unica capa que no se puede saltar (SPEC H5): si entra despues de la UI, existe una ventana en la que el gesto nuevo escribe sin validacion. Y la formula de equivalencia entra primero porque los tres commits siguientes la consumen.

Un commit por fase, cada uno con sus gates corridos de verdad. Fases con riesgo ALTO (F2) van solas.

Incorpora las correcciones B1-B5 de la revision adversarial del 2026-08-09.

## F0 — Contrato puro + equivalencia (riesgo BAJO)

**Que:** `packages/nutrition-v2/substitution-intake.ts` — modulo hoja, sin IO:

- `SubstitutionOptionSchema` / `SubstitutionIntakeRequestSchema`: lo unico que el cliente puede mandar es `{ prescriptionItemId, substitutionId, attempt, quantity? }`.
- `computeSubstitutionEquivalence({ item, substitute })` → `{ quantity, unit, macros, basis, computed: 'explicit' | 'calorie-equivalent' | 'needs-confirmation' | 'unavailable' }`.
- `substitutionIntentOperationId({ localDate, prescriptionItemId, substitutionId, attempt })` — **sin `deviceId`** (excepcion declarada al helper canonico).
- `substitutionAttemptFromToday(today, prescriptionItemId)` → cantidad de entries de hoy de ese item **en cualquier estado**. Es la unica fuente de `attempt` en web y RN.
- Redondeo (5 en `g`/`ml`, 0,5 en contadas, nunca 0), tope de plausibilidad `SUBSTITUTION_MAX_PORTION_FACTOR = 3` aislado en una constante.

**Golden tests** obligatorios, con los pares REALES de LIVE ademas de los sinteticos:

| Caso | Esperado |
|---|---|
| Lomo liso 120 g / 240 kcal → Posta cocida (`per_serving`, 30 g, 55 kcal) | ~130 g, **nunca** los 16,5 kcal congelados |
| Palta 45 g / 72 kcal → Pechuga cocida (100 g, 165 kcal) | ~45 g |
| Yogurt proteico 1 un / 77 kcal → Leche protein (100 g, 60 kcal) | ~130 g, unidad del sustituto (no "un") |
| Pechuga 100 g / 165 kcal → Espinaca (23 kcal/100 g) | `needs-confirmation` (~715 g supera 3× la porcion) |
| Sustituto con kcal 0 / null (existe en LIVE) | `unavailable`, prellenado con la porcion del SUSTITUTO |
| Fila con `quantity` explicita y `unit` NULL | gana la cantidad del coach + unidad natural del sustituto |
| `macrosBasis` `per_100` vs `per_serving` | escalado correcto en ambas |
| `attempt` con 0 / 1 activa / 1 retirada / 2 corregidas | 0 / 1 / 1 / 2 (cuenta todos los estados) |

**Gates:** `pnpm test` (paquete) · `pnpm typecheck`.

## F1 — RPC de lectura de opciones (riesgo MEDIO — DB en LIVE)

**Que:** migracion **aditiva** `get_nutrition_substitution_options_v2(p_client_id, p_local_date)`:

- SECURITY DEFINER, `search_path = ''`, scope `private.nutrition_v2_can_read_client`.
- **Version del dia: `nutrition_day_snapshots_v2.version_id` primero**; solo si el dia no tiene snapshot, el selector determinista de `nutrition_v2_effective_permissions` (`20260728130000:74-92`). No crea snapshot.
- Devuelve, por `prescriptionItemId`, las filas autorizadas con los macros **vigentes** del sustituto via `private.food_catalog_v2_item_json(food_id, coach_id)` (coach = `clients.coach_id` del alumno).
- **Solo lectura**: no congela snapshot, no toca ninguna funcion existente.
- `revoke all from public, anon` + `grant execute to authenticated`.

**Protocolo Supabase (AGENTS.md), en este orden:** snapshot → `EXPLAIN` del cuerpo con datos reales → prueba en transaccion con `rollback` usando **JWT reales** (alumno propio / alumno ajeno / coach del pool / coach ajeno / anon) → recien ahi aplicar → `get_advisors` (security + performance) despues.

**Caso de prueba obligatorio:** dia con snapshot de una version y plan re-publicado despues ⇒ la RPC devuelve los `prescription_item_id` de la version **del snapshot**, no de la nueva.

**Gates:** matriz de JWT con evidencia pegada en TASKS · advisors sin hallazgos nuevos · `pnpm typecheck`.

## F2 — Guard de autorizacion + fix del tope de cantidad (riesgo ALTO — commit propio)

Dos `create or replace`, ambos con la **MISMA firma** y base copiada **verbatim** de la definicion viva (`20260728130000`).

**(a) `record_nutrition_intake_v2` (17 args).** Unico delta:

```
if p_source = 'substitution' then
  perform private.nutrition_v2_assert_substitution_authorized(
    p_prescription_item_id, p_food_id, p_custom_name
  );
end if;
```

- Va **despues** del short-circuit de idempotencia (misma razon que NUT-009) y **fuera** del `if not v_delegated`: una correccion delegada desde `correct_` tambien valida autorizacion.
- Sin `prescription_item_id` y con `source = 'substitution'` ⇒ denegado.
- **Sin excepcion por rol**: aplica tambien al coach escribiendo sobre su alumno (SPEC "Autorizacion").
- `private.nutrition_v2_assert_substitution_authorized` es nueva, `stable security definer`, `revoke all`.

**(b) `correct_nutrition_intake_v2` (18 args).** Unico delta: el argumento `p_check_quantity` de la llamada a `assert_intake_permission` (`:601-610`) pasa a ser

```
p_source is distinct from 'substitution'
  and p_quantity is distinct from v_original.quantity
```

Motivo (SPEC H3): cambiar de alimento autorizado no es "ajustar la cantidad prescrita", y el tope en % compara contra la cantidad de otro alimento, a veces en otra unidad. **Sin este delta, D3 falla para 3 de las 6 versiones publicadas con reemplazos**, incluida la unica con `canRegisterFreely = false`. El resto del guard (mover de franja) queda intacto.

**Antes de aplicar**, tx-rollback que demuestra:

1. autorizado ⇒ ok;
2. food no autorizado ⇒ 42501;
3. item de otro alumno ⇒ 42501;
4. delegado desde `correct_` ⇒ tambien valida autorizacion;
5. correccion-sustitucion con `canAdjustPrescribedQuantity = false` ⇒ **pasa**;
6. correccion normal (no sustitucion) con `canAdjustPrescribedQuantity = false` ⇒ **sigue fallando** (no se aflojo de mas);
7. coach del pool escribiendo `'substitution'` no autorizada ⇒ 42501.

**Despues:** advisors + `pg_get_functiondef('get_nutrition_today_v2')` identico al de antes (criterio 9).

**Rollback** documentado al pie: re-aplicar `20260728130000` tal cual (contiene las dos funciones).

**Gates:** matriz con JWT reales · advisors · `pnpm typecheck` · suite completa.

## F3 — Boundary compartido: action web + route movil (riesgo MEDIO)

**Que:** un solo servicio server-side que resuelve y decide, consumido por las dos superficies (la asimetria entre ellas fue justo lo que dejo NUT-009 sin efecto — el comentario de `api/mobile/nutrition-v2/intake/route.ts:145-146` lo dice explicito):

1. Lee las opciones (F1) y elige la fila por `substitutionId`; si no existe ⇒ error tipado.
2. Calcula la equivalencia (F0). El `quantity` del cliente solo se honra si `canAdjustPrescribedQuantity` lo permite y cae dentro de `quantityAdjustmentPercent` **medido contra la cantidad equivalente**, no contra la prescrita del otro alimento.
3. Decide **record vs correct** (D3): re-chequea contra el servidor si hay entry activa con ese `prescription_item_id` hoy ⇒ `correct_nutrition_intake_v2` con razon automatica; si no ⇒ `record_nutrition_intake_v2`.
4. Arma el payload completo server-side (`source: 'substitution'`, `captureMethod: 'prescription'`, franja del item, snapshot calculado) y la clave determinista con el `attempt` recibido.

Superficies: `recordSubstitutionIntakeAction` en `apps/web/src/app/c/[coach_slug]/nutrition-v2/_actions/intake.actions.ts` (misma `authorizeStudentWrite`, mismo rate limit) y `action: 'substitute'` en `apps/web/src/app/api/mobile/nutrition-v2/intake/route.ts`.

**Tests:** `substitutionId` inexistente · item de otro alumno · doble llamada con la misma clave · rama correccion · correccion con `canAdjustPrescribedQuantity = false` · `quantity` del cliente fuera del tope · `attempt` desactualizado (dos llamadas con el mismo `attempt` ⇒ una entry).

**Gates:** `pnpm typecheck` · `pnpm check:nutrition-v2-boundaries` · `pnpm lint` de los tocados · tests nuevos.

## F4 — UI alumno web (riesgo BAJO)

- Pill con **cantidad equivalente + kcal** (de F0), no la kcal congelada de una porcion arbitraria.
- Tap ⇒ `recordSubstitutionIntakeAction` con estado pendiente por pill, **deshacer** (mismo patron de void que ya existe) y toast que distingue registro de correccion.
- Fila del item consumido por sustitucion: nombre del reemplazo + prescrito tachado + chip semantico "Sustituido".
- Muere el explicativo de `canRegisterFreely` en este camino (D2).
- `needs-confirmation` y `unavailable` ⇒ stepper prellenado segun las reglas 4 y 5 de la SPEC, con el motivo en una linea.
- PostHog: `student_nutrition_intake` con `method: 'substitution'`.

**Gates:** `pnpm lint` de los tocados · `pnpm typecheck` · tests de `nutrition-today.logic` · `pnpm check:tokens`.

## F5 — Paridad RN Android (riesgo BAJO)

Mismo comportamiento en `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx` + `ItemSubstitutionsHint`, con la cola offline usando la **misma clave determinista** (reintento = mismo id, no dead-letter) y el **mismo evento** `student_nutrition_intake` con `method: 'substitution'`. Cero dependencias nativas.

**Gates:** `pnpm --filter @eva/mobile exec tsc --noEmit` · tests de mobile tocados · `expo export --platform android` si toca bundling.

## F6 — QA y cierre

Preview web (alumna de QA con `canRegisterFreely = false` **y** `canAdjustPrescribedQuantity = false`) + device fisico Android, cada caso **verificado en DB**. Guion: registrar · doble tap · sustituir sobre registrado · deshacer y re-registrar · ciclo A→B→A · `needs-confirmation` · modo avion. Acta en TASKS con evidencia. Actualizar `docs/specs/nutrition-flows-redesign/TASKS.md` (T2.4 cerrada) y `docs/status/MOBILE_PARITY.md` si cambia la paridad declarada.

## Fuera de este plan (anotado, no ejecutado)

- Camino "cualquiera de mi grupo de intercambio" (D4 ⇒ T2.5).
- Indice `_PENDING_AUDIT_nutrition_v2_prescribed_intent_once` (decision de producto abierta). Sin el, la carrera multi-device de la SPEC no tiene garantia dura.
- Hueco pre-existente de `source = 'prescription'` con food arbitrario por PostgREST (modelo S2).
- Insert directo a `nutrition_intake_entries` con `idempotency_key` NULL: sigue posible y puede fabricar filas `'substitution'`; `get_nutrition_today_v2` filtra `idempotency_key is not null`, asi que Today y la adherencia V2 no se contaminan (solo superficies legacy). Anotado, no cerrado aca.
- Regen de `database.types.ts` (tanda propia ya declarada en el programa padre).
- Editor de reemplazos coach en RN (diferido desde F-02).
- El `quantity` NULL en las 21 filas vivas: se deja como esta; la equivalencia lo resuelve en lectura.
