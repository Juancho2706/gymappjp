# PLAN — T2.5 Intercambio: sheet de dos bloques + swipe

Orden: **el guard y los datos primero, el sheet despues, el gesto al final**. Misma logica que funciono en T2.4 — la capa que no se puede saltar entra antes que la UI que la usa — y ademas respeta D3: si algo se corta por tiempo, se corta el swipe, que vale el 2%.

Un commit por fase con sus gates. F1 va sola (toca el hot-path del intake).

## F0 — Equivalencia del grupo + contrato (riesgo BAJO)

**Que:** ampliar `packages/nutrition-v2/substitution-intake.ts` sin romper nada de T2.4.

- `SubstitutionOptionSchema` gana `origin: 'coach' | 'group'` para que la UI sepa en que bloque va cada opcion.
- `describeSubstitutionDelta({ item, equivalence })` → el texto del pin 3: `"mismas kcal ±4%"` cuando la diferencia calorica es menor al 5%, y si no `"+2 g proteina"` / `"−15 kcal"` con el macro que mas se mueve. Puro, con golden tests.
- La equivalencia NO cambia: el bloque grupo usa `computeSubstitutionEquivalence` tal cual, con los mismos topes (SPEC H2).

**Gates:** tests del paquete · `pnpm typecheck`. *(Aviso al owner antes de correr suites; por defecto solo el archivo.)*

## F1 — Guard del grupo (riesgo ALTO — commit propio, DB en LIVE)

**Que:** `create or replace` de `private.nutrition_v2_assert_substitution_authorized` con la misma firma. Delta unico: ademas de la fila autorizada, acepta

```
exists (
  select 1
  from public.nutrition_prescription_items_v2 pi
  join public.foods fi on fi.id = pi.food_id
  join public.foods fs on fs.id = p_food_id
  where pi.id = p_prescription_item_id
    and fi.exchange_group_id is not null
    and fi.exchange_group_id = fs.exchange_group_id
)
```

`record_nutrition_intake_v2` **no se toca**: el guard vive en la funcion auxiliar, que ya se llama desde ahi. Eso baja el riesgo respecto de T2.4, donde hubo que reemplazar la RPC entera.

**tx-rollback con JWT reales ANTES de aplicar**, casos obligatorios:

1. food del **mismo** grupo que el item ⇒ **OK**
2. food de **otro** grupo ⇒ 42501
3. food **sin** grupo ⇒ 42501
4. item **sin** grupo (el prescrito no esta clasificado) ⇒ 42501
5. fila autorizada del coach de otro grupo ⇒ **OK** (la autorizacion explicita gana sobre el grupo)
6. sin `prescription_item_id` ⇒ 42501
7. intake prescrito normal ⇒ **OK**, sin regresion

**Despues:** advisors + `pg_get_functiondef('get_nutrition_today_v2')` y de `record_nutrition_intake_v2` identicos a los de antes. **Rollback:** re-aplicar `20260809230833`.

## F2 — La RPC de opciones aprende el grupo (riesgo MEDIO — DB en LIVE)

**Que:** `create or replace get_nutrition_substitution_options_v2` con **dos argumentos nuevos con default** (`p_group_query text default null`, `p_group_limit int default 20`), asi los clientes viejos siguen llamandola igual.

Cada item suma:

- `group`: `{ id, code, name }` del `exchange_group_id` del food del item (null si no tiene ⇒ **item fijo**, D2);
- `groupOptions`: alimentos del mismo grupo con los macros vigentes (mismo `food_catalog_v2_item_json`), **excluyendo** el propio food y los ya autorizados, ordenados por cercania calorica, **limitados** a `p_group_limit`;
- `groupTotal`: cuantos hay en total, para que el sheet diga "de N".

Con `p_group_query` no nulo, filtra por nombre server-side (mismo normalizador que el catalogo).

**Protocolo Supabase completo** (snapshot → EXPLAIN con datos reales → tx-rollback con JWT reales → aplicar → advisors). **EXPLAIN obligatorio con el grupo mas grande (C, 715 alimentos)**: si el plan no usa indice sobre `exchange_group_id`, se agrega antes de aplicar.

## F3 — Boundary: aceptar opciones del grupo (riesgo MEDIO)

`planSubstitutionIntake` deja de exigir que el `substitutionId` exista en las filas autorizadas: si viene un `foodId` del grupo, lo valida contra `groupOptions` de la MISMA respuesta de la RPC (nunca contra lo que mande el cliente) y arma el payload igual. El contrato del cliente suma `groupFoodId?` como alternativa a `substitutionId`; **exactamente uno de los dos**, validado en el schema.

**Tests:** food del grupo OK · food que no esta en el grupo del item ⇒ error tipado · los dos ids a la vez ⇒ invalido · ninguno ⇒ invalido · la rama correccion sigue andando.

## F4 — Sheet web (riesgo BAJO)

Reemplaza las pills por **"⇄ N equivalentes"** en la fila. Sheet con los dos bloques, delta por opcion, buscador con debounce, paginado ("ver mas"), y el copy honesto del candado. Reusa `TodayModal`.

## F5 — Sheet RN + señal offline (riesgo BAJO)

Paridad exacta con `Sheet.tsx`. Ademas: la fila optimista con chip **"En cola"** al encolar sin red — el reparo heredado de T2.4, que ahora se puede pintar porque el sheet conoce nombre y macros de la opcion.

## F6 — Swipe en las dos superficies (riesgo BAJO, el 2%)

`framer-motion` en web (`drag="x"`), `gesture-handler` + `reanimated` en RN. Primera opcion, toast con deshacer 6 s, ciclado en swipes sucesivos. Respeta `prefers-reduced-motion`.

## F7 — QA y cierre

Preview web + device. Guion: sheet con los dos bloques · buscador · elegir del grupo · candado sin ⇄ · swipe y ciclado · deshacer · modo avion con el chip "En cola". Cada caso verificado en DB.

## Fuera de este plan

- Arreglar `exchange_portion_grams` del catalogo (deuda de datos, afecta a porciones).
- Check primario / muerte de "Lo comi" (T2.7).
- Flag explicito de item fijo (D2 lo descarto).
