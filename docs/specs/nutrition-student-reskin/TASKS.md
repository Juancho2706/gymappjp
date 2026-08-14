# TASKS — T2.7 Re-skin del alumno + paleta fija

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) ·
`[!]` bloqueado (se anota por que).

## F0 — Auditoria y documentos

- [x] Auditoria contra HEAD (2026-08-13): inventario completo de la paleta (design.ts + 6 grupos
      de hardcodes + tokens web ya en `@theme` + RN sin tokens) y estado por decision del catalogo
      (tabla en SPEC). Hallazgos clave: "Lo comi" sigue vivo web+RN; racha semanal no existe;
      el rango ya es semantica del AuraHero pero el visual es anillo (conflicto D-A); comida libre
      es feature nueva, no re-skin (D-B).
- [x] SPEC / PLAN / TASKS (este commit)
- [x] Decisiones del owner (2026-08-13 noche, por chat): **D-A = BANDA con rango sombreado**
      (reemplaza al anillo grande del Hoy; los mini-anillos de macros se conservan) ·
      **D-B = DIFERIR el cupo de comida libre a T3.6** · **D-C = SI, checkbox primario**
      (muere el boton "Lo comi" en web y RN)

## F1 — Paleta trio fijo (sin dependencias) — **CERRADA 2026-08-13**

- [x] `NUTRITION_MACROS` a tokens canonicos (web + native classes)
- [x] Tokens RN: canales en `global.css` + `macro.*` en `tailwind.config.js`
- [x] `resolveNutritionMacroColors()` fija y sin `brandColor` (+ caller AuraHero RN, que ademas
      suelta `branding` — el hero ya no depende de la marca para los macros)
- [x] Hardcodes → tokens: `NutritionV2Overrides` · AuraHero web · `DayTotalsBar` ·
      `AddFoodSheet` web · AuraHero RN · `NutritionV2Kit`
- [x] Bonus V1 RN (la spec pide V1 alineada): `MACRO_COLORS` de `MacroRingSummary.tsx` (fuente
      unica de FoodItemRow / NutritionDailySummaryWidget / MealCardExpandable) pasa P/C/G al trio;
      `kcal` se queda (no es un macro)
- [x] Tests: `mobile-aura-theme.test.ts` invertido (ningun macro sigue la marca);
      `white-label-tokens.test.ts` verde sin tocar
- [x] Gates: tsc web 0 · tsc mobile 0 · eslint tocados limpio · vitest 10/10 · boundaries 340 ·
      docs:check OK. NO corridos: `expo export` ni suite completa (CPU del owner en uso)
- Gotcha de extraccion: `design.ts` vive en `packages/` (fuera del scan de Tailwind/NativeWind);
  las clases `bg-macro-*`/`text-macro-*` DEBEN aparecer literales en algun archivo escaneado —
  hoy las anclan los mapas locales de `NutritionV2Kit` (RN) y `NutritionV2Overrides` (web). Si
  esos mapas se refactorizan, agregar safelist.
- Deuda declarada: los PDF de exportacion (web y `nutrition-day-export.ts` RN) usan una paleta
  propia espejada entre si (blue/emerald/purple 600) — alinearlos es un cambio a DOS lados y
  queda para F5 con decision explicita.

## F2 — Jerarquia del Hoy — desbloqueada (D-A banda · D-C checkbox)

- [x] Banda de energia con rango sombreado (web + RN, 2026-08-13): `energyBandGeometry` puro en
      el paquete (riel 0→115% de la meta, zona ±10% adentro; 3 tests nuevos) + AuraHero web y RN
      reemplazan el anillo grande por la banda. Encabezado "ENERGIA · RANGO A–B" + kcal grande a
      la derecha + linea de estado (verde en rango / ambar sobre — nunca rojo). El aura glow se
      conserva (achatado detras del bloque); los mini-anillos de macros se conservan. RN anima el
      fill en pixeles (onLayout: reanimated no interpola porcentajes).
- [x] Checkbox primario; muere "Lo comi" (web + RN, 2026-08-13): `leading` nuevo en
      `NutritionFoodRow` (web) y `FoodRow` (RN Kit); `EatCheckbox` 22px con area tactil de 44px.
      Tap en vacio = registra (mismo camino `onEat`/`onAte`, idempotencia intacta); tap en marcado
      = abre "Retirar registro" (el dialogo/sheet con motivo — des-registrar nunca es accidental);
      en cola (RN) = marcado pero inerte. El lapiz y el tacho de la fila se conservan (NUT-009).
      El testid web `nutrition-v2-lo-comi` vive SOLO en el estado pendiente: el spec E2E
      `alumno-hoy.spec.ts` sigue valido sin tocarse.
- [x] Nota del coach expandida en RN — YA CUMPLIDO antes de esta fase: `CoachNoteCard` arranca
      con `open = true` (el colapso es opt-in del alumno). El catalogo auditaba un estado viejo.
- [x] "⇄ N equivalentes" literal en la fila — YA CUMPLIDO por T2.5: `ItemExchangeTrigger`
      (web y RN) pinta la pill "⇄ N equivalentes" bajo el item.
- [x] Racha semanal "N de 7 en rango" en el Hoy (2026-08-13, web + RN): chip junto al saludo del
      AuraHero. Helpers compartidos en el paquete (`energyDayInRange` ±10% · `countEnergyDaysInRange`
      · `countEnergyDaysEvaluable`, +4 tests). Reglas de honestidad: cuentan solo los dias CERRADOS
      de la semana (hoy a media mañana "fuera de rango" seria mentira) y sin dias evaluables el chip
      NO se pinta (nada de "0 de 7" un lunes). Cero fetch nuevo: web lo computa de la pagina de
      historial que el Hoy ya carga; RN de `useNutritionWeekHistory` que el TodayTab ya usa.
- [x] Celebracion dia completo: paridad web — YA CUMPLIDO antes de esta fase: el AuraHero web
      tiene confetti tintado al primario + ilustracion "dia-completado" 1x/dia (sessionStorage).

## F3 — Plan + Historial — **CERRADA 2026-08-13**

- [x] Tendencia 4 barras semanales arriba del historial (web + RN): card "Ultimas N semanas" con
      barras = dias en rango por semana (vieja→reciente), chip "tendencia ↑/→/↓"
      (`energyTrendDirection`: compara la mas reciente contra la mas vieja; con <2 semanas
      cerradas la card no se pinta) y fechas en los extremos. Las cards de semana cambian su
      metrica: pill "N/7 en rango" (verde con ≥5) en vez de "n/7 dias · %" — los puntos del strip
      ya dicen que dias tienen registro. `HistoryWeekBucket` (web) y `NutritionHistoryWeek` (RN)
      ganan `inRangeCount` computado de las filas crudas con el helper compartido.
- [x] Dias con nombre del coach — YA CUMPLIDO antes de esta fase: `variant.label` es el titulo de
      la card del Plan en web (`PlanVariantCard`) y RN; el chip "Por defecto" web ya habia muerto.
- [x] Semana actual solo en Hoy — YA CUMPLIDO antes de esta fase (paridad RN T1.3):
      `groupHistoryDaysByWeek` web y el agrupador RN EXCLUYEN la semana en curso, con el caption
      "la semana en curso vive en el tab Hoy" en ambos.
- [x] Poda de chips de permisos en RN — YA CUMPLIDO antes de esta fase: `PlanRulesCard` RN solo
      pinta registro libre y ajuste de cantidad (con %); `canSubstitute` no se pinta.
- [x] Deuda saldada (2026-08-14, pedido owner): los puntos del strip semanal se pintan por RANGO.
      `buildNutritionWeek` materializa `rangeDot` en cada celda (`nutritionWeekCellRangeDot`, +2
      tests) para sobrevivir a la poda del borde RSC → cliente (`toWeekNavCells` lo conserva).
      Semantica: verde = dia dentro del ±10% (o registro injuzgable — sin meta, o HOY: juzgar a
      medio dia seria mentir, misma regla que la racha) · ambar = con datos fuera del rango (nunca
      rojo) · apagado = sin datos · hueco = futuro. Renderers: `WeekDayNav` web y RN (cubre Hoy,
      Plan, ficha del coach e historial RN) + `HistoryWeekCard` web, todos con fallback a la regla
      vieja para payloads cacheados sin `rangeDot`.

## QA en preview de F1-F3 — [x] EJECUTADO 2026-08-14 (desbloqueado: la sesion de Catalina seguia viva)

Preview de `c6328192` en el alias de la rama, sesion de la alumna Catalina. Cobertura: Hoy /
Plan / Historial · claro Y oscuro · desktop 1400 y responsive 390 (bottom nav) · consola sin
errores en todo el recorrido.

**Seed de QA aplicado en LIVE (pedido del owner, reversible):** todo el historial previo de
Catalina 20/07-14/08 paso a `entry_status='voided'` con `correction_reason='qa-reset-t27-20260814'`;
se insertaron 16 dias sinteticos "QA dia completo" (`note='seed qa-reset-t27-20260814'`,
`idempotency_key='qa-seed-t27-<fecha>'`) con kcal exactas para cubrir verde/ambar/apagado y las
pills (semana 3-9 ago = 5/7; 27jul-2ago = 2/7 + un verde injuzgable; 20-26jul = 1/7); snapshots
`nutrition_day_snapshots_v2` creados donde faltaban. Ademas el plan "Plancito 2" (variante
Viernes) gano una 2da franja **"Cena" 21:00** (Pechuga 150 g + Sopa 200 ml) para probar
multi-comida. 🔴 Gotchas de seed aprendidos: el read model V2 EXIGE `idempotency_key IS NOT NULL`
(sin el, la entry cae al carril legacy) y los targets del historial salen del SNAPSHOT del dia,
no del plan.

### Verificado OK
- Hoy: banda de energia (encabezado "ENERGIA · RANGO 2.655-3.245", kcal grande, "faltan ~N"),
  chip de racha "2 de 7 en rango" (aparece solo con evaluables; conteo correcto), mini-anillos
  con trio, strip por rango EXACTO contra los datos (LU ambar 2.000 · MA verde 2.900 · MI ambar
  700 · JU verde 3.000 · VI hoy verde-con-registro · SA/DO hueco), porciones, celebracion no
  aplica.
- Checkbox: vacio→registra (via "Comi toda esta comida"); marcado→abre "Retirar registro" con
  motivos (Lo registre por error / No lo comi / Registro duplicado / Otro) — cancelado sin mutar.
- **Bug reportado por el owner ("check de 1 comida tarda años y la 2da no se puede") NO
  reproduce en web**: ambos checks fueron INSTANTANEOS (UI optimista + toast "Registraste tu
  POLLO/Cena 🎉" con Deshacer), la 2da comida se marco sin bloqueo, DB consistente (5 entries,
  877 kcal). Triar en RN/device.
- Historial: pills "5/7"/"2/7"/"1/7" correctas (cuentan SOLO dias juzgables; verde
  injuzgable-con-registro no suma — coincide con diseño), tap en celda abre el detalle del dia
  correcto (06/08: 2.660/2.950, macros trio, "1 registro"), "tendencia ↑" correcta.
- Plan: metas del dia, franjas con kcal (583/294), "PORCIONES A ELECCION", "REGLAS DEL PLAN".

### Hallazgos → F4 (corregidos 2026-08-14 en la misma jornada; ver registro de cierres)
- [x] 🔴 H1 — Chips P/C/G de las filas (Hoy y Plan, web) con paleta INVERTIDA/vieja (P naranja,
      C azul, G celeste). Causa: `apps/web/src/components/nutrition/macro-tokens.ts` quedo fuera
      de la migracion F1 con la triada vieja ember/sport/aqua. Fix: `MACRO_META` apunta a los
      tokens canonicos `var(--color-macro-*)` (arregla TODAS las superficies que lo consumen:
      MacroChipRow, MacroRings, MacroBars). RN ya cumplia (`NUTRITION_MACROS.nativeClass`).
- [x] 🔴 H3 — Historial: semana de borde de paginacion PARCIAL (pill "0/7" mentirosa) y DUPLICADA
      tras "Ver semanas anteriores". Fix web: `trimHistoryWeeksPage` (helper puro + 3 tests) —
      con `hasMore` la ultima semana de la tanda se descarta y el cursor pasa al lunes de la
      ultima emitida (la tanda siguiente re-trae la descartada COMPLETA); aplicado en `page.tsx`
      y en la server action, + dedupe por `weekStartIso` al appendear en `HistoryWeeksList`.
      Fix RN: el agrupador esconde la semana mas vieja mientras `canLoadMoreHistory` (el merge
      acumulativo de RN ya la completaba sola; solo pintaba la version cortada mientras tanto).
- [x] 🟡 H2 — Zona ±10% de la banda imperceptible en ambos temas. Fix web+RN: relleno success al
      34% + bordes laterales solidos (ticks de inicio/fin del rango).
- [x] 🟡 H4 — Trend card ilegible. Fix web+RN: cada columna lleva su CIFRA (N en rango) y un
      track de fondo como escala; barra success 70%/40%/gris segun tramo.
- [~] 🔵 H5 — Punto de HOY del strip no refrescaba al registrar: era SINTOMA de H8 (el
      `router.refresh()` colgado nunca traia la verdad del server). Sin cambio propio;
      re-verificar en preview tras H8.
- [x] 🔵 H6 — "Viernes · Viernes": `formatSelectedDayCaption` ya no repite la variante cuando su
      nombre es el del dia (+2 tests). RN no duplicaba.
- [ ] ⚪ H7 — Tabs Hoy/Plan/Historial no navegaron con clicks de la extension (URL directa si);
      probable artefacto de la extension — verificar con un click humano antes de tratarlo bug.

### 🔴 H8 (2026-08-14, reproducido EN VIVO por el owner) — checkboxes muertos tras "Retirar registro"
- Sintoma: tras retirar un item, NINGUN checkbox ni lapiz/tacho respondia (el owner: "no me deja
  volver a marcar Avena ni quitar el check de las otras"); el boton "Comer lo que falta" seguia
  vivo. Confirmado en DOM: 5 checkboxes y 10 tachos `disabled=true` con `isPending` colgado +30
  min. **Es el mismo bug que el owner reporto AYER** ("el check tardaba años y no podia marcar la
  2da comida"): un solo `useTransition` envuelve `await action()` **y el `router.refresh()`**; si
  el refresh RSC tarda o se cuelga (visto en el preview), `isPending` queda true y TODA la
  seccion quedaba deshabilitada sin feedback. RN no lo sufre (pending por item, `eatingId`).
- Fix (web `TodayExperience.tsx`): los `disabled` de checkbox/lapiz/tacho/swipe/trigger miran
  `busyId` (mutacion realmente en vuelo; se limpia en el `finally` apenas el server confirma) y
  NO `isPending`. Protege igual contra doble-registro; la UI se libera sin esperar el refresh.

### 🔴 H9 (2026-08-14, reportado por el owner sobre `5ca38679`) — tabs muertos tras cualquier mutacion
- Sintoma: "si interactuo con el check de los alimentos antes de pulsar un tab, los tabs no
  funcionan" (5 clicks a Historial/Plan sin efecto; recargar lo arregla). H8 habia arreglado los
  CHECKBOXES pero la NAVEGACION seguia muriendo.
- Repro determinista conseguido (programatico): "Retirar registro" → click al `<a>` del tab →
  URL intacta para siempre. Descartado overlay (body `pointer-events:auto`, sin `inert`, el
  propio `<a>` es el elemento en el punto). Control: mismo click SIN mutacion previa navega bien.
- Causa (leida en `next/dist/client/components/app-router-instance.js`): un ACTION_NAVIGATE
  DESCARTA la accion pendiente del ActionQueue (`pending.discarded = true`) — y una accion
  descartada JAMAS llama `action.resolve()`, dejando huerfana la promesa que ya se entrego a
  React (`setState(deferredPromise)` + `use()`): el router queda suspendido y no vuelve a
  navegar. Con `router.refresh()` dentro de cada mutacion, la ventana era "toda mutacion
  reciente". Familia de bugs ABIERTOS de Next: vercel/next.js#86055 · #86151 · #45830 (no se
  sube Next incidentalmente por esto).
- Fix (`c767a5ea`): CERO `router.refresh()` en las mutaciones del Hoy del alumno. Nueva
  `fetchNutritionTodayAction` (lectura pura, auth espejo de history.actions) reconcilia un
  estado base cliente (`baseToday`) bajo `useOptimistic`; si la lectura falla, los deltas
  confirmados se commitean a la base (no se revierte lo que el server ya escribio); guard de
  secuencia contra syncs cruzados. `usePortionMarks` recibe `refreshToday` del caller y pierde
  `useRouter`. Costo asumido: el strip semanal RSC no refresca en caliente (H5 se acepta como
  limitacion documentada mientras el bug upstream siga abierto).
- Gates: tsc web 0 · vitest area `/c` completa 1067/1067 · boundaries 343 · eslint ok.
- ⚠️ `c767a5ea` resulto INSUFICIENTE (feedback owner + auditoria 2026-08-14 tarde): ver H9-bis/H10.

### 🔴 H9-bis + H10 (2026-08-14, auditoria a fondo pedida por el owner) — la raiz COMPLETA
- Owner sobre `c767a5ea`: (1) retirar → ir a Plan sigue muerto; (2) NUEVO: chequear → ir a Plan →
  volver a Hoy y el check "desaparece" (la DB lo tiene; recargar lo muestra).
- **H9-bis (tabs)**: la auditoria encontro que TODA server action invocada desde el cliente se
  despacha al ActionQueue del router — `callServer` emite `ACTION_SERVER_ACTION`
  (`next/dist/client/app-call-server.js:14-26`). Quitar `router.refresh()` NO saco la pantalla
  del queue: la accion de escritura Y la nueva accion de lectura siguen siendo acciones
  descartables; un click a un tab dentro de esa ventana (~2 s) descarta la pendiente y su
  `deferredPromise` jamas resuelve (`app-router-instance.js:82-92` retorna sin `action.resolve`)
  → `use()` suspendido → router muerto. El `await` del caller SI resuelve
  (`server-action-reducer.js:252-263` usa resolve/reject del payload, independiente del discard)
  — por eso los checkboxes siguen vivos y solo mueren las navegaciones. Presente en Next 16.3.0
  instalado. "Retirar" lo dispara mas porque el dialogo deja la mano lista sobre el tab.
- **H10 (check no persiste)**: regresion de `c767a5ea` — sin `router.refresh()` y con actions
  sin `revalidatePath`, NADA evicta el router/prefetch cache del cliente
  (`server-action-reducer.js:218-231` evicta SOLO con `didRevalidate`). La vuelta a Hoy remonta
  `TodayExperience` con un `serverToday` stale (pre-mutacion) y la base pisaba la verdad.
- **Fix (este commit), dos patas**:
  1. `navigation-gate.ts`: contador module-level de server actions en vuelo (`trackedAction`
     envuelve las 13 actions del area: intake x7, favoritos x3, porciones x2, lectura today) +
     listener de click en CAPTURA mientras la vista Hoy esta montada: con accion en vuelo, el
     click a un `<a>` interno se difiere (preventDefault + destino recordado) y se despacha al
     drenar la cola — el click SIEMPRE termina navegando y jamas se descarta una accion.
     `WeekDayNavigator` pasa su `router.replace` por `gateNavigate`. Ventana residual conocida:
     back/forward del navegador (popstate no interceptable) — aceptada mientras el bug upstream
     viva. La compuerta se RETIRA cuando Next arregle el descarte sin promesa huerfana.
  2. `today-cache.ts`: ultima verdad del read model por pestaña (module-level). El mount y el
     effect de `serverToday` prefieren el cache si existe (payload RSC puede ser stale) y
     reconcilian enseguida con `fetchNutritionTodayAction` — el check persiste entre tabs sin
     depender de los caches de Next.
- Gates: tsc web 0 · vitest 1067/1067 · boundaries 345 · eslint sin errores.
- ✅ Verificado programatico en el preview de `8c1a063e` (2026-08-14): (1) retirar registro →
  click al tab a los 300 ms (accion en pleno vuelo) → NAVEGO a Historial (el gate difirio y
  despacho); (2) volver a Hoy → la UI pinta EXACTAMENTE la verdad de DB (3 checks marcados =
  3 entries activas, 2 filas pendientes = las retiradas) — nada de payload stale. Falta el
  visto bueno manual del owner (su flujo: chequear → Plan → volver → el check persiste).

### 🔴 H11 (2026-08-14 noche, owner: "marcar un check → tabs muertos; retirar ya funciona")
- Matriz empirica en preview (programatica): void+click temprano/tardio NAVEGA · eat+click
  temprano/tardio MUERE SIEMPRE (incluso con la compuerta H9 difiriendo). Fetch-log comparado:
  en VOID el apply del action llega a commitear (hay un 3er POST = re-render RSC aplicado y el
  effect re-sincroniza); en EAT el apply JAMAS commitea (sin 3er POST, cero errores JS, y toda
  navegacion posterior muerta — el fetch de la navegacion responde en 6 ms y el estado nunca se
  aplica).
- Causa: `revalidatePath` dentro de las server actions de mutacion obliga al router a una
  NAVEGACION INTERNA al aplicar la respuesta (`server-action-reducer.js:297-325`: seed del
  flight + `navigateToKnownRoute` con `FreshnessPolicy.RefreshAll`) y en Next 16.3.0 ese apply
  queda colgado de forma reproducible en el flujo de marcar. Sin revalidacion el reducer sale
  por la via corta (`return state`, lineas 265-272) sin navegacion interna.
- Fix (`b29e7c00` + tests `f4917c11`): fuera `revalidatePath` de las 7 mutaciones del alumno
  (helper y derivacion de headers NUT-006 eliminados; la historia queda en git). El costo —
  router cache stale tras mutar — ya lo cubre `today-cache.ts` (H10); bonus: cada check deja de
  re-renderizar la pagina entera en el server. Tests: los 6 asserts de revalidacion pasan al
  contrato nuevo ("nada revalida"; Team sigue escribiendo sin INValid_PAYLOAD). ⚠️ El commit
  `b29e7c00` salio con 6 tests en rojo y un mensaje que decia 1067/1067 — corregido y declarado
  en `f4917c11`; con el, vitest 1067/1067 de nuevo.
- [ ] Prueba de fuego en preview PENDIENTE de pestaña VISIBLE (Chrome en background congela el
  commit de render y envenena el resultado): flujo owner = marcar un check → click a
  Plan/Historial → debe navegar. La verificacion programatica quedo no-concluyente por el
  throttling; el owner valida a mano.

### 🔴 H12 (2026-08-14 noche, owner: "marcar → tabs muertos" PERSISTIA con H9+H10+H11) — cirugia de transporte
- Con H11 deployado el owner seguia reproduciendolo (retirar navega, marcar mata). Internet: 16.3.1
  existe pero su changelog no lista un fix del area (solo "optimistic routing prefetch loops");
  bump = apuesta, descartado. La conclusion de las tres capas: mientras el navegador invoque
  server actions, cada request entra al ActionQueue del router y el apply de la accion de MARCAR
  encuentra siempre un camino para dejar el router muerto (descarte con promesa huerfana H9,
  cache sin evictar H10, revalidacion/seed H11, y lo que quede — revalidacion implicita por
  cookies de Supabase incluida como sospechosa sin confirmar).
- Fix estructural (`bd48cd7d`): el area del alumno DEJA de usar server actions como transporte.
  - `app/api/student/nutrition-v2/route.ts`: puente POST `{op, input}` → despacha a las MISMAS
    funciones de `_actions/*` (auth cookies + rate limit + Zod adentro). CSRF: `sec-fetch-site`
    + `origin`. 15 ops (7 intake, 2 porciones, 3 favoritos, search, group page, today, history).
  - `_components/nutrition-api.ts`: mismos nombres/firmas via `typeof import` — los 4 call sites
    (TodayExperience, PortionMarks, SubstitutionSheet, HistoryWeeksList) solo cambian el import.
  - `fetch()` no despacha NADA al router ⇒ navegar con la request en vuelo es seguro por
    construccion; la compuerta H9 queda montada como cinturon (inFlight siempre 0 hoy).
- Gates: tsc web 0 · vitest 1067/1067 · boundaries 346 · eslint ok.
- [ ] Prueba de fuego del owner con pestaña visible: marcar → tab (el QA programatico siguio
  bloqueado por la pestaña en background que congela el renderer).

## F4 — Correccion (verificacion visual contra el mock)

- [x] H1-H6 + H8 corregidos (arriba). Gates: tsc web+mobile 0 · vitest 30/30 (week-nav 3 tests
      nuevos + caption 2) · boundaries 342 · eslint tocados sin errores nuevos.
- [ ] Stepper hibrido + chips de razon + "Otra…" — deltas menores si los hay (chips de razon del
      sheet Retirar verificados OK en el QA: Lo registre por error / No lo comi / duplicado /
      Otro motivo)
- [~] Re-QA en preview de `5ca38679` (deploy READY): verificado por DOM con javascript_tool —
      H1 ✅ (dots de chips = rgb(94,159,214)/rgb(255,183,77)/rgb(129,199,132), trio exacto),
      H2 ✅ (zona en 78.3%→95.7% del riel con bordes success), H8 parcial ✅ (5 checkboxes con
      `disabled=false` tras recargar; el flujo completo retirar→re-marcar quedo a medias porque
      el renderer del navegador se congelaba con la ventana en background — gotcha conocido).
      QUEDA a ojo del owner: H3 (historial sin semana duplicada/parcial + "Ver semanas
      anteriores"), H4 (trend card con cifras), H6 (caption), H8 con la mano (su propio repro:
      retirar Avena y volver a marcarla) y H7 (clicks en los tabs).

## F5 — Cierre

- [ ] Re-QA visual completa: preview web (claro/oscuro/marca custom) + device Android
- [ ] Paridad declarada en `docs/status/MOBILE_PARITY.md`
- [ ] OTA android propuesto al owner (cierre O2)

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-13 | F0 | (este commit) | docs:check | Auditoria + los tres documentos. Tres decisiones del owner quedan abiertas (D-A/D-B/D-C); F1 no depende de ninguna. |
| 2026-08-13 | F1 | (este commit) | tsc web+mobile 0 · vitest 10/10 · eslint ✓ · boundaries 340 ✓ | Trio fijo en design.ts + tokens RN + 6 grupos de hardcodes + V1 RN (MACRO_COLORS). Sin QA visual todavia: la re-QA completa es F5. |
| 2026-08-13 | F2 (parcial) | (este commit) | tsc web+mobile 0 · vitest banda 4/4 + aura ✓ · eslint tocados sin errores nuevos | Banda de energia (D-A) y checkbox de registro (D-C) en web y RN; nota RN, "⇄ N equivalentes" y celebracion web verificados como YA cumplidos. Queda SOLO la racha semanal. Sin QA visual (F5). NO corridos: expo export ni suite completa. |
| 2026-08-14 | Deuda de puntos por rango | 477bc476 | tsc web+mobile 0 · vitest 49/49 · eslint ✓ · boundaries 342 ✓ | `rangeDot` materializado en `buildNutritionWeek` + renderers web/RN con fallback. QA en preview quedo BLOQUEADO en el login del alumno (ver seccion arriba). |
| 2026-08-14 | QA preview F1-F3 | c6328192 (sin cambios de codigo) | QA visual web: Hoy/Plan/Historial · dark+claro · 1400+390 · consola limpia | Desbloqueado solo (sesion de Catalina viva). Seed QA en LIVE (reset + 16 dias + franja Cena). 7 hallazgos H1-H7 documentados arriba para F4. Bug del owner (checks lentos/2da comida) NO reproduce en web. |
| 2026-08-14 | F4 — H1-H6 + H8 | (este commit) | tsc web+mobile 0 · vitest 30/30 · boundaries 342 · eslint ✓ | H1 paleta chips (macro-tokens.ts al trio) · H2 zona banda visible (web+RN) · H3 borde de paginacion sin parciales ni duplicados (web+RN) · H4 trend card con cifras+track (web+RN) · H6 caption sin duplicar · H8 checkboxes muertos post-retiro (disabled por busyId, no isPending) — H8 reproducido en vivo por el owner y ES el bug de "no podia marcar la 2da comida". Queda re-QA en preview tras deploy. |
| 2026-08-13 | F2 (cierre) + F3 | (este commit) | tsc web+mobile 0 · vitest 26/26 (energy-range 4 nuevos + week-nav + banda) · eslint tocados sin errores nuevos · boundaries 342 ✓ | Racha "N de 7 en rango" en el Hoy + trend card y pills "en rango" en el historial, web y RN con los mismos helpers del paquete. F3 items 2/3/4 verificados como YA cumplidos. Sin QA visual (F5). NO corridos: expo export ni suite completa. |
