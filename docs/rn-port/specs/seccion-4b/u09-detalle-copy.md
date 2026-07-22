# 4B-09 — Ficha del coach V2: copy, upsell e ilustración del empty-state (+ gap del banner "plan convertido")

Archivos RN: `apps/mobile/app/coach/nutrition-v2/[clientId].tsx` (post-4B-08 — este archivo YA
tiene asignar/archivar de 4B-08 montados; esta unidad SOLO ajusta copy/upsell/ilustración y evalúa
D-08) + `apps/mobile/lib/nutrition-v2-pro.ts` (solo el copy del banner de upsell, deuda de 4B-16 —
ver D-06). Unidad SECUENCIAL tras 4B-08 (mismo archivo → nunca en la misma wave; INVENTARIO §7).

Referencia web:
`apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx` (RSC),
`_lib/nutrition-pro.ts:32-38` (module key + `NUTRITION_PRO_UPGRADE_HREF`),
`_components/ConvertedPlanBanner.tsx:6,26-58` (banner descartable),
`_quick-edit/QuickEditEntry.tsx:60-85` (CTA de header),
`@/services/nutrition-v2-read.service.ts:170-201` (`getNutritionConversionLinkForWeb`).

## Contexto (canónico V2, decisiones owner)

El detalle RN es una superficie viva y en gran parte a paridad (INVENTARIO §1). Esta unidad NO
reabre las acciones de 4B-08 (asignar/archivar) ni el quick-edit interno (builder). Ataca los
deltas de **copy/upsell/ilustración/jerarquía** (D-01/D-02/D-05/D-06/D-07/D-09) y **verifica el
gap de datos** del banner "plan convertido" (D-08). Regla owner 4 (RN-extras estricto): los dos
RN-extras benignos del historial se documentan, no se retiran (INVENTARIO §4).

## Afirmaciones y deltas (verificados abriendo AMBOS lados)

1. **D-01 — Jerarquía de la CTA de edición: PARIDAD de capacidad/copy/prioridad; placement es
   adaptación nativa sancionada (SIN cambio).**
   Web: la CTA vive en el slot `actions` del header (`page.tsx:150-170`). Con plan →
   `QuickEditEntry` (`QuickEditEntry.tsx:60-69` botón primario icono lápiz `bg-primary`, label en
   `aria`/`title`; `:70-85` dropdown "..." con el camino secundario "Rehacer con el asistente",
   `Wand2`). Sin plan → link "Crear plan" (`page.tsx:162-168`). Copys `QE_COPY.enter='Editar plan'`,
   `QE_COPY.redo='Rehacer con el asistente'`.
   RN: sin CTA en el header (solo back + `NutritionHeader`, `[clientId].tsx:340-357`). "Editar plan"
   es un `NutritionMotionButton` DENTRO de la card "Plan vigente" (`[clientId].tsx:438-444`,
   `QUICK_EDIT_COPY.enter`). "Rehacer con el asistente" es un botón al final del scroll
   (`[clientId].tsx:594-600`, `QUICK_EDIT_COPY.redo`, `tone="neutral"`).
   **Verificado:** los copys son IDÉNTICOS (`microcopy.ts:8-9` = `QE_COPY`), la prioridad (editar
   primario / redo secundario) se preserva y ambos citan el mismo diseño §1.2.A
   (`QuickEditEntry.tsx:4`, `[clientId].tsx:592-593`).
   **Delta:** ninguno accionable. RN no tiene el slot `actions` del header de `NutritionPageShell`;
   "Editar plan" vive contextual en la card que edita y el redo se demueve al fondo con `tone`
   neutral (que ya lo de-enfatiza pese a ser full-width vs el dropdown web). **SANCIONAR como
   adaptación nativa; NO cambiar.**
   Cierre: documentar el placement como adaptación legítima; capacidad y copy a paridad.

2. **D-02 — Nota profesional aside→card inline: orden relativo YA alineado (afirmación del informe
   STALE).**
   Web: la nota vive en la columna `aside` de `NutritionPageShell` (`page.tsx:171-182`,
   `NutritionCard tone="neutral"`). RN: card en el flujo, colocada DESPUÉS de "Estructura
   prescrita" y ANTES de "Últimos días" (`[clientId].tsx:508-517`).
   **Verificado:** el informe afirmó "nota antes del historial en web, después en RN"; el código RN
   ACTUAL pone la nota (`:508`) ANTES del historial (`:519`) → el orden relativo YA está alineado.
   La conversión aside→card en columna única es adaptación nativa legítima (RN no tiene rail lateral).
   **Delta:** ninguno de orden. **SANCIONAR.** (El copy de la card lo ataca D-07.)
   Cierre: documentar; el orden nota→historial ya coincide con web.

3. **D-05 — Historial lista (RN) vs grid (web): layout nativo sancionado; composición de la línea
   difiere.**
   Web: grid `sm:grid-cols-2 xl:grid-cols-3` (`page.tsx:352`), una card por día; línea no-legacy
   `` `${day.consumed.calories} kcal · ${day.activeEntryCount} registros` `` en UNA sola línea muted
   con separador "·" (`page.tsx:377-383`).
   RN: lista vertical con `border-b` (`[clientId].tsx:540`); no-legacy parte el dato: izquierda
   `` `${day.activeEntryCount} registros` `` (`[clientId].tsx:562-567`), derecha
   `` `${day.consumed.calories} kcal` `` en `font-mono` alineada a la derecha
   (`[clientId].tsx:579-582`) — sin el join "·". Mismos campos del read-model, distinta composición.
   Header de sección: web "Ultimos dias" sin tildes (`page.tsx:342`), RN "Últimos días" con tildes
   (`[clientId].tsx:520`) — divergencia de tilde (el web es el typo; RN mantiene la ortografía
   correcta del proyecto → NO tocar RN).
   RN-extra benigno: "Sin registros en la ventana disponible." (`[clientId].tsx:534`); web no tiene
   equivalente (grid simplemente vacío). Conservar (decisión owner 4 / INVENTARIO §4).
   **Delta:** la lista vertical es adaptación nativa legítima. La composición kcal-mono-a-la-derecha
   es el patrón que el propio informe describe ("kcal a la derecha en font-mono") y es más escaneable;
   es capability-neutral. **Recomendación: SANCIONAR el patrón nativo (kcal mono a la derecha, sin
   recomponer).** Si el owner exige paridad de copy exacta, la alternativa es recomponer la línea
   RN no-legacy a `"{kcal} kcal · {N} registros"` en una sola línea; documentar la elección.
   Cierre: documentar el layout de lista + kcal-mono-derecha como sancionado; header RN queda
   "Últimos días" (tildes correctas); el RN-extra del historial vacío se conserva.

4. **D-06 — Upsell Pro: la RUTA `/coach/modules` es el equivalente nativo correcto (SANCIONAR); el
   COPY es deuda de 4B-16 (NO tocar aquí).**
   Web: `Link href={NUTRITION_PRO_UPGRADE_HREF}` = `/coach/subscription` (`page.tsx:344-350`,
   `_lib/nutrition-pro.ts:38`), copy inline "Historico completo con Nutricion Pro" (`page.tsx:349`,
   sin tildes).
   RN: `router.push('/coach/modules')` (`[clientId].tsx:525`), copy
   `NUTRITION_PRO_HISTORY_BANNER_LABEL='Histórico completo con Nutrición Pro'`
   (`lib/nutrition-v2-pro.ts:23`, con tildes).
   **Verificado (ruta):** RN NO tiene pantalla propia `/coach/subscription` (solo
   `(tabs)/subscription.tsx`, un webview a la web); el addon Pro de nutrición es el MÓDULO
   `nutrition_exchanges`, y TODO upsell de módulo de nutrición en RN aterriza en `/coach/modules`
   (`[clientId].tsx:525`, `builder/[clientId].tsx:1175`, `ProgresoTab.tsx:759`). Es el patrón nativo
   consistente (comprar el addon puntual); web va a `/coach/subscription` porque en la web los
   módulos vienen incluidos en los planes. **La ruta RN `/coach/modules` es correcta y consistente
   → SANCIONAR, NO cambiar a `/coach/subscription`.** Documentar como divergencia de plataforma.
   **Verificado (copy):** la divergencia de tildes ("Historico"/"Nutricion" web vs
   "Histórico"/"Nutrición" RN) es exactamente la deuda de consolidación del subconjunto puro
   `nutrition-pro` en `@eva/nutrition-v2` (INVENTARIO §6 P0-1 / 4B-16). **Por instrucción del owner:
   NO duplicar el fix aquí; dejar el copy local (`lib/nutrition-v2-pro.ts:23`) como está.**
   **Delta:** ninguno accionable en 4B-09 (ruta sancionada, copy deferido a 4B-16).
   Cierre: documentar ruta nativa `/coach/modules` como sancionada; copy sin tocar (deuda 4B-16).

5. **D-07 — Copy de la nota privada: divergencia de PALABRA (real) + tilde.**
   Web (`page.tsx:178,180`): "Sin nota privada para la version vigente." + "El alumno no recibe esta
   informacion." RN (`[clientId].tsx:514,516`): "Sin nota privada para la versión vigente." + "El
   alumno no recibe este contenido."
   **Verificado:** dos diferencias — (a) "versión"(RN, tilde) vs "version"(web, typo sin tilde);
   (b) **"este contenido"(RN) vs "esta informacion"(web) → diferencia de palabra real.**
   **Delta:** alinear el TÉRMINO de la 2ª línea a web ("informacion", no "contenido"), conservando la
   ortografía correcta del proyecto (regla global "tildes sí"): dejar la card RN como
   "Sin nota privada para la versión vigente." + "El alumno no recibe esta **información**." El typo
   web "version"/"informacion" queda como deuda menor del lado web (fuera de alcance RN-only). Si el
   owner exige verbatim del web, copiar los strings web tal cual (sin tildes); recomendación:
   unificar la palabra manteniendo tildes correctas.
   Cierre: RN dice "…no recibe esta información." (palabra alineada a web + tildes correctas).

6. **D-08 — Banner "plan convertido" V1→V2 (AC8): GAP DE DATOS confirmado — el conversion link NO
   viaja al RN.**
   Web: lee el link vía un servicio SEPARADO `getNutritionConversionLinkForWeb({ v2PlanId:
   activePlan.id })` (`page.tsx:130-131`) contra la tabla `nutrition_v2_conversion_links` (RLS
   `coach_id=auth.uid()`, `nutrition-v2-read.service.ts:170-201`) — **NO** sale del read-model del
   detalle. Devuelve `{ convertedAt }` o `null` (fail-soft si la tabla no existe/falla,
   `:191-200`). Render: `ConvertedPlanBanner planId convertedAtLabel` (`page.tsx:215-217`),
   descartable client-side en `localStorage` por planId
   (`eva:nutrition-v2-converted-plan-banner-dismissed:{planId}`, `ConvertedPlanBanner.tsx:6,26-46`),
   copy "Plan convertido del sistema anterior el {fecha} — revísalo cuando quieras."
   (`ConvertedPlanBanner.tsx:54-58`); fecha vía `formatDateDdMmYyyySantiago` (`page.tsx:133`).
   RN: INEXISTENTE. **Gap verificado, la data NO llega:** (i) el read-model compartido
   `NutritionClientDetailReadModel` NO transporta el link (web tampoco lo saca de ahí); (ii)
   `getNutritionClientDetailV2` (`lib/nutrition-v2.api.ts`) devuelve solo el read-model; (iii) el
   endpoint móvil coach `/api/mobile/nutrition-v2/coach` (GET read-only, hub/client) NO consulta
   `nutrition_v2_conversion_links` (grep sin resultados); (iv) cero referencias a "conversion" en
   `apps/mobile/lib`.
   **Delta (NET-NEW, único que exige una nueva ruta de datos):** portar D-08 requiere en RN
   (1) un read RLS-scoped espejo de `getNutritionConversionLinkForWeb` — RN lee directo con el
   cliente supabase de sesión (mismo camino autoritativo que 4B-08, la RLS de la tabla scopea a
   `coach_id=auth.uid()`); **OJO:** la tabla aún NO está en `database.types.ts` (migración
   `20260717120000` aplicada, types sin regen), así que web usa un cast manual `ConversionLinkClient`
   (`read.service.ts:154-168`) → RN replicaría el cast; (2) un banner descartable con
   `AsyncStorage` (MISMA convención de key por planId) + copy verbatim + icono `History`;
   (3) un formato de fecha DD/MM/YYYY Santiago equivalente a `formatDateDdMmYyyySantiago`.
   **Recomendación:** Fase 1 es SOLO informativa (sin botón regenerar; el re-sync es por CLI), y es
   el único delta con costo de nueva query. **Confirmar con owner si entra en 4B-09 o se difiere**
   (INVENTARIO §7 unit-3, tamaño M). Si entra: portar el read espejo (cast manual) + banner
   AsyncStorage descartable. Si no: documentar el gap y dejarlo fuera hasta regen de types /
   decisión owner.
   Cierre: gap documentado con mecanismo de port; la inclusión la decide el owner/juez (no bloquea
   el resto de 4B-09).

7. **D-09 — Empty-state "Sin plan vigente" sin ilustración: FALTA una sola prop (ilustración YA
   disponible en RN).**
   Web: `NutritionStatePanel illustration="sin-plan"` (`page.tsx:198-199`), título "Sin plan
   vigente", desc "Crea y publica un plan para revisar objetivos y adherencia.", CTA "Crear plan".
   RN: `NutritionStatePanel` SIN prop `illustration` (`[clientId].tsx:391-402`); título, descripción
   y CTA IDÉNTICOS a web (copys ya a paridad).
   **Verificado (afirmación del informe STALE):** la ilustración YA está portada a RN —
   `sin-plan.webp`(+`@2x`) está en `apps/mobile/assets/illustrations/`; `'sin-plan'` es miembro
   válido de `NutritionIllustration` (`state-illustration.tsx:29,39,75`); `NutritionStatePanel`
   acepta `illustration` y renderiza `StateIllustration` (`NutritionV2Kit.tsx:652,664,687-690`); el
   uso documentado exacto es `NutritionStatePanel illustration="sin-plan"` (`state-illustration.tsx:20`).
   **Delta:** cambio TRIVIAL — añadir `illustration="sin-plan"` al `NutritionStatePanel` de
   `[clientId].tsx:391`. Nada más (copys ya idénticos).
   Cierre: empty-state con ilustración `sin-plan` 1:1 con web.

## Cierre (qué debe quedar)

- `app/coach/nutrition-v2/[clientId].tsx`:
  - **D-07 (accionable):** card "Nota profesional" → 2ª línea "El alumno no recibe esta **información**."
    (palabra alineada a web, tildes correctas).
  - **D-09 (accionable):** `NutritionStatePanel` del empty-state → añadir `illustration="sin-plan"`.
  - **D-01/D-02/D-05/D-06 (documentar, sin cambio):** placement de CTA (header web vs card+fondo RN),
    nota aside→card (orden ya alineado), historial lista + kcal-mono-derecha, ruta upsell
    `/coach/modules` — todo sancionado como adaptación/consistencia nativa.
  - **D-08 (condicional):** si el owner lo aprueba, montar el banner "plan convertido" descartable
    (read RLS-scoped espejo + `AsyncStorage` + fecha DD/MM/YYYY); si no, queda documentado el gap.
- `lib/nutrition-v2-pro.ts`: **intacto** — el copy del banner (tildes) es deuda de 4B-16; no se toca.
- 4B-08 (asignar/archivar): **intacto** — fuera del alcance de esta unidad.

## Comprobación objetiva

Con flag ON y un alumno con plan vigente: la card "Nota profesional" sin nota dice "El alumno no
recibe esta información." (palabra alineada a web). Con un alumno SIN plan, el empty-state muestra la
ilustración `sin-plan` (1:1 con web), mismo título/descripción/CTA "Crear plan". El upsell de
historial (coach sin addon Pro) navega a `/coach/modules` (equivalente nativo del `/coach/subscription`
web) — divergencia de plataforma documentada, no bug. El historial se ve como lista vertical con
"{N} registros" a la izquierda y kcal en `font-mono` a la derecha (adaptación nativa sancionada). La
jerarquía de edición (Editar plan primario en la card / Rehacer con el asistente secundario al fondo)
conserva copy y prioridad de web. Para D-08: verificar que el conversion link NO llega en el
read-model/API RN (confirmado) — el banner solo aparece si se porta el read espejo aprobado por el
owner; sin él, no se renderiza (paridad con el fail-soft `null` de web). Comparar captura web-móvil
(ficha del Centro V2) vs RN: empty-state con ilustración, nota profesional, upsell e historial.
Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, lint, `check:tokens`,
`check:nutrition-v2-boundaries`.
