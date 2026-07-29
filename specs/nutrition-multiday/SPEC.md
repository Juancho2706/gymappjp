# SPEC — Multi-dia en Nutricion V2 (variantes por dia de semana)

Fecha: 2026-07-28 · Origen: pedido de coach real (Dudu) + verificacion `D:\tmp\dudu-a-multidia.md` · Plan visual: artifact "Plan: Multi-dia + Porciones propias".

## Problema

El backend V2 soporta N variantes de dia por version (`nutrition_day_variants_v2` con `day_of_week` 0-6 + default unico, snapshot que elige por fecha, contratos `min(1)` sin tope, persistencia que itera N, gate Pro `multi_variant` ya cobrando), pero **ninguna superficie de creacion puede producirlas**: los builders web y RN hardcodean `dayVariants: [variant]` y el quick-edit no tiene `ADD_VARIANT`. Un coach no puede armar "dia de semana vs fin de semana".

## Modelo funcional

- Un plan = 1 dia base ("Todos los dias", `is_default`) + 0..7 dias especificos (1 variante = 1 `day_of_week`).
- Resolucion (ya en prod): match exacto de dow gana; sin match cae al base. El dia del alumno queda congelado en su snapshot.
- Cada dia tiene sus propias franjas/items/porciones Y sus propias metas de macros. Metas de dia especifico: heredan el base salvo personalizacion explicita.
- Crear dia = multi-select de dias (ej. Sa+Do) clonando el contenido del base (opcion secundaria: vacio). Edicion posterior por dia.
- Gating: >1 variante = Pro `multi_variant` (enforcement server-side ya existe). Coach BASE ve el CTA con candado + upsell; el server rechaza igual.

## UX por superficie (diseno cerrado, ver mockups del artifact)

1. **Builder web** — sin paso nuevo: barra de chips de dias arriba de las franjas en Construccion (chip = label + kcal; activo = dia en edicion). Popover "Agregar dia": selector Lu-Do multi-select (dias ocupados deshabilitados) + origen copiar/vacio. Menu ⋯ por chip: Renombrar · Cambiar dia · Duplicar como otro dia · Personalizar objetivos · Eliminar (base no se elimina ni cambia de dia). Banner de herencia de metas con "Personalizar". Revisar agrupa por dia y resalta diferencias vs base.
2. **Builder RN** — espejo con chips horizontales scrolleables + sheet nativo.
3. **Quick-edit web+RN** — boton "Agregar dia" + menu por dia (Cambiar dia / Eliminar). Todo lo demas ya es por-variante.
4. **Alumno web+RN** — badge en Hoy solo si >1 variante: "Hoy: plan de {label} · {kcal}"; en Plan, tira Lu-Do por card con highlight "hoy".
5. **Ficha coach web+RN** — cards por variante con tira de dias y "hoy aplica".

## Restricciones tecnicas

- **0 migraciones.** No tocar RPC, read models, RLS ni grants.
- `BuilderState` web/RN pasa de `slots[]` a `variants[]`; autosave `draftKey` versionado con migrador (drafts guardados de coaches no se pierden).
- Rehidratacion completa desde `detail.plan.dayVariants` al entrar a "Rehacer" (el guard anti-colapso actual se reemplaza por rehidratacion real).
- Claves de porciones por `variantKey:slotKey` (hoy colisionarian entre dias homonimos).
- Invariantes: exactamente una variante default; `day_of_week` unico entre no-default; server ya exige >=1 variante al publicar.

## Fuera de alcance (F2 futura)

Agrupar dias que comparten edicion ("finde" como bucket unico), copiar variantes entre planes, tope de kcal diferencial automatico.

## Criterio de aceptacion

- Coach Pro crea Sa+Do clonados, ajusta almuerzo del sabado, publica; el alumno ve el sabado la variante correcta y el badge "Hoy: plan de Sabado".
- "Rehacer" sobre plan multi-dia rehidrata N dias sin perdida (test).
- Coach BASE recibe upsell al segundo dia y el server rechaza `UPGRADE_REQUIRED` (test existente).
- Gates: vitest + tsc web/mobile + lint + boundaries verdes.
