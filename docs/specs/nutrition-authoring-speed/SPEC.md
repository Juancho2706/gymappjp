# SPEC — T2.6 Velocidad de autoria del coach

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 2, tarea T2.6.
- **Antecedentes directos:** [nutrition-food-overrides](../nutrition-food-overrides/SPEC.md) (T2.1, patron de tabla coach-keyed) y [nutrition-exchange-swap](../nutrition-exchange-swap/SPEC.md) (T2.5, en produccion).
- **Rama de trabajo:** `rnmobiledenuevo`.
- **Alcance:** web (PWA) **y** React Native Android. Cero dependencias nuevas.
- **Auditoria de estado real:** 2026-08-12 contra HEAD (lecturas de codigo citadas con archivo:linea).
- **Decisiones del dueño:** 2026-08-12, D1 y D2 mas abajo.

## Por que existe esta SPEC

T2.6 es la unica tanda de la Ola 2 que no toca lo que ve el alumno: ataca el tiempo que el coach
gasta armando un plan. El enunciado del programa la resume en cuatro piezas, y la auditoria contra
HEAD mostro que **el enunciado esta desfasado del codigo en dos de ellas**. Esta SPEC parte del
codigo, no del enunciado.

## Estado real hoy (auditoria 2026-08-12)

| Pieza | Que dice el enunciado | Que hay en HEAD |
|---|---|---|
| Porcion pegajosa | "ultima cantidad por coach+food y por alumno+food" | No existe nada. `ADD_ITEM` precarga `food.servingSize` / `servingUnit` (`_lib/draft-builder.ts:849-856`). El coach reescribe la misma cantidad cada vez. |
| Copy semana | "quick-select prox 1/2/4 + toggle reemplazar" | Existen los presets **Lu a Vi / Fin de semana / Todos** (`_lib/copy-presets.ts`), que MARCAN seleccion sin ejecutar. No hay quick-select relativo (proximos N) ni toggle: la copia **siempre reemplaza**, y los destinos ocupados solo se confirman (`_components/DayPlanStrip.tsx:163-190`). |
| Gramatica destructiva | "undo en todo, muere el confirm del wizard-delete-slot" | `ItemRow` ya es optimista + Deshacer (`_components/ItemRow.tsx:100`), y el reducer tiene `RESTORE_ITEM`. El confirm **no vive en el wizard: vive en quick-edit** (`_quick-edit/EditableSlotCard.tsx:237-243`). En el wizard es peor: `SlotEditor.tsx:135-139` dispara `REMOVE_SLOT` en el acto, **sin confirm y sin undo**, y no existe `RESTORE_SLOT`. |
| Notas visibles en wizard | "campo notas visibles en wizard" | `visibleNotes` **ya viaja** en el estado del draft y en `assembleDraft` (tests en `_lib/draft-builder.test.ts:327-335`); falta unicamente el campo en la UI. Deuda heredada: "Rehacer" resetea `visible_notes` (PR #174). |

Consecuencia de alcance: la pieza de gramatica destructiva **no es borrar un confirm**, es agregar
undo de franja en el wizard y despues alinear quick-edit al mismo gesto.

## Decisiones del dueño

**D1 — La porcion pegajosa se guarda en una tabla nueva `coach_food_last_qty`.** Se descarto
derivarla de los planes ya publicados (no recordaria lo tipeado en un borrador sin publicar) y
descarto `localStorage` (no cruza equipo ni llega al movil). Implica DDL aditiva en LIVE con el
protocolo de `AGENTS.md`: tx-rollback antes, advisors despues, grants por columna, RLS.

**D2 — "Anexar" suma franjas y no pisa.** Reemplazar deja el destino igual al origen (lo de hoy);
anexar AGREGA las franjas del origen a lo que el destino ya tiene. Copiar dos veces puede dejar
franjas repetidas: se avisa ANTES, en el mismo menu, con el conteo exacto.

## Alcance

### 1. Porcion pegajosa

Al elegir un alimento, la cantidad precargada deja de ser el `servingSize` del catalogo y pasa a
ser **la ultima cantidad que ese coach uso para ese alimento**, con precedencia:

1. ultima cantidad para **(coach, alumno, alimento)**;
2. si no hay, ultima para **(coach, alimento)**;
3. si no hay, `servingSize` del catalogo (comportamiento actual, intacto).

La memoria se escribe cuando el coach **fija** la cantidad (blur / commit del campo), no en cada
tecla. Se guarda cantidad + unidad juntas: una cantidad sin su unidad no significa nada.

Regla dura: la porcion pegajosa **sugiere, nunca decide**. No cambia items ya escritos, no toca
planes publicados, no participa del freeze ni del snapshot.

### 2. Copy semana

- **Quick-select relativo**: "proximos 1 / 2 / 4" resuelto desde el dia de origen, ademas de los
  tres presets existentes. Sigue MARCANDO la seleccion; la copia la ejecuta la CTA de siempre.
- **Toggle reemplazar / anexar** (D2) con el conteo explicito de que pasa en cada destino antes de
  confirmar ("2 dias quedan iguales al origen" / "2 dias suman 3 franjas").
- Ambas cosas son decision PURA (modulo sin React, con tests) y se consumen igual desde el menu del
  dia (`DayPlanStrip`) y el de la franja (`CopySlotMenu`), como ya hace `copy-presets.ts`.

### 3. Gramatica destructiva unificada

Un solo gesto en todo el modulo: **la accion ocurre, y hay Deshacer por 5-8 s**. Cero confirms.

- Wizard: `REMOVE_SLOT` pasa a optimista + Deshacer; el reducer suma `RESTORE_SLOT` (espejo exacto
  de `RESTORE_ITEM`, restituyendo la franja **en su indice original**).
- Quick-edit: muere `confirmingDelete`; la fila usa el mismo Deshacer.
- Inventario de gestos destructivos del modulo y su estado se lleva en TASKS.

### 4. Notas visibles en el wizard

Campo de notas visibles en el paso del plan, espejo del de quick-edit (mismo limite, mismo copy,
mismo destino `visibleNotes` del draft). Se arregla en la misma tanda la deuda de PR #174:
"Rehacer" no puede resetear `visible_notes`.

## Fuera de alcance

- Editor unico (O3, T3.x) y plantillas auto-escaladas.
- Cualquier cambio en el read model del alumno, en el freeze o en la publicacion.
- Nutricion V1: **deprecada** (decision del dueño 2026-08-12). No recibe ninguna de estas mejoras.
- iOS: nada hasta veredicto de Apple (runbook del programa padre).

## Contrato de datos (D1)

Tabla `public.coach_food_last_qty`, aditiva, forward-only, modelada sobre
`coach_food_overrides` (`supabase/migrations/20260807220000_coach_food_overrides.sql`):

- `coach_id` → `coaches(id)` on delete cascade. **Jamas viene del payload**: se deriva del actor.
- `food_id` → `foods(id)` on delete cascade.
- `client_id` → `clients(id)` on delete cascade, **nullable**: `null` = memoria del coach para ese
  alimento; con valor = memoria para ese alumno. Las dos filas conviven y la lectura las ordena por
  precedencia.
- `quantity numeric not null`, `unit text not null` (mismo dominio que el builder).
- `updated_at timestamptz not null default now()`.
- Unicidad `(coach_id, food_id, client_id)` **con `nulls not distinct`** — a diferencia de
  `coach_food_overrides`, aca el NULL es un valor con significado y sin esa clausula Postgres
  permitiria filas duplicadas de la memoria "solo coach".
- Check de rango en `quantity` (> 0 y <= 9999): es una sugerencia, no debe poder envenenar la UI.
- RLS `to authenticated`, sin `force row level security` (misma leccion que T2.1). Grants por
  columna en toda columna user-editable.
- Sin `archive_gate_*`: es tabla coach-keyed (regla 4 del programa padre).

## Riesgos

1. **La memoria sugiere una cantidad absurda** (el coach tipeo 500 g una vez). Mitigado por el
   check de rango y porque el valor es visible y editable antes de guardar nada.
2. **Escritura ruidosa**: si se escribe en cada tecla, es un write por pulsacion. Por eso se escribe
   en el commit del campo, y con `on conflict do update` (una fila por combinacion, no un log).
3. **Undo de franja mal restituido**: restaurar al final de la lista en vez de a su indice se ve
   como un bug. Por eso `RESTORE_SLOT` lleva indice, igual que `RESTORE_ITEM`.
4. **Anexar duplica franjas** (D2). Mitigado con el aviso previo y el conteo exacto.

## Criterios de aceptacion

- Agregar un alimento ya usado precarga la ultima cantidad **de ese alumno**; si nunca se uso con
  ese alumno, la del coach; si nunca, el `servingSize` del catalogo. Verificado en DB.
- El menu de copia ofrece "proximos 1 / 2 / 4" y el toggle, y el conteo previo dice la verdad en
  ambos modos. Cubierto por tests del modulo puro.
- Ningun gesto destructivo del modulo pide confirmacion; todos ofrecen Deshacer, incluida la franja
  del wizard, que vuelve a su posicion original.
- El wizard tiene campo de notas visibles y "Rehacer" ya no lo resetea.
- Paridad RN de lo que aplique al builder movil, o la ausencia queda declarada en
  `docs/status/MOBILE_PARITY.md`.
- Gates reales del programa padre, con evidencia.
