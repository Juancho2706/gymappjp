# PLAN — T2.5 Intercambio: sheet de dos bloques + swipe

Orden: **el guard y los datos primero, el sheet despues, el gesto al final**. Misma logica que funciono en T2.4 — la capa que no se puede saltar entra antes que la UI que la usa — y ademas respeta D3: si algo se corta por tiempo, se corta el swipe, que vale el 2%.

Un commit por fase con sus gates. F1 va sola (toca el hot-path del intake).

## F0 — Equivalencia del grupo + contrato (riesgo BAJO)

**Que:** ampliar `packages/nutrition-v2/substitution-intake.ts` sin romper nada de T2.4.

- `SubstitutionOptionSchema` gana `origin: 'coach' | 'group'` para que la UI sepa en que bloque va cada opcion. **`schemaVersion` se queda en `1`**: los clientes desplegados lo parsean con `z.literal(1)` y un bump romperia T2.4 en las apps sin OTA.
- `describeSubstitutionDelta({ item, equivalence })` → el texto del pin 3: `"mismas kcal"` cuando la diferencia calorica es menor al 5%, y si no `"+2 g proteina"` / `"−15 kcal"` con el macro que mas se mueve. Puro, con golden tests.
- `substitutionIntakeIdempotencyKey` acepta la opcion del grupo con el namespace **`gf-{foodId}`** en el slot del `substitutionId` (SPEC, "Idempotencia"). Tests de que los dos namespaces nunca colisionan.
- La equivalencia NO cambia: el bloque grupo usa `computeSubstitutionEquivalence` tal cual, con los mismos topes (SPEC H2).

**Gates:** tests del paquete · `pnpm typecheck`. *(Aviso al owner antes de correr suites; por defecto solo el archivo.)*

## F1 — Guard del grupo (riesgo ALTO — commit propio, DB en LIVE)

**Que:** `create or replace` de `private.nutrition_v2_assert_substitution_authorized` con la **misma firma** (aca si aplica: no cambian los argumentos). Delta unico: ademas de la fila autorizada, acepta que el food escrito comparta grupo con el food del item, resolviendo la membresia como el resolver ya existente (`20260804091000`) y filtrando visibilidad:

```
-- membresia = overlay tenant-scoped (respetando is_excluded) UNION columna legacy
-- visibilidad = global OR del coach del alumno OR de su org
-- item        = de una version published/superseded de un plan activo
```

Se escribe con un CTE `grupo_del_item` y otro `grupo_del_food`, no con el join ingenuo sobre `foods.exchange_group_id`: esa columna ignora las exclusiones del coach y sus agregados (SPEC H6).

`record_nutrition_intake_v2` **no se toca**: el guard vive en la funcion auxiliar, que ya se llama desde ahi. Eso baja el riesgo respecto de T2.4, donde hubo que reemplazar la RPC entera.

**tx-rollback con JWT reales ANTES de aplicar**, casos obligatorios:

1. food del **mismo** grupo que el item ⇒ **OK**
2. food de **otro** grupo ⇒ 42501
3. food **sin** grupo ⇒ 42501
4. item **sin** grupo (el prescrito no esta clasificado) ⇒ 42501
5. fila autorizada del coach de otro grupo ⇒ **OK** (la autorizacion explicita gana sobre el grupo)
6. sin `prescription_item_id` ⇒ 42501
7. intake prescrito normal ⇒ **OK**, sin regresion
8. food **privado de otro coach**, del mismo grupo ⇒ **42501** (SPEC H7)
9. food del mismo grupo **excluido por el coach** (`is_excluded`) ⇒ **42501** (se inserta la fila en la tx y se revierte)
10. item de una version **archivada / de plan inactivo** ⇒ **42501**

**Despues:** advisors + `pg_get_functiondef('get_nutrition_today_v2')` y de `record_nutrition_intake_v2` identicos a los de antes. **Rollback:** re-aplicar `20260809230833`.

## F2 — La RPC de opciones aprende el grupo (riesgo MEDIO — DB en LIVE)

**Que:** cambiar la firma de `get_nutrition_substitution_options_v2`. **NO se puede con `create or replace`**: Postgres no deja cambiar la lista de argumentos, asi que crearia una **segunda** funcion y la llamada de 2 args de los clientes de T2.4 quedaria ambigua. Reproducido en LIVE con rollback:

```
LLAMADA-2-ARGS FALLO 42725 :: function public.zz_probe_ambig(integer, integer) is not unique
```

La migracion, en una sola transaccion:

1. `drop function public.get_nutrition_substitution_options_v2(uuid, date);`
2. `create function ...` con la firma nueva;
3. **re-emitir los grants** — no viajan con la firma nueva. Hoy: `revoke ... from public, anon` + `grant execute to authenticated` (verificado en LIVE: `authenticated`, `service_role`, `postgres`).

Argumentos nuevos, todos con default (`p_group_query text default null`, `p_group_limit int default 20`, `p_group_food_id uuid default null`, `p_prescription_item_id uuid default null`). **`p_group_limit` se clampea server-side** (PostgREST deja al cliente mandar lo que quiera).

Cada item suma:

- `group`: `{ id, code, name }` del grupo del food del item (null ⇒ **item fijo**, D2);
- `groupOptions`: alimentos del mismo grupo — membresia de H6, **visibilidad de H7** — con los macros vigentes, **excluyendo** el propio food y los ya autorizados, ordenados por cercania de porcion (SPEC), **limitados** a `p_group_limit`;
- `groupTotal`: cuantos hay en total, para que el sheet diga "de N".

`p_group_query` filtra por nombre server-side con el normalizador del catalogo (`private.food_catalog_v2_normalize_text` + `name_search` + indice trgm), **escapando `%` y `_`**, que el normalizador no toca. `p_group_food_id` devuelve **ese** alimento solo si pertenece al grupo del item y es visible — es el camino de validacion de F3, el que sobrevive al buscador y al paginado. `p_prescription_item_id` acota el computo a un item, para no calcular grupos de items que el sheet no abrio.

**Costo:** ordenar y paginar se hace con join directo a `foods` + `coach_food_overrides`; `food_catalog_v2_item_json` (que ademas arrastra `food_catalog_v2_media_json`) se llama **solo para la pagina devuelta**, no para los ~700 del grupo.

**Protocolo Supabase completo** (snapshot → EXPLAIN con datos reales → tx-rollback con JWT reales → aplicar → advisors). **EXPLAIN obligatorio con el grupo mas grande (C, 716)**. El indice `foods_exchange_group_id_idx` (btree) **ya existe**; verificar que el plan lo use y que el trgm cubra la busqueda.

**Rollback:** `drop` de la firma nueva + re-aplicar `20260809222811` con sus grants.

## F3 — Boundary: aceptar opciones del grupo (riesgo MEDIO)

`planSubstitutionIntake` deja de exigir que el `substitutionId` exista en las filas autorizadas: si viene un `foodId` del grupo, lo valida **con `p_group_food_id`** — no contra la respuesta paginada, que no contiene lo que el alumno encontro por el buscador o por "ver mas" (seria un falso `SUBSTITUTION_NOT_AUTHORIZED` para la mayoria de un grupo de 716). Nunca se confia en lo que manda el cliente: los macros y la cantidad salen de lo que devuelve la RPC.

El contrato del cliente suma `groupFoodId?` como alternativa a `substitutionId`; **exactamente uno de los dos**, validado en el schema.

`resolveAttempt` cambia en dos cosas: sondea con el namespace `gf-` cuando corresponde, y **salta tambien las entries `corrected`**, no solo las `voided` (SPEC, "Idempotencia" punto 2).

**Tests:** food del grupo OK · food que no esta en el grupo ⇒ error tipado · food privado ajeno ⇒ error tipado · food excluido por el coach ⇒ error tipado · opcion hallada por buscador fuera del top-20 ⇒ **OK** · los dos ids ⇒ invalido · ninguno ⇒ invalido · deshacer + re-elegir la misma opcion del grupo ⇒ clave nueva · la rama correccion sigue andando.

## F4 — Sheet web (riesgo BAJO)

Reemplaza las pills por **"⇄ N equivalentes"** en la fila. Sheet con los dos bloques, delta por opcion, buscador con debounce, paginado ("ver mas"), y el copy honesto del candado. Reusa `TodayModal`.

**Depende de D4** (destino del checkbox "Puede sustituir"): si el owner aprueba ocultarlo, entra en esta fase; si no, la fase sale igual y el toggle queda documentado como muerto.

## F5 — Sheet RN + señal offline (riesgo BAJO)

Paridad exacta con `Sheet.tsx`. Ademas: la fila optimista con chip **"En cola"** al encolar sin red — el reparo heredado de T2.4, que ahora se puede pintar porque el sheet conoce nombre y macros de la opcion.

La cola **bumpea el `attempt` por cada gesto encolado** para ese item (SPEC, "Idempotencia" punto 3). Test obligatorio: ciclo **A→B→A sin red** ⇒ tres claves distintas, una sola entry viva al drenar.

## F6 — Swipe en las dos superficies (riesgo BAJO, el 2%)

`framer-motion` en web (`drag="x"`), `gesture-handler` + `reanimated` en RN. Primera opcion **aplicable de un tap** (salta `needs-confirmation` y `unavailable`; si no queda ninguna, abre el sheet), toast con deshacer 6 s, ciclado en swipes sucesivos. Respeta `prefers-reduced-motion`.

## F7 — QA y cierre

Preview web + device. Guion: sheet con los dos bloques · buscador · elegir del grupo · candado sin ⇄ · swipe y ciclado · deshacer · modo avion con el chip "En cola". Cada caso verificado en DB.

## Fuera de este plan

- Arreglar `exchange_portion_grams` del catalogo (deuda de datos, afecta a porciones).
- Check primario / muerte de "Lo comi" (T2.7).
- Flag explicito de item fijo (D2 lo descarto).
