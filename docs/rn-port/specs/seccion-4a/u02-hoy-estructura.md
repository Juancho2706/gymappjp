# 4A-02 — Vista Hoy: estructura, badges, CTAs, franjas y consumido

Archivos RN de la unidad: `apps/mobile/app/alumno/nutrition-v2/index.tsx` (bloques `TodayTab`,
`TodaySlotCard`, `UnassignedCard`; el shell/tab-bar es de 4A-05 y los diálogos de 4A-06 — misma
restricción de archivo: 4A-02/03/04/05/06 comparten `index.tsx`, waves separadas).

Referencia web: `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/TodayExperience.tsx` +
`page.tsx:142-187` + `_components/nutrition-today.logic.ts`.

## Orden vertical web (fuente de verdad)

`TodayExperience.tsx:183-418`: (1) fila de badges → (2) AuraHero → (3) PortionCoverageRow →
(4) banner de error → (5) fila de CTAs → (6) sección "Tu plan de hoy" → (7) sección "Consumido hoy" →
diálogos/sheets. Antes del árbol, `page.tsx:172-177` inserta el banner de lag de plan.

## Afirmaciones y deltas

1. **Fila de badges + chip "Día registrado".**
   Web `TodayExperience.tsx:185-200`: `StrategyBadge` + `PlanVersionBadge` (con
   `effectiveLabel="desde {fecha}"`) y, si `today.snapshotId`, chip esmeralda
   `border-emerald-300/60 bg-emerald-50 text-emerald-800` (dark `emerald-950/30 / emerald-300`) con
   `CheckCircle2` y texto "Día registrado".
   RN `index.tsx:726-735`: badges sí; chip "Día registrado" NO existe. **Delta.**
   Cierre: chip presente con `snapshotId`, tono success (mapa RN del canvas esmeralda ya usado por el kit).

2. **Subtítulo + chip de sincronización RN-extra.**
   RN `index.tsx:718-724` muestra la fila "Tu consumo real frente al snapshot del día." + `SyncOfflineState`.
   Web no tiene ese texto (la descripción vive en el header del shell, `page.tsx:64`) ni chip de sync en el Hoy.
   **Delta RN-extra.** Cierre: se elimina el subtítulo; el estado offline/pending se conserva SOLO como
   adaptación documentada de la cola offline nativa (chip visible únicamente cuando offline o pending>0,
   nunca en estado synced — hoy ya es así; escribir la justificación en el spec residual).

3. **Banner de lag de plan.**
   Web `page.tsx:164-177`: si `today.plan === null || today.plan.id !== plan.plan.id` → banner Info
   (`rounded-control border-border-subtle bg-surface-sunken`, icono `Info` muted) con dos copys exactos
   (líneas 166-168). RN: no existe (TodayTab no consulta el plan vigente). **Delta funcional.**
   Cierre: RN fetchea el plan vigente (API `getNutritionPlanV2` ya existe) y reproduce banner + ambos copys.

4. **Estado sin plan publicado.**
   Web `page.tsx:153-162`: sin plan vigente la vista Hoy COMPLETA se reemplaza por `NutritionStatePanel`
   con ilustración `sin-plan`, título "Tu plan todavía no está publicado" y descripción exacta.
   RN `index.tsx:795-800`: muestra hero + CTAs y un panel al final con otro copy. **Delta.**
   Cierre: mismo comportamiento y copy que web (la ilustración depende de 4A-07 kit; si aún no está,
   panel sin ilustración con copy correcto y nota).

5. **Fila de CTAs: Registrar + Escanear + Compartir.**
   Web `TodayExperience.tsx:228-248`: una fila `flex flex-wrap gap-2` con
   (a) `NutritionMotionButton` primario "Registrar alimento" con icono `Plus`;
   (b) link "Escanear" con `ScanBarcode`, estilo botón neutral (`border-border-default bg-surface-card`);
   (c) botón "Compartir" con `Share2`, mismo estilo neutral.
   RN `index.tsx:787-793`: dos botones apilados full-width, "+ Registrar alimento" y "Compartir mi día",
   al FINAL de la lista; el scanner NO tiene CTA en el Hoy (solo dentro de add-food). **Delta.**
   Cierre: fila de 3 CTAs bajo el error banner/coverage row, mismos íconos (lucide RN), copys web exactos
   ("Registrar alimento", "Escanear", "Compartir"), posición idéntica (antes de "Tu plan de hoy").

6. **Sección "Tu plan de hoy" (franjas con prescripción).**
   Web `TodayExperience.tsx:561-640`: heading `h2` "Tu plan de hoy" (font-display text-lg semibold);
   una `NutritionCard` por franja de `slotsWithPrescribedContent(today)` (`portion-marks.logic.ts:357-363`:
   items fijos O targets de porciones); header interno = nombre franja (text-base font-display) + hora en
   `font-mono text-xs text-muted`; filas `NutritionFoodRow` con nota del ítem (`item.notes`) y
   `quantityLabel = "{quantity} {unit}[ · opcional]"`; acción por ítem: si YA consumido
   (`isPrescriptionConsumed`, `nutrition-today.logic.ts:62-64`) → check esmeralda "Registrado";
   si no → botón `tone="success"` "Lo comí" (testid `nutrition-v2-lo-comi`) con pending por ítem.
   RN `TodaySlotCard` (`index.tsx:844-981`): NO hay heading de sección; lista TODAS las franjas
   (`model.mealSlots.map`, línea 756) aunque no tengan prescripción ni targets; agrega badge
   Consumido/Esperado/Sin registros y subtotal kcal (no existen en el Hoy web — son del `MealSlotCard`
   del kit que TodayExperience NO usa); botón "Comí" `tone="nutrition"` SIEMPRE visible (sin estado
   "Registrado"); sub-encabezados "Prescrito"/"Consumido"; botón "+ Registrar en {slot}" por franja
   (no existe en web); hora sin font-mono. **Delta estructural mayor.**
   Cierre elemento por elemento:
   - heading "Tu plan de hoy" presente;
   - solo franjas de `slotsWithPrescribedContent` (helper compartible desde `@eva/nutrition-v2` o copia RN con test);
   - sin badges de estado, sin subtotal, sin sub-encabezados, sin CTA por franja;
   - "Lo comí" `tone success`, pending por ítem, y estado "Registrado" (check esmeralda) cuando
     `entry.prescriptionItemId === item.id` exista en los registros del día;
   - nota del ítem visible; hora en mono.

7. **Sección "Consumido hoy" agregada (no por franja).**
   Web `TodayExperience.tsx:274-323`: heading con icono `Utensils text-primary` + "Consumido hoy";
   vacío → StatePanel "Todavía no registras alimentos" + descripción exacta (líneas 281-283);
   con datos → UNA `NutritionCard` con TODOS los registros activos ordenados por hora
   (`consumedEntries`, `nutrition-today.logic.ts:55-59`), cada fila con `statusLabel="Corregido"` si
   corresponde y DOS icon-buttons: lápiz "Editar cantidad" y papelera "Retirar registro"
   (tono danger, `TodayExperience.tsx:300-316`, `IconButton` 531-559).
   RN: los consumidos viven DENTRO de cada franja + card "Sin franja" (`UnassignedCard`,
   `index.tsx:983-1023`) con un único botón "Editar". **Delta estructural mayor.**
   Cierre: sección única "Consumido hoy" bajo "Tu plan de hoy", orden por `occurredAt`, fila con
   acciones lápiz/papelera (icon buttons con `hitSlop`; tono danger en retirar), empty state web.

8. **Banner de error de mutación.**
   Web `TodayExperience.tsx:216-225`: errores del server (humanizados con `humanizeStudentWriteError`)
   pintan banner rosa (`border-rose-300/60 bg-rose-50 text-rose-800` + dark) con `AlertTriangle`,
   `aria-live="assertive"`, ubicado entre coverage row y CTAs; dentro de diálogos va `DialogError`
   (427-439). RN usa `Alert.alert` nativo (`index.tsx:383,415,477`). **Adaptación a documentar + delta
   de copy**: web humaniza `COACH_ACCOUNT_PAUSED` etc.; RN muestra `outcome.error.message` crudo.
   Cierre: mínimo, RN humaniza el mensaje (mismo helper/copys que web) y el residuo `Alert` vs banner
   queda escrito como adaptación (o se porta el banner inline, preferido por paridad).

9. **Optimismo y refresco.** Web: sin overlay optimista para intake (espera server + `router.refresh()`,
   `TodayExperience.tsx:104-132`); RN: overlay optimista + cola offline (`index.tsx:118-330`).
   Adaptación nativa legítima YA sancionada (offline-first) — se conserva, se documenta; el efecto
   visible (fila "Guardando"/"Sin sincronizar" via `FoodRow.status`) usa los labels del kit que web
   también define (`NutritionV2Kit.tsx` web:309). En paridad de contrato.

10. **Pie "Registro del día · {fecha}".** RN `index.tsx:802-804` — no existe en web. **Delta RN-extra.**
    Cierre: eliminar (o mover la fecha al lugar donde web la muestra: no la muestra).

## Comprobación objetiva

Screenshot RN vs web móvil (<760px) del Hoy con: plan con 2 franjas + 1 registro sin franja + 1 ítem
consumido + 1 corregido. Checklist: orden vertical (badges→hero→porciones→CTAs→plan→consumido),
chip "Día registrado", banner lag, copys exactos ("Lo comí", "Registrado", "Consumido hoy",
"Todavía no registras alimentos"), acciones lápiz/papelera, cero badges por franja, cero botón por franja.
