# 4B-05 — HUB paridad (header + CTA global "Nuevo plan" + búsqueda/orden del roster)

Archivos RN: `apps/mobile/app/coach/nutrition-v2/index.tsx` (hub cableado inline por 4B-04),
`apps/mobile/lib/nutrition-v2-hub.ts` (helpers puros del roster + test). El componente
`CoachNutritionV2Screen` se monta INLINE dentro del tab `coach/(tabs)/nutricion.tsx:162` (4B-04),
así que el hub es la RAÍZ del tab, no una pantalla pusheada.
Referencia web: `apps/web/src/app/coach/nutrition-v2/page.tsx:82-105` +
`_components/HubRoster.tsx` + `_components/NewPlanPickerButton.tsx` +
`_lib/hub-roster.ts` + `components/nutrition-v2/NutritionV2Kit.tsx:109-167` (`NutritionPageShell`/
`NutritionHeader`).

Alcance vinculante (`DECISIONES-OWNER.md`): V1 al olvido (decisión 1), RN-extras sin contraparte
web = RETIRAR salvo excepción escrita (decisión 4). Colisiona con 4B-04 en `index.tsx` → wave
secuencial tras SWAP (ya cerrado @ commit `76d8ea2f`). Métricas del hub ya en paridad de lógica
(`mapNutritionHubMetrics` espejo de `mapHubMetrics`) — no se re-especifican.

## Afirmaciones y deltas

1. **Header del shell — eyebrow "Canary privado" (RETIRAR, decisión 4).**
   RN `index.tsx:238-243` monta `NutritionHeader eyebrow="Canary privado"`. El shell web
   NO tiene eyebrow (`page.tsx:86-92` no pasa `eyebrow` a `NutritionPageShell`; el header web
   `NutritionV2Kit.tsx:109-167` solo lo pinta si se le pasa). Es un RN-extra sin contraparte web
   (INVENTARIO §5, "Eyebrow Canary privado: copy RN-only… Retirar al alcanzar paridad de header").
   **Delta:** eliminar `eyebrow="Canary privado"`.
   Cierre: `NutritionHeader` sin `eyebrow`.

2. **Header del shell — descripción (copy delta).**
   Web `page.tsx:90-91`: title `"Centro de Nutrición"`, description
   `"Planes, consumo reciente y alumnos por atender."`.
   RN `index.tsx:240-241`: title `"Centro de Nutrición"` (paridad), description
   `"Planes, actividad y señales de atención por alumno."` (**copy delta**).
   Cierre: description RN = `"Planes, consumo reciente y alumnos por atender."` (verbatim web).

3. **Header del shell — backHref/flecha de volver (adaptación nativa por escrito).**
   Web `page.tsx:88` pasa `backHref="/coach/dashboard"`; `NutritionHeader` web
   (`NutritionV2Kit.tsx:122-149`) con `backHref` pinta la variante compacta con flecha `ArrowLeft`
   que enlaza al dashboard. El `NutritionHeader` RN ya soporta la variante compacta con
   `onBack` (callback imperativo, `NutritionV2Kit.tsx:167-216`, adaptación ya sancionada del
   `backHref` web para navegación de stack).
   **PERO** el hub RN se monta INLINE como raíz del tab (4B-04, `nutricion.tsx:162`): un tab root
   no tiene "atrás" (la cápsula flotante `CoachMobileChrome` es la navegación); el shell V1 RN que
   reemplazó tampoco tenía flecha (`nutricion.tsx:277-311`, solo título + subtítulo). Renderizar
   una flecha a `/coach/dashboard` desde la raíz del tab abandonaría el navegador de tabs (mismo
   riesgo de cápsula perdida que 4B-04 evitó con el render inline).
   **Delta / decisión:** NO cablear `onBack` en el montaje inline (el `backHref` web es un
   affordance de layout de página bajo sidebar sin homólogo 1:1 en un tab root nativo). Documentar
   como adaptación nativa sancionada (espejo de la lógica de 4B-04). Ver Riesgo R1.
   Cierre: header sin flecha en el tab root; adaptación anotada en el código.

4. **CTA global "Nuevo plan" (FALTA por completo).**
   Web `page.tsx:91` pasa `actions={<NewPlanPickerButton roster={pickerRoster} />}`; el botón
   (`NewPlanPickerButton.tsx:49-57`) abre un diálogo buscable con el roster COMPLETO del workspace
   y, al elegir alumno, navega al builder (`:42` `router.push('/coach/nutrition-v2/${clientId}/builder')`).
   El roster del picker lo arma el RSC paginando el hub scoped hasta 8 páginas de 50
   (`page.tsx:56-76`), independiente de la paginación visible del roster.
   RN `index.tsx:242`: `actions={<SyncOfflineState … />}` — **no hay CTA global**; el único CTA de
   plan es por-fila (`index.tsx:329-339`). INVENTARIO §1 ("CTA global Nuevo plan: FALTA el picker
   global") y RANKING 4B-05.
   **Delta:** portar el picker como acción del header:
   - Botón compacto en `actions` (junto al chip offline): icono `Plus` (44px, `aria-label`
     `"Nuevo plan"`); si cabe, texto `"Nuevo plan"` (espejo del colapso responsivo web
     `NewPlanPickerButton.tsx:47-57` icono-solo en ~390px). Tokens: `bg-primary`,
     `text-primary-foreground` / white sobre primary.
   - Al tocar: sheet/modal nativo (reusar `Sheet`/`NativeDialog` del kit RN, patrón del propio
     `nutricion.tsx` V1) con: título `"Nuevo plan de nutrición"`, descripción
     `"Elige el alumno para abrir su builder y crear (o versionar) su plan."`
     (verbatim `NewPlanPickerButton.tsx:62-65`), input de búsqueda `"Buscar alumno…"`, lista de
     alumnos (nombre + pill `planCtaLabel` con icono `FilePlus2` + `ChevronRight`), empty
     `"Sin coincidencias."` y estado sin-roster
     `"No hay alumnos en tu espacio para crear un plan."` (`NewPlanPickerButton.tsx:70-72,111-113`).
   - Roster del picker: cargar el roster COMPLETO del scope (no solo la página visible) paginando
     `getNutritionCoachHubV2` (mismo keyset) hasta un tope (espejo web: 8×50). Mapear a
     `{ clientId, clientName, planStatus }`.
   - Al elegir: navegar al builder RN con la RUTA CORRECTA de segmento (ver afirmación 5).
   Cierre: CTA global "Nuevo plan" en el header con picker buscable → builder, roster completo.

5. **Href del builder — segmento vs query (bug latente del CTA).**
   El helper RN `nutritionV2BuilderHref` (`lib/nutrition-v2-hub.ts:84-86`) devuelve
   `/coach/nutrition-v2/builder?clientId=${clientId}` (query). Pero la ruta del builder RN es
   `app/coach/nutrition-v2/builder/[clientId].tsx` (segmento dinámico; lee `params.clientId` de la
   ruta, `builder/[clientId].tsx:109-110`) y **no existe** `builder/index.tsx` (verificado: la
   carpeta `builder/` solo contiene `[clientId].tsx`). El propio comentario del helper
   (`:83-84`) dice que usó query "para no acoplarse a un segmento dinámico que aún no exista" — el
   segmento YA existe. El CTA por-fila usa este helper (`index.tsx:332`
   `router.push(nutritionV2BuilderHref(item.clientId))`), así que hoy navega a una ruta sin match.
   Web navega por segmento (`/coach/nutrition-v2/${clientId}/builder`, `HubRoster.tsx:273`,
   `NewPlanPickerButton.tsx:42`).
   **Delta (correctness):** corregir `nutritionV2BuilderHref` a la forma de segmento
   `/coach/nutrition-v2/builder/${encodeURIComponent(clientId)}`; el picker global y el CTA por-fila
   usan el mismo helper. Extender el test de `nutrition-v2-hub.ts`.
   Cierre: `nutritionV2BuilderHref` en forma de segmento; CTA por-fila y picker aterrizan en el
   builder real. Ver Riesgo R2.

6. **Búsqueda del roster (FALTA).**
   Web `HubRoster.tsx:149-163`: input `type="search"` ancho completo, placeholder
   `"Buscar en esta página…"`, `aria-label="Buscar alumno en el roster"`, tope 120 chars
   (`:157`), filtro client-side tolerante a acentos (`applyRosterFilters` → `normalizeText`,
   `_lib/hub-roster.ts:64-71,97-102`). La búsqueda cubre SOLO la página cargada; si `hasMore` hay
   una nota `"Hay más alumnos en otras páginas. La búsqueda solo cubre la página actual."`
   (`HubRoster.tsx:238-242`).
   RN `index.tsx:227-342`: FlashList con chips de atención pero **sin input de búsqueda**;
   `lib/nutrition-v2-hub.ts` NO exporta `normalizeText` ni búsqueda.
   **Delta:** agregar input de búsqueda (tokens `bg-surface-card`, `border-border-default`, icono
   `Search`, `min-h-11`, `maxLength 120`, `autoCapitalize="none"`, `autoCorrect={false}`) en el
   `ListHeaderComponent`, placeholder `"Buscar en esta página…"`; filtrar por nombre tolerante a
   acentos; nota `"Hay más alumnos en otras páginas. La búsqueda solo cubre la página actual."`
   cuando `page.hasMore` y hay filtro activo con 0 resultados.
   Cierre: búsqueda por nombre tolerante a acentos sobre la página cargada + nota de otras páginas.

7. **Orden del roster (FALTA).**
   Web `HubRoster.tsx:185-198`: `<select>` con `SORT_OPTIONS` (`_lib/hub-roster.ts:40-45`):
   `default`→`"Actividad reciente"`, `name`→`"Nombre (A-Z)"`, `activity`→`"Último registro"`,
   `attention`→`"Prioridad de atención"`. Orden estable (`applyRosterFilters` → `compareBySort`,
   `_lib/hub-roster.ts:104-130`): `default` respeta el orden del servidor (updatedAt desc); `name`
   por `localeCompare` normalizado; `activity` por `lastIntakeAt` desc (nulls al final);
   `attention` por `ATTENTION_PRIORITY` (no_plan 3 > draft_pending 2 > no_recent_intake 1 > none 0).
   RN: **sin selector de orden** (solo el orden del servidor). `lib/nutrition-v2-hub.ts:60-69`
   solo filtra por atención, sin sort.
   **Delta:** portar `SORT_OPTIONS` + `applyRosterFilters` (search+attention+sort) a
   `lib/nutrition-v2-hub.ts` (con test) y renderizar un selector nativo de orden (patrón
   `SortSheet`/pills del propio `nutricion.tsx` V1, o `Sheet` "Filtros y orden"). Copys de las
   opciones verbatim del web (con tildes: "Último registro", "Prioridad de atención").
   Cierre: selector de orden con las 4 opciones espejo + orden estable idéntico al web.

8. **Helpers compartidos — `applyRosterFilters`/`SORT_OPTIONS`/`normalizeText`/`filterPickerEntries`.**
   Hoy la lógica del roster está DUPLICADA: web `_lib/hub-roster.ts` la tiene completa
   (`applyRosterFilters`, `SORT_OPTIONS`, `normalizeText`, `filterPickerEntries`, `planCtaLabel`),
   RN `lib/nutrition-v2-hub.ts` solo el subconjunto de atención/métricas. El header del archivo RN
   ya se declara "Espejo RN de los helpers de web `_lib/hub-roster.ts`" (`nutrition-v2-hub.ts:4-5`).
   **Delta (patrón sancionado):** EXTENDER el espejo RN en `lib/nutrition-v2-hub.ts` con los
   helpers faltantes (`normalizeText`, `SORT_OPTIONS`/`SortKey`, `applyRosterFilters` con
   search+sort, `filterPickerEntries`), replicando 1:1 la semántica web y cubriéndolos con test
   (vitest, como el resto de la lib). Copys de labels con tildes correctas (regla español latam;
   el web omite tildes en algunos labels — RN los pone bien, no es delta a "corregir hacia web").
   **Nota de deuda (no bloquea esta unidad):** la ruta canónica sería promover el subconjunto puro
   a `@eva/nutrition-v2` y que web + RN reexporten (mata el drift), igual que 4B-16 hace con
   `nutrition-pro`. Eso toca web + `packages/*` (fuera del file-scope de esta unidad, RANKING
   4B-05 = `index.tsx` + `lib/nutrition-v2-hub.ts`). Dejar como follow-up de deuda, no ampliar
   el alcance sin excepción escrita.
   Cierre: helpers del roster completos y testeados en `lib/nutrition-v2-hub.ts`; deuda de
   promoción a `@eva/nutrition-v2` anotada.

9. **Tarjeta de atención por alumno (delta de fidelidad).**
   Web (móvil, `HubRoster.tsx:280-293`): cuando `attentionReason !== 'none'` renderiza
   `CoachAttentionCard` con `{ title, description, reason, tone, actionLabel:'Revisar' }`, donde
   `attentionTitle`/`attentionDescription` (`HubRoster.tsx:38-48`) mapean:
   `no_plan`→`"Sin plan publicado"` / `"Este alumno todavía no tiene una prescripción versionada."`
   (tone `warning`); `draft_pending`→`"Borrador pendiente"` /
   `"Existe una versión que aún no ha sido publicada."` (tone `info`); `no_recent_intake`→
   `"Sin consumo reciente"` / `"No hay registros canónicos durante los últimos siete días."`
   (tone `info`).
   RN `index.tsx:320-324`: solo una línea `nutritionAttentionLabel(reason)` en
   `text-warning-700` — **sin card**. RN YA tiene `CoachAttentionCard` exportado
   (`components/nutrition-v2/NutritionV2Kit.tsx:892-925`, `NutritionAttentionModel` de
   `@eva/nutrition-v2` = `{id,title,description,reason,tone,actionLabel}`, `design.ts:188-195`).
   **Delta:** reemplazar la línea por `CoachAttentionCard` con los mismos copys de título/descripción
   por motivo y tono (`no_plan`→warning, resto→info), `actionLabel:'Revisar'`. Portar los mapeos
   `attentionTitle`/`attentionDescription` (helpers puros → `lib/nutrition-v2-hub.ts` con test).
   Cierre: tarjeta de atención con título+descripción+tono por motivo (espejo web), no la línea.

10. **Insignia de versión del plan (FALTA).**
    Web (móvil, `HubRoster.tsx:256-258`): si `versionNumber && planStatus==='published'` pinta
    `PlanVersionBadge version={versionNumber} status="published"` junto al nombre.
    RN `index.tsx:311-316`: solo `StrategyBadge`, **sin** `PlanVersionBadge`. RN YA tiene
    `PlanVersionBadge` (`NutritionV2Kit.tsx:273-296`) y el read-model ya trae `versionNumber`
    (`packages/nutrition-v2/read-models.ts:399`).
    **Delta:** agregar `PlanVersionBadge` cuando `versionNumber && planStatus==='published'`.
    Cierre: insignia de versión presente en paridad.

11. **Copys de la fila del roster (deltas menores).**
    - Fallback de plan: web `"Sin plan publicado"` (`HubRoster.tsx:261`) vs RN `"Sin plan V2"`
      (`index.tsx:318`). **Delta:** alinear a `"Sin plan publicado"`.
    - Métrica: web tercer tile `"Activos hoy"` (`HubRoster.tsx:143`) vs RN `"Actividad hoy"`
      (`index.tsx:247`). **Delta:** alinear a `"Activos hoy"`.
    - Chip de atención "Sin plan V2" (RN `nutrition-v2-hub.ts:26`) vs web "Sin plan"
      (`_lib/hub-roster.ts:36`): el chip RN aclara que es el plan V2; conservar es aceptable
      (no rompe paridad funcional), pero registrarlo. Sin cambio salvo que el owner pida verbatim.
    Cierre: fallback "Sin plan publicado" y métrica "Activos hoy"; chip "Sin plan V2" documentado.

12. **Card del roster — "Abrir ficha" explícito (delta de estructura).**
    Web (móvil, `HubRoster.tsx:264-279`): DOS botones en fila — `"Abrir ficha"` (borde neutro,
    `ChevronRight`) + CTA primario `planCtaLabel` (`FilePlus2`, fondo primary). La navegación a la
    ficha es un botón etiquetado.
    RN `index.tsx:299-339`: toda la fila superior es un `Pressable` que abre la ficha (sin botón
    "Abrir ficha" etiquetado) + un CTA primario debajo. La ficha se abre por toque en la tarjeta,
    con `ChevronRight` al final como afordance.
    **Delta (menor / adaptación):** la web expone la acción "Abrir ficha" como botón; RN la deja
    implícita en el toque de la card. Es adaptación táctil legítima (card tappable nativa), pero
    documentar; si el owner exige paridad estricta de affordance, agregar botón "Abrir ficha".
    Por defecto: conservar el patrón de card tappable RN (más nativo) y anotarlo.
    Cierre: CTA primario `planCtaLabel` presente (ya en paridad); "Abrir ficha" tappable-card
    documentado como adaptación.

13. **Stats — card segmentada vs tiles (adaptación aceptable).**
    Web `HubRoster.tsx:134-145`: UNA card `divide-x` de 3 segmentos; con paginación activa
    (`!metricsAreTotals`) muestra overline `"Resumen de la página"`.
    RN `index.tsx:244-251`: 3 tiles `Metric` separados + una línea de texto
    `"{total} alumno(s) {scopeLabel}"` (`nutritionHubMetricScopeLabel` → "en este workspace" /
    "de esta página"). El etiquetado de scope YA está resuelto por el helper compartido.
    **Sin delta funcional** (misma información, layout nativo distinto). Solo aplica el copy de la
    métrica (afirmación 11). Documentar como adaptación.
    Cierre: en paridad de información; sin cambio estructural obligatorio.

14. **Estados (loading / gate OFF / vacío / offline / refresco) — adaptaciones sancionadas.**
    - Loading: `NutritionSkeleton variant="coach"` (`index.tsx:197-223`) ≈ `loading.tsx` web
      (INVENTARIO §3, aceptable).
    - Gate OFF: RN `NutritionStatePanel` "Centro V2 no habilitado / …" (`index.tsx:205-215`) en vez
      del `redirect` server-side web; adaptación nativa (RN no redirige) — conservar, moot para el
      coach real (rollout mode=on).
    - Vacío: copys en paridad cercana (`index.tsx:278-287`); mantener y alinear con el nuevo
      estado "sin coincidencias" del filtro (agregar acción "Limpiar filtros" espejo
      `HubRoster.tsx:220-243`).
    - Offline: chip `SyncOfflineState` + caché `readNutritionV2Cache/writeNutritionV2Cache`
      (`index.tsx:112-147,242`) — RN-extra visible pero adaptación nativa legítima (INVENTARIO §3,
      caché + chip); conservar. Con el CTA global en `actions`, ubicar el chip offline junto al
      botón "Nuevo plan" sin romper el layout compacto del header.
    - Refresco: pull-to-refresh (`index.tsx:230-233`) — paridad de intención.
    Cierre: estados conservados; "sin coincidencias" del filtro con acción Limpiar; chip offline
    reubicado junto al CTA.

## Pendientes heredados de 4B-04 (ruteo inline)

15. **Clearance de la cápsula flotante del coach en el FlashList del hub.**
    El hub se monta inline como cuerpo del tab (4B-04); la cápsula del coach
    (`CoachMobileChrome.tsx:164-178`) es un overlay `StyleSheet.absoluteFill` que flota en
    `bottom: insets.bottom + 16`, así que TAPA el final del scroll si el contenido no reserva
    espacio. Hoy el FlashList usa `contentContainerStyle={{ paddingHorizontal:16, paddingBottom:40 }}`
    (`index.tsx:235`) — insuficiente: la última fila / la barra de paginación quedan bajo la cápsula.
    Referencia del patrón: el alumno reserva `paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE`
    (`ALUMNO_TABBAR_CLEARANCE = 88`, `AlumnoMobileChrome.tsx:91`; uso en
    `alumno/(tabs)/nutrition-v2/index.tsx:1097,2130,2157,2482`). Los tabs del coach reservan un
    fijo `paddingBottom: 120` para la cápsula flotante (p.ej. `coach/(tabs)/clientes.tsx:1177,1179`).
    **Delta:** el FlashList debe reservar clearance de la cápsula coach. Opción A (preferida, espejo
    del alumno): exportar una constante `COACH_TABBAR_CLEARANCE` desde `CoachMobileChrome` (o
    reutilizar el `120` ya convenido) y usar `paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE`
    con `useSafeAreaInsets`. Alinear el `paddingBottom:40` interno de la `PaginationBar`
    (`index.tsx:288-297`) para que "Anterior/Siguiente" quede accionable sobre la cápsula.
    Cierre: el último ítem y la paginación quedan por encima de la cápsula; nada tapado.

16. **Safe-area top al montar inline.**
    El hub RN pinta `<View className="flex-1 bg-surface-app">` con el `ListHeaderComponent`
    abriendo en `pt-5` (`index.tsx:226,237`), y las ramas de skeleton/gate usan `pt-6`
    (`index.tsx:199,207,219`) — SIN safe-area top. Como cuerpo del tab (sin header de stack), el
    título choca contra el notch/status bar. El shell V1 que reemplazó resolvía esto con
    `<SafeAreaView edges={['top']} …>` (`nutricion.tsx:154,273`), y el propio wrapper del tab en
    modo `loading`/`v1` usa `SafeAreaView edges={['top']}` (`nutricion.tsx:154,273`). La web lo
    resuelve con `pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]` (`NutritionV2Kit.tsx:90`).
    **Delta:** envolver el hub en `SafeAreaView edges={['top']}` (react-native-safe-area-context)
    o aplicar `paddingTop: insets.top` al contenedor raíz, en TODAS las ramas de retorno (skeleton,
    gate OFF, loading, contenido), para que el header respete el inset superior al montar inline.
    Cierre: safe-area top respetada en las 4 ramas de render del hub inline.

## Comprobación objetiva

Con flag `nutritionV2Coach` ON, tab "Nutrición" del coach (inline):
1. Header: título "Centro de Nutrición" + desc "Planes, consumo reciente y alumnos por atender.",
   SIN eyebrow "Canary privado", SIN flecha de volver, con CTA "Nuevo plan" (icono/compacto) y chip
   offline; el título respeta el notch (safe-area top).
2. "Nuevo plan" → sheet buscable con el roster COMPLETO del workspace; elegir alumno abre el
   builder REAL (`/coach/nutrition-v2/builder/{clientId}`), no una ruta muerta.
3. Roster: input "Buscar en esta página…" filtra tolerante a acentos; selector de orden con
   "Actividad reciente / Nombre (A-Z) / Último registro / Prioridad de atención" reordena estable;
   con `hasMore` y 0 coincidencias aparece la nota de "otras páginas".
4. Filas: `PlanVersionBadge` en publicados, fallback "Sin plan publicado", métrica "Activos hoy",
   CTA `planCtaLabel`; con motivo de atención, `CoachAttentionCard` (título+descripción+tono), no
   la línea suelta.
5. Scroll hasta el final: la última fila y la barra de paginación quedan accionables por ENCIMA de
   la cápsula flotante (nada tapado).
Captura web móvil (~390px) vs RN light/dark × marca para verificar copys, tokens y clearance.
Gates: `pnpm check:tokens`, `pnpm --filter @eva/mobile exec tsc --noEmit`, vitest de
`lib/nutrition-v2-hub.ts` (search/sort/picker/attention-map + href de builder), eslint.

## Riesgos / decisiones a resolver antes de codear

- **R1 (backHref):** el web usa `backHref="/coach/dashboard"`; el montaje inline (tab root) no
  tiene "atrás" y una flecha abandonaría el navegador de tabs. Recomendación: NO cablear `onBack`
  inline (adaptación nativa sancionada). Confirmar con el owner si prefiere una flecha o mantener
  el tab root sin ella.
- **R2 (`nutritionV2BuilderHref` roto):** hoy devuelve query (`builder?clientId=`) contra una ruta
  de segmento (`builder/[clientId]`) sin `builder/index` → el CTA por-fila navega a ruta sin match.
  Verificar en device y corregir a segmento; es un fix de correctness dentro del alcance del CTA.
- **R3 (helpers duplicados):** extender el espejo RN en `lib/nutrition-v2-hub.ts` (patrón vigente)
  vs promover a `@eva/nutrition-v2` (canónico anti-drift pero toca web + packages, fuera de
  file-scope). Default: espejo RN + test; deuda anotada. Confirmar si el owner quiere abrir ya la
  unidad de deuda (como 4B-16).
- **R4 (tildes en labels):** el web omite tildes en varios labels de filtro/orden; RN los escribe
  bien (regla español latam). No "corregir hacia web" quitando tildes; mantener RN correcto.

## Cierre (2026-07-21)

Implementado en `apps/mobile/lib/nutrition-v2-hub.ts`, `apps/mobile/app/coach/nutrition-v2/index.tsx`,
`apps/mobile/components/coach/CoachMobileChrome.tsx` (solo export de la constante) y el test
`tests/mobile-nutrition-v2-parity-helpers.test.ts`. Resoluciones del juez aplicadas al pie de la letra.

- **1. Eyebrow "Canary privado":** RETIRADO. `NutritionHeader` sin `eyebrow`.
- **2. Descripción del header:** ahora `"Planes, consumo reciente y alumnos por atender."` (verbatim web).
- **3. Back/flecha (R1):** NO se cableó `onBack` en el montaje inline (tab root). `NutritionHeader`
  se usa en su variante ancha sin flecha; adaptación nativa anotada.
- **4. CTA global "Nuevo plan":** botón compacto 44px `bg-primary` con icono `Plus` (aria-label
  "Nuevo plan") junto al chip offline en `actions`. Abre `NewPlanPickerSheet` (Sheet `nativeModal`)
  con título/descripción verbatim, input "Buscar alumno…", lista (nombre + pill `nutritionPlanCtaLabel`
  con `FilePlus2` + `ChevronRight`), empty "Sin coincidencias." y estado sin-roster
  "No hay alumnos en tu espacio para crear un plan.". El roster COMPLETO se carga perezosamente al
  abrir paginando `getNutritionCoachHubV2` (8×50, espejo web); offline cae a la página visible.
- **5. Href del builder (R2):** `nutritionV2BuilderHref` corregido a segmento
  `/coach/nutrition-v2/builder/${encodeURIComponent(clientId)}` (verificado: existe
  `builder/[clientId].tsx`, no `builder/index.tsx`). Test actualizado. Lo usan el CTA por-fila y el picker.
- **6. Búsqueda del roster:** input en el `ListHeaderComponent` (icono `Search`, `min-h-11`,
  `maxLength 120`, `autoCapitalize="none"`, `autoCorrect={false}`, placeholder "Buscar en esta página…"),
  filtro tolerante a acentos vía `applyNutritionRosterFilters`; nota "Hay más alumnos en otras
  páginas…" cuando `page.hasMore` y 0 coincidencias.
- **7. Orden del roster (R3):** `NUTRITION_SORT_OPTIONS` + `applyNutritionRosterFilters` (search+
  attention+sort estable) en la lib con test; selector `HubSortSheet` (Sheet `nativeModal`, pills
  espejo del `SortSheet` V1) con las 4 opciones y labels acentuados.
- **8. Helpers espejo (R3):** `normalizeText`, `NutritionSortKey`, `NUTRITION_SORT_OPTIONS`,
  `applyNutritionRosterFilters`, `isNutritionRosterFiltered`, `filterNutritionPickerEntries` y los
  mapas de la tarjeta de atención agregados a `lib/nutrition-v2-hub.ts` con vitest. Deuda de
  promoción a `@eva/nutrition-v2` anotada (esta rama NO toca `packages/*`).
- **9. Tarjeta de atención:** la línea suelta se reemplazó por `CoachAttentionCard` con
  título/descripción/tono por motivo (`nutritionAttentionCardTitle/Description/Tone`, `no_plan`→warning
  resto→info, `actionLabel:'Revisar'` → abre la ficha).
- **10. `PlanVersionBadge`:** presente cuando `versionNumber && planStatus === 'published'`.
- **11. Copys:** fallback "Sin plan publicado"; métrica "Activos hoy". Chip "Sin plan V2"
  conservado (documentado, R4/decisión previa).
- **12/13.** Card tappable RN + stats como tiles: conservados como adaptación nativa (sin cambio
  estructural obligatorio).
- **14. Estados:** "Sin coincidencias" con acción "Limpiar filtros" (+ nota de otras páginas) para
  filtro sin resultados; el chip offline queda junto al CTA en `actions`.
- **15. Clearance:** `COACH_TABBAR_CLEARANCE = 120` exportado desde `CoachMobileChrome.tsx` (fuente
  única = valor vigente de los tabs coach); el FlashList reserva `paddingBottom: insets.bottom +
  COACH_TABBAR_CLEARANCE`, la paginación queda accionable sobre la cápsula.
- **16. Safe-area top:** `paddingTop: insets.top` (+24 en skeleton/gate/loading) en las 4 ramas de
  render inline.

Gates: `pnpm --filter @eva/mobile exec tsc --noEmit` (0 errores), `pnpm vitest run
tests/mobile-nutrition-v2-parity-helpers.test.ts` (31 passed), `pnpm exec eslint` de los 4 archivos
propios (0 errores). Pendiente heredado global: build nativa + device QA por el CEO.
