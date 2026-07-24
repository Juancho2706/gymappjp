# 4A-03 — Vista Plan (solo lectura)

Archivos RN: `apps/mobile/app/alumno/nutrition-v2/index.tsx` (bloques `PlanTab`, `PlanObjectives`,
`PlanRulesCard`, `PlanVariantCard`). Comparte archivo con 4A-02/04/05/06 → wave separada.
Referencia web: `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:193-416`.

## Afirmaciones y deltas

1. **Card de encabezado del plan.**
   Web `page.tsx:211-228`: badges → `h2` nombre (`font-display text-2xl font-bold`, mt-4) → vigencia
   (`text-xs text-muted`: "Vigente desde X hasta Y" / "· versión actual") → descripción de estrategia en
   `text-sm leading-6 text-body` → si `plan.visibleNotes`, caja `bg-surface-sunken` DENTRO de la card con
   overline "Notas de tu coach" y texto `whitespace-pre-wrap text-sm`.
   RN `index.tsx:1350-1372`: nombre mt-3; descripción de estrategia en `text-xs text-text-subtle`
   (web: sm/body); las notas viven en una card SEPARADA tone="info" con overline "Protocolo".
   **Deltas:** tamaño/tono de la descripción; notas fuera de la card; overline "Protocolo" vs
   "Notas de tu coach"; falta `whitespace-pre-wrap` equivalente (RN Text lo respeta por defecto — ok).
   Cierre: notas dentro de la card del encabezado, overline "Notas de tu coach", descripción sm/body.

2. **Metas diarias.**
   Web `page.tsx:245-266`: overline "Metas diarias"; grilla `grid-cols-2 sm:grid-cols-3` con `dd`
   (`font-display text-lg font-bold tabular-nums`) + `dt` (`text-xs text-muted`); filas solo para
   valores non-null (Energía, Proteína, Carbohidratos, Grasas, Fibra).
   RN `index.tsx:1383-1404`: overline "Objetivos diarios" (**copy delta**); valores sin `tabular-nums`
   (`fontVariant`); layout flex-wrap min-w-[30%] (≈3 col, aceptable).
   Cierre: overline "Metas diarias", `fontVariant: ['tabular-nums']` en las cifras.

3. **Reglas del plan.** Web `page.tsx:269-297` vs RN `index.tsx:1406-1431`: chips y copys idénticos
   (verificado línea a línea: registro libre, ajuste ±%, intercambios, mover franja, opcionales).
   **En paridad.**

4. **Card por variante de día.**
   Web `page.tsx:300-336`: header label + pill "Por defecto" (`text-[10px]`, `border-primary/30 bg-primary/10`);
   subtítulo "N franjas · X kcal" con `tabular-nums`; si hay >1 variante, `MacroChipRow size="sm"` con los
   targets de la variante (315-325); si `mealSlots.length===0` → copy
   "Plan sin franjas fijas: sigue tus metas diarias y registra lo que comas." (327-330);
   franjas como sub-cards `PlanSlotBlock`.
   RN `index.tsx:1433-1480`: sin `MacroChipRow` de variante (**falta**), sin copy de plan sin franjas
   (**falta**), franjas planas sin sub-card. Pill "Por defecto" en paridad.
   Cierre: los tres elementos presentes.

5. **Bloque de franja (`PlanSlotBlock`).**
   Web `page.tsx:340-402`: sub-card `rounded-control border bg-surface-sunken/40 p-3`; título franja +
   rango horario `startTime–endTime` en `font-mono text-xs`; SUBTOTAL kcal de los items a la derecha
   (`font-mono text-xs font-semibold`, líneas 346,361-363); indicaciones de la franja (`slot.instructions`,
   `text-xs text-subtle`); items como `NutritionFoodRow` con `note = describeItemGuidance(item)`
   (rango ajustable "Ajustable entre X y Y" / "Hasta X" / "Desde X" + notas, líneas 405-416);
   sin items pero con targets → overline "Objetivo de la franja" + `MacroChipRow` (384-396);
   sin items ni targets → "Franja flexible sin alimentos prescritos." (398).
   RN `index.tsx:1448-1476`: franja plana (sin sub-card sunken), solo `startTime` (sin rango ni mono),
   SIN subtotal, SIN "Objetivo de la franja", SIN guía de ítems (`describeItemGuidance`);
   copy de franja flexible sí está. **Deltas múltiples.**
   Cierre: sub-card sunken, rango horario mono, subtotal, objetivo de franja con MacroChipRow,
   nota de guía por ítem (helper portado con test).

6. **Pie "Actualizado {fecha}".** RN `index.tsx:1378` — no existe en web. **Delta RN-extra**; eliminar.

7. **Estados.** Vacío: copys en paridad (`page.tsx:197-201` vs `index.tsx:1325-1334`); falta ilustración
   `sin-plan` (depende de 4A-07). Offline RN con copy propio = adaptación de la cola nativa, documentar.

## Comprobación objetiva

Plan con 2 variantes, franja con rango horario + indicaciones + ítem con min/max + franja solo-targets:
captura web móvil vs RN; verificar subtotales, "Objetivo de la franja", guía "Ajustable entre…",
"Metas diarias", notas del coach dentro del header card.

## Cierre (2026-07-21)

- Deltas 1-6 aplicados: notas del coach dentro de la card del encabezado (overline "Notas de tu coach"),
  descripción `text-sm/leading-6/text-body`, nombre `mt-4`; overline "Metas diarias" + `tabular-nums`;
  variante con `MacroChipRow` cuando hay >1 (`showTargets`), subtítulo `text-sm tabular-nums` y copy de plan
  sin franjas; nuevo `PlanSlotBlock` (sub-card sunken/40, rango horario mono con en-dash, subtotal kcal,
  "Objetivo de la franja" con `MacroChipRow`, guía por ítem).
- Helper `describeItemGuidance` portado 1:1 a `apps/mobile/lib/nutrition-v2-plan.ts` (puro) con test
  `tests/mobile-nutrition-v2-plan.test.ts` (6 casos: min+max, solo max, solo min, notas, rango+notas, null).
- Pie "Actualizado {fecha}" retirado (RN-extra sin contraparte web).
- Copy offline del estado vacío se conserva como adaptación documentada de la cola nativa (delta 7).
