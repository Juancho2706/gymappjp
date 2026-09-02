---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-09-01"
canonical: true
source_of_truth: apps/web responsive + apps/mobile
---

# Paridad Web/PWA → React Native

Única fuente de verdad para saber qué está cerrado, qué falta y dónde retomar el port de React Native. Los detalles de ejecución viven en [`specs/rn-mobile-parity-redesign/TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md); este archivo prevalece ante cualquier auditoría, spec de unidad o informe histórico.

> **Preservación de funciones** (qué se movió de lugar, qué quedó **órfano** en el rediseño, y la deuda de paridad mobile): [`REDESIGN_FEATURE_MATRIX.md`](REDESIGN_FEATURE_MATRIX.md).

## Resumen ejecutivo

> **QA en device pendiente (acumulado, 18 ítems):** [`docs/testing/QA_DEVICE_PENDIENTE.md`](../testing/QA_DEVICE_PENDIENTE.md).
> Los 11 puntos nuevos del tren «cierre de backlog 02-09» quedaron **VERDES con el owner el 02-09**
> (Android e iOS, claro y oscuro): sección «Verificado» del mismo archivo.

> **2026-09-02 (tren «cierre de backlog» — EN PRODUCCIÓN, QA del owner pendiente en device)**: `master` = `rnmobiledenuevo` =
> `794aee52`, deploy `dpl_E6Rt7ETYsZ5tpbW84DLLdCP4RMHk` READY, OTA 1.1.2 `production` android `01a063b0-6a6a-7d09-ad3c-bbdd04591b0d`
> (run 33675885999) / ios `01a063b0-86f0-7c30-8079-9e61d9b6b356` (run 33675889223). Paridad nueva RN ≥ PWA (decisión del owner):
> **solicitudes de alumnos** en la app (chip «Solicitudes (N)» en Alumnos, pantalla `/coach/leads` con WhatsApp/correo/contactado/
> sumar con alta prellenada/descartar, push `lead_received`; API `GET/PATCH /api/mobile/coach/leads`, contrato `packages/schemas/
> coach-leads.ts`); **reemplazos estructurados** del plan bajo cada ítem y **stepper de confirmación** en sustituciones (antes Alert);
> **swipe-back del builder bloqueado en nativo** (`usePreventRemove`, un solo diálogo con back físico y botón); el bloque colocado toma
> nombre/media al editar el ejercicio (E1, web y RN); tarjeta de Share sin velo; 6 CTAs de nutrition-v2 RN sin «no incluido en tu
> plan»; «Cerrar sesión» solo en «Más»; login del alumno RN explica la cuenta de coach (VTA-3.12); tema con `success600`/
> `destructive600`; lint del builder y `Sheet.tsx` en cero; `@react-navigation/native` como dependencia directa (7.2.4, JS puro).
> Solo web: check-in offline con borrador, aviso de correo en persona, hora/día Santiago en notas y mediciones, gates de dominio en
> movimiento/builder/ficha, purga a 30 días, instrumentación E394, ejercicios E2/E3/E5/E6, link `/join` en Invitar alumno. Brechas
> declaradas: `converted` desde RN no copia la atribución al alumno (el alta móvil no devuelve `clientId`); la vista Plan del alumno
> suma una lectura por versión hasta que `get_nutrition_plan_read_v2` transporte reemplazos; `hybrid_strategy` RN sigue nombrando
> «Nutrición Pro» (4 sitios). QA en device: [`docs/testing/QA_DEVICE_PENDIENTE.md`](../testing/QA_DEVICE_PENDIENTE.md) + lo de este tren.
>
> **2026-09-02 (QA del owner del 02-09: ejecutor, Share Entreno y accesos — EN PRODUCCIÓN, QA pendiente)** (SDD
> [qa-ejecutor-share-0209](../specs/qa-ejecutor-share-0209/SPEC.md), mockup `c4a77ab0` opción B): `master` = `rnmobiledenuevo` =
> `0f545926`, deploy web `dpl_35ZT6w7oLzBrnMEAsXjmVQVdCy2R` READY, OTA 1.1.2 canal `production` android `bd2bc6e8` (run 33593759289) /
> ios `025d158f` (run 33593765074). Paridad web ↔ RN de lo nuevo: **cardio cronometrado se registra solo** al vencer (MIN = tiempo
> prescrito, envío, ✓, avance; pausar/saltar solo rellena; continuo e intervalos; motor `workout-engine/cardio-autolog`) en
> `CardioStepV3` (web) y `CardioScreenV3` (RN); **permiso de notificaciones del timer** desde Ajustes del entreno (RN «Temporizador en la
> pantalla bloqueada» con Abrir Ajustes; web «Avisarme al terminar el descanso»); **confirmación al salir del builder** con cambios
> (RN flecha/atrás Android/gesto iOS; web beforeunload + diálogo); **selector de grupo muscular por región** (RN pestañas + pills,
> web Select agrupado; catálogo único con Movilidad y Rehabilitación). Solo RN: tarjeta de Share sin fondos (texto blanco con
> contorno fino, color del coach solo en la silueta) y Stories/WhatsApp/Guardar con aviso dentro del composer; pegar un link
> `/join/<código>` deja el código. Solo web: Despegue con logo desde las hojas portaleadas, vista previa (og) = solo logo del coach
> con Content-Length y `?v=`, guardián E394 de deploy skew. **QA del owner PENDIENTE en device y web** (lista en la SDD § QA).
>
> **2026-09-01 (Ola de orden CERRADA — QA del owner verde en celular; supersede las dos entradas siguientes del mismo día)** (SDD
> [ola-de-orden](../specs/ola-de-orden/TASKS.md) § «Cierre de la ola»): todo lo descrito abajo como «EN CÓDIGO sin OTA» está en el
> canal `production` de OTA 1.1.2 — tren 1 (`f9cf8ae9`) android `6cd2d29d` / ios `8548c0c0` y tren 2 (`935cd4c8`) android `27e920aa` /
> ios `1677cf76` — con QA del owner VERDE (ronda 2 + QA final). El tren 2 sumó lo pedido en el QA: **orden de la barra editable** desde
> Funciones (▲▼, fila `_nav` de `coach_feature_prefs` vía `featurePrefs.navOrder` del config, `resolveNavOrder` en `coach-nav-state`),
> «Cerrar sesión» al final de «Más» (fuera del hub Opciones), Alumnos sin tarjeta «Herramientas», bloque «Qué se ve en tu panel» también
> para team (switch del pool si gestiona), fila «Funciones» oculta al coach org-managed, hero con deltas de fase 2 (`coach_kpi_snapshots`).
> Brechas que quedan (backlog B1–B16 en TASKS): reach global del buscador (hoy solo Inicio), 6 CTAs de plan en nutrition-v2 RN, logout
> duplicado Más/Mi cuenta, `activeModuleCount`/`MI_PANEL_*` sin renombrar, theme sin `success-600`/`danger-600`, test de
> `ModuleOffNotice` RN, editores sin gate `training`.
>
> **2026-09-01 (Ola de orden W2→W4 en RN — navegación, «Más», Funciones única, todo-incluido; EN CÓDIGO sin OTA)** (SDD
> [ola-de-orden](../specs/ola-de-orden/TASKS.md), mockup `bff90120`): la barra del coach deja de ser un `.slice(0,5)` de una
> lista fija — `buildMobileBar` (@eva/coach-nav) arma «Inicio · Alumnos · 2 dominios prendidos según `PERSONA_DOMAIN_ORDER`
> · Más» y el sobrante vive en la hoja `(tabs)/more.tsx` (Tu trabajo / Gestión, chasis del hub Opciones); «Equipo» ya no se
> cae para coaches de team; Cardio/Movimiento entran a la barra como push de stack (`tab: null`). `settings/funciones.tsx`
> (nueva) es la ÚNICA puerta a especialidad + 5 master switches (con «Abrir ›») + detalle de nutrición sin candados + guía +
> alumno de ejemplo; `mi-panel.tsx`, `features.tsx`, `modules.tsx` y `tools.tsx` son `<Redirect>`; hub Opciones con una fila
> «Funciones»; `lib/funciones-copy.ts` (toast honesto desde `NAV_MODULES`). Todo-incluido: `ModuleOffNotice` RN
> «temporalmente no disponible» + «Volver» (sin RefreshPlanButton), tab «Check-ins» huérfana borrada, lupa del buscador global
> en `MobileGreetingHeader` (`coach-search-trigger`), FAB sin «Programa» con Entrenamiento apagado, hero del dashboard con
> `kpi.deltas` servidos por el API (nunca «+1/+3» inventados). **Paridad web ↔ RN completa en código** (web: sidebar en 3
> grupos, Funciones única, redirects, KPI con deltas reales). Tests: nav.test.ts (buildMobileBar ×13), contrato
> MOBILE_TAB_KEYS, tests/mobile/funciones-copy · domain-off · mi-panel. **QA device del owner PENDIENTE** (kut · jesus-coach
> · jpl, por cable adb+Metro contra la rama; lista en TASKS § W4 «QA del owner»). Brechas declaradas: cápsula móvil WEB
> sigue con `.slice(0,5)`; team sin switch por dominio del pool; CTAs de plan en nutrition-v2 RN; «reach global» del
> buscador. Requiere OTA 1.1.2 (sin cambio nativo) tras el go.
>
> **2026-09-01 (Ola de orden W1 «Interruptores de verdad» — feature-prefs por dominio, EN CÓDIGO sin OTA)** (SDD
> [ola-de-orden](../specs/ola-de-orden/TASKS.md) § W1, mockup `9801fec7` 1A 2A 3A 4A, 14 commits locales
> `11ebbbbc..29c4a669`): la app del coach lee los 5 dominios de `coach_feature_prefs` (`/api/mobile/config` →
> `featurePrefs.domains`, `lib/entitlements-core.ts` fail-open, `nutritionEnabled` queda como espejo legacy para
> binarios viejos) y `disabledDomains` del nav sale de los 5, no solo de nutrición. **Gates RN (W1.7)** con
> `useDomainGuard` (`lib/domain-guard.ts`: se gatea el EFECTO de fetch y se elige rama en el JSX, nunca early-return
> antes de los hooks) + `components/coach/DomainOffNotice.tsx` (chasis de `ModuleOffNotice`, copy compartido con la
> web desde `@eva/feature-prefs`, CTA «Prender en Mi panel» → `/coach/settings/mi-panel`): `(tabs)/builder.tsx`
> (conserva «Programas», sin «Nueva»; no consume `?primera=1`), `nutrition-v2/index.tsx`, `cardio/index` +
> `cardio/[clientId]`, `movement/index` + `movement/[clientId]` (incl. wizard `?start=1`), `bodycomp/[clientId]`
> (lee el dominio del MISMO `getWorkspaceEntitlements` del recurso). Precedencia: preferencia ANTES que módulo
> (`ModuleOffNotice` queda como kill-switch de operador). **Ficha del alumno (W1.9)**: `lib/client-tabs.ts`
> esconde `analisis`/`plan` con `training:false` y `nutricion` con `nutrition:false`, cae a Resumen sin mutar
> `tab`, y el detalle diario no dispara fetch con el dominio apagado; el override por-alumno no oculta pestañas.
> Paridad web ↔ RN **completa en código** (web: `assertDomainEnabled` + `DomainOffNotice`/`DomainOffBanner` +
> `_lib/profile-tabs.ts`). Tests: `tests/mobile-entitlements-domains.test.ts`, `tests/mobile-nav-tab-keys-contract.test.ts`,
> `tests/mobile/domain-guard.test.ts`, `domain-off.test.ts`, `client-tabs.test.ts`. **QA device del owner
> PENDIENTE** (kut · jesus-coach · jpl; lista en TASKS § W1); sin OTA hasta su go. Pendientes declarados:
> `program-builder` (editor) sin gate `training`; CTA a Mi panel para coach de team cae en la pantalla
> solo-standalone (aviso «lo define el equipo», sin crash) hasta W3; bodycomp apagado muestra «Alumno» en el
> subtítulo (cero fetch). Requiere OTA 1.1.2 (sin cambio nativo).
>
> **2026-09-02 (ejercicios propios: Editar · Eliminar con confirmación · Deshacer · Duplicar, paridad web ↔ RN)**
> (spec [ejercicios-propios-web](../specs/ejercicios-propios-web/SPEC.md), mockup aprobado `9d6f222f`; reporte de un
> coach web-only que no podía borrar los suyos): la **web no tenía NINGUNA puerta** para editar, eliminar ni duplicar un
> ejercicio propio — `updateExerciseAction`/`softDeleteExerciseAction`/`restoreExerciseAction`/`cloneExerciseAction`
> existían sin call site desde `3aac0089`. Ahora el preview del catálogo `/coach/exercises` (`ExerciseCatalogClient.tsx`)
> ofrece «Editar ejercicio» (reusa `ExerciseFormModal` con `exercise=` + prop nuevo `onSaved`), «Eliminar» con
> `AlertDialog` que dice cuántos bloques lo usan (`usageByExercise` desde `workout_blocks`, degradable a `{}`) y toast
> «Deshacer» 8 s (`restoreExerciseAction`), y «Duplicar a mis ejercicios» para el sistema; chip «Propio»/«Del equipo»
> en las cards; la línea de origen decide por `isOwn` (en org/team la fila propia tiene `coach_id` NULL y se leía como
> global). Builder web (`DraggableExerciseCatalog.tsx`, por alumno y plantillas): «Editar ejercicio» en el preview de
> propios, pidiendo la fila completa antes (la lista del builder viene recortada: sin `instructions`/`image_url`, guardar
> las habría vaciado). Actions: `.select('id')` y error explícito con 0 filas (antes PostgREST devolvía éxito
> silencioso), `revalidatePath('/coach/workout-programs/builder')`, y `cloneExerciseAction` reescrita — copia media/tipo
> desde la fila origen (antes el clon nacía sin GIF ni tipo), nace en el pool en workspace team (`resolveExerciseOwner`),
> dup-check scopeado; el borrado de media al editar respeta archivos compartidos por un clon. **RN**: ya tenía
> Editar/Eliminar/Duplicar pero borraba sin preguntar — ahora `ExerciseFormSheet.remove()` confirma con `Alert` (conteo
> real vía `countExerciseUsage`), `deleteExercise`/`restoreExercise` chequean filas, toast «Ejercicio eliminado» con
> acción «Deshacer» (soporte aditivo `action` en `components/Toast.tsx`, API vieja intacta), línea «Usado en N bloques»
> en `ExercisePreviewSheet`, y el catálogo del builder (`ExerciseSearchSheet.tsx` + `program-builder.tsx`
> `catalogReloadKey`) ofrece «Editar ejercicio» sobre propios reusando el mismo sheet; «Usados recientemente» se
> resuelve contra el catálogo (deja de servir la copia vieja). Tests: `exercises.actions.test.ts` 12 verdes (8 nuevos:
> softDelete/restore 3 vías + 0 filas, update 0 filas). Deuda declarada: un bloque ya colocado en el día conserva el
> nombre viejo hasta recargar (web y RN); el builder de plantillas web no scopea el catálogo por workspace
> (preexistente). **EN PRODUCCIÓN 02-09 00:42Z**: `master` = `rnmobiledenuevo` = `322f2c39`, deploy web
> `dpl_7TjwZBD2rk2mBuswTs5Vvh2MLRnb` READY, OTA 1.1.2 canal `production` android `547ba203` (run 33576258157) /
> ios `26ef40d2` (run 33576265663). **QA del owner VERDE 02-09 (web + device) ⇒ SDD `done`**; backlog heredado
> E1–E9 en la TASKS de la spec (bloque ya colocado conserva el nombre viejo hasta recargar, conteo por bloques,
> catálogo de plantillas web sin scope por workspace, thumbnail del clon).
>
> **2026-09-01 (cierre Sentry en RN + tercer estado del ejecutor + Despegue honesto)**: en OTA 1.1.2 `production` (android `0877558f` / ios `b5cf3973`, `master` `cc2a2def`, QA device del owner verde) — el builder ya no remonta la app al volver de Ciclo 14 a Semanal (`DAY_SHORT[8..14] ?? D${id}` en `program-builder.tsx`, `HeroSection.tsx`, `ActiveProgramSection.tsx`; EVA-MOBILE-D), el logo del coach sube sin `ENOENT` en Android (`settings/brand.tsx` sin `allowsEditing`; crop centrado 1:1 en `uploadCoachLogo`; EVA-MOBILE-A) y el ejecutor pide perfil y plan en paralelo con UNA sola query (`workout-session.ts`; EVA-MOBILE-9). **En OTA 1.1.2 (android `05227828` / ios `6a3ea4e9`, 01-09 01:36Z; QA device del owner verde)** (`19b1138b`, mockup «Reintentar y Despegue honesto» 1A + 2A aprobado): `useWorkoutSession` expone `loadError: 'offline' | 'error' | null` + `retry()` (`lib/workout-load-state.ts` puro; NetInfo como verdad de red; solo cuando no hubo caché) y `ExecutorV3` pinta «No pudimos cargar tu rutina» con «Reintentar» / «Volver al inicio» antes del vacío real; el Despegue (`session-morph.tsx` + `lib/despegue-ready.ts`) separa `signalsReady` de `degraded`: al ganar el fallback de 4,6 s dice «ESTO ESTÁ TARDANDO» con los dots vivos y «TOCAR PARA ENTRAR IGUAL» (paridad con `WorkoutLaunchMorph.tsx` web). Tests: `tests/mobile/workout-session-load-error.test.ts`, `session-morph-degraded.test.ts`. QA device del owner **verde** (01-09): plan nunca abierto en modo avión (copy offline + Reintentar + Volver), regresión con caché, y Despegue con red muerta («ESTO ESTÁ TARDANDO» → entrar igual).
>
> **2026-08-29 (guard de acceso RN contaba al alumno demo — 6 coaches free en el muro)**: `lib/coach-access.ts` hacía el head-count de cupo con `is_archived = false` pero SIN `is_demo = false`, así que un coach free v3 (cupo 1) con el alumno de ejemplo del onboarding + su primer alumno real sumaba 2 > 1 y el layout lo mandaba a `/coach/reactivate`; ahí el overview (API, que sí excluye el demo) decía «1 alumno» y ofrecía «Continuar gratis», y `activate-free` lo rechazaba («solo disponible para suscripciones bloqueadas») porque el status seguía `active` — deadlock sin salida desde el teléfono (reporte de `gf.riquelmevera`, 29-08; 5 coaches más en la misma condición). W6.9 (22-08) había corregido el banner del home pero no este guard. Fix: el guard aplica el MISMO predicado canónico que `capacity.service.ts` (web) y `occupiesCap`; `tests/mobile/coach-access.test.ts` pinnea los filtros. La web nunca estuvo afectada (el proxy usa `countActiveStandaloneClients`). Requiere OTA 1.1.2.
>
> **2026-08-28 («+ Nueva» pregunta qué crear + hoja «Entrenamiento incompleto» legible)** (spec
> [library-new-choice](../specs/library-new-choice/SPEC.md), mockup aprobado `9d979bfa`): el CTA hero de la
> biblioteca de programas abre en **ambas plataformas** una hoja «¿Qué querés crear?» con «Programa nuevo»
> (builder, igual que antes) y «Ejercicio personalizado» (catálogo con `?create=1`, que abre el alta solo y limpia
> el param). RN: `app/coach/(tabs)/builder.tsx` (`Sheet` nativeModal) + `ejercicios.tsx`; web:
> `LibraryHeader.tsx` (dropdown `sm+` / bottom sheet `<sm`) + `ExerciseCatalogClient.tsx`. Eventos
> `library_new_pressed` / `library_new_choice` en las dos. **Paridad web ↔ RN completa en código; QA device y
> navegador del owner PENDIENTE** (TASKS W2). Hermana solo-RN: las dos filas de `DoubleIntentSheet`
> (`components/alumno/home/ActiveProgramSection.tsx`) dejan de pintarse sólidas en dark (`bg-sport-100` sin
> `dark:` ⇒ token crudo); ahora igualan el patrón de la web (`WorkoutDoneSheet.tsx`, que ya estaba bien).
>
> **2026-08-26 («Vive tu app» directo — lo que cambia en RN)** (spec
> [vive-tu-app-directo](../specs/vive-tu-app-directo/SPEC.md), commits `2d19e237..e7ed1de9`): el coach que
> toca «Vive tu app» desde la app **entra directo** — la URL que emite el endpoint móvil ahora lleva
> `&src=rn&from=<guia|builder>` (`lib/vive-tu-app.ts`, `openViveTuAppGuided({ from })`; el builder pasa
> `from: 'builder'`), y ese `src=rn` es el que hace que el banner de la sesión demo en la web ofrezca la
> **vuelta a la app** en vez de un cierre de sesión. El `from` viaja en el body con allowlist de dos valores
> y default `guia`; el **body es opcional** a propósito, para que un bundle anterior al OTA que postea sin
> cuerpo siga funcionando. `isStoreSafeUrl` acepta el link (mira el path, no la query) y hay caso positivo en
> `tests/mobile/store-compliance.test.ts`.
>
> **La guía se recarga al volver**: `apps/mobile/lib/guia-reload.ts` (NUEVO, puro —
> `shouldReloadOnAppState(prev, next)`) + listener `AppState` en `app/coach/guia.tsx`, con `inFlightRef`
> **dentro de `load()`** para que el deduplicado cubra a los tres llamadores (listener, `useFocusEffect` y
> `onViveTuApp`). Sin esto el coach volvía del navegador y veía la guía cacheada, sin el tilde. **Regresión
> menor declarada:** `program-builder.tsx` **no** lleva listener (no tiene `load()`; vive del snapshot de
> `useCoachOnboarding`).
>
> **`+native-intent.ts`** gana la allowlist explícita `coach/guia → '/coach/guia'` (el resto del árbol de
> coach sigue devolviendo el path crudo), que es la que aterriza el `intent://…;scheme=eva;package=cl.evaapp.eva;end`
> de Android y el `eva://coach/guia` de iOS que emite el banner web. **Cero cambios nativos**: `app.json` ya
> declara `"scheme": "eva"` y el filtro que genera Expo no restringe host, así que el deep link entra con el
> binario actual (mismo mecanismo que el `eva://auth/confirmed` que ya corre en producción). Efecto lateral
> aceptado: `eva://coach/guia/loquesea` también aterriza en la guía.
>
> **Explainer v2 con clave versionada**: `VIVE_TU_APP_EXPLAINED_PREFIX` pasa a
> `eva.vive-tu-app.explained.v2:` para que quien ya vio el v1 se entere del botón nuevo — «…toca «Volver a la
> app» o usa el botón atrás.», literal idéntico al del banner web (nada lo pinnea automáticamente: son dos
> strings en árboles distintos, deuda anotada). El sello `…v1:` queda huérfano en AsyncStorage a propósito.
>
> **Chip «Entró hace X» en el roster** (`components/coach/directory/directory-shared.ts`): el estado del
> alumno usa `first_login_at` y solo puede **afirmar la ausencia de login** para filas nacidas después de
> `FIRST_LOGIN_SIGNAL_CUTOVER = '2026-08-26T06:00:00Z'` — constante **duplicada web/RN** (RN no importa de
> `apps/web`) que se mueve en los dos archivos a la vez o miente.
>
> **Auto-alta bloqueada**: `CreateClientModal` del directorio avisa y deshabilita cuando el correo tipeado es
> el del propio coach («usa Vive tu app desde tu panel»), leyendo la sesión **local**
> (`getSession()`, no `getUser()` de red) y una vez por apertura; el 409 `OWN_EMAIL` del servidor cae en
> `fieldErrors.email` (inline, nunca el banner global). Copy sin plan, sin precios y sin `eva-app.cl`
> (guards `tests/mobile-no-prices` y `tests/mobile/store-copy` verdes). Nota declarada: `showsCupo` se apaga
> si `guidedCapNote` ya está en pantalla, para no decir dos veces que el demo no gasta cupo.
>
> Gates verdes al cierre: `tsc` mobile, `tests/mobile/{guia-reload,native-intent,vive-tu-app-explainer,store-compliance,guided-invite,directory-status}`
> y los guards de tiendas. **Requiere OTA a los runtimes 1.1.1 + 1.1.2** (disparada en el cierre de esta ola;
> sin cambios nativos ⇒ no hay binario) **+ QA device**: `eva://coach/guia` y el `intent://` de Android con la
> app **cerrada** (cold start por `initial: true`), «atrás» con sesión demo, y el explainer v2. Dependencia
> dura de release: el explainer promete un botón que solo existe con el deploy web de W2 arriba.

> **2026-08-22 (Nutrición V2 · «eliminar plantilla» EN PARIDAD)**: feedback del coach en iOS
> («¿No puedo eliminar plantillas ya creadas? Si no me sirven quedan ahí para siempre») — la
> biblioteca RN solo sabía abrir y editar. Ahora la pestaña **Plantillas** del hub tiene la baja:
> papelera con `accessibilityLabel` junto al lápiz **y** pulsación larga en la fila, confirmación
> con el diálogo del DS (`NativeDialog`, nunca `Alert` nativo) — «¿Eliminar «X»? Los alumnos que ya
> la tienen aplicada no cambian.» + «Esta acción no se puede deshacer.» —, botón destructivo en
> «Eliminando…» mientras responde el servidor, toast «Plantilla eliminada» y la fila fuera de la
> lista sin esperar el refetch. Camino de escritura: acción **`deleteTemplate`** de
> `POST /api/mobile/nutrition-v2/coach/mutate` (la única puerta de escritura del coach móvil,
> NUT-005) → `deletePlanTemplate` → RPC definer `soft_delete_nutrition_plan_template_v2`, que exige
> `auth.uid()` = dueño; una plantilla ajena y una inexistente responden lo MISMO. Es soft-delete:
> los planes ya aplicados son versiones propias del alumno, no punteros, así que no cambian. **Sin
> paridad**: el «Deshacer» del toast web (re-crea la plantilla desde un caché del contenido) no
> existe en RN — por eso el diálogo lo dice. El picker «Nuevo plan → Reutilizar» comparte la lista
> pero NO recibe `onDelete`. Pinneado en `tests/mobile/nutrition-v2-plan-template-delete.test.ts`
> (predicado y copy) y en el `route.test.ts` del endpoint. Requiere OTA + QA device.

> **2026-08-22 (W4.7-rn de coach-onboarding-v2 — un solo onboarding por área)**: mueren en la app
> el modal de bienvenida Free (`MobileFreeWelcomeModal`) y el checklist de 4 pasos
> (`MobileOnboardingChecklist` + sus 6 bloques, ~650 líneas) — la guía v2 (`/coach/guia` + píldora)
> ES la bienvenida, en todos los planes; y `lib/onboarding-mode.tsx` (`OnboardingModeProvider`
> montado en `app/coach/_layout.tsx`, `isGuideActive` de `@eva/onboarding` sobre la foto que ya
> publica el dashboard) apaga el AUTO-arranque de los tours de módulo mientras la guía está activa
> —el «?» los sigue abriendo y no marca nada como visto—. Cubre el tour del hub de Nutrición y el
> del editor (`useTourController`); `settings/brand.tsx` no auto-lanza nada, así que no se tocó.
> Pinneado en `tests/mobile/onboarding-mode.test.tsx` y `tests/mobile/tour-autostart-guide.test.tsx`.
> Requiere OTA + QA device.

> **2026-08-22 QA owner Android (W6.10 del embudo Free→Pro)**: el banner Free del home deja de
> imprimir «0 de 1 alumno activo» dos veces (`ClientCapMeter` con `showLabel={false}`, el estado
> «Cupo completo» pasa al `accessibilityLabel` de la fila); `MobilePublicCodeRequiredModal` se
> rediseña con el DS («Tu link de alumnos cambió» con tilde, halo `theme.primary`, el link como
> pastilla mono con «Copiado ✓», acciones en fila); y el alta con cupo lleno abre DIRECTO en el
> muro (`shouldOpenAtCapWall` en `lib/client-cap.ts`) en vez de dejar escribir el formulario para
> rechazarlo al enviar, con «Ver mi plan» nueva en el muro y `upgrade_gate_hit` etiquetado por
> `source`.

> **2026-08-22 (W6.2/W6.3/W6.6 del embudo Free→Pro — cupo visible y acción real, sin vender)**: el
> muro de cupo de `CreateClientModal` pasa a ESTADO + acciones reales (**[Archivar un alumno]** →
> `ArchiveToFreeSpaceSheet` nuevo sobre el `Sheet` DS, con confirmación inline y archivado
> reversible · **[Actualizar estado]** · «Entendido»), con copy y caption servidos por
> `lib/client-cap.ts` (`capWallCopy`): la línea «Los cambios de plan se hacen en eva-app.cl» existe
> SOLO en Android, texto plano y sin `Linking`, y en iOS ni se monta; medidor de cupo nuevo
> `components/coach/ClientCapMeter.tsx` (barra/anillo, marca <80 % · ámbar ≥80 % · «Cupo completo»
> al 100 %, `accessibilityRole="progressbar"`) reemplaza la barra inline del banner Free del home;
> el tono «Mejorar mi plan» muere en `ProgresoTab` y `BuilderDayStrip` («Ver mi plan», mismo
> destino) y `verify-email` deja de decir «Upgrade cuando quieras». Lógica pura pinneada en
> `tests/mobile/client-cap.test.ts`. **QA device del owner pendiente** (W6.8) y requiere el
> mismo OTA de W5.
>
> **Ronda de revisión adversarial (W6.9, mismo día)**: el sheet de archivado deja de ser un
> `<Modal>` dentro de otro `<Modal>` (overlay en la MISMA ventana, patrón `ImportWatchSheet`: dos
> ventanas nativas anidadas son el precedente del «pantalla gris» de Android) y EXCLUYE a los
> alumnos de ejemplo, que no ocupan cupo; el banner Free del home pasa a medir con `capClients`
> —el predicado del gate del server (`is_archived = false AND is_demo = false`), no el KPI de
> activos—; `verify-email` deja de fusionar el «dónde» dentro de un beneficio y baja la línea
> canónica de Android como caption aparte (guard de árbol `tests/mobile/store-copy.test.ts`);
> el CTA de Novedades pasa por la allowlist nueva `lib/store-compliance.ts` (`isStoreSafeUrl`) para
> que una URL escrita en el panel de admin no pueda mandar a `/pricing` desde dentro de la app; y
> `BuilderDayStrip` deja de nombrar el tier ajeno. En la web, `OpenInAppCard` pierde el botón: la
> ruta `/coach/subscription` no estaba cubierta por el universal link / app link (ambos quedaron
> preparados, pero el `intentFilter` exige BINARIO nuevo, no OTA).

> **2026-08-22 (W5 del embudo Free→Pro — la app deja de hablar de plata)**: el sello «Hecho con
> EVA» aterriza en `/hecho-con-eva` (landing sin precios) en vez de la home con `PreciosSection`;
> `lib/coach-tiers.ts` deja de re-exportar `TIER_CONFIG` y expone `getTierMaxClients`, con guard
> nuevo `tests/mobile-no-prices.test.ts` que barre `apps/mobile/**` contra precios; el muro de cupo
> de `CreateClientModal` y los tres copys de plan Free de `CoachDashboardSections` usan
> `studentCountLabel` (se acabó el «1 alumnos»); `coach/(tabs)/perfil.tsx` toma `TIER_LABELS` de
> `@eva/tiers` (el espejo local no tenía `free`). Requiere OTA a los runtimes vigentes junto con W6.

> **2026-08-22**: reenvío de confirmación desde la app (uid + endpoint móvil con guards) — el alta
> móvil devuelve el `uid`, `(auth)/verify-email` gana el botón «Reenviar correo» con cooldown de
> 60 s, y `POST /api/mobile/auth/resend-confirmation` replica los 7 guards del reenvío web
> (identidad por uid, nunca por email del body). Cierra el callejón sin salida del coach cuyo
> correo de confirmación cae en spam. QA en device pendiente (W4.6 de `specs/embudo-free-pro`).

> **2026-08-19 (saneo documental — qué QA en device existe de verdad)**: los bloques fechados de
> abajo quedaron congelados en su día y varios dicen «QA device pendiente» sobre trabajo que el
> owner ya probó. Estado real al 19-08: **3 rondas en device Android el 17-08** (cabina, tour,
> sello, roster y el editor único RN, que era el pendiente T3.3b) y **una tanda más el 18-08**
> sobre el OTA de `4de66a5c` (android **+ ios**), de la que salieron equivalencia del reemplazo
> visible, teclado que tapaba «Notas para tu alumno», sheets `nativeModal` al borde en Android,
> «Aplicar» plantilla y el foco del tour. Sigue **sin acta**: el flujo multi-día del editor, el tab
> Alimentos RN (crear/clasificar/filtros y, sobre todo, clasificar un alimento **GLOBAL**), la
> semana completa (`nutrition-week-view` cerró sin una sola tarea de QA), las notas del coach
> (📝 por franja y por grupo, entraron después de las rondas) y la matriz transversal MOB-02 —
> que además **no es certificable por OTA**: el config plugin del splash exige binario nuevo.

> **2026-08-17 (paquete post-QA de T3.v: wave 2 + «Familia N», web+RN)**: cierran los
> hallazgos restantes del QA del owner — cinta compacta 768-1023 sin solapes (track
> `minmax(0,1fr)` que derramaba sin crecer el body; gate anti-solape nuevo probado en rojo),
> centrado real del lienzo a 2xl (49px→0 medido, lienzo por fin a los 880 del contrato),
> columna cantidad/unidad estable en web y `TextInput` de Android centrado en RN (métricas
> compartidas `QUANTITY_CONTROL_HEIGHT_CLASS`), chevrons con afordancia + rotación + altura
> animada (`grid-rows` + `inert` web / LayoutAnimation RN, reduced-motion respetado).
> **«Familia N»**: TODA alta de nutrición (alimento·libre·franja·grupo·día·plantilla·nueva
> versión) usa la pastilla `AddActionButton` con los iconos clay del owner
> (`public/action-icons` + assets RN bundleados); «alimento» = stack de 3 categorías;
> primarias con **contraste white-label dinámico** — web `getContrastInfo` sobre el
> `--theme-primary` computado (`useBrandPrimaryHex`), RN `readableInkOn` espejo matemático
> exacto (mismos casos verificados en ambas plataformas por tests y por el gate contra DOM:
> `#F5D90A`→tinta oscura 13.05:1, `#1D4ED8`→blanca 6.70:1) — de paso se arregló el CTA de
> plantillas RN que llevaba `text-white` fijo sobre la marca. Gate visual: 75+ asserts.
> **QA device del owner pendiente sobre el OTA #2.**

> **2026-08-16 (fixes del QA T3.v — el hub RN copia el tablist de la web; Porciones se rescata)**:
> decisión del owner: **la web/PWA es el jefe**. El tablist del hub V2 en RN pasa a ser
> `Alumnos · Plantillas · Alimentos · Curación`, idéntico a
> `apps/web/.../nutrition-v2/_components/NutritionHubTabs.tsx`. La pestaña **Plantillas** es nueva
> en RN: monta la biblioteca del coach con `PlanTemplateList`
> (`apps/mobile/components/nutrition-v2/PlanTemplateList.tsx`), extraída del sheet
> «Nuevo plan → Reutilizar» para que picker y pestaña compartan una sola lista; cada fila abre la
> plantilla en el editor único (`plantillas/editor?template=<id>`) y el CTA de cabecera crea una
> nueva. Sin paridad: «Desde un alumno» (segunda alta de la web) sigue siendo web-only — no tiene
> endpoint mobile. **Porciones deja de ser pestaña** y vuelve a ser **pantalla propia**
> (`/coach/nutrition-v2/portions`), a la que se entra desde un acceso secundario en la pestaña
> Alimentos; embebida bajo el overlay del tablist nacía tapada y su tira de grupos se estiraba
> (un `ScrollView` de RN trae `flexGrow: 1` y el content container alinea en `stretch`: los chips
> `rounded-pill` se veían como óvalos gigantes). El deep link viejo `?tab=portions` ya no existe y
> cae a `roster`; a cambio `resolveNutritionHubInitialTab` acepta los slugs en español que escribe
> la web (`alumnos|plantillas|alimentos|curacion`), así que un link copiado del navegador aterriza
> en la misma pestaña. **Bug de datos arreglado**: la lista de equivalencias del teléfono siempre
> fallaba con «No pudimos cargar la lista» porque el GET de
> `/api/mobile/nutrition/exchanges/group-foods` validaba el `groupId` con una regex RFC 4122 propia
> y los grupos del SISTEMA están sembrados con ids no-RFC
> (`0000e8c0-0000-0000-0000-00000000000N`); ahora usa `z.guid()`, igual que los schemas
> compartidos y la server action web, con test de regresión en `route.test.ts`. Gates:
> typecheck web+mobile, `expo export --platform android`, `check:tokens` y vitest de las rutas de
> exchanges, todo verde. **QA en dispositivo PENDIENTE.**

> **2026-08-16 (T3.v Cabina — pasada visual del editor único, web+RN, SIN QA del owner)**:
> **MacroSpark** (kcal mono + barra apilada P/C/G por aporte calórico 4/4/9, popover de gramos
> con contrato D3: hover 120 ms en puntero fino, tap en grueso, Esc/tap-fuera/scroll cierran,
> uno abierto a la vez) reemplaza a `MacroChipRow` en TODAS las superficies del editor
> único/quick-edit convergido, **web y RN**: fila de item (foto real de producto 34–36 px con
> fallback a ícono de categoría; item libre = tile punteado), header y contraída de franja
> (stack de hasta 4 fotos + subtotal con «% de la meta»), PublishBar (kcal x/meta + micro-barras
> por macro con su token), picker/paleta (spark por la base REAL del alimento — `per_serving`
> no miente «por 100 g», prop `basisLabel`). Porcentajes = `macroCalorieShares` en
> `@eva/nutrition-v2` (una sola fuente con tests golden: drift web↔RN imposible por
> construcción). Web además: **cinta** ≥768 (anillo semántico de kcal + «Metas del día ▾» que
> hospeda `TargetsEditorCard`; el canvas deja de pintar la card de metas bajo cinta viva) y
> **rail de días** ≥1024 (dots verde/ámbar, kcal por día, defecto B4 como enlace
> `APPLY_BASE_PORTIONS`; cápsula horizontal sigue <1024). RN espeja con **mini-cinta sticky**
> (kcal x/meta + 3 % con dot de macro) y «Metas» como hoja del header en `QuickEditMode`
> (cubre ambas pantallas del editor). Divergencias declaradas: rail/paleta = solo desktop web;
> popover RN sobre `_anchored` (Modal medido con flip/clamp). Builder y área alumno con diff
> CERO. Gates 2026-08-16 todo verde: typecheck web+mobile, vitest (3.336), `check:tokens`,
> boundaries, `expo export --platform android`, Playwright harness 41 asserts × 5 anchos ×
> 2 temas. **QA del owner (web responsive + device Android) PENDIENTE; OTA android ACUMULADO
> PUBLICADO 2026-08-17 por decisión del owner (grupo `aca6fc76`, android `01a00d3d`,
> runtime 1.1.0, GH Actions run 31983615828) — el QA device corre sobre ese OTA.**

> **2026-08-16 (T3.3a convergencia del quick-edit RN, rama `rnmobiledenuevo`, SIN QA device)**:
> el quick-edit del coach RN consume la **gramatica compartida** de `@eva/nutrition-v2`
> (`editor-state`, R1): murieron el reducer RN (1.600 LOC) y el reducer paralelo de porciones —
> las porciones viven EN el arbol y el publish proyecta con la MISMA dupla del web
> (`readModelToDraft` + `applyQuickEditToDraft`, diff por `id`). Con la convergencia el QE RN
> **gana**: porcion pegajosa N/A (solo editor), copy de franja con porciones atomico, undo de
> porciones al indice, y nota de porciones ahora tambien existe en la gramatica web
> (`SET_PORTION_NOTES`). **Cambios de comportamiento declarados**: (1) el lapiz de correccion de
> macros (T2.2) en QE RN queda SOLO para items con alimento hidratado en la sesion (swap/alta) —
> criterio W2 del editor; los items base viven de su `macroBase` congelado (el fetch del mapa de
> foods murio); (2) el diff pasa de key-based a id-based (semantica web: franja nueva cuenta 1,
> no 1+N items); (3) los respaldos locales v1 (dos reducers) se DESCARTAN (`schema: 2`).
> **QA device Android del owner: OK (2026-08-16)** sobre el quick-edit convergido; el **OTA queda
> ACUMULADO** por decision del owner (sale junto a T3.3b + pasada visual, al cerrar el retiro del
> par viejo). El editor unico RN completo (metadatos, creacion, plantillas) sigue en **T3.3b**.

> **2026-08-16 (T3.3b — EL EDITOR UNICO YA EXISTE EN RN; gap de paridad CERRADO)**: el coach
> movil gana `/coach/nutrition-v2/editor/[clientId]` (+ `plantillas/editor`) sobre la MISMA
> gramatica compartida, y el **corte RN** ya ocurrio: la ficha ("Crear plan" y "Editar plan"),
> el `+` del hub y el CTA por fila del roster entran por el editor; el par viejo queda como
> camino secundario ("Edición rápida (clásica)" en la ficha; el wizard solo por URL directa).
> Cruzan a RN: metadatos del plan (nombre, estrategia con la regla segura, 4 permisos + tope
> ±%), creacion `?from=template:|plan:` o en blanco con vigencia elegible, reemplazos
> autorizados EDITABLES, override de macros, duplicar dia, copiar dia a varios dias
> (Reemplazar/Sumar + presets + aviso previo), reorden de items (Subir/Bajar en vez del drag
> de escritorio), capsula de dia activo, totales del dia fijos y **porcion pegajosa (cierra la
> deuda T2.6 F4 RN)**. Plantillas: crear/editar desde el telefono por un camino de escritura
> movil nuevo (`saveTemplate` del endpoint de mutaciones, mismo servicio que la web).
> **Divergencias declaradas**: (a) el editor RN muestra los 4 permisos + tope ±% (el wizard RN
> mostraba 2 por la poda de la ola 3) — manda el editor web, que es la superficie canonica;
> (b) el drag con manija es web-desktop y en RN se expresa como Subir/Bajar; (c) la paleta
> lateral `lg+` no aplica al telefono; (d) sin respaldo local en creacion ni en plantilla
> (mismo pendiente declarado que la web). **QA device del editor RN: HECHO** — el pase único del
> owner del 2026-08-17 (device Android, 3 rondas; V4.2 de la Cabina lo declaraba explícitamente
> como «incluye el pendiente T3.3b del editor RN») y el OTA **dejó de estar acumulado**: salieron
> los grupos `aca6fc76`, `7738d234`, `a4dafcea`, el #4 (`dff7edc8`) y el #5 (`768389fb`) el 17-08,
> y la tanda del propio QA el 18-08 desde `4de66a5c` (android + ios). Sigue **sin acta el flujo
> multi-día** (agregar día, cambiar día, duplicar como otro día): ninguna ronda registrada lo
> menciona — pendiente de QA en device del owner (auditoría 17-08). Esta línea decía «QA
> PENDIENTE; el OTA sigue acumulado» hasta el saneo documental del 19-08.

> **2026-08-15 (T3.x editor unico de nutricion — corte web W4, rama `rnmobiledenuevo`)**: la web
> corto sus CTAs al **editor unico** (`/coach/nutrition-v2/[clientId]/editor`): la ficha, el `+`
> del Centro V2, el roster del hub, el tab del cliente y "Aplicar plantilla" (`?from=`) apuntan
> ahi; el quick-edit clasico y el wizard quedan como caminos secundarios del menu "..." durante
> la ventana de retiro. **GAP RN DECLARADO**: en `apps/mobile` NO existe el editor unico — el
> coach movil sigue con su par builder/quick-edit de siempre (sin cabecera de metadatos, sin
> creacion `?from=`, sin sustituciones editables, sin override en quick-edit, sin duplicar/copiar
> dia, sin porcion pegajosa en quick-edit, sin capsula/paleta). La paridad llega en **T3.3**
> (editor RN Android sobre los reducers compartidos de R1); nada del corte web toca RN.
> Programa: [`specs/nutrition-unified-editor/`](../specs/nutrition-unified-editor/SPEC.md).

> **2026-08-06 (F0 Sentry+RN, `7ccf7a07`/`8a7eaecf` en master)**: resuelto el crash-loop P0 de
> arranque en Android — `expo-blur` (dimezisBlurView) reemplazado por velo JS plano (`EvaBlur`) —
> y Sentry quedó vivo en web (replay) y RN. Pusheado; **queda build Android `eas build --local`
> (los builds locales no aparecen en `eas build:list`) + QA en dispositivo**. GOTCHA operativo:
> Play y TestFlight comparten canal `production` y runtime `1.1.0` — un OTA sin
> `--platform android` toca la build iOS que está en App Review.

> **2026-07-31 (cierre de archivado + V2 canónica, en integración)**: RN/Web usan Nutrition V2 como
> entrada canónica para Standalone/Team; se retiró el filtro de ausencia de plan V2 y los aliases
> legacy quedan solo para compatibilidad hasta versión mínima. El directorio RN trata archivados como
> filas no navegables: su única acción es desarchivar cuando el workspace tiene cupo. El perfil directo
> queda suspendido, limpia sesión/caché/cola ante `CLIENT_BLOCKED` y no reactiva planes al volver.
> La migración forward-only de asignaciones y la guarda RLS/read-model histórico siguen **sin aplicar
> en producción**; falta entorno Supabase controlado, JWTs reales, Playwright y QA físico Android/iOS.
> El detalle de corte está en [`NUTRITION_V2_CUTOVER_RUNBOOK.md`](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md).

> **2026-08-04 (F4 ola 1 — porciones del coach en RN)**: la pestaña **Porciones** del hub V2
> (`apps/mobile/app/coach/nutrition-v2/portions.tsx`, deep link `?tab=portions`) espeja la sección
> Porciones de `/coach/foods` en web: buscador sobre TODO el catálogo, gramos sugeridos por el
> servidor, preview de la frase del alumno, y quitar/restaurar alimentos de la lista propia. Toda
> escritura pasa por `/api/mobile/nutrition/exchanges/group-foods` (NUT-005), que comparte servicio
> con la web para que no puedan divergir. **Sin QA en dispositivo ni build EAS todavía.**
>
> Deuda conocida de esta ola: ~~la pantalla usa `style` inline~~ (saldada el 2026-08-04: la pestaña
> quedó 100% NativeWind, los únicos `style` que sobreviven son el color de marca runtime, y el
> `#fff` hardcodeado de los CTA pasó a `theme.primaryForeground` — antes rompía white-label con
> marcas claras); el resto de la deuda la cierran las olas siguientes de esta misma fecha.

> **2026-08-04 (F4 ola 2 — duplicar con copia de lista + conteo de equivalencias)**: cierra dos de
> las deudas del bloque anterior. (a) **"Duplicar y ajustar"** llega a RN
> (`apps/mobile/components/nutrition-v2/DuplicateGroupSheet.tsx`) desde la pestaña Porciones y desde
> el picker de grupos del builder: crea un grupo propio y, por defecto, copia su lista completa
> **reescalada por regla de tres**. El reescalado vive solo en el servidor
> (`duplicateExchangeGroupWithList`), al que RN llega por el handler `PUT` nuevo de
> `/api/mobile/nutrition/exchanges/groups` — mismo schema y mismo servicio que la server action web,
> así que web y teléfono no pueden producir gramos distintos. La copia es best-effort: si falla, el
> grupo creado se conserva y se avisa. (b) **Conteo de equivalencias por grupo**: el GET de
> `/api/mobile/nutrition-v2/exchange-groups` devuelve `foodCounts` y RN lo pinta en los chips de
> Porciones, en el picker del builder y —cuando un grupo prescrito está en 0— como aviso ámbar de
> **porciones huérfanas** en la franja. Un fallo del conteo nunca rompe el catálogo: se degrada a
> mapa vacío y la UI calla en vez de acusar de vacío a un grupo lleno. Además,
> `countExchangeListRowsByGroup` ahora pagina: PostgREST cortaba en `max_rows` (1000) y la tabla ya
> pasa las 2.500 filas, así que el conteo que también usa `/coach/foods` venía truncado.
> **Sin QA en dispositivo ni build EAS todavía.**

> **2026-08-04 (F4 ola 3 — plantillas de plan en el builder RN)**: el `+` del hub RN gana las dos
> pestañas de la web ("Desde cero" / "Reutilizar"): elegir plantilla → elegir alumno → el builder
> abre con `?from=template:<id>` (misma puerta única AD-3 que la web, `parsePlanBuilderOrigin`).
> Endpoint móvil nuevo `GET /api/mobile/nutrition-v2/plan-templates` (lista y carga-para-aplicar;
> reusa `plan-templates.service` con el cliente token-scoped y resuelve server-side los alimentos
> del draft). Con `builder` payload usable se aplica vía `RESTORE`; las 33 plantillas importadas de
> V1 (solo `draft`) pasan por el port RN de `builderStateFromTemplateDraft`
> (`apps/mobile/lib/nutrition-v2-builder-template.ts`). `effectiveFrom` se fuerza a hoy en ambas
> ramas. `?from=plan:` aún no está en RN. **Sin QA en dispositivo ni build EAS todavía.**

> **2026-08-09 (T2.3 web — el hub es la única casa del catálogo)**: en web, `/coach/foods` pasó a
> ser un redirect 307 al tab Alimentos del hub V2 (`1eaea68c`); crear, clasificar en grupos con
> porciones (formulario único), filtro "Editados por mí", "Solo míos" y navegar sin buscar viven
> ahora en `coach/nutrition-v2`. Las menciones anteriores de este documento a `/coach/foods` son
> históricas. **Deuda de paridad SALDADA el 2026-08-11** (`6c4da722`, `949a1eab`, `a0b976e7`): el
> tab Alimentos RN (`apps/mobile/app/coach/nutrition-v2/foods.tsx`) ganó crear/clasificar/filtros
> — esta línea la declaró pendiente hasta el saneo documental del 19-08.

> **2026-08-13 (T2.6 F6 — velocidad de autoría: qué cruzó a RN y qué queda declarado)**: del
> programa T2.6 (`docs/specs/nutrition-authoring-speed/`) cruzaron a RN las piezas de gramática y
> notas: (a) **F1** — el builder RN gana `RESTORE_SLOT` (espejo exacto del web, idempotente y con
> índice) y "Quitar franja" pasa de borrado seco a optimista + snackbar Deshacer
> (`UndoSnackbar` reusado del quick-edit); el quick-edit RN pierde el `Alert` de confirmación que
> tenía ENCIMA del undo y la ventana se unifica en 8 s (`UNDO_TIMEOUT_MS`, era 5 s) — una sola
> gramática destructiva en las dos plataformas. (b) **F5** — `SET_VISIBLE_NOTES` + validación de
> tope (8000, espejo del contrato) en `lib/nutrition-v2-builder.ts` y campo "Notas para tu alumno"
> en el paso "El plan" del builder RN (el quick-edit RN ya las editaba desde 4B-03).
> **Declarado SIN portar** (no cruza en esta tanda): (c) **F2 copy semana** — quick-select
> "próximos 1/2/4", modo Sumar (`APPEND_VARIANT_SLOTS_TO`) y el aviso previo con duplicados; el
> copy de día RN hoy solo duplica a días LIBRES (`DUPLICATE_VARIANT_AS` filtra ocupados), así que
> portarlo implica también la semántica reemplazar-ocupado con confirmación — pieza propia. En el
> menú de la franja RN falta el quick-select (decisión A: los chips solo MARCAN la selección; la
> fusión por nombre ya es idéntica en las dos plataformas). (d) **F4 porción pegajosa** — las RPC
> ya están en LIVE (`coach_food_last_qty_for_client` invoker+RLS, `coach_food_last_qty_remember`
> definer con guards) y el `ADD_ITEM` web acepta `prefill`; a RN le falta el camino de datos
> (llamada con JWT del coach — directa o vía `/api/mobile`) y el prefill en su `ADD_ITEM`.
> **QA en dispositivo COMPLETO (owner, 2026-08-15)** vía OTA android `a93d01a3` (F2 copy semana y
> F4 porción pegajosa siguen declarados SIN portar). El OTA fue android-only: iOS 1.1.0 (54) sigue
> en App Review y el canal es compartido.
>
> **Actualización 2026-08-19 (saneo documental)**: (c) y (d) ya no describen el árbol. El nivel
> **día** de F2 cruzó a RN con la gramática compartida de R1/T3.3b — `QuickEditMode.tsx` despacha
> `COPY_VARIANT_TO_DAYS` (modo Reemplazar/Sumar + presets + aviso previo) contra
> `packages/nutrition-v2/editor-state.ts` — y **F4 porción pegajosa la cerró T3.3b W3**
> (`a95f1811`). Lo que sigue sin existir es el quick-select «próximos 1/2/4» **del menú de la
> FRANJA**, y ya no es deuda solo-RN: su única implementación
> (`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/CopySlotMenu.tsx`) cuelga
> de `SlotEditor.tsx`, o sea del wizard que perdió todas sus puertas en `0355d67d` ⇒ hoy es
> **inalcanzable en las dos plataformas** (regresión inventariada en la auditoría del 17-08, §3).

> **2026-08-14 (T2.7 re-skin del alumno — qué cruzó a RN y qué es web-only)**: del programa T2.7
> (`docs/specs/nutrition-student-reskin/`) cruzaron a RN en los MISMOS commits que web: **F1**
> paleta de macros al trío fijo (`61718112`, canales `--color-macro-*` en `global.css` +
> `macro.*` en tailwind, V1 RN alineada vía `MACRO_COLORS`), **F2** banda de energía + checkbox
> de registro (`7746e18f`, `energyBandGeometry` compartido; RN anima el fill con `onLayout`),
> **F2/F3** racha "N de 7 en rango" + tendencia del historial (`e49e2d25`, helpers en el paquete)
> y los puntos del strip por RANGO (`477bc476`, `rangeDot` materializado en `buildNutritionWeek`
> con fallback para payloads viejos). **Web-only por diseño** (no aplican a RN): H8-H13 — toda la
> saga "marcar → tabs muertos" es del App Router web; la causa raíz real (H13, `c74b176c`) fue una
> tormenta de re-renders de `usePortionMarks` web bajo delta de `useOptimistic` que dejaba las
> transiciones (la navegación del router lo es) sin turno. **RN es inmune verificado**: su
> `usePortionMarks` (`apps/mobile/components/alumno/nutrition-v2/usePortionMarks.ts`) es
> useReducer + refs, sin `useOptimistic` en todo `apps/mobile`. El puente fetch H12 tampoco aplica
> (RN ya hablaba por `/api/mobile/*`). **QA en dispositivo del re-skin RN: COMPLETO (owner, 2026-08-15)**
> sobre los OTAs android `a93d01a3` + `901dc471`; la ronda 2 (`dd43c45c`) arregló la media del detalle
> de Aprender (el catálogo guarda el GIF animado en `video_url`, gif_url null en 818/889 → clasificar
> con `execMediaKind`, nunca por columna) y dos víctimas del gotcha css-interop `style`-función
> ("Fuentes y método" y el share de Records).

> **2026-08-17 (Guía Viva — onboarding de nutrición, paridad 1:1 por diseño)**: los tours
> spotlight del editor y del hub existen en las dos plataformas con el MISMO contrato: guiones
> compartidos en espíritu (editor 8 pasos web ancho / 6 compacto = el guion RN; hub 6 idéntico,
> copys literales del artifact aprobado), flag `eva.tour.<id>.v1.<coachId>` con clave IDÉNTICA
> (localStorage web / AsyncStorage RN — un test de contrato cruzado importa ambos módulos y exige
> igualdad), «Saltar»=«Listo» para la memoria, y «?» de 30 px repetible. Diferencias deliberadas:
> RN no tiene guion de 8 (rail y paleta no existen en el teléfono), la tarjeta RN es SIEMPRE dock
> (D3 por construcción), y el «?» del editor RN flota sobre la PublishBar porque sus dos CTA
> `flex-1` ocupan todo el ancho (D2 manda sobre la letra de la SPEC). Deuda menor declarada: el
> paso «Metas» dice «popover» y en RN abre bottom sheet (copy cerrado por D6, decisión del owner).
> **QA en device del tour RN: HECHO** en las rondas del owner del 17-08 y 18-08 — de ahí salieron
> el OTA #4 (`dff7edc8`: «tour RN corregido, misma ventana + scroll al target») y el foco del tour
> que caía en la barra de estado, arreglado en la tanda del 18-08. **Deuda viva declarada**: la
> tarjeta del tour queda **bajo la tab bar**; el arreglo real es subir el punto de montaje del
> overlay al layout raíz (tanda propia, verificada como NO hecha en código el 19-08). Esta línea
> decía «QA en device del tour RN pendiente» hasta el saneo documental del 19-08.

> **2026-08-17 (Sello EVA v2 — fondo Horizonte B, paridad por contrato)**: `AppBackground` RN v2
> = espejo del `AppSeal` web. La grilla 40×40 se RETIRÓ y el `SKY #38BDF8` fijo murió: el segundo
> blob sale del par del tema (`sealPair` de `@eva/brand-kit`, mismo helper que publica
> `--seal-*-rgb` en web — preset ⇒ par curado del catálogo; legacy ⇒ derivado H+38°, W-brand B2
> estricto). Deriva Reanimated UI-thread pura (46s/58s, cero JS por frame), gateada por
> reduce-motion y prop `animated` (kill-switch para el QA de batería del owner). Grano jamás
> anima; alphas por tema en `SEAL_TOKENS`, gobernados por `check:tokens` contra los `--seal-*`
> web (5 tokens × light/dark). Familia de entrada RN intacta (usa `EntryBackground`). Nota para
> QA: `alumno/onboarding` y `change-password` ya montaban `AppBackground` ⇒ ganan Horizonte B
> implícito (decisión pendiente menor si el owner los considera «entrada»).

> **2026-08-17 (Notas del coach + retiro del par viejo — paridad 1:1)**: el 📝 de nota por
> franja y por grupo existe idéntico en web y RN (mismo reducer compartido, mismos topes
> 2000/1000, tinte de marca con-nota por contraste, sheet con contador y limpiar) y la banda 💬
> del alumno se pinta en el Hoy de ambas plataformas desde el MISMO read-model. El retiro del
> par viejo también fue simétrico: cero puertas al clásico/wizard en web y RN (R2 encontró y
> cerró además dos CTAs del tab Nutrición de la ficha que el corte T3.3b no había convertido);
> el código viejo queda inalcanzable pero intacto hasta la demolición. Paridad Mi Marca
> verificada campo a campo el mismo día (informe dedicado): estructural IGUAL; 4 drifts
> corregidos (`0b91ca17`); gaps declarados con plan en artifact «Mi Marca RN Pulido».

La paridad global **no está certificada todavía**.

| Bloque | Código y revisión estática | QA en dispositivo | Estado efectivo |
|---|---:|---:|---|
| Sección 1 — ejecutor del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 2 — dashboard del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 3 — coach (14 unidades) | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 2R — residuos del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 4A — nutrición del alumno | **12/12 aplicadas** | Pendiente | Cerrada estática; no certificada |
| Ola 4B — nutrición del coach y catálogos | **Cerrada: 15/15 unidades de rama** | Pendiente | Cerrada estática; no certificada |
| Experiencia de entrada — splash/onboarding/acceso | Cerrada estática | Pendiente | Código y exports verdes; requiere build nuevo + QA física |

“Cerrado estático” significa que código, spec y verificaciones automatizadas disponibles convergieron. No significa que el comportamiento visual, gestos, teclado, cámara, safe areas u offline estén aprobados en hardware real.

> **2026-07-31 (corte compliance stores + timers lockscreen)**: (a) **Purga anti-steering completa**
> (informe `docs/research/cta-pagos-externos-stores-2026-07-31.md`; Apple 3.1.1 + política de pagos de
> Play prohíben CTAs a pago externo): eliminados de verdad (sin flags ni `Platform.OS`) los ~25 puntos
> de venta de RN — tab Suscripción reconvertido a **"Mi plan"** solo-estado (sin precios, tarjeta ni
> historial de pagos), muro `/coach/reactivate` neutro ("Tu plan está inactivo" + estado, ya sin botón
> a la web), 9 banners del dashboard a "Ver mi plan" interno, registro reducido a 2 pasos SIN precios
> CLP ni "se activan en eva-app.cl", muros de límite/módulos/nutrición/marca/funciones/perfil a copy de
> estado, y normalización "incluido en planes pagos"→"no incluido en tu plan". Nuevo
> `components/coach/RefreshPlanButton.tsx` ("Actualizar estado") revalida entitlements por el camino
> canónico de `activate-free`. La venta vive en web/email/WhatsApp (correos Resend por evento = deuda
> abierta). NOTA: esto supersede el "pago sigue siendo link-out a la web" del corte anterior — ya no
> hay link-out; el pago es 100% fuera de la app sin mención in-app. (b) **Timers en lockscreen**:
> módulo genérico `timers/live-timer-notification.ts` (chronometer down/up/none, actions, largeIcon,
> smallIcon `notification_icon` con fallback), **cardio** ganó cronómetro vivo (countdown/fases/
> ascendente, color de zona, logo del coach, notif final "¡Cardio completo!" patrón QA-10) y el
> **descanso** ganó botones operables en background (`Pausar/+15 s/Saltar` + ficha de pausa con
> `Reanudar`) vía handler headless único (`timers/notification-events.ts`, despacho por prefijo —
> notify-kit admite UN solo `onBackgroundEvent`) + snapshot/cola anti doble-apply (57 tests nuevos).
> Gates del corte: tsc mobile 0, eslint tocados limpio, suite 5007 tests verdes, boundaries verde,
> `expo export` android verde. TODO exige la MISMA build EAS ya pendiente (notify-kit); QA física
> post-build: botones en MIUI/Pixel, +15 s sin doble-apply, huérfanas, "Mi plan"/muros en light/dark.
>
> **2026-07-31 (corte 2 — venta por email + deudas de timers cerradas)**: (a) **Canal de venta Resend**
> (reemplazo del CTA purgado; `apps/web`): 3 correos por el MISMO evento que pinta el muro — límite de
> alumnos (los 4 call sites de UPGRADE_REQUIRED: alta/import × web/móvil), "vence pronto" (ventana ≤3
> días, solo `canceled`/`paused` — `active` se auto-renueva y `past_due` ya recibe dunning) y "venció"
> (transición del cron paid-expiry). Dedupe SIN DDL vía `admin_audit_logs` como ledger (ancla
> `current_period_end` / cooldown 7 d), kill-switch `EVA_SALES_EMAILS_DISABLED`, templates en código
> sin precios (test lo pinnea), fail-open de lectura y ledger solo tras envío exitoso. Murió
> `buildUpgradeRequiredEmail` (precios hardcodeados stale). ⚠️ Requiere `EMAIL_FROM` + `RESEND_API_KEY`
> en Vercel prod. (b) **Deuda de pausa exacta CERRADA en los 3 modos de cardio**: `timing.ts` gana
> `useStopwatch.adopt()` y `useIntervalRunner.adoptRemaining()` (aditivos, respetan QA4 h5); el drenaje
> adopta exacto vía `cardio-adoption.ts` (módulo puro, 11 tests). (c) **Superserie**: la notif del
> descanso imprime "Ronda n de N" (discriminador `countKind` ExecutorV3→…→notif). Gates: tsc web+mobile
> 0, 5053 tests, export android verde. Cambios (b)/(c) son JS-only ⇒ viajan por OTA si la build ya corrió.
>
> **2026-07-31 (gate de acceso RN — corrección)**: los guards de suscripción vivían dentro de los layouts de **tabs**, así que no cubrían las rutas fuera de esos grupos. Coach: `app/coach/(tabs)/_layout.tsx` dejaba sin gate ~21 rutas (`cliente/[clientId]`, `program-builder`, `nutrition-v2/*`, `cardio/*`, `bodycomp`, `movement/*`, `settings/*`, `foods`, `tools`, …) y además se evaluaba una sola vez por arranque (el layout de tabs no se desmonta al cambiar de tab), de modo que un back-gesture devolvía al dashboard con el plan vencido. Alumno: mismo patrón dejaba fuera `workout/[planId]`, `exercise/[id]`, `add-food` y `onboarding`, alcanzables por deep link o por el tap de una notificación push. Corregido con layouts raíz `app/coach/_layout.tsx` y `app/alumno/_layout.tsx` — el del coach usa estado reactivo (`lib/coach-access.ts`, SWR + revalidación por foreground/navegación) en vez de un efecto de una pasada, y el del alumno absorbió el gate de montaje completo, incluido el consentimiento de pool (Ley 21.719), en el mismo orden que el proxy web. En el mismo corte, el muro `/coach/reactivate` de RN gana la salida **volver al plan gratuito** (panel de archivado/eliminación + `POST /api/mobile/coach/activate-free`, que comparte `services/billing/activate-free.service.ts` con la web): antes solo sabía link-outear al navegador, así que un coach vencido sin computador solo podía pagar. El camino de **pago** sigue siendo link-out exclusivo a la web. Requiere QA física + build/OTA.

> **2026-07-31 (Ola 7A — Live Activities de iOS; código completo, **Swift sin compilar hasta el build EAS #3**)**:
> el cronómetro vivo del descanso y de cardio llega al **lockscreen y la Dynamic Island de iOS**, espejo del
> sistema que Android ya tenía con el `chronometer` de notify-kit. Tres piezas nuevas: (a) **Widget Extension**
> `apps/mobile/targets/eva-timer-activity/` generada por `@bacons/apple-targets@5.0.0` (única dependencia nueva,
> `-D`) — tarjeta oscura con `Text(timerInterval:)` monoespaciado tintado con el acento de marca, figura EVA como
> imageset del target, isla compacta/mínima/expandida; (b) **módulo Expo local** `apps/mobile/modules/eva-live-activity/`
> (autolink por `modules/`) con `isSupported/start/update/end/drainCommands` y **una actividad por `kind`**, de modo
> que descanso y cardio coexisten; (c) **botones** `LiveActivityIntent` en `_shared/` (compilan en el target de la
> app y en el de la extensión, como exige Apple) con los **mismos action ids que Android** — descanso
> Pausar/+15 s/Saltar/Reanudar, cardio Pausar/Reanudar. Cada intent mueve la actividad al instante y deja el
> comando en el App Group `group.cl.evaapp.eva`; el JS lo drena al volver la app al frente
> (`timers/live-activity-commands.ts`, registrado a nivel de módulo en `app/_layout.tsx`) y reconstruye el snapshot
> con el **`atMs` del press**, no con la hora del drenaje. Todo el JS nuevo es **NO-OP seguro** con require
> guardado: **Android no cambia de comportamiento en nada** y en iOS < 16.2, sin el módulo nativo enlazado o con
> las Live Activities apagadas en Ajustes, no ocurre nada. Botones sólo iOS 17+ (`#available`), sin fila de botones
> en 16.2–16.x. DIFERIDOS conscientes: **logo del coach en iOS** (exigiría cachear la imagen dentro del App Group)
> y **"Fase siguiente"** de cardio (la secuencia vive en el componente). Riesgo abierto a validar en dispositivo:
> `EvaTimerAttributes` está **duplicado** entre el pod y el target porque son módulos Swift distintos, y ActivityKit
> machea por nombre de tipo. Gates reales: `tsc --noEmit` 0 errores, **325 tests** de `tests/mobile/` verdes
> (17 nuevos del drenaje), `expo config --type introspect` sin errores con el plugin y el App Group resueltos, y
> `expo export --platform ios` verde. **Swift NO se compila en Windows**: la verificación nativa (target, intents,
> provisioning del extension, `ios.appleTeamId`) queda para el **build EAS #3** + QA física.
>
> **2026-07-29 (rama `worktree-adelanto-qa-20260729`, sin merge)**: adelanto paralelo al QA del owner —
> (1) **QA F2** contadores del directorio coach espejados al pulse crudo de `CoachWarRoom.tsx:220-229`
> (Riesgo/Atención/Nutri. desde el array pulse; filtro `nutrition_low` solo por flag) + test
> `tests/mobile-directory-pulse-parity.test.ts`; (2) **QA F4/F6** safe area top en `builder.tsx` y
> `clientes.tsx` (`edges=['top']`) + clearance inset-aware (`COACH_TABBAR_CLEARANCE + insets.bottom`);
> (3) **consentimiento de pool Ley 21.719 en RN** (gap legal: la app no pasa por el proxy web que lo
> fuerza): endpoint `api/mobile/auth/pool-consent` (GET/POST/DELETE espejo de `consent.actions.ts`),
> pantalla `alumno/consent.tsx`, gate en `(tabs)/_layout` (orden blocked→password→consent, fail-open
> como el proxy) y revocación en el perfil del alumno; (4) **export PDF del reporte de Movimiento**
> (`movement-report-pdf.ts`, espejo del print web; delta aceptado: sin bitácora `pdf_generate`);
> (5) hallazgo transversal: la infra de push (`apps/web/src/lib/push.ts`) no tenía NINGÚN disparador
> nativo — corregido más abajo. F5 (anillo proteína) no reproducible en código actual — re-testear en
> device; F9 ("Z4") sin rastro en código — probable fix colateral. Todo pendiente de QA física.

> **2026-07-30 (misma rama, corte 3 — ronda QA-2 del owner, 14 hallazgos + 2 decisiones)**: (a) splash
> nativo → figura BLANCA `eva-icon.png` (era la variante negra sobre #07080C; config nativa = próximo
> build) y loader default RN → figura EVA respirando (muere el wordmark tricolor; custom del coach
> intacto); (b) **grano global** en `AppBackground` ambos temas (crosshatch sello de la entrada,
> decisión owner); (c) ficha de alumno coach: iconos lucide SIN `cssInterop` en todo el cluster
> (caían a negro en dark — registro sistémico via `themed-lucide.ts`), 5 KPI cards con contrato
> compartido web/RN (labels completos, tiles tonales), flash V1→V2 del tab Nutrición muerto
> (skeleton hasta asentar 4 señales async), backdrop de tabs con rampa de opacidad + fricción
> horizontal resuelta, fotos de check-in FIRMADAS en lote (bucket privado; antes pintaba paths
> crudos = recuadros vacíos); (d) editor nutrición V2: icono del alimento repuesto (el dato llegaba
> del read-model y se perdía en la hidratación), chip de grupo delega en `GroupDot` DS; (e) barrida
> de safe areas: 11 ramas en 8 archivos (ficha nutricional, quick-edit, 6 tabs coach con
> `edges=[]`); (f) `DateField` JS puro (día/mes/año) en perfil cardio; (g) avatar del hub Opciones
> muestra el LOGO del coach (fallback iniciales), espejo web en `IdentityHero` de settings;
> (h) retiro de las viñetas del directorio (patrón solo-RN); (i) builder workout: Guardar/FAB se
> ocultan con el catálogo abierto (espejo web), modo simple EXTIRPADO (−40 líneas), anatomía de
> filas espejada (trash rojo, link SS, volumen en línea) + bug real: `toggleSuperset` sin `intent`
> podía agregar en vez de quitar; (j) web: fondo del documento bajo el ejecutor dark-only
> (`html:has(.is-workout-page)` — mata el bloque blanco de iPhone) + fallback `100vh`, logo del
> coach en avatares web, mismas KPI cards. Gates del corte: tsc web+mobile 0, vitest 1115 verdes,
> lint 0 errores. TODO pendiente de QA física. Además aterrizó el **morph card→sheet de la
> entrada** (frame 4 del concepto C, decisión owner 2026-07-30): "Soy alumno" se expande EN LA
> MISMA pantalla hasta el sheet con el form del código (260ms, reversible con back, reduce-motion
> a fade 160ms); el form se extrajo a `CoachIdentifierForm` compartido y `/alumno/codigo` sigue
> intacta para deep links. Timings 1:1 con la spec del mockup; gates: tsc 0, vitest 1121, expo
> export android OK.

> **2026-07-30 (misma rama, corte 6 — Cardio Conectado F1+F2 + home Mock C + ronda QA-5 del owner,
> 10 hallazgos triados / 6 codificados)**: **Cardio Conectado** (SDD `specs/cardio-conectado/`) —
> F1: HUD BLE en vivo en `CardioScreenV3` (tiempo-en-zona mm:ss, `ZoneBar` 5 segmentos con marcador
> vivo + objetivo, avg/máx de sesión, háptica fuera-de-zona con debounce 10 s y rearme en pausa) con
> reducer puro `zone-session` en `@eva/cardio`; la curva de FC persiste SIN migración en
> `workout_logs.metadata.hr` (v1, serie downsampleada ≤360 pts) vía `ctx.hrMetadata` de
> `buildTypedPayload`. F2: `readHubWorkouts` en ambos hubs — iOS migrado de `react-native-health`
> (congelada por sus autores) a `@kingstinct/react-native-healthkit` v14 conservando la plomería de
> errores QA-4 (HealthConnectResult + scopes `habits|workouts` para no reportar 'denied' falso) —
> e `ImportWatchSheet` en el resumen: matching ≥50 % de solape con la ventana real de sesión,
> `hubImportPatch` solo ejes vacíos, precedencia BLE>hub, escritura por `logSet`. Permisos nuevos
> (`READ_EXERCISE/HEART_RATE/DISTANCE/ACTIVE_CALORIES_BURNED` + plugin kingstinct) **exigen build
> EAS y ampliar el form de Play Health**. **Home alumno Mock C** (decisión CEO, artifact de mocks) —
> header sin borde duro con wash de elevación del tema, marca↔fecha en una fila, mensaje del coach
> con su logo real (`BrandLogoCircle`, ex-BrandDot, ahora compartido); `WeekStrip` reemplaza a
> `StreakRibbon` (deprecated): 7 dots Lun→Dom con el MISMO estado greedy de las day-cards
> (`deriveWeeklyStreak`, cero regla duplicada) + chip de racha RPC con hito y singular corregido.
> **QA-5** — keypad "Listo" en hero SOLO cierra el teclado ("Aplastar serie" comitea; fuera de hero
> intacto); `VideoPlayer` resiliente (onError/onHttpError + puente postMessage porque el onLoadEnd
> del HTML local miente + watchdog 12 s → miniatura + reintento ×2, controles re-sincronizados);
> taps de day-cards/hero/pendientes garantizados en MIUI (`measureMorphOriginSafe`: rect ≤120 ms o
> fallback `null` — `startMorph` ya degradaba a origen sintético; deuda declarada: `workout.tsx`
> PlanCard usa el crudo); logo del coach en el hero de "Mi perfil" (`Avatar src` modo logo, fallback
> iniciales); atajo share 1-tap en cada tile de Records (`RecordShareCard` extraído de
> `PRDetailSheet`, overlay hermano — jamás Modal-en-Modal); splash como loader del dashboard
> (`DashboardReadyContext` + `DashboardSplashOverlay` hermano del Stack con handoff visual continuo
> desde `SplashGate`, fade 280 ms, tope 5 s, onboarding y flujo sin sesión intactos). Verificado en
> triaje sin tocar código: Aprender ya pagina server-side con taps vivos, "Comparte tu logro" ya
> existe desde jul-08 (view-shot nativa — exige binario ≥ jul-08), Jose Fit SÍ tiene logo en DB
> (avatar "JF" = bundle viejo). iOS Live Activities queda Ola 7A (diferida). Gates del corte: tsc
> mobile 0; vitest 1388 verdes (tests/mobile + packages cardio/workout-engine); export Android en
> curso al cierre. TODO pendiente de QA física en build EAS nueva.

> **2026-07-30 (misma rama, corte 5 — ronda QA-4 del owner, 19 hallazgos, 13 informes + 12 workers
> juzgados)**: **Ejecutor V3 RN** — cronómetro count-up arreglado (`useStopwatch` re-armaba el
> intervalo cada tick y quedaba 0:00↔0:01; roller guardaba 0-1s en `workout_logs`); ejercicios por
> tiempo YA NO auto-arrancan (paridad web: movilidad/cardio/intervalos con Iniciar/Pausar/Reanudar;
> el lado 2 per-side sí auto-continúa); registro SIEMPRE visible en movilidad (ActiveSetRow +
> historial bajo el anillo; muere "Registrar a mano", que desmontaba el anillo y mataba el timer);
> miniatura real en la card SIGUIENTE del descanso (`thumbnail_url` entra al select del plan +
> cadena thumb→gif→póster YT; las sustituciones propagan `thumbnail_url`); detector YouTube
> unificado (`youtube-nocookie.com` caía a 'image' y rompía 33 ejercicios del catálogo — helper
> `isYoutubeMediaUrl` RN+web, 6 clones muertos); video centrado llenando el marco + botón mute
> (default muteado) también para YouTube vía IFrame API sin recargar el WebView; ignition:
> `overflow hidden` (las 3 líneas ya no se ven antes de tiempo), `SessionMorphProvider` al layout
> RAÍZ (Android cerraba el Dialog en el `router.push` sin avisar a JS → ahora sí espera el "TOCA
> PARA COMENZAR"), LISTO centrado, logo con máscara circular; ejecutor forzado a DARK
> (`ForceScheme` + footer/título/descripción de `Sheet` gateados por `forceDark` — muere la barra
> blanca con cuenta en modo claro; sheets "Nota del coach" ×4 incluidos); rueda KG/REPS a 280ms
> (antes 400 + ~150 de `delaysContentTouches` iOS) + haptic Medium + rueda conectada en superserie
> + web a 280. **Días del programa** — la day-card de HOY completada abre "Ya hiciste este
> entrenamiento" (paridad web QA7); `?recuperar=` validado con `validateTargetDate` (adiós
> "Recuperando: Invalid date"); copy amigable para serie pasada sin registro (string compartido del
> engine). **Centro Nutrición coach** — SOLO las 3 tabs quedan sticky (overlay `translateY`;
> título/pill/+ scrollean); buscador de Alimentos dentro del scroll; la cápsula del coach por fin
> se minimiza en el hub V2. **Fichas coach** — muere el flash "No pudimos abrir la ficha"
> (`setLoading(false)` antes de tener `userId` + offline derivado del TTL de cache): máquina
> resolving|loading|blocked|ready|failed (`lib/coach-nutrition-detail-phase.ts` + 9 tests), error
> ámbar SOLO desde el catch, Reintentar + auto-retry al volver online, loader de marca; builder
> ídem. **Mi marca FULL en RN** — las 7 variantes de loader + compositor 8×4 portadas
> (`components/loaders/`, svg/moti, reduced-motion) y enchufadas vía `EvaLoaderScreen` (cubre las
> 68 pantallas de carga); Guardar ya no corrompe la cache (merge no destructivo); el coach carga SU
> PROPIA marca al entrar (antes solo el flujo alumno escribía cache → marca ajena en device
> compartido); editor completado: tema del ejecutor + compositor + previews con el render REAL;
> `use_brand_colors_coach` honrado solo por el camino autenticado (select anon intacto).
> **Salud/BLE** — estudio completo en `docs/research/estudio-salud-dispositivos-2026-07-30.md`
> (+ anexo de código). OTA: el scan espera `PoweredOn` + taxonomía de errores BLE con copy por
> causa y CTA a ajustes; `BleManager` lazy (muere el prompt BT al abrir cardio); `androidInit`
> verifica permisos realmente concedidos; `iosInit` propaga el error real; aviso ANTES de mandar a
> Play Store por Health Connect (Android ≤13). Config para la PRÓXIMA build: `BLUETOOTH_SCAN/
> CONNECT` fuera de `app.json` (habilita el `neverForLocation` del plugin ble-plx — sin él el scan
> Android 12+ da 0 resultados) + `plugins/with-health-connect.js` (`setPermissionDelegate` en
> MainActivity — sin esto `requestPermission` CRASHEA nativo — y `activity-alias` Android 14+).
> BLOQUEANTES de release (owner): capability HealthKit en el provisioning local (`credentialsSource:
> "local"` no sincroniza capabilities) y formulario "Health apps declaration" en Play Console
> (~2 semanas de aprobación — empezar YA). **Misc** — check-in: fotos arregladas
> (`expo-file-system/legacy`: el entry SDK 54 lanza siempre; try/catch con error visible; iOS sin
> crop 1:1 forzado); comparador de fotos del coach migrado a `Gesture.Pan` (usaba `locationX`
> relativo al view tocado = temblor frenético; sheet sin scroll); IMC sin desbordar; segmented
> "Lado" a ancho completo ("Alternado" ya no parte); iconos de Herramientas normalizados para
> Android (sizes pares, stroke 2, HW texture). Gates del corte: tsc web+mobile en 0; vitest 4843
> verdes (379 archivos). TODO pendiente de QA física; BLE/Health Connect/HealthKit y el form de
> Play exigen build EAS nueva + trámites del owner.

> **2026-07-30 (misma rama, corte 4 — ronda QA-3 del owner, ~26 hallazgos, 13 workers juzgados)**:
> **Ejecutor V3 RN** — (a) el keypad custom ya no se abre solo al entrar ni tras cada serie
> (lazy-init del nonce en `SetRow.tsx:880`); (b) descanso SIN flash de la serie siguiente (la
> decisión de descanso corre en el tick síncrono ANTES del `await logSet` en `handleCommit`);
> (c) la nota de serie queda visible sobre el teclado (KeyboardAvoidingView en pager + KeypadHost
> + contexto `useEnsureVisibleInStep`); (d) hairline blanca de los sheets dark muerta
> (`border-inverse/10` en la primitive `Sheet.tsx`) y GestureHandlerRootView dentro de
> `nativeModal` → el slider de volumen de Ajustes por fin arrastra; (e) la intro espera los datos
> (mínimo 1.4s, techo 4.5s) — el Inicio ya no "carga por partes"; la racha semanal cabe en 360px
> (grupo label/copy con shrink + dots 14px) y aterriza con fade sin salto; crossfade EMPEZAR→sesión
> 220ms; confetti final una sola pasada (`isInfinite={false}`, la lib venía en TRUE por default);
> prefetch del gif del primer ejercicio durante intro/Inicio; (f) superserie: glow del card activo
> por anillos internos (muere el `elevation` cortado de Android), miniaturas reales en filas B/C
> (gif/imagen/`mqdefault` de YouTube vía `execMediaKind`), bandas marquee "CONTINÚA SIN DESCANSO"
> arriba/abajo del card activo (RN **y web**, apagadas durante descanso y reduced-motion),
> `ExecMediaImage` nuevo con cache memory-disk + skeleton real + retry ×2 (compartido con
> `TypedMediaV3`), el lightbox de técnica ahora sí agranda (70% del alto para gif; 16:9 solo
> video), nombres a 2 líneas en "Plan completo" (sheet + peek del descanso).
> **Notificaciones Android** — plugin `expo-notifications` cableado (`notification-icon.png`
> reemplazado: era un PLACEHOLDER de plantilla, ahora la figura EVA blanca; color #0B0E13) +
> `visibility PUBLIC` del countdown (canal y notificación) — todo exige build EAS nueva.
> **Nutrición alumno RN** — sticky SOLO la tira de días (título+tabs scrollean; 3 tabs con
> `stickyHeaderIndices=[1]`); flash "Sin conexión" muerto (el `stale` del TTL de cache ya no se
> confunde con offline, 3 sitios); anillos macro con track limpio en dark (alpha .24) y "/ —"
> cuando falta meta; scanner con preview (CameraView con `style` imperativo — mismo gotcha
> cssInterop de los iconos); lightbox de la foto del alimento (fila de resultados + seleccionado).
> **Versiones fuera** — jerga "versión/vN" retirada de web+RN (el único número visible era el
> builder web; Borrador/Publicado funcional se conserva). **Modales** — "Registrar alimento" RN
> pasa de bottom-sheet a diálogo centrado (fade + KAV + autofocus, testIDs intactos); web
> `TodayModal` centrado en TODOS los viewports + `initialFocusRef` al input de búsqueda;
> `WelcomeModal` con spring suave (damping 22/stiffness 160) y clip extra `collapsable={false}`
> alrededor del video (WebView Android compone sobre el recorte del padre).
> **Arranque** — una sola identidad tras el splash nativo (la firma EVA no se monta cuando hay
> marca de coach cacheada; el crossfade arranca con AsyncStorage sin esperar red — la red solo
> define el destino); el saludo SIEMPRE nombra a quien entra (sin nombre queda la marca sola:
> "Hola de nuevo" pelado bajo el nombre del coach se leía como saludo AL coach); `/?pick=1`
> fuerza el selector con sesión viva y elegir rol cierra la sesión del OTRO rol (con veredicto y
> tope 1.2s). **Onboarding del alumno NUEVO** — 3 slides post-login primera vez en el dashboard
> (`eva_student_onboarding_v1`, skippable, marca del coach en el slide 1) encadenado ANTES del
> WelcomeModal. **Home/coach/misc** — bloque "día pendiente" pasa de ember a warning ámbar
> informativo (RN + web; mapeo `--color-warning-*` nuevo en el @theme web); la ficha de alumno
> del coach pinta el header superior con el MISMO glass que las tabs al quedar sticky (wrapper
> local, TopBar intacto); "Conectar Salud" avisa antes de saltar a Health Connect + `getSdkStatus`
> + try/catch/finally (mensajes instalar/actualizar); Aprender: chip de músculo legible (blanco
> sobre scrim .62); disclaimers médicos legibles en dark (`dark:bg-warning-100/[0.16]` en
> check-in + onboarding ×2 — quedan ~11 usos rotos del mismo patrón inventariados como deuda).
> Gates del corte: tsc web+mobile en 0. Pendientes de DATOS (no UI): `proteinG` llega null en el
> read-model de hoy aunque el plan lo define (290g) — revisar RPC; catálogo OFF con curación
> pendiente (Quaker categoría "bebida"/100 ml). TODO pendiente de QA física; icono de notif,
> countdown en lockscreen, sonido de fin de descanso (expo-audio) y Health Connect exigen la
> build EAS nueva.

> **2026-07-29 (misma rama, corte 2)**: (a) **push W1** (catálogo aprobado por el owner): payload dual
> `url`/`screen`, kill-switch `EVA_PUSH_DISABLED_EVENTS`, `meal_reminder` extendido a nativo (el cron
> pasa por `sendPushToClient`), `program_assigned` (web action + bridge RN), `checkin_received` al coach
> (action web + bridge nuevo `api/mobile/checkin-submitted`), `checkin_due` (cron nuevo, hitos día 8/15);
> (b) **QA F13** (decisión owner): la web arranca en el tema del sistema (`defaultTheme="system"`),
> toggles leen `resolvedTheme`; (c) limpieza de builds: perfiles `prodpreview`/`staging` y opción
> `enterprise` retirados; (d) **editor de día pasado RN** (cierra el gap P1 del informe de paridad):
> `validateTargetDate`/`resolveRepeatDate` promovidos a `@eva/workout-engine` (web importa del paquete),
> `useWorkoutSession(planId, repeatDate, editDate)` con modo solo-UPDATE client-side (paridad
> `workout-log.actions.ts:119-185` + fix `80995cae`: fecha=HOY se normaliza), ventana completa del día
> corrida a la fecha (logs/historial/máximos/última sesión), snapshot escopado por fecha, cola offline
> con `target_date` (dedup por día escrito, descarte permanente `past_set_not_found` + Sentry), sheet
> del home habilita "Revisar y editar" para días pasados (muere "Disponible pronto"). 47 tests nuevos.
> Todo pendiente de QA física.

> **2026-07-29 (`9bf856b8` + `61ae0f8f`, hoy ancestros de `master` — esta línea decía «rama `worktree-nutricion-ui-rescate`, sin merge» hasta el saneo documental del 19-08, verificado con `git merge-base --is-ancestor`)**: rescate UI de Nutrición V2 en olas 0-4 (poda de eco + permisos a 2 reales + wizard 2 pasos + selector por día) con paridad web/RN en el mismo corte — semana completa Lu-Do (`WeekDayNav` + `week-view.ts` compartidos), copia de franjas entre días (`COPY_SLOT_TO_VARIANTS` en los 4 reducers), carry-over de `visible_notes` también en el publish RN, y barrido de 677 clases muertas `text-text-*`/`border-border-*` de mobile (texto renderizaba negro incluso en dark). Las olas 4A/4B siguen "cerradas estáticas": este corte agrega superficies que requieren QA física propia. Spec: [`docs/specs/nutrition-week-view/`](../specs/nutrition-week-view/SPEC.md).

> **2026-07-25 (PR #170, `60090f90`)**: el ejecutor del alumno quedó rediseñado a **V3** — único camino en web y RN, flags eliminados — e integró **cardio fases A-D** (ejes de captura por modalidad, Escaladora, intervalos por distancia, coach ve los registros). La Sección 1 sigue “cerrada estática” sobre ese código nuevo; la deuda cardio priorizada vive en [`specs/cardio-ejes-y-fixes/TASKS.md`](../../specs/cardio-ejes-y-fixes/TASKS.md) y la cola del ejecutor en [`specs/executor-v3/TASKS.md`](../../specs/executor-v3/TASKS.md).

## Ola 4A (cerrada estática)

Fuente funcional/visual: `apps/web/src/app/c/[coach_slug]/nutrition-v2/**` y `apps/web/src/components/nutrition-v2/**` en viewport móvil. Specs vigentes: [`docs/rn-port/specs/seccion-4a/`](../rn-port/specs/seccion-4a/).

| Unidad | Alcance | Código | QA device |
|---|---|---:|---:|
| 4A-01 | Ruteo y chrome | Aplicado | Pendiente |
| 4A-02 | Vista Hoy: estructura | Aplicado | Pendiente |
| 4A-03 | Vista Plan | Aplicado | Pendiente |
| 4A-04 | Historial | Aplicado | Pendiente |
| 4A-05 | Shell y tab bar | Aplicado | Pendiente |
| 4A-06 | Editar y retirar registros | Aplicado | Pendiente |
| 4A-07 | Kit e ilustraciones | Aplicado | Pendiente |
| 4A-08 | AuraHero y colores white-label | Aplicado | Pendiente |
| 4A-09 | Porciones | Aplicado | Pendiente |
| 4A-10 | Registro y buscador | Aplicado | Pendiente |
| 4A-11 | Scanner | Aplicado | Pendiente |
| 4A-12 | Celebraciones y residuos | Aplicado | Pendiente |

Aplicadas: **las 12** (wave C en `73f6aa82`; wave D en `3efa1a75`; wave E en `7c6684fa`). Código de la ola completo; falta QA device.

## Ola 4B (cerrada estática)

Fuente funcional/visual: superficie V2 VIVA del coach (`apps/web/src/app/coach/nutrition-v2/**` +
catálogos vivos). Specs vigentes: [`docs/rn-port/specs/seccion-4b/`](../rn-port/specs/seccion-4b/)
(INVENTARIO, RANKING con las 16 unidades y 6 waves, DECISIONES-OWNER: **V1 al olvido**, recetas
fuera, RN-extras estricto).

| Estado | Unidades |
|---|---|
| Aplicadas (wave 4B.1, `bce2eb3b`) | 4B-01 macros meal-groups (P0 datos), 4B-02 scope org foods, 4B-03 quick-edit notas+permisos |
| Aplicada (wave 4B.2, `76d8ea2f`) | 4B-04 SWAP tab coach→Centro V2 (inline, cápsula intacta; V1 = rollback tras flag) |
| Aplicadas (wave 4B.3, `8f8161cb`) | 4B-05 HUB, 4B-06 Catálogo V2 + ficha, 4B-08 Detalle asignar/archivar, 4B-10 Builder F-02 reemplazos (cierra TODO F-02 P3), 4B-15 MG editor |
| Aplicadas (wave 4B.4, `2cdc0c79`) | 4B-07 Curación, 4B-17 Tablist hub (Alumnos/Alimentos/Curación cableado), 4B-09 Detalle copy+banner convertido, 4B-11 Builder porciones (write-path nuevo), 4B-14 Quick-edit drafts |
| Aplicada (wave 4B.5, `a9b8958e`) | 4B-12 Builder permisos del alumno + guardar-en-catálogo + archivar-y-reemplazar (idempotencia estable) |
| Aplicada (wave 4B.6, `6338f4a4`) | 4B-13 Builder drafts (autosave + Restaurar + guard warn-only; cierra la ola) |
| Fuera de rama | 4B-16 deuda transversal nutrition-pro (toca web+packages; abrir en rama de web) |

> **2026-07-26 (`c159d67a`)**: 4B-03 evolucionó en paridad — las notas visibles (`visible_notes`)
> pasaron de read-only a **editables** en el quick-edit de AMBAS plataformas (misma acción,
> normalización, tope 8000 y microcopy espejo). Detalle en
> [`u03-quickedit-notas-permisos.md`](../rn-port/specs/seccion-4b/u03-quickedit-notas-permisos.md).

## Estado "En progreso" del día (O2, cerrado estático 2026-07-26)

SDD: [`docs/specs/workout-day-in-progress/`](../specs/workout-day-in-progress/SPEC.md). Regla única
`deriveDayCompletion` en `@eva/workout-engine` (done = 100% de series; cardio sin `sets` = 1 unidad)
con 12 fixtures de paridad consumidos por los tests de AMBAS plataformas. Web y RN comparten visual
(`CircleDashed` + "En progreso") y copy del sheet ("Entrenamiento incompleto"). La racha del RPC no
se tocó (decisión CEO). Falta QA device (4 escenarios del PLAN).

## Experiencia de entrada (cerrada estática 2026-07-26; SUPERADA por entrada dark v1)

Fuente histórica: [`specs/mobile-entry-experience/`](../../specs/mobile-entry-experience/SPEC.md) —
el walkthrough de 3 escenas que describe fue reemplazado por
[`docs/specs/entrada-dark-v1/`](../specs/entrada-dark-v1/DESIGN-SPEC.md) (vigente, última
actualización 2026-08-19: splash «Quietud»).

El owner aprobó las cuatro decisiones de la SPEC y el frente quedó aplicado sobre
`rnmobiledenuevo`:

- `expo-splash-screen` gobierna un único launch nativo continuo, sin espera React artificial; se
  retiraron tres componentes splash sin importadores;
- walkthrough de tres escenas locales 1×/2× con `coach-plan`, `alumno-scan`, `progreso` y `logro`
  como acento, preload, reduce motion, safe areas y adaptación a 320×568/texto ampliado;
- selector compacto y un solo campo accesible para código, slug o enlace, con submit explícito,
  errores diferenciados y protección contra doble envío;
- parser compartido en `@eva/schemas`, intents sin fetch fuera de React y branding vivo antes de la
  persistencia;
- login alumno fail-closed sin coach y endpoint autenticado que deriva identidad del bearer,
  valida el workspace exacto con la misma fuente canónica de web y solo después persiste el último
  workspace. La caché y el `coachId` del body no autorizan.

Evidencia estática: 61 tests focalizados y suite completa de 4130 tests verdes, typecheck
web/mobile, ESLint afectado sin warnings, tokens `86/86`, docs y exports Expo Android/iOS verdes.
No hubo cambio de schema, RLS ni dependencias. Como `app.json` cambió configuración nativa, falta
un build EAS nuevo y QA física; no es un cambio certificable por OTA.

### Dónde retomar

1. Generar build EAS Android/iOS del corte con la nueva configuración de splash.
2. Ejecutar matriz de entrada en hardware: cold/warm start, primer/segundo uso, sesión, teclado,
   código/slug/links, cuatro presets, EVA/custom, light/dark, red/offline y VoiceOver/TalkBack.
3. Corregir cualquier P0/P1/P2 y solo entonces certificar la entrada.
4. Abrir la ola 5 (builder y programas de entrenamiento del coach) con inventario contra código.
5. Completar matriz device de 4A/4B y regresión dirigida de Secciones 1–3/2R.
6. Deuda 4B-16 (consolidar nutrition-pro puro en `@eva/nutrition-v2`) en rama de web.

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `production` | Build + **Submit a Play internal testing** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` (2026-07-25, corte con deuda cardio + universal links); previos `4382ff6c`/`335c88da` también verdes | Vía completa funcionando sobre el corte actual; retener artefacto (1 día) |
| iOS | `production` | Build + **Submit a TestFlight** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa`, con el profile regenerado (HealthKit + Associated Domains; la falla de capability de los runs 07-23/24 quedó cerrada) | Binario del corte actual existe y fue enviado; falta verificación en App Store Connect y QA device |

Un build/submit verde no sustituye la verificación manual en App Store Connect/Play Console ni el QA en dispositivo (universal links incluidos — el CDN del AASA de Apple puede tardar horas).

## Siguiente horizonte

Después de cerrar la experiencia de entrada y certificar el trabajo acumulado:

1. 5 — builder y programas del coach.
2. 6 — dominios restantes, inventariados en lotes pequeños.
3. 7 — certificación transversal de rutas, estados, branding, accesibilidad y ambos sistemas operativos.

El alcance exacto se confirma contra código antes de abrir cada ola; no se reactiva automáticamente un checklist histórico.

## Contrato de actualización

Actualizar este archivo en el mismo cambio que:

- aplique o revierta una unidad de paridad;
- cambie la ola activa o el orden de ejecución;
- obtenga un resultado nuevo de build o QA device;
- acepte una divergencia nativa;
- descubra un bloqueo que cambie el siguiente paso.

Cada actualización debe cambiar `last_verified` con fecha y commit. Evidencia extensa pertenece a la spec de unidad o a auditorías fechadas, nunca a este resumen.
